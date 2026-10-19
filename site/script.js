// script.js — Shkurto frontend (merr linket nga API, jo nga localStorage)
// QR gjenerohet nga serveri te /api/qr — zero varësi CDN.
// Shiriti me vizore: linku vendoset si shirit letre, 1ch = 1 karakter; kur shkurtohet, tehu e pret.

const $ = (id) => document.getElementById(id);
const form = $('shortenForm');
const longUrlInput = $('longUrl');
const aliasInput = $('customAlias');
const errorMsg = $('errorMsg');
const resultBox = $('result');
const shortUrlInput = $('shortUrl');
const copyBtn = $('copyBtn');
const linksList = $('linksList');
const refreshBtn = $('refreshBtn');
const searchInput = $('searchInput');
const bandScroll = $('bandScroll');
const ruler = $('ruler');
const strip = $('strip');
const blade = $('blade');
const bandCount = $('bandCount');
const bandDelta = $('bandDelta');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONO_ADVANCE = 0.6; // JetBrains Mono: 600/1000 em për çdo karakter
const nf = new Intl.NumberFormat('sq-AL');

/* ---------- Ndihmës ---------- */
function showError(text) { errorMsg.textContent = text; errorMsg.hidden = !text; }
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function plural(n, one, many) { return `${nf.format(n)} ${n === 1 ? one : many}`; }
const chars = (n) => plural(n, 'karakter', 'karaktere');

