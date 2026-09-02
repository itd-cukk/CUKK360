/**
 * Validation.gs — Kontrol kualitas data & anti-kecurangan.
 *
 * FR-35 (straight-lining), FR-36 (kalibrasi), FR-37 (audit log), FR-44 (laporan
 * kualitas data), BR-05 (kalibrasi gagal TIDAK memblokir submit), BR-07.
 */

/* ============================================================================
 * EVALUASI SATU SUBMIT (dipanggil dari a360SubmitTask)
 * ========================================================================== */

/**
 * @param {string} penugasanId
 * @param {{coreIds:string[], teknisIds:string[], includeTeknis:boolean,
 *          kalibrasiCoreId:?string, kalibrasiTeknisId:?string}} spec
 * @return {{straightLining:boolean, kalibrasiCoreGagal:boolean,
 *           kalibrasiTeknisGagal:boolean, flagged:boolean, catatan:string[]}}
 */
function evaluateSubmissionQuality_(penugasanId, spec) {
  var jawaban = readObjects_('jawaban_360').filter(function (j) {
    return String(j.penugasan_id) === String(penugasanId);
  });
  var byQ = {};
  jawaban.forEach(function (j) { byQ[j.pertanyaan_id] = Number(j.skor); });

  var catatan = [];

  // --- straight-lining: semua skor core_value identik ---
  var coreScores = spec.coreIds.map(function (id) { return byQ[id]; }).filter(function (v) { return v >= 1 && v <= 5; });
  var straightLining = coreScores.length >= 5 && coreScores.every(function (v) { return v === coreScores[0]; });
  if (straightLining) catatan.push('Straight-lining: seluruh ' + coreScores.length + ' butir Core Values dijawab angka ' + coreScores[0] + '.');

  // --- kalibrasi ---
  var kalibrasiCoreGagal = false, kalibrasiTeknisGagal = false;
  if (spec.kalibrasiCoreId && byQ[spec.kalibrasiCoreId] !== undefined) {
    kalibrasiCoreGagal = Number(byQ[spec.kalibrasiCoreId]) !== 1;
    if (kalibrasiCoreGagal) catatan.push('Kalibrasi Core Values gagal (dijawab ' + byQ[spec.kalibrasiCoreId] + ', seharusnya 1).');
  }
  if (spec.includeTeknis && spec.kalibrasiTeknisId && byQ[spec.kalibrasiTeknisId] !== undefined) {
    kalibrasiTeknisGagal = Number(byQ[spec.kalibrasiTeknisId]) !== 2;
    if (kalibrasiTeknisGagal) catatan.push('Kalibrasi Teknis gagal (dijawab ' + byQ[spec.kalibrasiTeknisId] + ', seharusnya 2).');
  }

  var flagged = straightLining || kalibrasiCoreGagal || kalibrasiTeknisGagal;

  if (flagged) {
    try {
      appendObject_('audit_log', {
        id: shortId_('aud'), nia: 'SYSTEM', aksi: 'flag_kualitas_data', waktu: nowIso_(),
        detail: JSON.stringify({ penugasanId: penugasanId, straightLining: straightLining,
          kalibrasiCoreGagal: kalibrasiCoreGagal, kalibrasiTeknisGagal: kalibrasiTeknisGagal, catatan: catatan }),
        perangkat_ip: ''
      });
    } catch (e) { Logger.log('flag audit gagal: ' + e); }
  }

  return {
    straightLining: straightLining,
    kalibrasiCoreGagal: kalibrasiCoreGagal,
    kalibrasiTeknisGagal: kalibrasiTeknisGagal,
    flagged: flagged,
    catatan: catatan
  };
}

/* ============================================================================
 * LAPORAN KUALITAS DATA (FR-44) — dipakai Report.gs & panel Admin/IAD
 * ========================================================================== */

/**
 * @param {string} sessionToken
 * @param {{periodeId?:string}=} filter
 */
