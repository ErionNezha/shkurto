// script.js — Shkurto frontend (merr linket nga API, jo nga localStorage)
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
function drawQr(text) {
  const canvas = document.getElementById('qrCanvas');
  if (window.QRCode && canvas) {
    window.QRCode.toCanvas(canvas, text, { width: 180, margin: 1 }, (err) => { if (err) console.error(err); });
  }
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

async function loadLinks() {
  linksList.innerHTML = '<p class="empty">Po ngarkohen linket…</p>';
  try {
    const res = await fetch('/api/links');
    if (!res.ok) throw new Error('API error');
    const links = await res.json();
    if (!Array.isArray(links) || links.length === 0) {
      linksList.innerHTML = '<p class="empty">Ende nuk ke asnjë link. Shkurto linkun e parë më lart!</p>';
      return;
    }
    linksList.innerHTML = '';
    links.forEach((link) => {
      const shortUrl = link.shortUrl || `${window.location.origin}/${link.shortCode}`;
      const item = document.createElement('div');
      item.className = 'link-item';
      const expiresText = link.expiresAt ? `Skadon: ${formatDate(link.expiresAt)}` : 'Skadenca: Kurrë';
      item.innerHTML = `
        <div class="short">${escapeHtml(shortUrl)}</div>
        <div class="orig">${escapeHtml(link.originalUrl)}</div>
        <div class="meta"><span>Klikime: <strong>${link.clickCount || 0}</strong></span><span>Krijuar: ${formatDate(link.createdAt)}</span><span>${escapeHtml(expiresText)}</span><span>Kodi: ${escapeHtml(link.shortCode)}</span></div>
        <div class="link-actions">
          <button type="button" class="btn-copy">Kopjo</button>
          <button type="button" class="btn-delete">Fshi</button>
        </div>`;
      item.querySelector('.btn-copy').addEventListener('click', (e) => copyText(shortUrl, e.currentTarget));
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
        if (del.ok) { loadLinks(); loadStats(); } else { btn.disabled = false; btn.dataset.armed = ''; btn.textContent = 'Fshi'; showError('Fshirja dështoi. Provo përsëri.'); }
      });
      linksList.appendChild(item);
    });
  } catch (e) {
    linksList.innerHTML = '<p class="empty">Linket nuk u ngarkuan dot. Kontrollo lidhjen me serverin.</p>';
  }
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
    loadLinks(); loadStats();
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
