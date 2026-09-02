/**
 * MasterData.gs — Sumber Data Tunggal.
 *
 * Tanggung jawab:
 *  - Impor berkas roster aktivis (upsert ke sheet `aktivis`, nonaktifkan yang hilang).
 *  - Validasi kualitas data impor (NIA duplikat, kolom wajib kosong, format NIA).
 *  - Tabel Referensi Level Jabatan + resolveLevelJabatan_().
 *  - Deteksi hierarki atasan-bawahan otomatis.
 *  - Cache master data di PropertiesService (JSON) supaya tidak getDataRange() tiap request.
 *
 * Aturan bisnis terkait: BR-10 (larangan lintas unit), BR-11 (NIA unik),
 * FR-07..FR-11.
 */

/* ============================================================================
 * 1. IMPOR ROSTER
 * ========================================================================== */

/**
 * Impor roster dari sheet lain (mis. hasil upload xlsx ke Google Sheets).
 * Kolom sumber yang dibaca (persis seperti Data_Aktivis_Agus_2026.xlsx):
 *   NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN
 * Kolom `email` opsional; bila ada kolom "EMAIL" akan dipakai.
 *
 * @param {string} sourceSheetId ID Spreadsheet sumber
 * @param {string=} sourceTabName nama tab; default tab pertama
 * @param {{apply?: boolean, sumberImpor?: string}=} opts
 *        apply=false → hanya laporan validasi (dry-run), tidak menulis.
 * @return {{summary:Object, validation:Object}}
 */
