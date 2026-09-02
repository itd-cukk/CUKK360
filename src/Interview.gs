/**
 * Interview.gs — Wawancara Appraisal Kinerja Tahunan (menu "Pertanyaan Wawancara").
 *
 * Terpisah dari skor 360, memakai pasangan atasan-bawahan dari
 * hierarki_terdeteksi yang sama (BR-13). FR-28..FR-34.
 */

/* ============================================================================
 * SEED BANK PERTANYAAN WAWANCARA (Lampiran G FRD / Bagian 5.4 prompt)
 * ========================================================================== */

var WAWANCARA_DEFAULT = [
  { kategori: 'Pencapaian Target', teks: 'Target kerja apa saja yang telah tercapai dan tidak tercapai pada periode berjalan, beserta faktor pendukung/penghambatnya?', level: 'semua' },
  { kategori: 'Kendala & Solusi', teks: 'Kendala utama apa yang dihadapi dalam menjalankan tugas, dan solusi apa yang sudah/akan dilakukan?', level: 'semua' },
  { kategori: 'Pengembangan Diri', teks: 'Kompetensi atau keterampilan apa yang ingin dikembangkan pada periode berikutnya?', level: 'semua' },
  { kategori: 'Rencana Kerja ke Depan', teks: 'Apa rencana kerja utama untuk periode berikutnya dan dukungan apa yang dibutuhkan dari atasan/organisasi?', level: 'semua' },
  { kategori: 'Khusus Pimpinan', teks: 'Bagaimana strategi pengembangan tim/bawahan yang telah dan akan dijalankan pada periode berikutnya?', level: 'Pimpinan' }
];

function seedPertanyaanWawancara_() {
  if (readObjects_('pertanyaan_wawancara').length) return;
  appendObjects_('pertanyaan_wawancara', WAWANCARA_DEFAULT.map(function (q, i) {
    return { id: 'wwc_' + (i + 1), kategori: q.kategori, teks: q.teks, berlaku_level: q.level };
  }));
}

/** Pertanyaan yang berlaku untuk level bawahan tertentu. */
function _pertanyaanWawancaraUntuk_(levelBawahan) {
  var isPim = isLevelPimpinan_(levelBawahan);
  return readObjects_('pertanyaan_wawancara').filter(function (q) {
    var lv = String(q.berlaku_level || 'semua');
    if (lv === 'semua') return true;
    if (lv === 'Pimpinan') return isPim;
    return lv === levelBawahan;
  }).map(_stripRow_);
}

/* ============================================================================
 * GENERATE SESI (FR-29)
 * ========================================================================== */

/**
 * Bentuk daftar Sesi Wawancara per pasangan Atasan-Bawahan dari hierarki periode.
 * Idemponten: sesi yang sudah 'selesai' dipertahankan.
 * @param {string} periodeId periode berjenis 'wawancara'
 * @return {{dibuat:number, dipertahankan:number}}
 */
