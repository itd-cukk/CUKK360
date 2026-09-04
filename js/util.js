/* util.js — helper DOM & UI. */

function $(id) { return document.getElementById(id); }

function el(tag, attrs, html) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
  });
}

var _toastT;
function toast(msg, isErr) {
  clearTimeout(_toastT);
  var old = document.querySelector('.toast');
  if (old) old.remove();
  var t = el('div', { class: 'toast' + (isErr ? ' err' : '') }, esc(msg));
  document.body.appendChild(t);
  _toastT = setTimeout(function () { t.remove(); }, isErr ? 5000 : 2800);
}

function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset._t = btn.dataset._t || btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>'; }
  else if (btn.dataset._t) { btn.innerHTML = btn.dataset._t; }
}