function importRosterFromSheet_(sourceSheetId, sourceTabName, opts) {
  opts = opts || {};
  var apply = opts.apply !== false; // default true
  var sumberImpor = opts.sumberImpor ||
    ('import_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss'));

  var src = SpreadsheetApp.openById(sourceSheetId);
  var tab = sourceTabName ? src.getSheetByName(sourceTabName) : src.getSheets()[0];
  if (!tab) throw new Error('Tab sumber tidak ditemukan: ' + sourceTabName);

  var values = tab.getDataRange().getValues();
  var head = _locateHeaderRow_(values);
  if (head.index < 0) {
    throw new Error('Header kolom (NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN) tidak ditemukan pada sumber.');
  }
  var col = head.map;
  var rows = values.slice(head.index + 1);

  /** @type {Object[]} baris roster yang bersih & siap upsert */
  var parsed = [];
  var validation = {
    totalBaris: 0,
    niaDuplikat: [],       // [{nia, barisKe:[...]}]
    kolomWajibKosong: [],  // [{barisKe, kolom:[...]}]
    formatNiaTidakSesuai: [], // [{barisKe, nia}]
    jabatanBaru: []        // teks jabatan yang belum ada di tabel referensi
  };

  var seenNia = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var barisKe = head.index + 2 + i; // nomor baris asli di sheet sumber
    var nia = normalizeNia_(row[col.nia]);
    var nama = cleanText_(row[col.nama]);
    var unit = cleanText_(row[col.unit]);
    var bo = cleanText_(row[col.bo]);
    var area = cleanText_(row[col.area]);
    var jabatan = cleanText_(row[col.jabatan]);
    var email = col.email >= 0 ? String(row[col.email] || '').trim().toLowerCase() : '';

    if (!nia && !nama && !unit && !bo && !area && !jabatan) continue; // baris kosong total
    validation.totalBaris++;

    var kosong = [];
    if (!nia) kosong.push('NIA');
    if (!nama) kosong.push('NAMA AKTIVIS');
    if (!unit) kosong.push('UNIT');
    if (!bo) kosong.push('BO');
    if (!area) kosong.push('AREA');
    if (!jabatan) kosong.push('JABATAN');
    if (kosong.length) validation.kolomWajibKosong.push({ barisKe: barisKe, kolom: kosong });

    if (nia && !isValidNiaFormat_(nia)) {
      validation.formatNiaTidakSesuai.push({ barisKe: barisKe, nia: nia });
    }

    if (nia) {
      if (seenNia[nia] === undefined) seenNia[nia] = [];
      seenNia[nia].push(barisKe);
    }

    parsed.push({
      nia: nia, nama: nama, jabatan_text: jabatan, unit: unit,
      bo: bo, area: area, email: email, __barisKe: barisKe
    });
  }

  Object.keys(seenNia).forEach(function (nia) {
    if (seenNia[nia].length > 1) validation.niaDuplikat.push({ nia: nia, barisKe: seenNia[nia] });
  });

  // Jabatan yang belum terpetakan ke tabel referensi.
  var jabatanSet = {};
  parsed.forEach(function (p) { if (p.jabatan_text) jabatanSet[p.jabatan_text] = true; });
  Object.keys(jabatanSet).forEach(function (j) {
    var res = resolveLevelJabatan_(j);
    if (res.level === 'PERLU_DIPETAKAN') validation.jabatanBaru.push(j);
  });

  var blocked = validation.niaDuplikat.length > 0; // BR-11: NIA duplikat menahan impor

  var summary = {
    sumberImpor: sumberImpor,
    apply: apply && !blocked,
    ditahanKarenaDuplikat: blocked,
    barisValid: parsed.length,
    ditambahBaru: 0,
    diperbarui: 0,
    dinonaktifkan: 0
  };

  if (!apply || blocked) {
    _writeImportAudit_('import_dryrun', summary, validation);
    return { summary: summary, validation: validation };
  }

  // ---- APPLY (di dalam lock) ----
  withLock_(function () {
    var existing = readObjects_('aktivis');
    var byNia = {};
    existing.forEach(function (a) { byNia[normalizeNia_(a.nia)] = a; });

    var tglImpor = nowIso_();
    var toAppend = [];
    var rosterNiaSet = {};

    parsed.forEach(function (p) {
      if (!p.nia) return;
      rosterNiaSet[p.nia] = true;
      var cur = byNia[p.nia];
      if (!cur) {
        toAppend.push({
          nia: p.nia, nama: p.nama, jabatan_text: p.jabatan_text, unit: p.unit,
          bo: p.bo, area: p.area, email: p.email, status_aktif: 'TRUE',
          sumber_impor: sumberImpor, tanggal_impor: tglImpor
        });
        summary.ditambahBaru++;
      } else {
        var changed =
          cleanText_(cur.jabatan_text) !== p.jabatan_text ||
          cleanText_(cur.bo) !== p.bo ||
          cleanText_(cur.area) !== p.area ||
          cleanText_(cur.unit) !== p.unit ||
          !toBool_(cur.status_aktif);
        if (changed) {
          // Catat riwayat mutasi bila jabatan/bo/area berubah (FR-11).
          if (cleanText_(cur.jabatan_text) !== p.jabatan_text ||
              cleanText_(cur.bo) !== p.bo || cleanText_(cur.area) !== p.area) {
            appendObject_('riwayat_mutasi_aktivis', {
              id: shortId_('mut'),
              nia: p.nia,
              jabatan_text_lama: cur.jabatan_text,
              bo_lama: cur.bo,
              area_lama: cur.area,
              berlaku_sejak_periode: _activePeriodeIdOrBlank_()
            });
          }
          updateRow_('aktivis', cur.__row, {
            nama: p.nama, jabatan_text: p.jabatan_text, unit: p.unit,
            bo: p.bo, area: p.area,
            email: p.email || cur.email,
            status_aktif: 'TRUE',
            sumber_impor: sumberImpor, tanggal_impor: tglImpor
          });
          summary.diperbarui++;
        }
      }
    });

    if (toAppend.length) appendObjects_('aktivis', toAppend);

    // Nonaktifkan NIA yang tidak lagi ada di roster baru.
    existing.forEach(function (a) {
      var nia = normalizeNia_(a.nia);
      if (!rosterNiaSet[nia] && toBool_(a.status_aktif)) {
        updateRow_('aktivis', a.__row, { status_aktif: 'FALSE', tanggal_impor: tglImpor, sumber_impor: sumberImpor });
        summary.dinonaktifkan++;
      }
    });
  });

  refreshMasterCache_();
  _writeImportAudit_('import_apply', summary, validation);
  return { summary: summary, validation: validation };
}

/** Cari baris header pada data sumber & petakan indeks kolom. */
function _locateHeaderRow_(values) {
  var want = {
    nia: /^nia$/i,
    nama: /nama\s*aktivis/i,
    unit: /^unit$/i,
    bo: /^bo$|tempat\s*tugas/i,
    area: /^area$/i,
    jabatan: /^jabatan$/i,
    email: /^e-?mail$/i
  };
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    var row = values[r].map(function (x) { return String(x || '').trim(); });
    var map = { nia: -1, nama: -1, unit: -1, bo: -1, area: -1, jabatan: -1, email: -1 };
    row.forEach(function (cell, c) {
      Object.keys(want).forEach(function (k) {
        if (map[k] < 0 && want[k].test(cell)) map[k] = c;
      });
    });
    if (map.nia >= 0 && map.nama >= 0 && map.unit >= 0 && map.bo >= 0 && map.area >= 0 && map.jabatan >= 0) {
      return { index: r, map: map };
    }
  }
  return { index: -1, map: null };
}

