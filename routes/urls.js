// routes/urls.js — API: POST /shorten, GET /links, DELETE /links/:code, GET /stats
const express = require('express');
const store = require('../store');

const router = express.Router();

const RESERVED = ['api', 'admin', 'kodi', 'index', 'public', 'netlify'];
const ALIAS_RE = /^[a-zA-Z0-9-_]{3,30}$/;

// Rate limit i thjeshtë: max 30 POST /api/shorten për IP për 10 minuta (in-memory)
const rateMap = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

function validateUrl(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'URL-ja është e detyrueshme.' };
  }
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return { ok: false, error: 'Kjo URL nuk lejohet.' };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    return { ok: false, error: 'URL-ja nuk është e vlefshme. Shembull: https://shembull.com/faqja' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Lejohen vetëm URL me http:// ose https://' };
  }
  return { ok: true, url: parsed.href };
}

function computeExpiresAt(body) {
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const opt = body.expiration || body.expiresIn || body.expiry || 'never';
  const val = String(opt).toLowerCase().trim();
  const now = Date.now();
  if (val === 'never' || val === 'kurrë' || val === 'kurre' || val === '' || val === 'null') return null;
  if (val === '24h' || val === '24' || val === '1d' || val === '1') return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  if (val === '7d' || val === '7' || val === 'week') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (val === '30d' || val === '30' || val === 'month') return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  // Numër orësh nëse vjen si numër i pastër > 1000 e trajtojmë si ms? Jo — kthe null
  return null;
}

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    // Stili i tutorialit: Math.random().toString(36)
    const code = Math.random().toString(36).substring(2, 8);
    if (code.length < 6) continue;
    if (RESERVED.includes(code.toLowerCase())) continue;
    // eslint-disable-next-line no-await-in-loop
    const exists = await store.codeExists(code);
    if (!exists) return code;
  }
  // Fallback më i fortë në rast kolizionesh të përsëritura
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
    // eslint-disable-next-line no-await-in-loop
    const exists = await store.codeExists(code);
    if (!exists) return code;
  }
  throw new Error('Nuk u gjenerua dot kod unik, provo përsëri.');
}

function buildShortUrl(req, code) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get ? req.get('host') : req.headers.host;
  return `${proto}://${host}/${code}`;
}

function isExpired(link) {
  return !!(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now());
}

// POST /api/shorten  (edhe POST /shorten nëse router montohet në root — shiko server.js)
async function shortenHandler(req, res) {
  try {
    const ip = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Shumë kërkesa. Provo përsëri pas disa minutash.' });
    }
    const body = req.body || {};
    const originalInput = body.originalUrl || body.url || body.longUrl;
    const validation = validateUrl(originalInput);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const customAlias = (body.customAlias || body.alias || body.customCode || '').trim();
    let shortCode;

    if (customAlias) {
      if (!ALIAS_RE.test(customAlias)) {
        return res.status(400).json({ error: 'Alias-i duhet 3–30 karaktere: vetëm shkronja, numra, - dhe _.' });
      }
      if (RESERVED.includes(customAlias.toLowerCase())) {
        return res.status(400).json({ error: 'Ky alias është i rezervuar, zgjidh një tjetër.' });
      }
      const exists = await store.codeExists(customAlias);
      if (exists) return res.status(409).json({ error: 'Ky alias është i zënë tashmë, zgjidh një tjetër.' });
      shortCode = customAlias;
    } else {
      shortCode = await generateUniqueCode();
    }

    const linkData = {
      shortCode,
      originalUrl: validation.url,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      expiresAt: computeExpiresAt(body),
      clickDates: [],
    };
    const saved = await store.createLink(linkData);
    const shortUrl = buildShortUrl(req, saved.shortCode);
    return res.status(201).json({ ...saved, code: saved.shortCode, shortUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Gabim në server. Provo përsëri.' });
  }
}

router.post('/shorten', shortenHandler);
router.post('/api/shorten', shortenHandler);

router.get('/links', async (req, res) => {
  try {
    const links = await store.getAllLinks();
    const withShort = links.map((l) => ({ ...l, code: l.shortCode, shortUrl: buildShortUrl(req, l.shortCode), expired: isExpired(l) }));
    return res.json(withShort);
  } catch (e) {
    return res.status(500).json({ error: 'Gabim në server.' });
  }
});
router.get('/api/links', async (req, res) => {
  try {
    const links = await store.getAllLinks();
    const withShort = links.map((l) => ({ ...l, code: l.shortCode, shortUrl: buildShortUrl(req, l.shortCode), expired: isExpired(l) }));
    return res.json(withShort);
  } catch (e) {
    return res.status(500).json({ error: 'Gabim në server.' });
  }
});

async function deleteHandler(req, res) {
  try {
    const { code } = req.params;
    const ok = await store.deleteLink(code);
    if (!ok) return res.status(404).json({ error: 'Linku nuk u gjet.' });
    return res.json({ message: 'Linku u fshi.', shortCode: code });
  } catch (e) {
    return res.status(500).json({ error: 'Gabim në server.' });
  }
}
router.delete('/links/:code', deleteHandler);
router.delete('/api/links/:code', deleteHandler);

async function statsHandler(req, res) {
  try {
    const links = await store.getAllLinks();
    const totalLinks = links.length;
    const totalClicks = links.reduce((s, l) => s + (l.clickCount || 0), 0);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    let clicksToday = 0;
    let clicksThisWeek = 0;
    links.forEach((l) => {
      (l.clickDates || []).forEach((iso) => {
        const t = new Date(iso).getTime();
        if (t >= startOfToday) clicksToday += 1;
        if (t >= weekAgo) clicksThisWeek += 1;
      });
    });
    return res.json({
      totalLinks,
      totalClicks,
      clicksToday,
      clicksThisWeek,
      todayClicks: clicksToday,
      weekClicks: clicksThisWeek,
      sot: clicksToday,
      keteJave: clicksThisWeek,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Gabim në server.' });
  }
}
router.get('/stats', statsHandler);
router.get('/api/stats', statsHandler);

router.shortenHandler = shortenHandler;
router.validateUrl = validateUrl;
router.computeExpiresAt = computeExpiresAt;
router.generateUniqueCode = generateUniqueCode;
router.RESERVED = RESERVED;

module.exports = router;
