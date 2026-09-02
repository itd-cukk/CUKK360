/**
 * Code.gs — Titik masuk Web App (doGet), templating HtmlService, dan
 * entry-point setup/seed untuk Admin.
 *
 * CATATAN STRUKTUR (asumsi didokumentasikan di README):
 * Diagram struktur pada prompt tidak menyebut file router eksplisit. Apps Script
 * tetap membutuhkan satu file pemegang `doGet`/`include`; file inilah tempatnya.
 * Seluruh logika bisnis tetap berada di modul sesuai Bagian 3.
 */

/**
 * Entry point Web App. Aplikasi adalah SPA sederhana: satu shell HTML,
 * navigasi antar layar dilakukan di client, data lewat google.script.run.
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'app';
  // Shell tunggal: Login.html berisi seluruh kerangka SPA (dashboard, assessment,
  // interview, report di-include di dalamnya). File itu memuat <html>/<head>
  // lengkap (termasuk <title> & <meta viewport>), jadi doGet TIDAK memanggil
  // setTitle()/addMetaTag() (Apps Script melarangnya untuk dokumen HTML penuh).
  var t = HtmlService.createTemplateFromFile('Login');
  t.bootstrap = JSON.stringify({ appName: APP_NAME, buildTime: nowIso_(), page: page });
  return t.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Include partial HTML (dipakai: <?!= include('Styles') ?>).
 * @param {string} filename tanpa ekstensi
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================================================================
 * ENTRY POINT ADMIN — dijalankan manual dari editor Apps Script
 * ========================================================================== */

/**
 * Bootstrap awal: buat Spreadsheet database baru bila belum ada, simpan ID-nya
 * ke Script Properties, buat seluruh sheet + header, lalu seed data referensi.
 * Jalankan SEKALI saat instalasi pertama.
 */
function setup() {
  var props = scriptProps_();
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    var ss = SpreadsheetApp.create(APP_NAME + ' — Database');
    id = ss.getId();
    props.setProperty('SPREADSHEET_ID', id);
    // Hapus sheet default kosong nanti setelah sheet skema dibuat.
  }
  if (!props.getProperty('OTP_PEPPER')) {
    props.setProperty('OTP_PEPPER', Utilities.getUuid());
  }
  ensureAllSheets_();
  seedReferensiLevelJabatan_();
  seedQuestionBank_();
  seedPertanyaanWawancara_();
  // Bersihkan sheet "Sheet1" default bila ada dan bukan bagian skema.
  var ss2 = getSpreadsheet_();
  var def = ss2.getSheetByName('Sheet1');
  if (def && ss2.getSheets().length > 1) ss2.deleteSheet(def);

  Logger.log('setup() selesai. SPREADSHEET_ID=' + id);
  return ok_({ spreadsheetId: id, url: getSpreadsheet_().getUrl() });
}

/** Pastikan semua sheet dalam SCHEMA ada beserta headernya. */
function ensureAllSheets_() {
  Object.keys(SCHEMA).forEach(function (name) { getSheet_(name); });
}

/**
 * Seed ulang seluruh data referensi (idemponten — aman diulang).
 * Berguna setelah mengubah bank pertanyaan di kode.
 */
function reseedAll() {
  seedReferensiLevelJabatan_();
  seedQuestionBank_();
  seedPertanyaanWawancara_();
  refreshMasterCache_();
  return ok_('reseed selesai');
}

/**
 * Helper Admin: set daftar NIA admin (dipisah koma) ke Script Properties.
 * @param {string} csv
 */
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