function _activePeriodeIdOrBlank_() {
  try {
    var p = getActivePeriode_('360');
    return p ? p.id : '';
  } catch (e) { return ''; }
}

function _writeImportAudit_(aksi, summary, validation) {
  try {
    appendObject_('audit_log', {
      id: shortId_('aud'),
      nia: 'SYSTEM',
      aksi: aksi,
      waktu: nowIso_(),
      detail: JSON.stringify({ summary: summary, validationRingkas: {
        niaDuplikat: validation.niaDuplikat.length,
        kolomWajibKosong: validation.kolomWajibKosong.length,
        formatNiaTidakSesuai: validation.formatNiaTidakSesuai.length,
        jabatanBaru: validation.jabatanBaru.length
      } }),
      perangkat_ip: ''
    });
  } catch (e) { Logger.log('audit impor gagal: ' + e); }
}

/* ============================================================================
 * 2. TABEL REFERENSI LEVEL JABATAN
 * ========================================================================== */

/**
 * Pola awal pemetaan jabatan → level (Lampiran F FRD + Bagian 6.3 prompt).
 * Dicek BERURUTAN; pola pertama yang cocok (regex, case-insensitive) menang.
 * `is_trigger_teknis` = apakah memicu kuesioner Teknis Kepemimpinan.
 *
 * ASUMSI (didokumentasikan di README): pola "Pratama/Plt" sengaja ditempatkan
 * SEBELUM "Pimpinan Menengah" umum, agar "Plt/Junior/Asisten <jabatan>"
 * (mis. "Plt Branch Manager") jatuh ke level Pratama, bukan Menengah penuh.
 * Prompt Bagian 6.3 menuliskan urutan sebaliknya; Admin dapat menata ulang
 * baris tabel referensi ini kapan saja lewat panel Admin.
 */
var DEFAULT_LEVEL_REF = [
  { pola: 'CEO|General Manager|Direktur|Wakil Rektor', level: 'Pimpinan Puncak', trigger: true },
  { pola: '\\bPlt\\b|Junior Branch Manager|Junior Area Manager|Junior .*Manager|Asisten Manager|Asisten AM', level: 'Pimpinan Menengah (Pratama)', trigger: true },
  { pola: 'Head of|Area Manager|Branch Manager|Kepala Toko|Kepala Departemen|\\bKepala\\b|\\bManager\\b', level: 'Pimpinan Menengah', trigger: true }
];

/** Seed sheet `referensi_level_jabatan` bila masih kosong. Idemponten. */
function seedReferensiLevelJabatan_() {
  var existing = readObjects_('referensi_level_jabatan');
  if (existing.length) { refreshMasterCache_(); return; }
  var rows = DEFAULT_LEVEL_REF.map(function (r, i) {
    return {
      id: 'lvl_' + (i + 1),
      pola_kata_kunci: r.pola,
      level: r.level,
      is_trigger_teknis: r.trigger ? 'TRUE' : 'FALSE'
    };
  });
  appendObjects_('referensi_level_jabatan', rows);
  refreshMasterCache_();
}

/**
 * Petakan teks jabatan bebas → { level, isTriggerTeknis }.
 * Tidak cocok pola apa pun → level 'PERLU_DIPETAKAN' (Staf tetap default 'Staf Pelaksana'
 * hanya bila memang tidak mengandung indikasi pimpinan — lihat aturan di bawah).
 *
 * Aturan:
 *  1. Cek tiap pola referensi berurutan; match pertama menang.
 *  2. Bila tidak ada match → 'Staf Pelaksana', trigger=false, TAPI ditandai
 *     needsReview=true supaya Admin meninjau (jabatan benar-benar baru).
 *
 * @param {string} jabatanText
 * @return {{level:string, isTriggerTeknis:boolean, matchedPola:(string|null), needsReview:boolean}}
 */
