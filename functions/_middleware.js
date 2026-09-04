/**
 * functions/_middleware.js — Cloudflare Pages Functions.
 *
 * Menyuntik `window.__SCRIPT_URL__` ke setiap respons HTML dari environment
 * variable `SCRIPT_URL` (URL Web App Apps Script, berakhiran /exec).
 * Set di: Cloudflare Pages → Settings → Environment variables → SCRIPT_URL.
 */
export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const scriptUrl = context.env.SCRIPT_URL || '';
  const html = await response.text();
  const injection =
    `<script>window.__SCRIPT_URL__ = ${JSON.stringify(scriptUrl)};</script>`;
  const modified = html.replace('</head>', injection + '\n</head>');

  return new Response(modified, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