function generateInterviewSessions_(periodeId) {
  return withLock_(function () {
    // hierarki dibuat untuk periode 360; untuk wawancara kita pakai hierarki
    // periode 360 aktif bila ada, kalau tidak pakai periode wawancara ini.
    var per360 = getActivePeriode_('360');
    var hirPeriodeId = per360 ? per360.id : periodeId;
    var hir = readObjects_('hierarki_terdeteksi').filter(function (h) {
      return String(h.periode_id) === String(hirPeriodeId);
    });
    if (!hir.length && per360) {
      // fallback: generate hierarki untuk periode wawancara
      detectHierarchy_(periodeId);
      hir = readObjects_('hierarki_terdeteksi').filter(function (h) { return String(h.periode_id) === String(periodeId); });
    }

    var existing = readObjects_('sesi_wawancara').filter(function (r) {
      return String(r.periode_id) === String(periodeId);
    });
    var keep = {};
    existing.forEach(function (r) {
      if (String(r.status) === 'selesai') keep[_pairKey_(r.nia_atasan, r.nia_bawahan)] = true;
    });
    _deleteSesiBelumSelesai_(periodeId);

    var byNia = {};
    getAktivisCached_().forEach(function (a) { byNia[a.nia] = a; });

    var toAdd = [];
    hir.forEach(function (h) {
      var a = normalizeNia_(h.nia_atasan), b = normalizeNia_(h.nia_bawahan);
      if (!byNia[a] || !byNia[b]) return;
      var key = _pairKey_(a, b);
      if (keep[key]) return;
      keep[key] = true;
      toAdd.push({
        id: shortId_('ses'), periode_id: periodeId,
        nia_atasan: a, nia_bawahan: b,
        status: 'belum_dijadwalkan', tanggal_sesi: '',
        konfirmasi_atasan: 'FALSE', konfirmasi_bawahan: 'FALSE'
      });
    });
    if (toAdd.length) appendObjects_('sesi_wawancara', toAdd);

    _audit_('SYSTEM', 'generate_interview_sessions', { periodeId: periodeId, dibuat: toAdd.length });
    return { dibuat: toAdd.length, dipertahankan: Object.keys(keep).length - toAdd.length };
  });
}

function _pairKey_(a, b) { return normalizeNia_(a) + '~' + normalizeNia_(b); }

function _deleteSesiBelumSelesai_(periodeId) {
  var sh = getSheet_('sesi_wawancara');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var iPer = SCHEMA.sesi_wawancara.indexOf('periode_id');
  var iStat = SCHEMA.sesi_wawancara.indexOf('status');
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][iPer]) === String(periodeId) && String(values[r][iStat]) !== 'selesai') {
      sh.deleteRow(r + 1);
    }
  }
}

/* ============================================================================
 * DAFTAR & BUKA SESI
 * ========================================================================== */