function resolveLevelJabatan_(jabatanText) {
  var t = cleanText_(jabatanText);
  if (!t) return { level: 'PERLU_DIPETAKAN', isTriggerTeknis: false, matchedPola: null, needsReview: true };

  var ref = _getLevelRefCached_();
  for (var i = 0; i < ref.length; i++) {
    var pola = ref[i].pola_kata_kunci;
    if (!pola) continue;
    var re;
    try { re = new RegExp(pola, 'i'); } catch (e) { re = null; }
    var hit = re ? re.test(t) : (t.toLowerCase().indexOf(String(pola).toLowerCase()) !== -1);
    if (hit) {
      return {
        level: ref[i].level,
        isTriggerTeknis: toBool_(ref[i].is_trigger_teknis),
        matchedPola: pola,
        needsReview: false
      };
    }
  }
  // Tidak match pola pimpinan mana pun → anggap Staf Pelaksana, tetap minta review.
  return { level: 'Staf Pelaksana', isTriggerTeknis: false, matchedPola: null, needsReview: true };
}

/** True bila level termasuk kategori pimpinan. */
function isLevelPimpinan_(level) {
  return LEVEL_PIMPINAN.indexOf(level) !== -1;
}

/**
 * Daftar jabatan pada roster aktif yang belum terpetakan (untuk panel Admin).
 * @return {string[]}
 */
function listJabatanPerluDipetakan_() {
  var aktivis = getAktivisCached_();
  var set = {};
  aktivis.forEach(function (a) {
    if (!a.status_aktif) return;
    var r = resolveLevelJabatan_(a.jabatan_text);
    if (r.needsReview || r.level === 'PERLU_DIPETAKAN') set[a.jabatan_text] = true;
  });
  return Object.keys(set).sort();
}

/* ============================================================================
 * 3. DETEKSI HIERARKI OTOMATIS
 * ========================================================================== */

/**
 * Bangun pasangan atasan-bawahan untuk sebuah periode dan simpan ke
 * `hierarki_terdeteksi`. Baris dengan sumber = 'koreksi_manual_admin' TIDAK ditimpa.
 *
 * Heuristik (FR-10 / Bagian 6.4 prompt):
 *  - Dalam 1 `bo` yang sama: Staf Pelaksana → atasan = pemegang level Pimpinan
 *    Menengah / Pratama pada bo tsb (mis. Branch Manager).
 *  - Branch Manager (Pimpinan Menengah di bo cabang) → atasan = Area Manager /
 *    Pimpinan Puncak pada `area` yang sama (kandidat ber-bo Head Office / Kantor Area).
 *  - Bila kandidat atasan >1, pilih yang levelnya paling tinggi lalu paling "spesifik"
 *    (nama jabatan memuat nama area). Bila tetap seri → ambil pertama (stabil by NIA).
 *
 * @param {string} periodeId
 * @return {{dibuat:number, dipertahankanManual:number, tanpaAtasan:string[]}}
 */
