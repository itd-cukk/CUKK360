/**
 * 00_Config.gs — Helper respons JSON/JSONP + entry-point Admin (setup/seed/impor).
 *
 * Arsitektur (model laporan-hn):
 *  - Backend ini HANYA JSON API. Tidak ada HtmlService / google.script.run.
 *  - Frontend statis (index.html + js/) di-host terpisah (Cloudflare Pages),
 *    memanggil Web App ini via fetch(SCRIPT_URL + '?action=...').
 *  - doGet/doPost + tabel ACTIONS ada di 12_Router.gs.
 *
 * Deploy Web App: Execute as = Me, Who has access = Anyone (agar CORS terbuka
 * untuk fetch lintas-origin dari domain Cloudflare Pages).
 */

/**
 * Bungkus objek jadi TextOutput JSON, atau JSONP bila ada nama callback.
 * @param {Object} obj
 * @param {string=} callback nama fungsi JSONP (dari ?callback=)
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function jr(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================
 * ENTRY POINT ADMIN — dijalankan MANUAL dari editor Apps Script (bukan API)
 * ========================================================================== */

/**
 * Bootstrap awal: buat Spreadsheet database, simpan SPREADSHEET_ID + OTP_PEPPER
 * ke Script Properties, buat 17 sheet + header, seed data referensi.
 * Jalankan SEKALI saat instalasi pertama.
 */
function setup() {
  var props = scriptProps_();
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    var ss = SpreadsheetApp.create(APP_NAME + ' — Database');
    id = ss.getId();
    props.setProperty('SPREADSHEET_ID', id);
  }
  if (!props.getProperty('OTP_PEPPER')) props.setProperty('OTP_PEPPER', Utilities.getUuid());

  ensureAllSheets_();
  seedReferensiLevelJabatan_();
  seedQuestionBank_();
  seedPertanyaanWawancara_();

  var ss2 = getSpreadsheet_();
  var def = ss2.getSheetByName('Sheet1');
  if (def && ss2.getSheets().length > 1) ss2.deleteSheet(def);

  Logger.log('setup() selesai. SPREADSHEET_ID=' + id + ' URL=' + getSpreadsheet_().getUrl());
  return ok_({ spreadsheetId: id, url: getSpreadsheet_().getUrl() });
}

/** Pastikan semua sheet dalam SCHEMA ada beserta headernya. */
function ensureAllSheets_() {
  Object.keys(SCHEMA).forEach(function (name) { getSheet_(name); });
}

/**
 * Impor roster PERTAMA KALI dari editor (bukan API) — mengatasi telur-ayam:
 * impor lewat panel Admin butuh login admin, sedangkan login admin butuh NIA
 * admin sudah ada di sheet `aktivis`.
 *
 * Prasyarat Script Property: BOOTSTRAP_ROSTER_SHEET_ID (wajib), BOOTSTRAP_ROSTER_TAB (opsional).
 */
function firstImport() {
  var id = scriptProps_().getProperty('BOOTSTRAP_ROSTER_SHEET_ID');
  if (!id) throw new Error('Set Script Property BOOTSTRAP_ROSTER_SHEET_ID = ID Spreadsheet sumber roster.');
  var tab = scriptProps_().getProperty('BOOTSTRAP_ROSTER_TAB') || null;
  var res = importRosterFromSheet_(id, tab, { apply: true });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** Pratinjau impor roster tanpa menulis (dry-run) dari editor. */
function firstImportDryRun() {
  var id = scriptProps_().getProperty('BOOTSTRAP_ROSTER_SHEET_ID');
  if (!id) throw new Error('Set Script Property BOOTSTRAP_ROSTER_SHEET_ID.');
  var tab = scriptProps_().getProperty('BOOTSTRAP_ROSTER_TAB') || null;
  var res = importRosterFromSheet_(id, tab, { apply: false });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** Seed ulang seluruh data referensi (idemponten). Jalankan setelah ubah bank pertanyaan di kode. */
function reseedAll() {
  seedReferensiLevelJabatan_();
  seedQuestionBank_();
  seedPertanyaanWawancara_();
  refreshMasterCache_();
  return ok_('reseed selesai');
}

/** Set daftar NIA admin (dipisah koma) ke Script Properties. */
function setAdminNias(csv) {
  scriptProps_().setProperty('ADMIN_NIAS', String(csv || '').trim());
  return ok_(getAdminNias_());
}

function getAdminNias_() {
  var raw = scriptProps_().getProperty('ADMIN_NIAS') || '';
  return raw.split(',').map(normalizeNia_).filter(String);
}

function isAdminNia_(nia) {
  return getAdminNias_().indexOf(normalizeNia_(nia)) !== -1;
}