function validationReport(sessionToken, filter) {
  try {
    var s = requireSession_(sessionToken);
    if (!s.isAdmin && !s.isPimpinan) return err_('Tidak berwenang.', 'FORBIDDEN');
    filter = filter || {};
    return ok_(buildValidationReport_(filter.periodeId || null));
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function buildValidationReport_(periodeId) {
  var per = periodeId ? _findPeriode_(periodeId) : getActivePeriode_('360');
  var pid = per ? per.id : null;

  var kalIds = kalibrasiIds_();
  var penugasan = readObjects_('penugasan_penilaian').filter(function (r) {
    return !pid || String(r.periode_id) === String(pid);
  });
  var penugasanById = {};
  penugasan.forEach(function (r) { penugasanById[r.id] = r; });

  var jawaban = readObjects_('jawaban_360');
  var byPenugasan = {};
  jawaban.forEach(function (j) {
    (byPenugasan[j.penugasan_id] = byPenugasan[j.penugasan_id] || []).push(j);
  });

  var katMap = pertanyaanKategoriMap_();

  var gagalKalibrasi = [];
  var straightLining = [];

  Object.keys(byPenugasan).forEach(function (penId) {
    var r = penugasanById[penId];
    if (!r) return;
    var arr = byPenugasan[penId];
    var byQ = {};
    arr.forEach(function (j) { byQ[j.pertanyaan_id] = Number(j.skor); });

    // kalibrasi
    if (byQ['kal_core'] !== undefined && Number(byQ['kal_core']) !== 1) {
      gagalKalibrasi.push({ penugasanId: penId, nia_penilai: r.nia_penilai, nia_dinilai: r.nia_dinilai, seksi: 'Core Values', dijawab: byQ['kal_core'] });
    }
    if (byQ['kal_teknis'] !== undefined && Number(byQ['kal_teknis']) !== 2) {
      gagalKalibrasi.push({ penugasanId: penId, nia_penilai: r.nia_penilai, nia_dinilai: r.nia_dinilai, seksi: 'Teknis', dijawab: byQ['kal_teknis'] });
    }

    // straight-lining pada butir core_value
    var coreScores = [];
    arr.forEach(function (j) {
      if (katMap[j.pertanyaan_id]) coreScores.push(Number(j.skor));
    });
    if (coreScores.length >= 5 && coreScores.every(function (v) { return v === coreScores[0]; })) {
      straightLining.push({ penugasanId: penId, nia_penilai: r.nia_penilai, nia_dinilai: r.nia_dinilai, nilai: coreScores[0], jumlahButir: coreScores.length });
    }
  });

  // NIA duplikat (harusnya sudah ditahan saat impor, tapi tampilkan untuk audit)
  var seen = {}, dupNia = [];
  readObjects_('aktivis').forEach(function (a) {
    var n = normalizeNia_(a.nia);
    seen[n] = (seen[n] || 0) + 1;
  });
  Object.keys(seen).forEach(function (n) { if (seen[n] > 1) dupNia.push({ nia: n, jumlah: seen[n] }); });

  // jabatan belum terpetakan
  var jabatanBelumDipetakan = listJabatanPerluDipetakan_();

  return {
    periode: per ? _stripRow_(per) : null,
    gagalKalibrasi: gagalKalibrasi,
    straightLining: straightLining,
    niaDuplikat: dupNia,
    jabatanBelumDipetakan: jabatanBelumDipetakan,
    ringkasan: {
      gagalKalibrasi: gagalKalibrasi.length,
      straightLining: straightLining.length,
      niaDuplikat: dupNia.length,
      jabatanBelumDipetakan: jabatanBelumDipetakan.length
    }
  };
}

/* ============================================================================
 * AUDIT LOG READER (FR-37) — untuk IAD/Admin
 * ========================================================================== */

function auditLogTail(sessionToken, limit) {
  try {
    var s = requireSession_(sessionToken);
    if (!s.isAdmin && !s.isPimpinan) return err_('Tidak berwenang.', 'FORBIDDEN');
    var rows = readObjects_('audit_log');
    limit = Math.min(Number(limit || 200), 1000);
    var tail = rows.slice(Math.max(0, rows.length - limit)).reverse().map(_stripRow_);
    return ok_(tail);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}
