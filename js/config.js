/* config.js — konfigurasi klien & state global. */

/**
 * URL Web App Apps Script (/exec). Prioritas:
 *  1. localStorage 'kk360_script_url'  (override manual saat dev/test)
 *  2. window.__SCRIPT_URL__            (disuntik functions/_middleware.js dari env SCRIPT_URL)
 */
function getUrl() {
  try {
    return localStorage.getItem('kk360_script_url') || window.__SCRIPT_URL__ || '';
  } catch (e) {
    return window.__SCRIPT_URL__ || '';
  }
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