function detectHierarchy_(periodeId) {
  if (!periodeId) throw new Error('periodeId wajib untuk detectHierarchy_');

  return withLock_(function () {
    var aktivis = getAktivisCached_().filter(function (a) { return a.status_aktif; });

    // enrich level
    aktivis.forEach(function (a) {
      var r = resolveLevelJabatan_(a.jabatan_text);
      a._level = r.level;
      a._rank = _levelRank_(r.level);
    });

    // existing rows for this periode
    var existing = readObjects_('hierarki_terdeteksi').filter(function (h) {
      return String(h.periode_id) === String(periodeId);
    });
    var manualPairs = {};
    var manualRows = [];
    existing.forEach(function (h) {
      if (String(h.sumber) === 'koreksi_manual_admin') {
        manualPairs[normalizeNia_(h.nia_bawahan)] = true;
        manualRows.push(h);
      }
    });

    // hapus baris otomatis lama untuk periode ini (biar tidak dobel), sisakan manual
    _deleteHierarkiOtomatis_(periodeId);

    var byBo = _groupBy_(aktivis, function (a) { return a.unit + '||' + a.bo; });
    var byArea = _groupBy_(aktivis, function (a) { return a.unit + '||' + a.area; });

    var newRows = [];
    var tanpaAtasan = [];

    aktivis.forEach(function (bawahan) {
      var niaB = normalizeNia_(bawahan.nia);
      if (manualPairs[niaB]) return; // dihormati, jangan buat otomatis

      var atasan = null;

      if (bawahan._level === 'Staf Pelaksana' || bawahan._rank === 1) {
        // cari pimpinan di bo yang sama
        var kandidatBo = (byBo[bawahan.unit + '||' + bawahan.bo] || []).filter(function (c) {
          return normalizeNia_(c.nia) !== niaB && c._rank >= 2;
        });
        atasan = _pilihAtasan_(kandidatBo, bawahan);
        // fallback: pimpinan di area yang sama
        if (!atasan) {
          var kandidatArea1 = (byArea[bawahan.unit + '||' + bawahan.area] || []).filter(function (c) {
            return normalizeNia_(c.nia) !== niaB && c._rank >= 3;
          });
          atasan = _pilihAtasan_(kandidatArea1, bawahan);
        }
      } else {
        // Pimpinan menengah / pratama → cari yang lebih tinggi di area yang sama
        var kandidatArea = (byArea[bawahan.unit + '||' + bawahan.area] || []).filter(function (c) {
          return normalizeNia_(c.nia) !== niaB && c._rank > bawahan._rank;
        });
        atasan = _pilihAtasan_(kandidatArea, bawahan);
        // fallback: pimpinan puncak di unit yang sama (mis. CEO)
        if (!atasan) {
          var puncak = aktivis.filter(function (c) {
            return c.unit === bawahan.unit && normalizeNia_(c.nia) !== niaB && c._rank >= 4;
          });
          atasan = _pilihAtasan_(puncak, bawahan);
        }
      }

      if (atasan) {
        newRows.push({
          id: shortId_('hir'),
          nia_bawahan: niaB,
          nia_atasan: normalizeNia_(atasan.nia),
          periode_id: periodeId,
          sumber: 'otomatis'
        });
      } else {
        tanpaAtasan.push(niaB);
      }
    });

    if (newRows.length) appendObjects_('hierarki_terdeteksi', newRows);

    appendObject_('audit_log', {
      id: shortId_('aud'), nia: 'SYSTEM', aksi: 'detect_hierarchy', waktu: nowIso_(),
      detail: JSON.stringify({ periodeId: periodeId, dibuat: newRows.length, manual: manualRows.length, tanpaAtasan: tanpaAtasan.length }),
      perangkat_ip: ''
    });

    return { dibuat: newRows.length, dipertahankanManual: manualRows.length, tanpaAtasan: tanpaAtasan };
  });
}

/** Rank numerik level untuk perbandingan. */
function _levelRank_(level) {
  switch (level) {
    case 'Pimpinan Puncak': return 4;
    case 'Pimpinan Menengah': return 3;
    case 'Pimpinan Menengah (Pratama)': return 2;
    case 'Staf Pelaksana': return 1;
    default: return 0; // PERLU_DIPETAKAN
  }
}

/** Pilih 1 atasan terbaik dari kandidat. */
function _pilihAtasan_(kandidat, bawahan) {
  if (!kandidat || !kandidat.length) return null;
  var sorted = kandidat.slice().sort(function (a, b) {
    if (b._rank !== a._rank) return b._rank - a._rank;
    var aSpes = _cocokArea_(a, bawahan) ? 1 : 0;
    var bSpes = _cocokArea_(b, bawahan) ? 1 : 0;
    if (bSpes !== aSpes) return bSpes - aSpes;
    return normalizeNia_(a.nia) < normalizeNia_(b.nia) ? -1 : 1; // stabil
  });
  return sorted[0];
}

function _cocokArea_(kandidat, bawahan) {
  var j = String(kandidat.jabatan_text || '').toLowerCase();
  var area = String(bawahan.area || '').toLowerCase();
  return area && j.indexOf(area) !== -1;
}

function _groupBy_(arr, keyFn) {
  var m = {};
  arr.forEach(function (x) {
    var k = keyFn(x);
    (m[k] = m[k] || []).push(x);
  });
  return m;
}

function _deleteHierarkiOtomatis_(periodeId) {
  var sh = getSheet_('hierarki_terdeteksi');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var idxPeriode = SCHEMA.hierarki_terdeteksi.indexOf('periode_id');
  var idxSumber = SCHEMA.hierarki_terdeteksi.indexOf('sumber');
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idxPeriode]) === String(periodeId) && String(values[r][idxSumber]) !== 'koreksi_manual_admin') {
      sh.deleteRow(r + 1);
    }
  }
}

