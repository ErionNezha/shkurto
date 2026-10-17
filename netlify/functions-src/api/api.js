// netlify/functions-src/api/api.js — Netlify Function (CommonJS)
// Përdor @netlify/blobs getStore("shkurto-links")
// Trajton: POST /api/shorten, GET /api/links, DELETE /api/links/:code, GET /api/stats
const { getStore, connectLambda } = require('@netlify/blobs');

const RESERVED = ['api', 'admin', 'kodi', 'index', 'public', 'netlify'];
const ALIAS_RE = /^[a-zA-Z0-9-_]{3,30}$/;
const rateMap = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) { rateMap.set(ip, { count: 1, start: now }); return false; }
  entry.count += 1; rateMap.set(ip, entry); return entry.count > RATE_LIMIT;
}
function validateUrl(input) {
  if (!input || typeof input !== 'string' || !input.trim()) return { ok: false, error: 'URL-ja është e detyrueshme.' };
  const trimmed = input.trim(); const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return { ok: false, error: 'Kjo URL nuk lejohet.' };
  let parsed; try { parsed = new URL(trimmed); } catch (e) { return { ok: false, error: 'URL-ja nuk është e vlefshme. Shembull: https://shembull.com/faqja' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'Lejohen vetëm URL me http:// ose https://' };
  return { ok: true, url: parsed.href };
}
function computeExpiresAt(body) {
  if (body.expiresAt) { const d = new Date(body.expiresAt); if (!Number.isNaN(d.getTime())) return d.toISOString(); }
  const opt = body.expiration || body.expiresIn || body.expiry || 'never';
  const val = String(opt).toLowerCase().trim(); const now = Date.now();
  if (val === 'never' || val === 'kurrë' || val === 'kurre' || val === '' || val === 'null') return null;
  if (val === '24h' || val === '24' || val === '1d' || val === '1') return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  if (val === '7d' || val === '7' || val === 'week') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (val === '30d' || val === '30' || val === 'month') return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}
function baseUrl(event) {
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers.host || '';
  return `${proto}://${host}`;
}

exports.handler = async (event) => {
  try {
    try { connectLambda(event); } catch (e) {}
    const store = getStore('shkurto-links');
    const method = event.httpMethod;
    const path = event.path || '';
    // Pastro path: /api/shorten, /.netlify/functions/api/shorten, /api/links/CODE, etj.
    let clean = path.replace('/.netlify/functions/api', '').replace('/api', '');
    if (!clean.startsWith('/')) clean = `/${clean}`;
    // DELETE /links/:code
    const deleteMatch = clean.match(/^\/links\/([^/]+)$/);

    if (method === 'POST' && (clean === '/shorten' || clean === '/' || clean === '')) {
      const ip = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim();
      if (isRateLimited(ip)) return json(429, { error: 'Shumë kërkesa. Provo përsëri pas disa minutash.' });
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Trupi i kërkesës nuk është JSON i vlefshëm.' }); }
      const validation = validateUrl(body.originalUrl || body.url || body.longUrl);
      if (!validation.ok) return json(400, { error: validation.error });
      const customAlias = (body.customAlias || body.alias || body.customCode || '').trim();
      let shortCode;
      if (customAlias) {
        if (!ALIAS_RE.test(customAlias)) return json(400, { error: 'Alias-i duhet 3–30 karaktere: vetëm shkronja, numra, - dhe _.' });
        if (RESERVED.includes(customAlias.toLowerCase())) return json(400, { error: 'Ky alias është i rezervuar, zgjidh një tjetër.' });
        const existing = await store.get(customAlias, { type: 'json' }).catch(() => null);
        if (existing) return json(409, { error: 'Ky alias është i zënë tashmë, zgjidh një tjetër.' });
        shortCode = customAlias;
      } else {
        let found = false;
        for (let i = 0; i < 20 && !found; i += 1) {
          const candidate = Math.random().toString(36).substring(2, 8);
          if (candidate.length < 6 || RESERVED.includes(candidate.toLowerCase())) continue;
          // eslint-disable-next-line no-await-in-loop
          const existing = await store.get(candidate, { type: 'json' }).catch(() => null);
          if (!existing) { shortCode = candidate; found = true; }
        }
        if (!found) return json(500, { error: 'Nuk u gjenerua dot kod unik, provo përsëri.' });
      }
      const link = { shortCode, originalUrl: validation.url, createdAt: new Date().toISOString(), clickCount: 0, expiresAt: computeExpiresAt(body), clickDates: [] };
      await store.setJSON(shortCode, link);
      return json(201, { ...link, code: shortCode, shortUrl: `${baseUrl(event)}/${shortCode}` });
    }

    if (method === 'GET' && clean === '/links') {
      const { blobs } = await store.list();
      const links = [];
      for (const b of blobs) {
        // eslint-disable-next-line no-await-in-loop
        const item = await store.get(b.key, { type: 'json' }).catch(() => null);
        if (item) links.push({ ...item, code: item.shortCode, shortUrl: `${baseUrl(event)}/${item.shortCode}`, expired: item.expiresAt ? new Date(item.expiresAt).getTime() <= Date.now() : false });
      }
      links.sort((a, b2) => new Date(b2.createdAt) - new Date(a.createdAt));
      return json(200, links);
    }

    if (method === 'DELETE' && deleteMatch) {
      const code = decodeURIComponent(deleteMatch[1]);
      const existing = await store.get(code, { type: 'json' }).catch(() => null);
      if (!existing) return json(404, { error: 'Linku nuk u gjet.' });
      await store.delete(code);
      return json(200, { message: 'Linku u fshi.', shortCode: code });
    }

    if (method === 'GET' && clean === '/stats') {
      const { blobs } = await store.list();
      let totalClicks = 0; let clicksToday = 0; let clicksThisWeek = 0;
      const now = new Date(); const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      for (const b of blobs) {
        // eslint-disable-next-line no-await-in-loop
        const item = await store.get(b.key, { type: 'json' }).catch(() => null);
        if (!item) continue;
        totalClicks += item.clickCount || 0;
        (item.clickDates || []).forEach((iso) => { const t = new Date(iso).getTime(); if (t >= startToday) clicksToday += 1; if (t >= weekAgo) clicksThisWeek += 1; });
      }
      return json(200, { totalLinks: blobs.length, totalClicks, clicksToday, clicksThisWeek, todayClicks: clicksToday, weekClicks: clicksThisWeek, sot: clicksToday, keteJave: clicksThisWeek });
    }

    return json(404, { error: 'Rruga nuk u gjet.' });
  } catch (e) {
    return json(500, { error: 'Gabim në server. Provo përsëri.' });
  }
};
