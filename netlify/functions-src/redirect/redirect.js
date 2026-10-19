// netlify/functions-src/redirect/redirect.js — Netlify Function (CommonJS)
// Merr ?code=, gjen linkun në Blobs, +1 click + timestamp, redirect 302
// Nuk ekziston -> 404 faqe; expired -> 410 faqe "Ka skaduar"
const { getStore, connectLambda } = require('@netlify/blobs');

function htmlPage(statusCode, title, heading, msg) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>${title} — Shkurto</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1a15"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>@font-face{font-family:B;font-weight:200 800;font-stretch:75% 100%;src:url(/fonts/bricolage-latin.woff2) format('woff2')}@font-face{font-family:M;font-weight:200 800;src:url(/fonts/manrope-latin.woff2) format('woff2')}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a1a15;color:#e8f0e9;font-family:M,system-ui,sans-serif;background-image:linear-gradient(rgba(206,232,196,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(206,232,196,.06) 1px,transparent 1px);background-size:24px 24px}main{max-width:520px}h1{font-family:B,system-ui,sans-serif;font-weight:780;font-stretch:78%;font-size:clamp(2.6rem,9vw,4.4rem);line-height:.95;letter-spacing:-.03em;margin:0 0 16px}p{color:#93ab9e;font-size:1.05rem;line-height:1.55;margin:0 0 28px}a{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:13px;background:#f4c430;color:#2a2105;font-weight:750;text-decoration:none}.cut{display:block;width:120px;border-top:2px dashed #f4c430;margin:0 0 26px}</style></head><body><main><span class="cut"></span><h1>${heading}</h1><p>${msg}</p><a href="/">Shkurto një link të ri</a></main></body></html>`,
  };
}

function htmlNotFound(code) {
  // Blobs mund të vonojë edhe pas riprovimeve në server: faqja ringarkohet
  // vetë disa herë (linku i freskët zakonisht shfaqet), pastaj tregon 404 reale.
  const safe = String(code).replace(/[^a-zA-Z0-9-_]/g, '');
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>404 — Shkurto</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1a15"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>@font-face{font-family:B;font-weight:200 800;font-stretch:75% 100%;src:url(/fonts/bricolage-latin.woff2) format('woff2')}@font-face{font-family:M;font-weight:200 800;src:url(/fonts/manrope-latin.woff2) format('woff2')}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a1a15;color:#e8f0e9;font-family:M,system-ui,sans-serif;background-image:linear-gradient(rgba(206,232,196,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(206,232,196,.06) 1px,transparent 1px);background-size:24px 24px}main{max-width:520px}h1{font-family:B,system-ui,sans-serif;font-weight:780;font-stretch:78%;font-size:clamp(2.6rem,9vw,4.4rem);line-height:.95;letter-spacing:-.03em;margin:0 0 16px}p{color:#93ab9e;font-size:1.05rem;line-height:1.55;margin:0 0 28px}a{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:13px;background:#f4c430;color:#2a2105;font-weight:750;text-decoration:none}.cut{display:block;width:120px;border-top:2px dashed #f4c430;margin:0 0 26px}</style></head><body><main><span class="cut"></span><h1 id="h">Po kontrolloj linkun…</h1><p id="m">Nëse linku është krijuar sapo tani, duhen pak sekonda sa të aktivizohet.</p><a href="/">Shkurto një link të ri</a></main><script>var k='shk_retry_${safe}';var n=0;try{n=parseInt(sessionStorage.getItem(k)||'0',10)||0;}catch(e){}if(n<4){try{sessionStorage.setItem(k,String(n+1));}catch(e){}setTimeout(function(){location.reload();},2500);}else{try{sessionStorage.removeItem(k);}catch(e){}document.getElementById('h').textContent='404 — Linku nuk u gjet';document.getElementById('m').textContent='Ky link i shkurtër nuk ekziston ose është fshirë.';}</script></body></html>`,
  };
}

exports.handler = async (event) => {
  try {
    try { connectLambda(event); } catch (e) {}
    let code = (event.queryStringParameters && event.queryStringParameters.code) || '';
    if (!code) {
      // Fallback: nxirr nga path /CODE
      const parts = (event.path || '').split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== 'redirect') code = last;
    }
    try { code = decodeURIComponent(String(code).trim()); } catch (e) { code = String(code).trim(); }
    if (!code) return htmlPage(404, '404', '404 — Linku nuk u gjet', 'Ky link i shkurtër nuk ekziston.');

    const store = getStore('shkurto-links');
    // Blobs është eventually-consistent: linku sapo-krijuar mund të mos duket
    // menjëherë — riprovo disa herë para se të japësh 404.
    let link = null;
    for (let attempt = 0; attempt < 4 && !link; attempt += 1) {
      link = await store.get(code, { type: 'json' }).catch(() => null);
      if (!link && attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!link) return htmlNotFound(code);
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
      return htmlPage(410, 'Ka skaduar', 'Ky link ka skaduar.', 'Afati i tij mbaroi dhe nuk të çon më askund. Kërkoji pronarit një link të ri.');
    }

    link.clickCount = (link.clickCount || 0) + 1;
    link.clickDates = [...(link.clickDates || []), new Date().toISOString()].slice(-1000);
    await store.setJSON(code, link);

    return { statusCode: 302, headers: { Location: link.originalUrl, 'Cache-Control': 'no-store' }, body: '' };
  } catch (e) {
    return htmlPage(500, 'Gabim', 'Gabim në server.', 'Linku nuk u hap dot tani. Rifreskoje faqen pas pak.');
  }
};
