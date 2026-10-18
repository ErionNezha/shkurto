// netlify/functions-src/redirect/redirect.js — Netlify Function (CommonJS)
// Merr ?code=, gjen linkun në Blobs, +1 click + timestamp, redirect 302
// Nuk ekziston -> 404 faqe; expired -> 410 faqe "Ka skaduar"
const { getStore, connectLambda } = require('@netlify/blobs');

function htmlPage(statusCode, title, heading, msg) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>${title} — Shkurto</title><style>body{background:#0b0f1a;color:#e8ecf5;font-family:system-ui;text-align:center;padding:60px 20px}a{color:#7c5cff}</style></head><body><h1>${heading}</h1><p>${msg}</p><p><a href="/">Kthehu te Shkurto</a></p></body></html>`,
  };
}

function htmlNotFound(code) {
  // Blobs mund të vonojë edhe pas riprovimeve në server: faqja ringarkohet
  // vetë disa herë (linku i freskët zakonisht shfaqet), pastaj tregon 404 reale.
  const safe = String(code).replace(/[^a-zA-Z0-9-_]/g, '');
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>404 — Shkurto</title><style>body{background:#0b0f1a;color:#e8ecf5;font-family:system-ui;text-align:center;padding:60px 20px}a{color:#7c5cff}</style></head><body><h1 id="h">Po kontrolloj linkun…</h1><p id="m">Nëse linku është krijuar sapo tani, duhen pak sekonda sa të aktivizohet.</p><p><a href="/">Kthehu te Shkurto</a></p><script>var k='shk_retry_${safe}';var n=0;try{n=parseInt(sessionStorage.getItem(k)||'0',10)||0;}catch(e){}if(n<4){try{sessionStorage.setItem(k,String(n+1));}catch(e){}setTimeout(function(){location.reload();},2500);}else{try{sessionStorage.removeItem(k);}catch(e){}document.getElementById('h').textContent='404 — Linku nuk u gjet';document.getElementById('m').textContent='Ky link i shkurtër nuk ekziston ose është fshirë.';}</script></body></html>`,
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
      return htmlPage(410, 'Ka skaduar', 'Ka skaduar', 'Ky link ka skaduar dhe nuk është më aktiv.');
    }

    link.clickCount = (link.clickCount || 0) + 1;
    link.clickDates = [...(link.clickDates || []), new Date().toISOString()].slice(-1000);
    await store.setJSON(code, link);

    return { statusCode: 302, headers: { Location: link.originalUrl, 'Cache-Control': 'no-store' }, body: '' };
  } catch (e) {
    return htmlPage(500, 'Gabim', 'Gabim në server', 'Provo përsëri më vonë.');
  }
};