function ivListSessions(sessionToken) {
  try {
    var s = requireSession_(sessionToken);
    var per = getActivePeriode_('wawancara');
    if (!per) return ok_({ periode: null, sebagaiAtasan: [], sebagaiBawahan: [] });
    var myNia = normalizeNia_(s.nia);

    var rows = readObjects_('sesi_wawancara').filter(function (r) {
      return String(r.periode_id) === String(per.id) &&
        (normalizeNia_(r.nia_atasan) === myNia || normalizeNia_(r.nia_bawahan) === myNia);
    });

    function pack(r) {
      var lawan = normalizeNia_(r.nia_atasan) === myNia ? r.nia_bawahan : r.nia_atasan;
      var lp = getProfil_(lawan) || { nama: '(?)', jabatan_text: '', bo: '' };
      return {
        sesiId: r.id, status: r.status, tanggal_sesi: r.tanggal_sesi,
        peran: normalizeNia_(r.nia_atasan) === myNia ? 'atasan' : 'bawahan',
        konfirmasi_atasan: toBool_(r.konfirmasi_atasan),
        konfirmasi_bawahan: toBool_(r.konfirmasi_bawahan),
        lawan: { nia: lawan, nama: lp.nama, jabatan_text: lp.jabatan_text, bo: lp.bo }
      };
    }
    return ok_({
      periode: per,
      sebagaiAtasan: rows.filter(function (r) { return normalizeNia_(r.nia_atasan) === myNia; }).map(pack),
      sebagaiBawahan: rows.filter(function (r) { return normalizeNia_(r.nia_bawahan) === myNia; }).map(pack)
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function ivOpenSession(sessionToken, sesiId) {
  try {
    var s = requireSession_(sessionToken);
    var r = _getSesiForUser_(sesiId, s.nia);
    if (!r.ok) return err_(r.msg, r.code);
    var sesi = r.row;

    var bawahan = getProfil_(sesi.nia_bawahan) || {};
    var atasan = getProfil_(sesi.nia_atasan) || {};
    var pertanyaan = _pertanyaanWawancaraUntuk_(bawahan.level || 'Staf Pelaksana');

    var jawaban = readObjects_('jawaban_wawancara').filter(function (j) { return String(j.sesi_id) === String(sesiId); });
    var byQ = {};
    jawaban.forEach(function (j) { byQ[j.pertanyaan_id] = j; });

    var rtl = readObjects_('rencana_tindak_lanjut').filter(function (x) { return String(x.sesi_id) === String(sesiId); }).map(_stripRow_);

    var selfAppraisalAktif = String(scriptProps_().getProperty('SELF_APPRAISAL_AKTIF') || 'TRUE') !== 'FALSE';

    return ok_({
      sesi: {
        sesiId: sesi.id, status: sesi.status, tanggal_sesi: sesi.tanggal_sesi,
        peran: normalizeNia_(sesi.nia_atasan) === normalizeNia_(s.nia) ? 'atasan' : 'bawahan',
        konfirmasi_atasan: toBool_(sesi.konfirmasi_atasan),
        konfirmasi_bawahan: toBool_(sesi.konfirmasi_bawahan),
        terkunci: toBool_(sesi.konfirmasi_atasan) && toBool_(sesi.konfirmasi_bawahan),
        atasan: { nia: atasan.nia, nama: atasan.nama, jabatan_text: atasan.jabatan_text },
        bawahan: { nia: bawahan.nia, nama: bawahan.nama, jabatan_text: bawahan.jabatan_text }
      },
      selfAppraisalAktif: selfAppraisalAktif,
      pertanyaan: pertanyaan.map(function (q) {
        var j = byQ[q.id] || {};
        return {
          id: q.id, kategori: q.kategori, teks: q.teks,
          jawaban_self_appraisal: j.jawaban_self_appraisal || '',
          catatan_atasan: j.catatan_atasan || ''
        };
      }),
      rencanaTindakLanjut: rtl
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * SIMPAN
 * ========================================================================== */

/** Bawahan mengisi self-appraisal (FR-30). */
function ivSaveSelfAppraisal(sessionToken, sesiId, answers) {
  try {
    var s = requireSession_(sessionToken);
    var r = _getSesiForUser_(sesiId, s.nia);
    if (!r.ok) return err_(r.msg, r.code);
    if (normalizeNia_(r.row.nia_bawahan) !== normalizeNia_(s.nia)) return err_('Hanya bawahan yang mengisi self-appraisal.', 'FORBIDDEN');
    if (_sesiTerkunci_(r.row)) return err_('Sesi sudah terkunci.', 'LOCKED');

    withLock_(function () { _upsertJawabanWawancara_(sesiId, answers || {}, 'jawaban_self_appraisal'); });
    _audit_(s.nia, 'wawancara_self_appraisal', { sesiId: sesiId });
    return ok_(true);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Atasan mencatat hasil wawancara + rencana tindak lanjut (FR-31, FR-32). */
function ivSaveAtasanNotes(sessionToken, p) {
  try {
    var s = requireSession_(sessionToken);
    p = p || {};
    var r = _getSesiForUser_(p.sesiId, s.nia);
    if (!r.ok) return err_(r.msg, r.code);
    if (normalizeNia_(r.row.nia_atasan) !== normalizeNia_(s.nia)) return err_('Hanya atasan yang mengisi catatan hasil.', 'FORBIDDEN');
    if (_sesiTerkunci_(r.row)) return err_('Sesi sudah terkunci.', 'LOCKED');

    withLock_(function () {
      _upsertJawabanWawancara_(p.sesiId, p.catatan || {}, 'catatan_atasan');
      if (p.tanggal_sesi !== undefined || (p.status && p.status)) {
        var patch = {};
        if (p.tanggal_sesi !== undefined) patch.tanggal_sesi = p.tanggal_sesi;
        if (!patch.tanggal_sesi && String(r.row.status) === 'belum_dijadwalkan') patch.status = 'berlangsung';
        if (p.tanggal_sesi) patch.status = 'menunggu_konfirmasi';
        updateRow_('sesi_wawancara', r.row.__row, patch);
      }
      // rencana tindak lanjut: ganti seluruhnya
      _replaceRTL_(p.sesiId, p.rencanaTindakLanjut || []);
    });
    _audit_(s.nia, 'wawancara_catatan_atasan', { sesiId: p.sesiId });
    return ok_(true);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Konfirmasi dua pihak (FR-33). Kunci saat keduanya konfirmasi. */
function ivConfirmSession(sessionToken, sesiId) {
  try {
    var s = requireSession_(sessionToken);
    var res = withLock_(function () {
      var r = _getSesiForUser_(sesiId, s.nia);
      if (!r.ok) return { err: r.msg, code: r.code };
      var sesi = r.row;
      var isAtasan = normalizeNia_(sesi.nia_atasan) === normalizeNia_(s.nia);
      var patch = isAtasan ? { konfirmasi_atasan: 'TRUE' } : { konfirmasi_bawahan: 'TRUE' };

      var ka = isAtasan ? true : toBool_(sesi.konfirmasi_atasan);
      var kb = isAtasan ? toBool_(sesi.konfirmasi_bawahan) : true;
      if (ka && kb) patch.status = 'selesai';
      else patch.status = 'menunggu_konfirmasi';

      updateRow_('sesi_wawancara', sesi.__row, patch);
      return { ok: true, terkunci: ka && kb };
    });
    if (res.err) return err_(res.err, res.code);
    _audit_(s.nia, 'wawancara_konfirmasi', { sesiId: sesiId, terkunci: res.terkunci });
    return ok_({ terkunci: res.terkunci });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function _getSesiForUser_(sesiId, nia) {
  var rows = readObjects_('sesi_wawancara');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(sesiId)) {
      var n = normalizeNia_(nia);
      if (normalizeNia_(rows[i].nia_atasan) !== n && normalizeNia_(rows[i].nia_bawahan) !== n) {
        return { ok: false, msg: 'Sesi ini bukan milik Anda.', code: 'FORBIDDEN' };
      }
      return { ok: true, row: rows[i] };
    }
  }
  return { ok: false, msg: 'Sesi tidak ditemukan.', code: 'NOT_FOUND' };
}

function _sesiTerkunci_(row) {
  return toBool_(row.konfirmasi_atasan) && toBool_(row.konfirmasi_bawahan);
}

function _upsertJawabanWawancara_(sesiId, answersByQ, field) {
  var existing = readObjects_('jawaban_wawancara').filter(function (j) { return String(j.sesi_id) === String(sesiId); });
  var byQ = {};
  existing.forEach(function (j) { byQ[j.pertanyaan_id] = j; });
  var toAdd = [];
  Object.keys(answersByQ).forEach(function (qid) {
    var val = answersByQ[qid];
    if (byQ[qid]) {
      var patch = {}; patch[field] = val;
      updateRow_('jawaban_wawancara', byQ[qid].__row, patch);
    } else {
      var row = { id: shortId_('jww'), sesi_id: sesiId, pertanyaan_id: qid, jawaban_self_appraisal: '', catatan_atasan: '' };
      row[field] = val;
      toAdd.push(row);
    }
  });
  if (toAdd.length) appendObjects_('jawaban_wawancara', toAdd);
}

function _replaceRTL_(sesiId, list) {
  var sh = getSheet_('rencana_tindak_lanjut');
  var values = sh.getDataRange().getValues();
  var iSes = SCHEMA.rencana_tindak_lanjut.indexOf('sesi_id');
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][iSes]) === String(sesiId)) sh.deleteRow(r + 1);
  }
  var rows = (list || []).filter(function (x) { return x && String(x.deskripsi || '').trim(); }).map(function (x) {
    return {
      id: shortId_('rtl'), sesi_id: sesiId, deskripsi: String(x.deskripsi).trim(),
      target_waktu: x.target_waktu || '', status: x.status || 'rencana'
    };
  });
  if (rows.length) appendObjects_('rencana_tindak_lanjut', rows);
}
