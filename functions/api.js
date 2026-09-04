/**
 * functions/api.js — Proxy Cloudflare Pages Function ke Apps Script Web App.
 *
 * Frontend memanggil `/api?action=...` di ORIGIN YANG SAMA (cukk360.pages.dev),
 * jadi tidak ada masalah CORS. Function ini meneruskan request (GET query string
 * atau POST body text/plain) ke SCRIPT_URL (Apps Script /exec) secara
 * server-to-server, lalu mengembalikan JSON apa adanya.
 *
 * SCRIPT_URL diambil dari environment variable Cloudflare Pages; bila kosong,
 * pakai default di bawah (endpoint publik, bukan rahasia).
 */

var DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyK8tLFXX4abKABGaHSRT60P5j3TNvQF0EGTDTGZyfD0ktV3p6lwbJEdtZlnaGNJzTn/exec';

export async function onRequest(context) {
  var request = context.request;
  var env = context.env || {};
  var target = (env.SCRIPT_URL || DEFAULT_SCRIPT_URL || '').trim();

  if (!target) {
    return _json({ ok: false, error: 'SCRIPT_URL belum dikonfigurasi di Cloudflare Pages.' }, 500);
  }

  var inUrl = new URL(request.url);
  var outUrl = target + (inUrl.search || '');

  var init = {
    method: request.method === 'POST' ? 'POST' : 'GET',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow'
  };
  if (init.method === 'POST') {
    init.body = await request.text();
  }

  try {
    var res = await fetch(outUrl, init);
    var body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return _json({ ok: false, error: 'Proxy gagal menghubungi backend: ' + (e && e.message ? e.message : e) }, 502);
  }
}

function _json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}
