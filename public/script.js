// script.js — Shkurto frontend (merr linket nga API, jo nga localStorage)
// QR gjenerohet nga serveri te /api/qr — zero varësi CDN.
const form = document.getElementById('shortenForm');
const longUrlInput = document.getElementById('longUrl');
const aliasInput = document.getElementById('customAlias');
const expirationSelect = document.getElementById('expiration');
const errorMsg = document.getElementById('errorMsg');
const resultBox = document.getElementById('result');
const shortUrlInput = document.getElementById('shortUrl');
const copyBtn = document.getElementById('copyBtn');
const linksList = document.getElementById('linksList');
const refreshBtn = document.getElementById('refreshBtn');

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.hidden = !text;
}
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('sq-AL'); } catch (e) { return iso; }
}
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const old = btn.textContent; btn.textContent = 'U kopjua!'; setTimeout(() => { btn.textContent = old; }, 1500); }
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    if (btn) { const old = btn.textContent; btn.textContent = 'U kopjua!'; setTimeout(() => { btn.textContent = old; }, 1500); }
  }
}
function qrUrlFor(text) {
  return '/api/qr?text=' + encodeURIComponent(text);
}
function drawQr(text) {
  const img = document.getElementById('qrImg');
  const link = document.getElementById('qrLink');
  const dl = document.getElementById('qrDownload');
  const src = qrUrlFor(text);
  if (img) img.src = src;
  if (link) link.href = text;
  if (dl) dl.href = src;
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const s = await res.json();
    document.getElementById('statTotalLinks').textContent = s.totalLinks ?? 0;
    document.getElementById('statTotalClicks').textContent = s.totalClicks ?? 0;
    document.getElementById('statToday').textContent = s.clicksToday ?? s.todayClicks ?? 0;
    document.getElementById('statWeek').textContent = s.clicksThisWeek ?? s.weekClicks ?? 0;
  } catch (e) { /* hesht */ }
}

// Një funksion i vetëm që ndërton kartën e një linku (dashboard + shtim optimistik)
function buildLinkItem(link) {
  const shortUrl = link.shortUrl || `${window.location.origin}/${link.shortCode}`;
  const item = document.createElement('div');
  item.className = 'link-item';
  item.dataset.code = link.shortCode;
  const expiresText = link.expiresAt ? `Skadon: ${formatDate(link.expiresAt)}` : 'Skadenca: Kurrë';
  item.innerHTML = `
    <div class="short">${escapeHtml(shortUrl)}</div>
    <div class="orig">${escapeHtml(link.originalUrl)}</div>
    <div class="meta"><span>Klikime: <strong>${link.clickCount || 0}</strong></span><span>Krijuar: ${formatDate(link.createdAt)}</span><span>${escapeHtml(expiresText)}</span><span>Kodi: ${escapeHtml(link.shortCode)}</span></div>
    <div class="link-actions">
      <button type="button" class="btn-copy">Kopjo</button>
      <button type="button" class="btn-qr" aria-expanded="false">QR</button>
      <button type="button" class="btn-delete">Fshi</button>
    </div>
    <div class="qr-box" hidden>
      <a href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener"><img class="qr-box-img" alt="QR code i linkut të shkurtër" width="160" height="160"></a>
      <div><a class="btn-secondary qr-download" download="qr-${escapeHtml(link.shortCode)}.png">Shkarko QR</a></div>
    </div>`;
  item.querySelector('.btn-copy').addEventListener('click', (e) => copyText(shortUrl, e.currentTarget));
  item.querySelector('.btn-qr').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const box = item.querySelector('.qr-box');
    const open = box.hidden;
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      const src = qrUrlFor(shortUrl);
      const img = box.querySelector('.qr-box-img');
      if (img && !img.getAttribute('src')) img.src = src;
      const dl = box.querySelector('.qr-download');
      if (dl && !dl.getAttribute('href')) dl.href = src;
    }
  });
  item.querySelector('.btn-delete').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Konfirmo fshirjen?';
      setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Fshi'; }, 3000);
      return;
    }
    btn.disabled = true;
    const del = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, { method: 'DELETE' });
    if (del.ok) { freshLinks.delete(link.shortCode); loadLinks(); loadStats(); } else { btn.disabled = false; btn.dataset.armed = ''; btn.textContent = 'Fshi'; showError('Fshirja dështoi. Provo përsëri.'); }
  });
  return item;
}

