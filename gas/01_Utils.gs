/**
 * Utils.gs — Helper umum, konstanta, dan definisi skema Google Sheets.
 *
 * Semua modul lain bergantung pada file ini. Tidak ada logika bisnis di sini.
 *
 * Asumsi (didokumentasikan di README):
 * - ID Spreadsheet database disimpan di Script Properties dengan key `SPREADSHEET_ID`.
 * - Daftar NIA yang punya hak Admin/Super Admin disimpan di Script Properties
 *   key `ADMIN_NIAS` (dipisah koma). Peran fungsional lain diturunkan dari Level Jabatan.
 */

/* ============================================================================
 * KONSTANTA GLOBAL
 * ========================================================================== */

var APP_NAME = 'KK-360 Performance';
var TZ = 'Asia/Pontianak';

/** TTL sesi login (detik). 8 jam. */
var SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Masa berlaku OTP (menit). */
var OTP_TTL_MINUTES = 5;

/** Maksimal percobaan verifikasi OTP sebelum kode dianggap hangus. */
var OTP_MAX_ATTEMPTS = 5;

/** Prefix key CacheService untuk sesi. */
var CACHE_SESSION_PREFIX = 'sess_';

/** Key CacheService/PropertiesService untuk cache master data. */
var CACHE_KEY_AKTIVIS = 'cache_aktivis_json';
var CACHE_KEY_LEVEL_REF = 'cache_level_ref_json';
var CACHE_MASTER_TTL_SECONDS = 6 * 60 * 60;

/** Level jabatan yang dianggap "Pimpinan" untuk kebutuhan peran & laporan. */
var LEVEL_PIMPINAN = [
  'Pimpinan Puncak',
  'Pimpinan Menengah',
  'Pimpinan Menengah (Pratama)'
];

/** Kode + nama 8 dimensi Core Values INVICTUS (urutan resmi). */
var INVICTUS = [
  { kode: 'I', nama: 'Integritas' },
  { kode: 'N', nama: 'Network' },
  { kode: 'V', nama: 'Value Creation' },
  { kode: 'I2', nama: 'Innovation' },
  { kode: 'C', nama: 'Credibility' },
  { kode: 'T', nama: 'Togetherness' },
  { kode: 'U', nama: 'Unity' },
  { kode: 'S', nama: 'Speed' }
];

/* ============================================================================
 * SKEMA GOOGLE SHEETS (Bagian 4 prompt / Bab 6 FRD)
 * Header ditulis PERSIS seperti di bawah pada baris pertama tiap sheet.
 * ========================================================================== */

var SCHEMA = {
  aktivis: ['nia', 'nama', 'jabatan_text', 'unit', 'bo', 'area', 'email', 'status_aktif', 'sumber_impor', 'tanggal_impor'],
  riwayat_mutasi_aktivis: ['id', 'nia', 'jabatan_text_lama', 'bo_lama', 'area_lama', 'berlaku_sejak_periode'],
  referensi_level_jabatan: ['id', 'pola_kata_kunci', 'level', 'is_trigger_teknis'],
  hierarki_terdeteksi: ['id', 'nia_bawahan', 'nia_atasan', 'periode_id', 'sumber'],
  otp_log: ['id', 'nia_target', 'kode_otp_hash', 'waktu_kirim', 'waktu_kedaluwarsa', 'status'],
  periode_penilaian: ['id', 'nama', 'jenis', 'tanggal_mulai', 'tanggal_selesai', 'status'],
  kategori_core_value: ['id', 'kode_huruf', 'nama'],
  pertanyaan_360: ['id', 'tipe', 'kategori_id', 'teks', 'label_skala_1', 'label_skala_2', 'label_skala_3', 'label_skala_4', 'label_skala_5', 'urutan'],
  opsi_jawaban_teknis: ['pertanyaan_id', 'skor', 'teks_label', 'deskripsi'],
  penugasan_penilaian: ['id', 'periode_id', 'nia_penilai', 'nia_dinilai', 'jenis_relasi', 'status'],
  jawaban_360: ['id', 'penugasan_id', 'pertanyaan_id', 'skor'],
  pertanyaan_wawancara: ['id', 'kategori', 'teks', 'berlaku_level'],
  sesi_wawancara: ['id', 'periode_id', 'nia_atasan', 'nia_bawahan', 'status', 'tanggal_sesi', 'konfirmasi_atasan', 'konfirmasi_bawahan'],
  jawaban_wawancara: ['id', 'sesi_id', 'pertanyaan_id', 'jawaban_self_appraisal', 'catatan_atasan'],
  rencana_tindak_lanjut: ['id', 'sesi_id', 'deskripsi', 'target_waktu', 'status'],
  audit_log: ['id', 'nia', 'aksi', 'waktu', 'detail', 'perangkat_ip']
};

