/* api.js — komunikasi ke backend lewat proxy same-origin `/api`.
 *
 * Frontend TIDAK memanggil script.google.com langsung (kena CORS). Semua request
 * lewat Cloudflare Pages Function `functions/api.js` yang meneruskan ke Apps Script.
 *
 *   apiGet(action, params)   → GET  /api?action=...&k=v
 *   apiPost(action, payload) → POST /api?action=...  (body JSON)
 *
 * Semua handler backend mengembalikan {ok:boolean, data|error}. Fungsi di sini
 * me-resolve `data` bila ok, atau reject Error(pesan) bila tidak.
 */

var API_BASE = '/api';

function _parseGasJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  var m = text && text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
  throw new Error('Respons backend tidak dapat dibaca.');
}

function _unwrap(res) {
  if (res && res.ok === false) throw new Error(res.error || 'Terjadi kesalahan di server.');
  if (res && Object.prototype.hasOwnProperty.call(res, 'ok')) return res.data;
  return res;
}

function _qs(params) {
  return Object.keys(params || {})
    .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
}

function apiGet(action, params, timeoutMs) {
  var url = API_BASE + '?action=' + encodeURIComponent(action);
  var qs = _qs(params);
  if (qs) url += '&' + qs;
  return _fetchWithTimeout(url, { method: 'GET' }, timeoutMs || 30000)
    .then(function (r) { return r.text(); })
    .then(function (t) { return _unwrap(_parseGasJson(t)); });
}

function apiPost(action, payload, timeoutMs) {
  var url = API_BASE + '?action=' + encodeURIComponent(action);
  var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
  return _fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body
  }, timeoutMs || 40000)
    .then(function (r) { return r.text(); })
    .then(function (t) { return _unwrap(_parseGasJson(t)); });
}

function _fetchWithTimeout(url, init, ms) {
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
  if (ctrl) init.signal = ctrl.signal;
  return fetch(url, init).then(
    function (r) { if (t) clearTimeout(t); return r; },
    function (e) {
      if (t) clearTimeout(t);
      throw (e && e.name === 'AbortError') ? new Error('Waktu tunggu habis.') : e;
    }
  );
}