function relTime(iso, future) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.abs(t - Date.now());
  const m = Math.round(diff / 60000);
  const h = Math.round(diff / 3600000);
  const d = Math.round(diff / 86400000);
  const pre = future ? 'pas' : 'para';
  if (m < 1) return future ? 'pas pak çastesh' : 'tani';
  if (m < 60) return `${pre} ${m} ${m === 1 ? 'minute' : 'minutash'}`;
  if (h < 24) return `${pre} ${h} ${h === 1 ? 'ore' : 'orësh'}`;
  if (d < 31) return `${pre} ${d} ${d === 1 ? 'dite' : 'ditësh'}`;
  try { return new Date(iso).toLocaleDateString('sq-AL', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; }
}
function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('sq-AL'); } catch (e) { return iso; }
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }
}
const qrUrlFor = (text) => '/api/qr?text=' + encodeURIComponent(text);
const stripProtocol = (u) => String(u || '').replace(/^https?:\/\//, '');

/* ---------- Shiriti me vizore ---------- */
const DEMO_URL = 'https://www.dyqani-shembull.al/produkte/elektronike/telefona?kategoria=smartphone&renditja=cmimi&utm_source=instagram&utm_campaign=vjeshte';
let demoActive = true;
let cutting = false;

function availableWidth() { return Math.max(200, bandScroll.clientWidth - 8); }
function fitFontSize(len) {
  const max = window.innerWidth < 640 ? 17 : 22;
  const min = window.innerWidth < 640 ? 11 : 13;
  return Math.max(min, Math.min(max, availableWidth() / (Math.max(len, 1) * MONO_ADVANCE)));
}
function setBandSize(len) {
  const fs = fitFontSize(len);
  $('band').style.setProperty('--fs', fs.toFixed(2) + 'px');
  const fitCh = Math.floor(availableWidth() / (fs * MONO_ADVANCE));
  const width = Math.max(len + 4, fitCh);
  ruler.style.width = width + 'ch';
  let ticks = '';
  for (let n = 0; n * 10 <= width - 3; n += 1) ticks += `<span class="tick" style="--n:${n}"><i>${n * 10}</i></span>`;
  ruler.innerHTML = ticks;
}
function urlPieceHtml(text) {
  // Thekso domain-in brenda shiritit
  const m = String(text).match(/^(https?:\/\/)?([^/?#]+)(.*)$/);
  if (!m) return escapeHtml(text);
  return `${escapeHtml(m[1] || '')}<span class="host">${escapeHtml(m[2])}</span>${escapeHtml(m[3])}`;
}
function renderBand(text) {
  blade.style.opacity = '0';
  bandDelta.textContent = '';
  if (!text) {
    const ph = 'linku yt shfaqet këtu';
    setBandSize(ph.length + 2);
    strip.innerHTML = `<span class="piece ghost">${ph}</span>`;
    bandCount.textContent = chars(0);
    return;
  }
  setBandSize(text.length);
  strip.innerHTML = `<span class="piece">${urlPieceHtml(text)}</span>`;
  bandCount.textContent = chars(text.length);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function animate(el, frames, opts) {
  if (!el.animate) return Promise.resolve();
  return el.animate(frames, { fill: 'forwards', ...opts }).finished.catch(() => {});
}
function scramble(el, from, to, duration) {
  const pool = 'abcdefghijklmnopqrstuvwxyz0123456789/-._';
  return new Promise((resolve) => {
    const start = performance.now();
    const len = Math.max(from.length, to.length);
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      let out = '';
      for (let i = 0; i < len; i += 1) {
        const settle = i / len;
        if (p >= settle + 0.12 || p === 1) out += to[i] || '';
        else if (p >= settle) out += pool[(Math.random() * pool.length) | 0];
        else out += from[i] || '';
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame); else { el.innerHTML = urlPieceHtml(to); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

// Tehu pret linkun e gjatë në gjatësinë e linkut të shkurtër
async function playCut(original, shortUrl) {
  cutting = true;
  const cutAt = shortUrl.length;
  const saved = original.length - cutAt;
  setBandSize(original.length);
  bandScroll.scrollLeft = 0;
  bandCount.textContent = chars(original.length);
  bandDelta.textContent = '';

  const finish = () => {
    strip.innerHTML = `<span class="piece">${urlPieceHtml(shortUrl)}</span>`;
    bandCount.textContent = chars(shortUrl.length);
    if (saved > 0) {
      const pct = Math.round((saved / original.length) * 100);
      bandDelta.textContent = `${chars(saved)} më pak, ${pct}% më i shkurtër`;
    }
    blade.style.opacity = '0';
    cutting = false;
  };

  if (reduceMotion || saved <= 0) {
    if (saved <= 0 && !reduceMotion) {
      strip.innerHTML = '<span class="piece"></span>';
      await scramble(strip.firstChild, original, shortUrl, 520);
    }
    finish();
    return;
  }

  strip.innerHTML = `<span class="piece head">${escapeHtml(original.slice(0, cutAt))}</span><span class="piece tail">${escapeHtml(original.slice(cutAt))}</span>`;
  const head = strip.querySelector('.head');
  const tail = strip.querySelector('.tail');
  blade.style.left = `calc(4px + ${cutAt}ch)`;
  blade.style.opacity = '1';
  await animate(blade, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  await wait(120);
  animate(head, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  await animate(tail, [
    { transform: 'translate(0,0) rotate(0)', opacity: 1 },
    { transform: 'translate(10px,6px) rotate(2deg)', opacity: 1, offset: 0.25 },
    { transform: 'translate(38px,44px) rotate(7deg)', opacity: 0 },
  ], { duration: 720, easing: 'cubic-bezier(.55,0,.8,.35)' });
  tail.remove();
  animate(blade, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
  await scramble(head, original.slice(0, cutAt), shortUrl, 560);
  finish();
}

async function runDemo() {
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  if (!demoActive) return;
  renderBand(DEMO_URL);
  await wait(reduceMotion ? 0 : 900);
  if (!demoActive) return;
  await playCut(DEMO_URL, `${window.location.origin}/vjeshte`);
}

longUrlInput.addEventListener('input', () => {
  demoActive = false;
  if (cutting) return;
  renderBand(longUrlInput.value.trim());
});
let resizeRaf;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    if (cutting) return;
    const piece = strip.querySelector('.piece:not(.ghost)');
    const text = piece ? piece.textContent : '';
    setBandSize(text ? text.length : 24);
  });
});

/* ---------- Statistikat ---------- */
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const s = await res.json();
    $('statTotalLinks').textContent = nf.format(s.totalLinks ?? 0);
    $('statTotalClicks').textContent = nf.format(s.totalClicks ?? 0);
    $('statToday').textContent = nf.format(s.clicksToday ?? s.todayClicks ?? 0);
    $('statWeek').textContent = nf.format(s.clicksThisWeek ?? s.weekClicks ?? 0);
  } catch (e) { /* hesht */ }
}

/* ---------- Linket e mia ---------- */
// Linket e sapokrijuara: serveri (Blobs) mund të vonojë disa sekonda t'i
// tregojë te lista — këto mbahen lokalisht që karta të mos zhduket te ri-ngarkimi.
const freshLinks = new Map();
// Rreshti me fshirje "të armatosur" (pret konfirmimin) — mbijeton ri-renderimet.
let armedDelete = { code: null, at: 0 };
let allLinks = [];
let justAdded = null;

function statusFor(link) {
  const exp = link.expiresAt ? new Date(link.expiresAt).getTime() : null;
  if (link.expired || (exp && exp <= Date.now())) return { cls: 'expired', label: 'Ka skaduar', note: link.expiresAt ? relTime(link.expiresAt, false) : '' };
  if (!exp) return { cls: '', label: 'Aktiv', note: 'pa skadencë' };
  const soon = exp - Date.now() < 48 * 3600000;
  return { cls: soon ? 'soon' : '', label: soon ? 'Skadon së shpejti' : 'Aktiv', note: `skadon ${relTime(link.expiresAt, true)}` };
}

function setArmed(btn, on) {
  btn.dataset.armed = on ? '1' : '';
  btn.querySelector('.lbl').textContent = on ? 'Konfirmo fshirjen' : 'Fshi';
  btn.setAttribute('aria-label', on ? 'Konfirmo fshirjen' : 'Fshi linkun');
}

function buildLinkItem(link, maxClicks) {
  const shortUrl = link.shortUrl || `${window.location.origin}/${link.shortCode}`;
  const clicks = Number(link.clickCount) || 0;
  const st = statusFor(link);
  const host = stripProtocol(shortUrl).replace(new RegExp(`/${link.shortCode}$`), '/');
  const item = document.createElement('article');
  item.className = 'link-row';
  item.dataset.code = link.shortCode;
  item.innerHTML = `
    <div class="link-main">
      <div class="link-id">
        <a class="link-short" href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener">${escapeHtml(host)}<b>${escapeHtml(link.shortCode)}</b></a>
        <div class="link-orig" title="${escapeHtml(link.originalUrl)}">${escapeHtml(stripProtocol(link.originalUrl))}</div>
      </div>
      <div class="clicks">
        <span class="clicks-num">${nf.format(clicks)}<small>${clicks === 1 ? 'klikim' : 'klikime'}</small></span>
        <span class="clicks-bar"><i style="--w:${maxClicks ? Math.max(clicks ? 4 : 0, (clicks / maxClicks) * 100) : 0}%"></i></span>
      </div>
      <div class="when">
        <span class="status ${st.cls}">${st.label}</span><br>
        <span title="Krijuar: ${escapeHtml(formatDate(link.createdAt))}">${escapeHtml(st.note)}, krijuar ${escapeHtml(relTime(link.createdAt, false))}</span>
      </div>
      <div class="row-actions">
        <button type="button" class="btn-copy" aria-label="Kopjo linkun" title="Kopjo"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg><span class="lbl">U kopjua</span></button>
        <button type="button" class="btn-qr" aria-label="Shfaq QR code" title="QR code" aria-expanded="false"><svg class="ic" aria-hidden="true"><use href="#i-qr"/></svg></button>
        <button type="button" class="btn-delete" aria-label="Fshi linkun" title="Fshi"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg><span class="lbl">Fshi</span></button>
      </div>
    </div>
    <div class="qr-box" hidden>
      <a href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener"><img class="qr-box-img" alt="QR code i linkut ${escapeHtml(link.shortCode)}" width="132" height="132"></a>
      <div><p>Skanoje me kamerë ose shkarkoje për ta printuar.</p><a class="btn-ghost btn-sm qr-download" download="qr-${escapeHtml(link.shortCode)}.png"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>Shkarko QR</a></div>
    </div>`;

  const copy = item.querySelector('.btn-copy');
  copy.addEventListener('click', async () => {
    await copyText(shortUrl);
    copy.classList.add('copied');
    copy.querySelector('use').setAttribute('href', '#i-check');
    toast('Linku u kopjua');
    setTimeout(() => { copy.classList.remove('copied'); copy.querySelector('use').setAttribute('href', '#i-copy'); }, 1600);
  });

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

  const delBtn = item.querySelector('.btn-delete');
  if (armedDelete.code === link.shortCode && Date.now() - armedDelete.at < 3000) {
    setArmed(delBtn, true);
    setTimeout(() => { if (armedDelete.code === link.shortCode) { armedDelete = { code: null, at: 0 }; setArmed(delBtn, false); } }, 3000 - (Date.now() - armedDelete.at));
  }
  delBtn.addEventListener('click', async () => {
    if (!delBtn.dataset.armed) {
      armedDelete = { code: link.shortCode, at: Date.now() };
      setArmed(delBtn, true);
      setTimeout(() => { if (armedDelete.code === link.shortCode) armedDelete = { code: null, at: 0 }; setArmed(delBtn, false); }, 3000);
      return;
    }
    armedDelete = { code: null, at: 0 };
    delBtn.disabled = true;
    try {
      const del = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, { method: 'DELETE' });
      if (!del.ok) throw new Error('fail');
      freshLinks.delete(link.shortCode);
      allLinks = allLinks.filter((l) => l.shortCode !== link.shortCode);
      renderLinks();
      toast('Linku u fshi');
      loadStats();
    } catch (err) {
      delBtn.disabled = false; setArmed(delBtn, false);
      toast('Fshirja dështoi. Provo përsëri.');
    }
  });
  return item;
}

function renderSkeletons() {
  linksList.innerHTML = '<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
}

function renderLinks() {
  const q = searchInput.value.trim().toLowerCase();
  const list = q ? allLinks.filter((l) => `${l.shortCode} ${l.originalUrl}`.toLowerCase().includes(q)) : allLinks;
  $('linksCount').textContent = allLinks.length ? nf.format(allLinks.length) : '';
  if (allLinks.length === 0) {
    linksList.innerHTML = '<div class="empty"><strong>Ende nuk ke asnjë link.</strong>Ngjit një link të gjatë më lart dhe shtyp Shkurto.</div>';
    return;
  }
  if (list.length === 0) {
    linksList.innerHTML = `<div class="empty"><strong>Asnjë link nuk përputhet me “${escapeHtml(q)}”.</strong>Provo një kod ose një pjesë tjetër të adresës.</div>`;
    return;
  }
  const max = Math.max(0, ...list.map((l) => Number(l.clickCount) || 0));
  linksList.innerHTML = '';
  list.forEach((link) => {
    const el = buildLinkItem(link, max);
    if (justAdded === link.shortCode) el.classList.add('row-enter');
    linksList.appendChild(el);
  });
  justAdded = null;
}

async function loadLinks(showSkeleton = false) {
  if (showSkeleton) renderSkeletons();
  try {
    const res = await fetch('/api/links');
    if (!res.ok) throw new Error('API error');
    const links = await res.json();
    const arr = Array.isArray(links) ? links : [];
    const serverCodes = new Set(arr.map((l) => l.shortCode));
    const now = Date.now();
    for (const [code, entry] of freshLinks) {
      if (serverCodes.has(code) || now - entry.at > 30000) freshLinks.delete(code);
    }
    allLinks = [...[...freshLinks.values()].map((e) => e.link), ...arr];
    renderLinks();
  } catch (e) {
    linksList.innerHTML = '<div class="empty"><strong>Linket nuk u ngarkuan.</strong>Kontrollo lidhjen dhe shtyp butonin e rifreskimit.</div>';
  }
}

// Shto linkun e ri menjëherë (pa pritur sinkronizimin e serverit)
function prependLink(link) {
  freshLinks.set(link.shortCode, { link, at: Date.now() });
  allLinks = [link, ...allLinks.filter((l) => l.shortCode !== link.shortCode)];
  justAdded = link.shortCode;
  renderLinks();
}

/* ---------- Formulari ---------- */
function showResult(shortUrl, originalUrl) {
  shortUrlInput.value = shortUrl;
  const a = $('shortUrlLink');
  a.textContent = stripProtocol(shortUrl);
  a.href = shortUrl;
  $('openBtn').href = shortUrl;
  $('resultOrig').textContent = originalUrl;
  $('resultOrig').title = originalUrl;
  const src = qrUrlFor(shortUrl);
  $('qrImg').src = src;
  $('qrLink').href = shortUrl;
  $('qrDownload').href = src;
  resultBox.hidden = false;
  if (!reduceMotion && resultBox.animate) {
    resultBox.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  demoActive = false;
  const originalUrl = longUrlInput.value.trim();
  const customAlias = aliasInput.value.trim();
  const expiration = (form.querySelector('input[name="expiration"]:checked') || {}).value || 'never';
  if (!originalUrl) { showError('Ngjit një link që fillon me http:// ose https://'); longUrlInput.focus(); return; }
  try {
    const parsed = new URL(originalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad');
  } catch (_) {
    showError('URL-ja nuk është e vlefshme. Lejohen vetëm linke me http:// ose https://');
    longUrlInput.focus();
    return;
  }
  if (customAlias && !/^[a-zA-Z0-9-_]{3,30}$/.test(customAlias)) {
    showError('Alias-i duhet 3–30 karaktere: vetëm shkronja, numra, - dhe _.');
    aliasInput.focus();
    return;
  }
  const btn = $('shortenBtn');
  btn.disabled = true; btn.textContent = 'Po shkurtohet…';
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl, url: originalUrl, customAlias, alias: customAlias, expiration, expiresIn: expiration }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showError(data.error || 'Linku nuk u shkurtua. Provo përsëri.'); return; }
    const shortCode = data.shortCode || data.code;
    const shortUrl = data.shortUrl || `${window.location.origin}/${shortCode}`;
    resultBox.hidden = true;
    longUrlInput.value = '';
    aliasInput.value = '';
    prependLink({
      shortCode,
      originalUrl: data.originalUrl || originalUrl,
      createdAt: data.createdAt || new Date().toISOString(),
      clickCount: data.clickCount || 0,
      expiresAt: data.expiresAt ?? null,
      shortUrl,
    });
    loadStats();
    await playCut(data.originalUrl || originalUrl, shortUrl);
    showResult(shortUrl, data.originalUrl || originalUrl);
    setTimeout(() => { loadLinks(); loadStats(); }, 2500);
    setTimeout(() => { loadLinks(); loadStats(); }, 8000);
  } catch (err) {
    showError('Nuk u lidha dot me serverin. Kontrollo internetin dhe provo përsëri.');
  } finally {
    btn.disabled = false; btn.textContent = 'Shkurto';
  }
});

copyBtn.addEventListener('click', async () => {
  await copyText(shortUrlInput.value);
  copyBtn.classList.add('done');
  copyBtn.querySelector('span').textContent = 'U kopjua';
  copyBtn.querySelector('use').setAttribute('href', '#i-check');
  toast('Linku u kopjua');
  setTimeout(() => {
    copyBtn.classList.remove('done');
    copyBtn.querySelector('span').textContent = 'Kopjo linkun';
    copyBtn.querySelector('use').setAttribute('href', '#i-copy');
  }, 1800);
});

if (navigator.share) {
  const shareBtn = $('shareBtn');
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', () => {
    navigator.share({ title: 'Shkurto', url: shortUrlInput.value }).catch(() => {});
  });
}

if (navigator.clipboard && navigator.clipboard.readText) {
  const pasteBtn = $('pasteBtn');
  pasteBtn.hidden = false;
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) { toast('Clipboard-i është bosh'); return; }
      longUrlInput.value = text;
      longUrlInput.dispatchEvent(new Event('input'));
      longUrlInput.focus();
    } catch (e) {
      toast('Ngjite me Ctrl+V ose mbaj gishtin te fusha');
      longUrlInput.focus();
    }
  });
}

// "/" fokuson fushën e linkut
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); longUrlInput.focus(); }
});

refreshBtn.addEventListener('click', () => {
  if (refreshBtn.animate && !reduceMotion) refreshBtn.querySelector('svg').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
  loadLinks(); loadStats();
});
searchInput.addEventListener('input', renderLinks);

$('aliasPrefix').textContent = `${window.location.host}/`;
renderBand(DEMO_URL);
runDemo();
loadLinks(true);
loadStats();