/* ============================================================================
 * AKSES SPREADSHEET
 * ========================================================================== */

/** @return {GoogleAppsScript.Properties.Properties} */
function scriptProps_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Spreadsheet database. Mendukung 2 mode:
 *  - Container-bound (seperti laporan-hn): kode ada DI DALAM Spreadsheet
 *    (Extensions → Apps Script) → pakai getActiveSpreadsheet().
 *  - Standalone: pakai SPREADSHEET_ID di Script Properties (dibuat oleh setup()).
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = scriptProps_().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('Tidak ada Spreadsheet aktif dan SPREADSHEET_ID belum di-set. ' +
      'Jalankan setup() (mode standalone) atau buat script dari dalam Spreadsheet (mode bound).');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Ambil sheet dengan nama tertentu; buat jika belum ada, lengkap dengan header dari SCHEMA.
 * @param {string} name
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet_(name) {
  if (!SCHEMA[name]) throw new Error('Sheet tidak dikenal di SCHEMA: ' + name);
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Baca seluruh baris sebuah sheet sebagai array of objects (key = header).
 * TIDAK dipakai per-request untuk master data besar (pakai cache) — hanya utilitas.
 * @param {string} name
 * @return {Object[]}
 */
function readObjects_(name) {
  var sh = getSheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue; // lewati baris kosong
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj.__row = r + 1; // nomor baris asli di sheet (1-based) untuk update in-place
    out.push(obj);
  }
  return out;
}

/**
 * Tambah satu baris object ke sheet, mengikuti urutan kolom SCHEMA.
 * @param {string} name
 * @param {Object} obj
 */
function appendObject_(name, obj) {
  var sh = getSheet_(name);
  var cols = SCHEMA[name];
  var row = cols.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  sh.appendRow(row);
}

/**
 * Tambah banyak baris object sekaligus (jauh lebih cepat dari appendObject_ berulang).
 * @param {string} name
 * @param {Object[]} objs
 */