/**
 * Koreksi manual hierarki oleh Admin. Menimpa/menambah baris pasangan
 * dan menandai sumber = 'koreksi_manual_admin' sehingga tidak ditimpa deteksi ulang.
 * @param {string} periodeId
 * @param {string} niaBawahan
 * @param {string} niaAtasan
 */
function setHierarkiManual_(periodeId, niaBawahan, niaAtasan) {
  return withLock_(function () {
    var b = normalizeNia_(niaBawahan);
    var rows = readObjects_('hierarki_terdeteksi');
    var found = null;
    rows.forEach(function (h) {
      if (String(h.periode_id) === String(periodeId) && normalizeNia_(h.nia_bawahan) === b) found = h;
    });
    if (found) {
      updateRow_('hierarki_terdeteksi', found.__row, {
        nia_atasan: normalizeNia_(niaAtasan), sumber: 'koreksi_manual_admin'
      });
    } else {
      appendObject_('hierarki_terdeteksi', {
        id: shortId_('hir'), nia_bawahan: b, nia_atasan: normalizeNia_(niaAtasan),
        periode_id: periodeId, sumber: 'koreksi_manual_admin'
      });
    }
    return ok_('hierarki manual disimpan');
  });
}

/* ============================================================================
 * 4. CACHE MASTER DATA
 * ========================================================================== */

/**
 * Refresh cache aktivis + referensi level ke PropertiesService sebagai JSON.
 * Dipanggil tiap kali roster diimpor ulang / referensi diubah.
 */
function refreshMasterCache_() {
  var aktivis = readObjects_('aktivis').map(function (a) {
    return {
      nia: normalizeNia_(a.nia),
      nama: a.nama,
      jabatan_text: cleanText_(a.jabatan_text),
      unit: cleanText_(a.unit),
      bo: cleanText_(a.bo),
      area: cleanText_(a.area),
      email: String(a.email || '').trim().toLowerCase(),
      status_aktif: toBool_(a.status_aktif)
    };
  });
  var levelRef = readObjects_('referensi_level_jabatan').map(function (r) {
    return { id: r.id, pola_kata_kunci: r.pola_kata_kunci, level: r.level, is_trigger_teknis: toBool_(r.is_trigger_teknis) };
  });
  _putBigJson_(CACHE_KEY_AKTIVIS, aktivis);
  _putBigJson_(CACHE_KEY_LEVEL_REF, levelRef);
}

function getAktivisCached_() {
  var v = _getBigJson_(CACHE_KEY_AKTIVIS);
  if (v) return v;
  refreshMasterCache_();
  return _getBigJson_(CACHE_KEY_AKTIVIS) || [];
}

function _getLevelRefCached_() {
  var v = _getBigJson_(CACHE_KEY_LEVEL_REF);
  if (v) return v;
  refreshMasterCache_();
  return _getBigJson_(CACHE_KEY_LEVEL_REF) || [];
}

/** Cari 1 aktivis by NIA dari cache. null bila tidak ada. */
function findAktivis_(nia) {
  var n = normalizeNia_(nia);
  var all = getAktivisCached_();
  for (var i = 0; i < all.length; i++) if (all[i].nia === n) return all[i];
  return null;
}

/**
 * Profil lengkap aktivis + level jabatan (dipakai Auth & Assessment).
 * @param {string} nia
 * @return {Object|null}
 */
function getProfil_(nia) {
  var a = findAktivis_(nia);
  if (!a) return null;
  var lv = resolveLevelJabatan_(a.jabatan_text);
  return {
    nia: a.nia, nama: a.nama, jabatan_text: a.jabatan_text,
    unit: a.unit, bo: a.bo, area: a.area, email: a.email,
    status_aktif: a.status_aktif,
    level: lv.level, isTriggerTeknis: lv.isTriggerTeknis, isPimpinan: isLevelPimpinan_(lv.level)
  };
}

/* ============================================================================
 * 5. WRAPPER PUBLIK untuk PANEL ADMIN (dipanggil via google.script.run)
 * ========================================================================== */

/**
 * Impor roster dari Spreadsheet sumber.
 * @param {string} sessionToken
 * @param {{sourceSheetId:string, tabName?:string, apply?:boolean}} p
 */
