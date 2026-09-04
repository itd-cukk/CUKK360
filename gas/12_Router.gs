/**
 * 12_Router.gs — Titik masuk Web App. doGet (baca) & doPost (tulis) mendispatch
 * berdasarkan parameter `action` ke tabel ACTIONS. Semua handler mengembalikan
 * objek {ok:boolean, data|error} (dari ok_()/err_()); jr() membungkusnya jadi
 * JSON, atau JSONP bila ada ?callback=.
 *
 * Konvensi:
 *  - GET  : parameter di query string (?action=...&sessionToken=...&penugasanId=...)
 *  - POST : body JSON (Content-Type: text/plain agar tidak memicu CORS preflight),
 *           mis. {"sessionToken":"...","answers":{...}}
 *  - Body POST digabung dengan query param; body menang bila bentrok.
 */

function doGet(e) { return _handleRequest_(e, 'GET'); }
function doPost(e) { return _handleRequest_(e, 'POST'); }

function _handleRequest_(e, method) {
  e = e || {};
  var q = e.parameter || {};
  var callback = q.callback || '';
  var action = q.action || '';

  var params = {};
  Object.keys(q).forEach(function (k) { params[k] = q[k]; });

  if (method === 'POST' && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body && typeof body === 'object') {
        Object.keys(body).forEach(function (k) { params[k] = body[k]; });
        if (body.action) action = body.action;
      }
    } catch (parseErr) {
      return jr(err_('Body POST bukan JSON valid: ' + parseErr, 'BAD_BODY'), callback);
    }
  }

  var fn = ACTIONS[action];
  if (!fn) return jr(err_('Aksi tidak dikenal: "' + action + '"', 'UNKNOWN_ACTION'), callback);
  if (fn.__method && fn.__method !== method) {
    return jr(err_('Aksi "' + action + '" harus dipanggil via ' + fn.__method + '.', 'WRONG_METHOD'), callback);
  }

  try {
    var out = fn(params);
    return jr(out && Object.prototype.hasOwnProperty.call(out, 'ok') ? out : ok_(out), callback);
  } catch (ex) {
    return jr(err_(ex && ex.message ? ex.message : String(ex), 'EXCEPTION'), callback);
  }
}

/** Tandai handler sebagai wajib GET / POST. */
function _get_(fn) { fn.__method = 'GET'; return fn; }
function _post_(fn) { fn.__method = 'POST'; return fn; }

/* ============================================================================
 * TABEL AKSI  (action string  ->  handler(params))
 * Handler hanya menata argumen; logika ada di modul masing-masing.
 * ========================================================================== */

