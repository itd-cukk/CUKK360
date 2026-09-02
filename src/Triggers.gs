/**
 * Triggers.gs — Instalasi time-driven trigger.
 *
 * FR-38 / FR-39: pengingat harian & ringkasan progres ke Admin.
 * Jalankan installTriggers() sekali dari editor Apps Script (atau lewat panel Admin).
 */

var TRIGGER_HANDLER = 'dailyReminderJob_';

/** Pasang trigger harian ~07:00 waktu Asia/Pontianak. Idemponten. */
function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger(TRIGGER_HANDLER)
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone(TZ)
    .create();
  _audit_('SYSTEM', 'install_triggers', { handler: TRIGGER_HANDLER, hour: 7 });
  return ok_('trigger harian dipasang (07:00 ' + TZ + ')');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  });
  return ok_('trigger dihapus');
}

/**
 * Handler harian. Dipanggil otomatis oleh trigger.
 * - Kirim pengingat H-3 / H-1 ke aktivis dengan tugas belum selesai.
 * - Setiap hari Senin, kirim ringkasan progres ke Admin.
 */
function dailyReminderJob_() {
  try {
    var pending = notifyPendingTasks_();
    Logger.log('notifyPendingTasks_: ' + JSON.stringify(pending));

    var dow = Number(Utilities.formatDate(new Date(), TZ, 'u')); // 1=Senin..7=Minggu
    if (dow === 1) {
      var prog = notifyAdminProgress_();
      Logger.log('notifyAdminProgress_: ' + JSON.stringify(prog));
    }
  } catch (e) {
    Logger.log('dailyReminderJob_ error: ' + e);
    _audit_('SYSTEM', 'daily_job_error', { error: String(e) });
  }
}

/* -- entry point panel Admin -- */
function adminInstallTriggers(sessionToken) {
  try { requireAdmin_(sessionToken); return installTriggers(); }
  catch (e) { return err_(e.message, 'EXCEPTION'); }
}
function adminRunReminderNow(sessionToken) {
  try {
    requireAdmin_(sessionToken);
    return ok_({ pending: notifyPendingTasks_({ force: true }), adminProgress: notifyAdminProgress_() });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}