function adminImportRoster(sessionToken, p) {
  try {
    requireAdmin_(sessionToken);
    p = p || {};
    if (!p.sourceSheetId) return err_('sourceSheetId wajib (ID Google Spreadsheet hasil upload roster).', 'VALIDATION');
    var res = importRosterFromSheet_(p.sourceSheetId, p.tabName || null, { apply: p.apply !== false });
    return ok_(res);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Ringkasan Master Data untuk dashboard admin. */
function adminMasterSummary(sessionToken) {
  try {
    requireSession_(sessionToken);
    var aktivis = getAktivisCached_();
    var aktif = aktivis.filter(function (a) { return a.status_aktif; });
    var perUnit = {}, perArea = {};
    aktif.forEach(function (a) {
      perUnit[a.unit] = (perUnit[a.unit] || 0) + 1;
      perArea[a.area] = (perArea[a.area] || 0) + 1;
    });
    return ok_({
      totalAktivis: aktivis.length,
      aktif: aktif.length,
      nonaktif: aktivis.length - aktif.length,
      perUnit: perUnit,
      perArea: perArea,
      jabatanPerluDipetakan: listJabatanPerluDipetakan_()
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** CRUD Tabel Referensi Level Jabatan (FR-09). */
function adminListLevelRef(sessionToken) {
  try {
    requireAdmin_(sessionToken);
    return ok_(readObjects_('referensi_level_jabatan').map(_stripRow_));
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function adminUpsertLevelRef(sessionToken, p) {
  try {
    requireAdmin_(sessionToken);
    p = p || {};
    if (!p.pola_kata_kunci || !p.level) return err_('pola_kata_kunci & level wajib.', 'VALIDATION');
    return withLock_(function () {
      var rows = readObjects_('referensi_level_jabatan');
      var found = p.id ? rows.filter(function (r) { return String(r.id) === String(p.id); })[0] : null;
      if (found) {
        updateRow_('referensi_level_jabatan', found.__row, {
          pola_kata_kunci: p.pola_kata_kunci, level: p.level,
          is_trigger_teknis: p.is_trigger_teknis ? 'TRUE' : 'FALSE'
        });
      } else {
        appendObject_('referensi_level_jabatan', {
          id: shortId_('lvl'), pola_kata_kunci: p.pola_kata_kunci, level: p.level,
          is_trigger_teknis: p.is_trigger_teknis ? 'TRUE' : 'FALSE'
        });
      }
      refreshMasterCache_();
      return ok_(readObjects_('referensi_level_jabatan').map(_stripRow_));
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Koreksi manual hierarki (wrapper). */
function adminSetHierarkiManual(sessionToken, p) {
  try {
    requireAdmin_(sessionToken);
    p = p || {};
    return setHierarkiManual_(p.periodeId, p.niaBawahan, p.niaAtasan);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Daftar aktivis dalam unit tertentu (untuk dropdown koreksi hierarki). */
function adminListAktivis(sessionToken, unit) {
  try {
    requireAdmin_(sessionToken);
    var all = getAktivisCached_().filter(function (a) {
      return a.status_aktif && (!unit || a.unit === unit);
    });
    return ok_(all.map(function (a) {
      return { nia: a.nia, nama: a.nama, jabatan_text: a.jabatan_text, unit: a.unit, bo: a.bo, area: a.area, level: resolveLevelJabatan_(a.jabatan_text).level };
    }));
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* -- penyimpanan JSON besar: pecah ke beberapa property bila > batas -- */
var _PROP_CHUNK = 8000;
function _putBigJson_(key, obj) {
  var props = scriptProps_();
  var s = JSON.stringify(obj);
  // hapus chunk lama
  var oldN = Number(props.getProperty(key + '_n') || 0);
  for (var i = 0; i < oldN; i++) props.deleteProperty(key + '_' + i);
  var n = Math.ceil(s.length / _PROP_CHUNK) || 1;
  var map = {};
  for (var j = 0; j < n; j++) map[key + '_' + j] = s.substr(j * _PROP_CHUNK, _PROP_CHUNK);
  map[key + '_n'] = String(n);
  props.setProperties(map, false);
  // salinan cepat di CacheService (bila muat)
  try {
    if (s.length < 95000) CacheService.getScriptCache().put(key, s, CACHE_MASTER_TTL_SECONDS);
  } catch (e) {}
}
function _getBigJson_(key) {
  try {
    var c = CacheService.getScriptCache().get(key);
    if (c) return JSON.parse(c);
  } catch (e) {}
  var props = scriptProps_();
  var n = Number(props.getProperty(key + '_n') || 0);
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < n; i++) parts.push(props.getProperty(key + '_' + i) || '');
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