function appendObjects_(name, objs) {
  if (!objs || !objs.length) return;
  var sh = getSheet_(name);
  var cols = SCHEMA[name];
  var rows = objs.map(function (o) {
    return cols.map(function (c) { return o[c] === undefined ? '' : o[c]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols.length).setValues(rows);
}

/**
 * Tulis nilai sebagian kolom pada satu baris (dari readObjects_.__row).
 * @param {string} name
 * @param {number} rowNumber 1-based nomor baris asli
 * @param {Object} patch key = header, value = nilai baru
 */
function updateRow_(name, rowNumber, patch) {
  var sh = getSheet_(name);
  var cols = SCHEMA[name];
  var range = sh.getRange(rowNumber, 1, 1, cols.length);
  var current = range.getValues()[0];
  for (var c = 0; c < cols.length; c++) {
    if (Object.prototype.hasOwnProperty.call(patch, cols[c])) current[c] = patch[cols[c]];
  }
  range.setValues([current]);
}

/* ============================================================================
 * CONCURRENCY
 * ========================================================================== */

/**
 * Jalankan fn di dalam script lock. Dipakai untuk operasi tulis kritis
 * (submit 360, konfirmasi wawancara, impor roster).
 * @param {function():T} fn
 * @param {number=} timeoutMs default 30 detik
 * @return {T}
 * @template T
 */
function withLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * ID / HASH / WAKTU
 * ========================================================================== */

function uuid_() {
  return Utilities.getUuid();
}

/** ID pendek deterministik-acak untuk baris sheet. */
function shortId_(prefix) {
  return (prefix || 'id') + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function addMinutes_(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

/** SHA-256 hex dari string. */
function sha256Hex_(str) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Hash OTP dengan garam per-NIA supaya rainbow table tidak berguna.
 * @param {string} nia
 * @param {string} kode kode OTP 6 digit
 */
function hashOtp_(nia, kode) {
  var pepper = scriptProps_().getProperty('OTP_PEPPER') || 'kk360-default-pepper';
  return sha256Hex_(nia + '|' + kode + '|' + pepper);
}

/* ============================================================================
 * NIA
 * ========================================================================== */

/** Panjang baku NIA (seluruh NIA riil = 12 karakter). */
var NIA_LEN = 12;

/**
 * Normalisasi NIA: trim, buang spasi internal, uppercase, dan LEFT-PAD '0'
 * untuk NIA murni-angka yang lebih pendek dari NIA_LEN.
 *
 * Alasan pad: Google Sheets sering mengubah NIA numerik ("010921100264") jadi
 * angka dan membuang '0' di depan ("10921100264"). NIA riil selalu 12 karakter,
 * jadi angka < 12 digit dipulihkan. NIA alfanumerik (mengandung huruf, mis.
 * "01SK11700901") tidak tersentuh — hanya di-uppercase.
 * @param {*} nia
 * @return {string}
 */
function normalizeNia_(nia) {
  var s = String(nia == null ? '' : nia).replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(s) && s.length < NIA_LEN) {
    s = ('000000000000' + s).slice(-NIA_LEN);
  }
  return s;
}

/**
 * Validasi format NIA: 10–14 karakter alfanumerik (huruf & angka diperbolehkan).
 * Pola sengaja longgar; validasi keras dilakukan saat pencocokan ke Master Data.
 * @param {string} nia
 * @return {boolean}
 */
function isValidNiaFormat_(nia) {
  var n = normalizeNia_(nia);
  return /^[A-Z0-9]{8,16}$/.test(n);
}

/* ============================================================================
 * STRING / MISC
 * ========================================================================== */

/** Rapikan teks jabatan bebas: hapus newline, spasi ganda, trim. */
function cleanText_(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Fisher–Yates shuffle (menghasilkan array baru). */
function shuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/**
 * Rata-rata numerik; abaikan null/undefined/'' dan nilai non-numerik.
 * null bila tidak ada nilai valid. (Catatan: Number('') === 0, jadi string
 * kosong HARUS ditolak eksplisit sebelum konversi.)
 */
function average_(nums) {
  var s = 0, n = 0;
  for (var i = 0; i < nums.length; i++) {
    var raw = nums[i];
    if (raw === null || raw === undefined || raw === '') continue;
    var v = Number(raw);
    if (!isNaN(v)) { s += v; n++; }
  }
  return n ? s / n : null;
}

function round2_(x) {
  return x == null ? null : Math.round(x * 100) / 100;
}

/** Boolean dari sel sheet ("TRUE"/"FALSE"/true/1/"ya"). */
function toBool_(v) {
  if (v === true) return true;
  if (v === false || v == null || v === '') return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'ya' || s === 'yes';
}

/* ============================================================================
 * RESPONS STANDAR untuk google.script.run
 * ========================================================================== */

function ok_(data) {
  return { ok: true, data: data === undefined ? null : data };
}

function err_(message, code) {
  return { ok: false, error: String(message), code: code || 'ERR' };
}

/* ============================================================================
 * AUDIT LOG (FR-37)
 * Helper fondasi — dipakai lintas modul (Auth, MasterData, Period, Assessment,
 * Interview, Notification, Triggers). Sengaja di sini, bukan di 02_Auth.gs,
 * agar modul lain tidak bergantung pada urutan/keberadaan file Auth.
 * ========================================================================== */

/**
 * Tulis satu baris ke sheet `audit_log`. Tidak pernah melempar error
 * (kegagalan audit tidak boleh menggagalkan aksi utama).
 * @param {string} nia  NIA pelaku, atau 'SYSTEM'
 * @param {string} aksi kode aksi singkat
 * @param {Object=} detail objek bebas; di-JSON-kan ke kolom detail
 */
function _audit_(nia, aksi, detail) {
  try {
    appendObject_('audit_log', {
      id: shortId_('aud'),
      nia: nia,
      aksi: aksi,
      waktu: nowIso_(),
      detail: JSON.stringify(detail || {}),
      perangkat_ip: (detail && detail.device) || ''
    });
  } catch (e) {
    Logger.log('audit gagal: ' + e);
  }
}
