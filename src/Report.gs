/**
 * Report.gs — Agregasi skor, dashboard, laporan individu/agregat, ekspor.
 *
 * FR-40..FR-48, BR-07 (kalibrasi dikecualikan), BR-08 (anonimisasi penilai),
 * BR-10, kontrol akses laporan Bab 3 FRD.
 */

/* Ambang predikat dari skor rata-rata 1..5 */
function predikat_(skor) {
  if (skor == null) return '-';
  if (skor >= 4.5) return 'Sangat Baik';
  if (skor >= 3.5) return 'Baik';
  if (skor >= 2.5) return 'Cukup';
  if (skor >= 1.5) return 'Kurang';
  return 'Sangat Kurang';
}

/* ============================================================================
 * 1. DASHBOARD PROGRES (FR-40)
 * ========================================================================== */

function reportDashboard(sessionToken) {
  try {
    var s = requireSession_(sessionToken);
    var out = { periode360: null, periodeWawancara: null, p360: null, pWawancara: null, kualitas: null };

    var per360 = getActivePeriode_('360');
    if (per360) {
      out.periode360 = per360;
      out.p360 = _progres360_(per360);
      if (s.isAdmin || s.isPimpinan) out.kualitas = buildValidationReport_(per360.id).ringkasan;
    }
    var perW = getActivePeriode_('wawancara');
    if (perW) { out.periodeWawancara = perW; out.pWawancara = _progresWawancara_(perW); }

    // aktivis biasa: sematkan progres tugas pribadi
    var mine = a360ListTasks(sessionToken);
    out.tugasSaya = mine.ok ? mine.data.ringkasan : null;
    var myIv = ivListSessions(sessionToken);
    out.wawancaraSaya = myIv.ok ? {
      sebagaiAtasan: myIv.data.sebagaiAtasan.length,
      sebagaiBawahan: myIv.data.sebagaiBawahan.length,
      selesai: []
        .concat(myIv.data.sebagaiAtasan, myIv.data.sebagaiBawahan)
        .filter(function (x) { return x.status === 'selesai'; }).length
    } : null;

    return ok_(out);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * 2. AGREGASI SKOR INVICTUS
 * ========================================================================== */

/**
 * Hitung skor per dimensi INVICTUS untuk SEMUA pemangku jabatan pada sebuah periode.
 * @param {string} periodeId
 * @return {Object<string, {byRelasi:Object, overall:number, dimensi:Object}>} key = nia_dinilai
 */
function computeScores_(periodeId) {
  var katMap = pertanyaanKategoriMap_(); // qid -> {kategori_id, kode, nama}
  var penugasan = {};
  readObjects_('penugasan_penilaian').forEach(function (r) {
    if (String(r.periode_id) === String(periodeId)) penugasan[r.id] = r;
  });

  // struktur: acc[niaDinilai][kategori_id][relasi] = [skor,...]
  var acc = {};
  readObjects_('jawaban_360').forEach(function (j) {
    var p = penugasan[j.penugasan_id];
    if (!p) return;
    var kat = katMap[j.pertanyaan_id];
    if (!kat) return; // lewati kalibrasi & teknis (BR-07)
    var nd = normalizeNia_(p.nia_dinilai);
    var rel = p.jenis_relasi;
    acc[nd] = acc[nd] || {};
    acc[nd][kat.kategori_id] = acc[nd][kat.kategori_id] || {};
    (acc[nd][kat.kategori_id][rel] = acc[nd][kat.kategori_id][rel] || []).push(Number(j.skor));
  });

  // teknis (opsional, tidak masuk INVICTUS)
  var teknisAcc = {};
  readObjects_('jawaban_360').forEach(function (j) {
    if (String(j.pertanyaan_id).indexOf('tk_') !== 0) return;
    var p = penugasan[j.penugasan_id];
    if (!p) return;
    var nd = normalizeNia_(p.nia_dinilai);
    (teknisAcc[nd] = teknisAcc[nd] || []).push(Number(j.skor));
  });

  var kategoriList = readObjects_('kategori_core_value');
  var out = {};
  Object.keys(acc).forEach(function (nd) {
    var dimensi = {};
    var semuaSkor = [];
    var byRelasiAll = { self: [], peer: [], atasan: [], bawahan: [] };

    kategoriList.forEach(function (k) {
      var relObj = acc[nd][k.id] || {};
      var perRelasi = {};
      var dimAll = [];
      ['self', 'peer', 'atasan', 'bawahan'].forEach(function (rel) {
        var arr = relObj[rel] || [];
        if (arr.length) {
          perRelasi[rel] = round2_(average_(arr));
          dimAll = dimAll.concat(arr);
          byRelasiAll[rel] = byRelasiAll[rel].concat(arr);
        }
      });
      var dimAvg = round2_(average_(dimAll));
      dimensi[k.id] = { kode: k.kode_huruf, nama: k.nama, rata: dimAvg, perRelasi: perRelasi };
      if (dimAvg != null) semuaSkor.push(dimAvg);
    });

    var byRelasi = {};
    ['self', 'peer', 'atasan', 'bawahan'].forEach(function (rel) {
      byRelasi[rel] = round2_(average_(byRelasiAll[rel]));
    });

    var overall = round2_(average_(semuaSkor));
    out[nd] = {
      dimensi: dimensi,
      byRelasi: byRelasi,
      overall: overall,
      predikat: predikat_(overall),
      teknis: teknisAcc[nd] && teknisAcc[nd].length ? round2_(average_(teknisAcc[nd])) : null
    };
  });
  return out;
}

/* ============================================================================
 * 3. LAPORAN INDIVIDU (FR-41)
 * ========================================================================== */

function reportIndividu(sessionToken, niaTarget, periodeId) {
  try {
    var s = requireSession_(sessionToken);
    var target = normalizeNia_(niaTarget || s.nia);

    if (!_bolehLihatIndividu_(s, target)) return err_('Anda tidak berwenang melihat laporan aktivis ini.', 'FORBIDDEN');

    var per = periodeId ? _findPeriode_(periodeId) : getActivePeriode_('360');
    if (!per) return err_('Belum ada periode 360 aktif.', 'NO_PERIODE');

    var prof = getProfil_(target);
    if (!prof) return err_('Aktivis tidak ditemukan.', 'NOT_FOUND');

    var scores = computeScores_(per.id)[target] || null;

    // radar 8 dimensi (urut INVICTUS resmi)
    var radar = [];
    if (scores) {
      readObjects_('kategori_core_value').forEach(function (k) {
        var d = scores.dimensi[k.id] || {};
        radar.push({ kode: k.kode_huruf, nama: k.nama, skor: d.rata == null ? 0 : d.rata });
      });
    }

    // catatan kualitatif penilai (anonim, BR-08) — dari audit submit_360 detail.catatanAda
    var catatan = [];
    if (s.isAdmin) {
      // hanya admin/IAD boleh melihat identitas; di sini tetap ringkas
    }

    // ringkasan wawancara (FR-41 pelengkap kualitatif)
    var wawancara = _ringkasWawancaraIndividu_(target);

    return ok_({
      profil: {
        nia: prof.nia, nama: prof.nama, jabatan_text: prof.jabatan_text,
        unit: prof.unit, bo: prof.bo, area: prof.area, level: prof.level
      },
      periode: _stripRow_(per),
      adaData: !!scores,
      overall: scores ? scores.overall : null,
      predikat: scores ? scores.predikat : '-',
      radar: radar,
      perbandinganRelasi: scores ? scores.byRelasi : { self: null, peer: null, atasan: null, bawahan: null },
      teknis: scores ? scores.teknis : null,
      dimensiDetail: scores ? scores.dimensi : {},
      wawancara: wawancara
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function _bolehLihatIndividu_(s, target) {
  if (normalizeNia_(s.nia) === target) return true;      // diri sendiri
  if (s.isAdmin) return true;                            // Admin / Super Admin
  if (s.isPimpinan) {
    // pimpinan: hanya anggota tim/unit yang dipimpin
    var tp = getProfil_(target);
    if (!tp || tp.unit !== s.unit) return false;
    var per = getActivePeriode_('360');
    if (!per) return false;
    var isBawahan = readObjects_('hierarki_terdeteksi').some(function (h) {
      return String(h.periode_id) === String(per.id) &&
        normalizeNia_(h.nia_atasan) === normalizeNia_(s.nia) &&
        normalizeNia_(h.nia_bawahan) === target;
    });
    return isBawahan || tp.area === s.area; // izinkan lingkup area yang dipimpin
  }
  return false;
}

function _ringkasWawancaraIndividu_(nia) {
  var perW = getActivePeriode_('wawancara');
  if (!perW) return null;
  var sesi = readObjects_('sesi_wawancara').filter(function (r) {
    return String(r.periode_id) === String(perW.id) && normalizeNia_(r.nia_bawahan) === normalizeNia_(nia);
  })[0];
  if (!sesi) return null;
  var jawaban = readObjects_('jawaban_wawancara').filter(function (j) { return String(j.sesi_id) === String(sesi.id); });
  var pertanyaan = {};
  readObjects_('pertanyaan_wawancara').forEach(function (q) { pertanyaan[q.id] = q; });
  var rtl = readObjects_('rencana_tindak_lanjut').filter(function (x) { return String(x.sesi_id) === String(sesi.id); }).map(_stripRow_);
  return {
    status: sesi.status,
    tanggal_sesi: sesi.tanggal_sesi,
    butir: jawaban.map(function (j) {
      var q = pertanyaan[j.pertanyaan_id] || {};
      return { kategori: q.kategori, teks: q.teks, self: j.jawaban_self_appraisal, catatanAtasan: j.catatan_atasan };
    }),
    rencanaTindakLanjut: rtl
  };
}

/* ============================================================================
 * 4. LAPORAN AGREGAT + RANKING (FR-42)
 * ========================================================================== */

function reportAgregat(sessionToken, opt) {
  try {
    var s = requireSession_(sessionToken);
    if (!s.isAdmin && !s.isPimpinan) return err_('Tidak berwenang.', 'FORBIDDEN');
    opt = opt || {};
    var groupBy = ['bo', 'area', 'unit'].indexOf(opt.groupBy) !== -1 ? opt.groupBy : 'bo';

    var per = opt.periodeId ? _findPeriode_(opt.periodeId) : getActivePeriode_('360');
    if (!per) return err_('Belum ada periode 360 aktif.', 'NO_PERIODE');

    var scores = computeScores_(per.id);
    var kategoriList = readObjects_('kategori_core_value');

    var grup = {}; // key -> { skor:[], perDim:{katId:[]} }
    Object.keys(scores).forEach(function (nia) {
      var prof = getProfil_(nia);
      if (!prof) return;
      if (!s.isAdmin && prof.unit !== s.unit) return; // pimpinan: unit sendiri
      var key = prof[groupBy] || '(tak diketahui)';
      grup[key] = grup[key] || { key: key, jumlahAktivis: 0, overall: [], perDim: {} };
      grup[key].jumlahAktivis++;
      if (scores[nia].overall != null) grup[key].overall.push(scores[nia].overall);
      kategoriList.forEach(function (k) {
        var d = scores[nia].dimensi[k.id];
        if (d && d.rata != null) (grup[key].perDim[k.id] = grup[key].perDim[k.id] || []).push(d.rata);
      });
    });

    var baris = Object.keys(grup).map(function (key) {
      var g = grup[key];
      var perDim = {};
      kategoriList.forEach(function (k) {
        perDim[k.kode_huruf + '·' + k.nama] = round2_(average_(g.perDim[k.id] || []));
      });
      var rata = round2_(average_(g.overall));
      return { grup: key, jumlahAktivis: g.jumlahAktivis, rataOverall: rata, predikat: predikat_(rata), perDimensi: perDim };
    }).sort(function (a, b) { return (b.rataOverall || 0) - (a.rataOverall || 0); });

    baris.forEach(function (r, i) { r.peringkat = i + 1; });

    return ok_({ periode: _stripRow_(per), groupBy: groupBy, baris: baris });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * 5. EKSPOR (FR-46)
 * ========================================================================== */

/** URL ekspor seluruh spreadsheet database ke XLSX (Admin saja). */
function reportExportExcelUrl(sessionToken) {
  try {
    requireAdmin_(sessionToken);
    var id = scriptProps_().getProperty('SPREADSHEET_ID');
    return ok_({ url: 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx' });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/**
 * Bangun PDF laporan individu, kembalikan sebagai data URI base64 supaya
 * client dapat memicu unduhan tanpa akses Drive.
 */
function reportIndividuPdf(sessionToken, niaTarget, periodeId) {
  try {
    var r = reportIndividu(sessionToken, niaTarget, periodeId);
    if (!r.ok) return r;
    var d = r.data;
    var html = _htmlLaporanIndividu_(d);
    var blob = Utilities.newBlob(html, 'text/html', 'laporan.html').getAs('application/pdf');
    var b64 = Utilities.base64Encode(blob.getBytes());
    var fname = 'Laporan_360_' + d.profil.nia + '_' + (d.periode.nama || '').replace(/\s+/g, '_') + '.pdf';
    return ok_({ filename: fname, mimeType: 'application/pdf', dataUri: 'data:application/pdf;base64,' + b64 });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function _htmlLaporanIndividu_(d) {
  var rows = d.radar.map(function (x) {
    return '<tr><td>' + x.kode + ' — ' + x.nama + '</td><td style="text-align:right">' + (x.skor || '-') + '</td></tr>';
  }).join('');
  var rel = d.perbandinganRelasi || {};
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#222;margin:32px}' +
    'h1{color:#c0392b;font-size:20px} h2{font-size:15px;border-bottom:2px solid #c0392b;padding-bottom:4px}' +
    'table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}' +
    'td,th{border:1px solid #ddd;padding:6px 10px}' +
    '</style></head><body>' +
    '<h1>' + APP_NAME + ' — Laporan Penilaian 360</h1>' +
    '<p><b>' + d.profil.nama + '</b> (' + d.profil.nia + ')<br>' + d.profil.jabatan_text +
    '<br>' + d.profil.unit + ' / ' + d.profil.bo + ' / ' + d.profil.area +
    '<br>Periode: ' + d.periode.nama + '</p>' +
    '<h2>Ringkasan</h2><p>Skor keseluruhan: <b>' + (d.overall == null ? '-' : d.overall) + '</b> — Predikat: <b>' + d.predikat + '</b></p>' +
    '<h2>Skor per Dimensi INVICTUS</h2><table><tr><th>Dimensi</th><th>Skor</th></tr>' + rows + '</table>' +
    '<h2>Perbandingan Sumber Penilaian</h2><table><tr><th>Self</th><th>Peer</th><th>Atasan</th><th>Bawahan</th></tr>' +
    '<tr><td>' + (rel.self || '-') + '</td><td>' + (rel.peer || '-') + '</td><td>' + (rel.atasan || '-') + '</td><td>' + (rel.bawahan || '-') + '</td></tr></table>' +
    (d.teknis != null ? '<h2>Kompetensi Teknis Kepemimpinan</h2><p>Skor: <b>' + d.teknis + '</b></p>' : '') +
    '<p style="color:#888;font-size:11px;margin-top:32px">Dicetak ' + Utilities.formatDate(new Date(), TZ, 'dd MMM yyyy HH:mm') + '</p>' +
    '</body></html>';
}
