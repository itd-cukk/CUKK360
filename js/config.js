/* config.js — konfigurasi klien & state global. */

/**
 * URL default Web App Apps Script (/exec).
 * Dipakai sebagai fallback bila env SCRIPT_URL Cloudflare / middleware belum aktif.
 * Bukan rahasia — endpoint web app publik; aksi apa pun tetap butuh sessionToken valid.
 * Ganti nilai ini kalau URL deployment Apps Script berubah, lalu git push.
 */
var DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyK8tLFXX4abKABGaHSRT60P5j3TNvQF0EGTDTGZyfD0ktV3p6lwbJEdtZlnaGNJzTn/exec';

/**
 * URL Web App Apps Script (/exec). Prioritas:
 *  1. localStorage 'kk360_script_url'  (override manual saat dev/test — setUrl())
 *  2. window.__SCRIPT_URL__            (disuntik functions/_middleware.js dari env SCRIPT_URL)
 *  3. DEFAULT_SCRIPT_URL               (fallback hardcode di file ini)
 */
function getUrl() {
  var ls = '';
  try { ls = localStorage.getItem('kk360_script_url') || ''; } catch (e) {}
  return ls || window.__SCRIPT_URL__ || DEFAULT_SCRIPT_URL || '';
}

/** Set URL backend manual (dipakai saat Cloudflare middleware belum aktif). */
function setUrl(u) {
  try { localStorage.setItem('kk360_script_url', String(u || '').trim()); } catch (e) {}
}

/** Sesi login berjalan (diisi js/auth.js). */
var SESSION = null;

/** Fingerprint perangkat — dipakai FR-04/BR-12 (perangkat dikenal → tanpa OTP). */
var DEVICE_ID = (function () {
  try {
    var k = localStorage.getItem('kk360_device');
    if (!k) {
      k = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('kk360_device', k);
    }
    return k;
  } catch (e) {
    return 'dev-nostore';
  }
})();

var SESSION_STORAGE_KEY = 'kk360_session';
