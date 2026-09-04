/* api.js — komunikasi ke backend Apps Script (JSON API).
 *
 * apiGet(action, params)   → GET  ?action=...&k=v ; fallback JSONP bila CORS gagal.
 * apiPost(action, payload) → POST body JSON (Content-Type text/plain, tanpa preflight).
 *
 * Semua handler backend mengembalikan {ok:boolean, data|error}. Fungsi di sini
 * me-resolve `data` bila ok, atau reject Error(pesan) bila tidak.
 */

function _parseGasJson(text) {
  // Apps Script kadang membungkus dengan HTML saat redirect; ambil objek JSON pertama.
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
  var base = getUrl();
  if (!base) return Promise.reject(new Error('URL backend belum diset (SCRIPT_URL).'));
  var url = base + '?action=' + encodeURIComponent(action);
  var qs = _qs(params);
  if (qs) url += '&' + qs;

  return fetch(url, { method: 'GET' })
    .then(function (r) { return r.text(); })
    .then(function (t) { return _unwrap(_parseGasJson(t)); })
    .catch(function () {
      // Fallback JSONP (GET only) — untuk jaringan yang memblokir CORS fetch.
      return _jsonp(url, timeoutMs).then(_unwrap);
    });
}

function apiPost(action, payload, timeoutMs) {
  var base = getUrl();
  if (!base) return Promise.reject(new Error('URL backend belum diset (SCRIPT_URL).'));
  var url = base + '?action=' + encodeURIComponent(action);
  var body = JSON.stringify(Object.assign({ action: action }, payload || {}));

  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000) : null;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body,
    signal: ctrl ? ctrl.signal : undefined
  })
    .then(function (r) { return r.text(); })
    .then(function (txt) { if (t) clearTimeout(t); return _unwrap(_parseGasJson(txt)); })
    .catch(function (e) { if (t) clearTimeout(t); throw (e && e.name === 'AbortError' ? new Error('Waktu tunggu habis.') : e); });
}

function _jsonp(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var cb = 'kk360cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var s = document.createElement('script');
    var done = false;
    window[cb] = function (data) { done = true; cleanup(); resolve(data); };
    function cleanup() {
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    s.onerror = function () { if (!done) { cleanup(); reject(new Error('Gagal menghubungi backend.')); } };
    s.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + cb;
    document.head.appendChild(s);
    setTimeout(function () { if (!done) { cleanup(); reject(new Error('Waktu tunggu habis.')); } }, timeoutMs || 20000);
  });
}
