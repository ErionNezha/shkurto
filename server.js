// server.js — Shkurto (Express)
// PORT nga env ose 3000. Rendi: statike + API para GET /:code.
const express = require('express');
const path = require('path');
const store = require('./store');
const urlsRouter = require('./routes/urls');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true }));

// File statikë
app.use(express.static(path.join(__dirname, 'public')));

// API routes (para /:code)
app.use('/api', urlsRouter);
app.use('/', urlsRouter); // mbështet edhe POST /shorten direkt nëse klienti e thërret ashtu (router ka /shorten)

// Redirect: GET /:code
app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    // Mos kapi file / rrugë të njohura
    if (['favicon.ico', 'favicon.svg', 'robots.txt', 'style.css', 'script.js', 'index.html'].includes(code)) {
      return res.status(404).send('Nuk u gjet.');
    }
    const link = await store.getLinkByCode(code);
    if (!link) {
      return res.status(404).send(`<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>404 — Shkurto</title><style>body{background:#0b0f1a;color:#e8ecf5;font-family:system-ui;text-align:center;padding:60px 20px}a{color:#7c5cff}</style></head><body><h1>404 — Linku nuk u gjet</h1><p>Ky link i shkurtër nuk ekziston ose është fshirë.</p><p><a href="/">Kthehu te Shkurto</a></p></body></html>`);
    }
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
      return res.status(410).send(`<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8"><title>Ka skaduar — Shkurto</title><style>body{background:#0b0f1a;color:#e8ecf5;font-family:system-ui;text-align:center;padding:60px 20px}a{color:#7c5cff}</style></head><body><h1>Ka skaduar</h1><p>Ky link ka skaduar dhe nuk është më aktiv.</p><p><a href="/">Kthehu te Shkurto</a></p></body></html>`);
    }
    await store.incrementClick(code);
    return res.redirect(302, link.originalUrl);
  } catch (e) {
    return res.status(500).send('Gabim në server.');
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Shkurto po dëgjon në portin ${PORT}`);
  });
}

module.exports = app;
