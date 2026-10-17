<!-- Created by Erion Nezha — © 2026 All rights reserved -->

# Shkurto — Shkurto linket e gjata

URL Shortener i ndërtuar nga zero sipas tutorialit të graph.org:
**"Create Own URL Shortener Website From Scratch"** (25 hapa).

**Live:** https://shkurto.netlify.app

## Çfarë bën

- Shkurton linke të gjata në kode 6-karakterëshe (ose alias custom)
- Ridrejton me **302**, numëron klikimet dhe ruan datat e klikimeve
- Dashboard **"Linket e mia"** nga API (jo localStorage)
- **QR Code** për çdo link të ri, buton **Kopjo**, buton **Fshi**
- **Skadencë**: Kurrë / 24 orë / 7 ditë / 30 ditë — linket e skaduara kthejnë **410 Ka skaduar**
- **Statistika**: Total linke, Total klikime, Sot, Këtë javë
- **Validim** (vetëm http/https, refuzon javascript:/data:), fjalë të rezervuara, **rate limit** 30 kërkesa / 10 min për IP

## Hapat e tutorialit (përmbledhje, 25 hapa)

1. Planifikimi i veçorive  2. Node.js + Express setup  3. Struktura e projektit
4. UI (HTML/CSS)  5. Formulari i shkurtimit  6. Gjenerimi i kodit të shkurtër
7. Modeli i ruajtjes `{shortCode, originalUrl, createdAt, clickCount}`  8. API `POST /shorten`
9. Logjika e ridrejtimit  10. Numëruesi i klikimeve  11. Dashboard
12. Alias custom  13. Butoni Kopjo  14. QR Code  15. Skadenca e linkut
16. Analytics (sot/javë)  17. Validimi i URL-së  18. Siguria / rate limit
19. Trajtimi i gabimeve 404/410  20. Testimi lokal  21. Responsive design
22. Pastrimi i kodit  23. README  24. Struktura finale e file-ve  25. Deploy (Netlify)

## Si ndizet lokalisht

```bash
cd ~/workspace/url-shortener
npm install
npm start
# ose me port tjetër:
PORT=3210 node server.js
```

Hap: http://localhost:3000 (ose portin që zgjodhe)

Pa asnjë konfigurim shtesë, linket ruhen në `data/links.json`.
Nëse vendos `MONGODB_URI` në mjedis dhe instalon `mongoose` (opsionale), përdoret MongoDB:

```bash
MONGODB_URI="mongodb://..." npm start
```

## API

| Metoda | Rruga | Përshkrimi |
|---|---|---|
| POST | `/api/shorten` | Krijon link. Trupi: `{originalUrl, customAlias?, expiration?}` ku expiration: `never` / `24h` / `7d` / `30d`. Kthen 201 / 400 / 409 / 429 |
| GET | `/api/links` | Të gjitha linket |
| DELETE | `/api/links/:code` | Fshin një link |
| GET | `/api/stats` | `{totalLinks, totalClicks, clicksToday, clicksThisWeek}` |
| GET | `/:code` | Redirect 302, ose 404, ose 410 nëse ka skaduar |

## Struktura

```
url-shortener/
  server.js
  package.json
  models/Url.js
  routes/urls.js
  store.js
  public/index.html, style.css, script.js
  netlify/functions-src/api/api.js
  netlify/functions-src/redirect/redirect.js
  site/   (kopja statike + _redirects për deploy Netlify)
  README.md
```

## Deploy në Netlify

- Publish directory: `site/`
- Functions: `netlify/functions-src/api` dhe `netlify/functions-src/redirect` (secili me `package.json` + `node_modules` për `@netlify/blobs`)
- Në Netlify, linket ruhen globalisht në **Blobs** (`getStore("shkurto-links")`) — dashboard tregon të gjitha linket e sajtit.
- `_redirects` te `site/`:
  ```
  /api/*  /.netlify/functions/api  200
  /:code  /.netlify/functions/redirect?code=:code  200
  ```

---

Krijuar nga Erion Nezha — © 2026 All rights reserved