// Linket e sapokrijuara: serveri (Blobs) mund të vonojë disa sekonda t'i
// tregojë te lista — këto mbahen lokalisht që karta të mos zhduket te ri-ngarkimi.
const freshLinks = new Map();

async function loadLinks() {
  linksList.innerHTML = '<p class="empty">Po ngarkohen linket…</p>';
  try {
    const res = await fetch('/api/links');
    if (!res.ok) throw new Error('API error');
    const links = await res.json();
    const serverCodes = new Set((Array.isArray(links) ? links : []).map((l) => l.shortCode));
    const now = Date.now();
    for (const [code, entry] of freshLinks) {
      if (serverCodes.has(code) || now - entry.at > 30000) freshLinks.delete(code);
    }
    const merged = [...links];
    [...freshLinks.values()].reverse().forEach((entry) => merged.unshift(entry.link));
    if (merged.length === 0) {
      linksList.innerHTML = '<p class="empty">Ende nuk ke asnjë link. Shkurto linkun e parë më lart!</p>';
      return;
    }
    linksList.innerHTML = '';
    merged.forEach((link) => linksList.appendChild(buildLinkItem(link)));
  } catch (e) {
    linksList.innerHTML = '<p class="empty">Linket nuk u ngarkuan dot. Kontrollo lidhjen me serverin.</p>';
  }
}

// Shto kartën e linkut të ri menjëherë (pa pritur sinkronizimin e serverit)
function prependLink(link) {
  freshLinks.set(link.shortCode, { link, at: Date.now() });
  const empty = linksList.querySelector('.empty');
  if (empty) linksList.innerHTML = '';
  const existing = linksList.querySelector(`[data-code="${CSS.escape(link.shortCode)}"]`);
  if (existing) existing.remove();
  linksList.prepend(buildLinkItem(link));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  resultBox.hidden = true;
  const originalUrl = longUrlInput.value.trim();
  const customAlias = aliasInput.value.trim();
  const expiration = expirationSelect.value;
  // Validim në klient (i njëjti rregull si serveri)
  try {
    const parsed = new URL(originalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad');
  } catch (_) {
    showError('URL-ja nuk është e vlefshme. Lejohen vetëm http:// ose https://');
    return;
  }
  if (customAlias && !/^[a-zA-Z0-9-_]{3,30}$/.test(customAlias)) {
    showError('Alias-i duhet 3–30 karaktere: vetëm shkronja, numra, - dhe _.');
    return;
  }
  const btn = document.getElementById('shortenBtn');
  btn.disabled = true; btn.textContent = 'Po shkurtohet…';
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl, url: originalUrl, customAlias, alias: customAlias, expiration, expiresIn: expiration }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || 'Diçka shkoi gabim. Provo përsëri.');
      return;
    }
    const shortUrl = data.shortUrl || `${window.location.origin}/${data.shortCode}`;
    shortUrlInput.value = shortUrl;
    resultBox.hidden = false;
    drawQr(shortUrl);
    // Karta e re shfaqet menjëherë; serveri sinkronizohet pas pak
    prependLink({
      shortCode: data.shortCode || data.code,
      originalUrl: data.originalUrl || originalUrl,
      createdAt: data.createdAt || new Date().toISOString(),
      clickCount: data.clickCount || 0,
      expiresAt: data.expiresAt ?? null,
      shortUrl,
    });
    loadStats();
    setTimeout(() => { loadLinks(); loadStats(); }, 2500);
    setTimeout(() => { loadLinks(); loadStats(); }, 8000);
  } catch (err) {
    showError('Nuk u lidha dot me serverin. Provo përsëri.');
  } finally {
    btn.disabled = false; btn.textContent = 'Shkurto';
  }
});

copyBtn.addEventListener('click', (e) => copyText(shortUrlInput.value, e.currentTarget));
refreshBtn.addEventListener('click', () => { loadLinks(); loadStats(); });

loadLinks();
loadStats();