var ACTIONS = {

  /* ---- ping / info ---- */
  'ping': _get_(function () { return ok_({ app: APP_NAME, time: nowIso_() }); }),

  /* ---- Auth ---- */
  'auth.login': _post_(function (p) {
    return authLogin({ nia: p.nia, pin: p.pin, deviceId: p.deviceId });
  }),
  'auth.requestOtp': _post_(function (p) {
    return authRequestActivationOtp({ nia: p.nia });
  }),
  'auth.verifyOtp': _post_(function (p) {
    return authVerifyOtp({ nia: p.nia, kode: p.kode, deviceId: p.deviceId, newPin: p.newPin });
  }),
  'auth.logout': _post_(function (p) { return authLogout(p.sessionToken); }),
  'auth.me': _get_(function (p) { return authMe(p.sessionToken); }),

  /* ---- Dashboard / Beranda ---- */
  'dashboard': _get_(function (p) { return reportDashboard(p.sessionToken); }),

  /* ---- Penilaian 360 ---- */
  'a360.list': _get_(function (p) { return a360ListTasks(p.sessionToken); }),
  'a360.open': _get_(function (p) { return a360OpenTask(p.sessionToken, p.penugasanId); }),
  'a360.saveDraft': _post_(function (p) {
    return a360SaveDraft(p.sessionToken, p.penugasanId, p.answers || {}, p.catatan || '');
  }),
  'a360.submit': _post_(function (p) {
    return a360SubmitTask(p.sessionToken, {
      penugasanId: p.penugasanId, formToken: p.formToken,
      answers: p.answers || {}, catatan: p.catatan || ''
    });
  }),

  /* ---- Wawancara ---- */
  'iv.list': _get_(function (p) { return ivListSessions(p.sessionToken); }),
  'iv.open': _get_(function (p) { return ivOpenSession(p.sessionToken, p.sesiId); }),
  'iv.saveSelf': _post_(function (p) {
    return ivSaveSelfAppraisal(p.sessionToken, p.sesiId, p.answers || {});
  }),
  'iv.saveAtasan': _post_(function (p) {
    return ivSaveAtasanNotes(p.sessionToken, {
      sesiId: p.sesiId, catatan: p.catatan || {}, tanggal_sesi: p.tanggal_sesi,
      status: p.status, rencanaTindakLanjut: p.rencanaTindakLanjut || []
    });
  }),
  'iv.confirm': _post_(function (p) { return ivConfirmSession(p.sessionToken, p.sesiId); }),

  /* ---- Laporan ---- */
  'report.individu': _get_(function (p) { return reportIndividu(p.sessionToken, p.niaTarget, p.periodeId); }),
  'report.individuPdf': _get_(function (p) { return reportIndividuPdf(p.sessionToken, p.niaTarget, p.periodeId); }),
  'report.agregat': _get_(function (p) {
    return reportAgregat(p.sessionToken, { groupBy: p.groupBy, periodeId: p.periodeId });
  }),
  'report.excelUrl': _get_(function (p) { return reportExportExcelUrl(p.sessionToken); }),
  'validation.report': _get_(function (p) {
    return validationReport(p.sessionToken, { periodeId: p.periodeId });
  }),
  'audit.tail': _get_(function (p) { return auditLogTail(p.sessionToken, p.limit); }),

  /* ---- Periode (Admin) ---- */
  'periode.list': _get_(function (p) { return periodeList(p.sessionToken); }),
  'periode.create': _post_(function (p) {
    return periodeCreate(p.sessionToken, {
      nama: p.nama, jenis: p.jenis, tanggal_mulai: p.tanggal_mulai, tanggal_selesai: p.tanggal_selesai
    });
  }),
  'periode.setStatus': _post_(function (p) {
    return periodeSetStatus(p.sessionToken, p.periodeId, p.status);
  }),

  /* ---- Master Data (Admin) ---- */
  'admin.importRoster': _post_(function (p) {
    return adminImportRoster(p.sessionToken, {
      sourceSheetId: p.sourceSheetId, tabName: p.tabName, apply: p.apply
    });
  }),
  'admin.masterSummary': _get_(function (p) { return adminMasterSummary(p.sessionToken); }),
  'admin.listLevelRef': _get_(function (p) { return adminListLevelRef(p.sessionToken); }),
  'admin.upsertLevelRef': _post_(function (p) {
    return adminUpsertLevelRef(p.sessionToken, {
      id: p.id, pola_kata_kunci: p.pola_kata_kunci, level: p.level, is_trigger_teknis: p.is_trigger_teknis
    });
  }),
  'admin.listAktivis': _get_(function (p) { return adminListAktivis(p.sessionToken, p.unit); }),
  'admin.setHierarkiManual': _post_(function (p) {
    return adminSetHierarkiManual(p.sessionToken, {
      periodeId: p.periodeId, niaBawahan: p.niaBawahan, niaAtasan: p.niaAtasan
    });
  }),
  'admin.installTriggers': _post_(function (p) { return adminInstallTriggers(p.sessionToken); }),
  'admin.runReminderNow': _post_(function (p) { return adminRunReminderNow(p.sessionToken); })
};
