/**
 * Assessment360.gs — Alur Penilaian 360 derajat (inti aplikasi).
 *
 * FR-19..FR-27, BR-04, BR-05, BR-07, BR-10.
 *
 * Alur:
 *  1. a360ListTasks        → daftar tugas untuk NIA login (periode aktif, unit sendiri).
 *  2. a360OpenTask         → konteks pemangku jabatan + kuesioner (opsi diacak di server,
 *                            spesifikasi form disimpan di cache berkunci formToken).
 *  3. a360SaveDraft        → simpan sementara (auto-save) di cache.
 *  4. a360SubmitTask       → validasi lengkap, tulis jawaban_360 (LockService),
 *                            tandai penugasan selesai, jalankan flag validasi.
 */

var FORM_CACHE_PREFIX = 'form_';
var DRAFT_CACHE_PREFIX = 'draft_';
var FORM_TTL_SECONDS = 3 * 60 * 60;

/* ============================================================================
 * 1. DAFTAR TUGAS
 * ========================================================================== */

/**
 * @param {string} sessionToken
 * @return {{ok:boolean, data?:{periode:Object, tasks:Object[], ringkasan:Object}}}
 */
function a360ListTasks(sessionToken) {
  try {
    var s = requireSession_(sessionToken);
    var per = getActivePeriode_('360');
    if (!per) return ok_({ periode: null, tasks: [], ringkasan: { total: 0, selesai: 0 } });

    var myNia = normalizeNia_(s.nia);
    var rows = readObjects_('penugasan_penilaian').filter(function (r) {
      return String(r.periode_id) === String(per.id) && normalizeNia_(r.nia_penilai) === myNia;
    });

    var tasks = rows.map(function (r) {
      var d = getProfil_(r.nia_dinilai) || { nama: '(tidak ditemukan)', jabatan_text: '', bo: '', area: '', unit: '' };
      // BR-10 guard tambahan (seharusnya sudah dijamin generator)
      if (d.unit && d.unit !== s.unit) return null;
      return {
        penugasanId: r.id,
        jenis_relasi: r.jenis_relasi,
        status: r.status,
        dinilai: {
          nia: r.nia_dinilai, nama: d.nama, jabatan_text: d.jabatan_text,
          bo: d.bo, area: d.area, level: d.level, isPimpinan: d.isPimpinan
        }
      };
    }).filter(Boolean);

    // urut: belum dulu, lalu self→atasan→bawahan→peer
    var order = { self: 0, atasan: 1, bawahan: 2, peer: 3 };
    tasks.sort(function (a, b) {
      if ((a.status === 'selesai') !== (b.status === 'selesai')) return a.status === 'selesai' ? 1 : -1;
      return (order[a.jenis_relasi] || 9) - (order[b.jenis_relasi] || 9);
    });

    var selesai = tasks.filter(function (t) { return t.status === 'selesai'; }).length;
    return ok_({
      periode: per,
      tasks: tasks,
      ringkasan: { total: tasks.length, selesai: selesai, sisa: tasks.length - selesai }
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * 2. BUKA TUGAS
 * ========================================================================== */

/**
 * @param {string} sessionToken
 * @param {string} penugasanId
 * @return {{ok:boolean, data?:{konteks:Object, form:Object, formToken:string, draft:Object|null}}}
 */
function a360OpenTask(sessionToken, penugasanId) {
  try {
    var s = requireSession_(sessionToken);
    var asg = _getAssignmentForUser_(penugasanId, s.nia);
    if (!asg.ok) return err_(asg.msg, asg.code);
    var r = asg.row;

    if (r.status === 'selesai' && _periodeTerkunci_(r.periode_id)) {
      return err_('Penilaian sudah dikirim dan periode terkunci.', 'LOCKED');
    }

    var dinilai = getProfil_(r.nia_dinilai);
    if (!dinilai) return err_('Data pemangku jabatan tidak ditemukan.', 'NOT_FOUND');

    // FR-24 / BR-04: seksi teknis bila relasi = bawahan-menilai-atasan ATAU pemangku jabatan pimpinan
    var includeTeknis = (r.jenis_relasi === 'bawahan') || !!dinilai.isTriggerTeknis;

    var form = buildQuestionnaire_({ includeTeknis: includeTeknis });

    // simpan spesifikasi form (id pertanyaan yang sah) di cache
    var formToken = uuid_();
    var spec = {
      penugasanId: r.id,
      nia_penilai: normalizeNia_(s.nia),
      includeTeknis: includeTeknis,
      coreIds: form.core.map(function (q) { return q.id; }),
      teknisIds: form.teknis.map(function (q) { return q.id; }),
      kalibrasiCoreId: form.kalibrasiCore ? form.kalibrasiCore.id : null,
      kalibrasiTeknisId: form.kalibrasiTeknis ? form.kalibrasiTeknis.id : null
    };
    CacheService.getUserCache().put(FORM_CACHE_PREFIX + formToken, JSON.stringify(spec), FORM_TTL_SECONDS);

    var draftRaw = CacheService.getUserCache().get(DRAFT_CACHE_PREFIX + r.id);
    var draft = draftRaw ? JSON.parse(draftRaw) : null;

    return ok_({
      konteks: {
        penugasanId: r.id,
        jenis_relasi: r.jenis_relasi,
        status: r.status,
        includeTeknis: includeTeknis,
        dinilai: {
          nia: dinilai.nia, nama: dinilai.nama, jabatan_text: dinilai.jabatan_text,
          bo: dinilai.bo, area: dinilai.area, unit: dinilai.unit, level: dinilai.level
        }
      },
      form: form,
      formToken: formToken,
      draft: draft
    });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * 3. AUTO-SAVE DRAFT (FR-26)
 * ========================================================================== */

function a360SaveDraft(sessionToken, penugasanId, answers, catatan) {
  try {
    var s = requireSession_(sessionToken);
    var asg = _getAssignmentForUser_(penugasanId, s.nia);
    if (!asg.ok) return err_(asg.msg, asg.code);
    CacheService.getUserCache().put(
      DRAFT_CACHE_PREFIX + penugasanId,
      JSON.stringify({ answers: answers || {}, catatan: catatan || '', savedAt: nowIso_() }),
      FORM_TTL_SECONDS
    );
    return ok_(true);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * 4. SUBMIT
 * ========================================================================== */

/**
 * @param {string} sessionToken
 * @param {{penugasanId:string, formToken:string, answers:Object<string,number>, catatan?:string}} p
 * @return {{ok:boolean, data?:{status:string, kualitasData:Object}}}
 */
function a360SubmitTask(sessionToken, p) {
  try {
    var s = requireSession_(sessionToken);
    p = p || {};
    var specRaw = CacheService.getUserCache().get(FORM_CACHE_PREFIX + p.formToken);
    if (!specRaw) return err_('Sesi formulir kedaluwarsa. Buka ulang tugas ini.', 'FORM_EXPIRED');
    var spec = JSON.parse(specRaw);
    if (String(spec.penugasanId) !== String(p.penugasanId) ||
        spec.nia_penilai !== normalizeNia_(s.nia)) {
      return err_('Token formulir tidak cocok.', 'FORM_MISMATCH');
    }

    var answers = p.answers || {};

    // ---- validasi kelengkapan (FR-26) ----
    var wajib = spec.coreIds.slice();
    if (spec.kalibrasiCoreId) wajib.push(spec.kalibrasiCoreId);
    if (spec.includeTeknis) {
      wajib = wajib.concat(spec.teknisIds);
      if (spec.kalibrasiTeknisId) wajib.push(spec.kalibrasiTeknisId);
    }
    var belum = [];
    wajib.forEach(function (qid) {
      var v = Number(answers[qid]);
      if (!(v >= 1 && v <= 5)) belum.push(qid);
    });
    if (belum.length) {
      return err_('Masih ada ' + belum.length + ' pertanyaan wajib yang belum dijawab.', 'INCOMPLETE');
    }

    // tolak jawaban untuk pertanyaan di luar spesifikasi form (mis. teknis padahal tak dipicu)
    var allowed = {};
    wajib.forEach(function (q) { allowed[q] = true; });

    var result = withLock_(function () {
      var asg = _getAssignmentForUser_(p.penugasanId, s.nia);
      if (!asg.ok) return { err: asg.msg, code: asg.code };
      var r = asg.row;

      // FR-27: cegah dobel bila sudah selesai & terkunci
      if (r.status === 'selesai' && _periodeTerkunci_(r.periode_id)) {
        return { err: 'Sudah dikirim & terkunci.', code: 'LOCKED' };
      }

      // hapus jawaban lama utk penugasan ini (edit sebelum deadline diperbolehkan)
      _deleteJawaban360_(r.id);

      var rows = [];
      Object.keys(answers).forEach(function (qid) {
        if (!allowed[qid]) return;
        rows.push({ id: shortId_('ans'), penugasan_id: r.id, pertanyaan_id: qid, skor: Number(answers[qid]) });
      });
      appendObjects_('jawaban_360', rows);

      // catatan khusus (FR-25) — disimpan di audit detail (tidak ada sheet khusus di skema)
      updateRow_('penugasan_penilaian', r.__row, { status: 'selesai' });

      return { ok: true, periodeId: r.periode_id, penugasanId: r.id, relasi: r.jenis_relasi, niaDinilai: r.nia_dinilai };
    });

    if (result.err) return err_(result.err, result.code);

    CacheService.getUserCache().remove(DRAFT_CACHE_PREFIX + p.penugasanId);
    CacheService.getUserCache().remove(FORM_CACHE_PREFIX + p.formToken);

    // ---- flag kualitas data (BR-05: tidak memblokir submit) ----
    var kualitas = evaluateSubmissionQuality_(result.penugasanId, spec);

    _audit_(s.nia, 'submit_360', {
      penugasanId: result.penugasanId, relasi: result.relasi,
      dinilai: result.niaDinilai, catatanAda: !!(p.catatan && p.catatan.trim()),
      kualitas: kualitas
    });

    return ok_({ status: 'selesai', kualitasData: kualitas });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function _getAssignmentForUser_(penugasanId, nia) {
  var rows = readObjects_('penugasan_penilaian');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(penugasanId)) {
      if (normalizeNia_(rows[i].nia_penilai) !== normalizeNia_(nia)) {
        return { ok: false, msg: 'Tugas ini bukan milik Anda.', code: 'FORBIDDEN' };
      }
      return { ok: true, row: rows[i] };
    }
  }
  return { ok: false, msg: 'Penugasan tidak ditemukan.', code: 'NOT_FOUND' };
}

function _periodeTerkunci_(periodeId) {
  var per = _findPeriode_(periodeId);
  if (!per) return true;
  if (String(per.status) === 'tutup') return true;
  if (per.tanggal_selesai) {
    var end = new Date(per.tanggal_selesai + 'T23:59:59');
    if (!isNaN(end.getTime()) && new Date() > end) return true;
  }
  return false;
}

function _deleteJawaban360_(penugasanId) {
  var sh = getSheet_('jawaban_360');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var iPen = SCHEMA.jawaban_360.indexOf('penugasan_id');
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][iPen]) === String(penugasanId)) sh.deleteRow(r + 1);
  }
}
