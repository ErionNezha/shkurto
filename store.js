// store.js — Storage layer
// Nëse MONGODB_URI ekziston dhe mongoose është i disponueshëm -> MongoDB
// Përndryshe -> file JSON në data/links.json (app-i punon kudo pa DB)

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'links.json');

let useMongo = false;
let UrlModel = null;
let mongooseRef = null;
let mongoReadyPromise = null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readAllFile() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeAllFile(links) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2), 'utf8');
}

async function initMongo() {
  if (!process.env.MONGODB_URI) return false;
  if (mongoReadyPromise) return mongoReadyPromise;
  mongoReadyPromise = (async () => {
    try {
      // eslint-disable-next-line global-require
      mongooseRef = require('mongoose');
      // eslint-disable-next-line global-require
      UrlModel = require('./models/Url');
      if (!UrlModel) return false;
      if (mongooseRef.connection.readyState === 0) {
        await mongooseRef.connect(process.env.MONGODB_URI);
      }
      useMongo = true;
      return true;
    } catch (e) {
      console.warn('MongoDB nuk u lidh, përdoret file store:', e.message);
      useMongo = false;
      return false;
    }
  })();
  return mongoReadyPromise;
}

// Init në ngarkim (pa e bllokuar serverin nëse Mongo mungon)
initMongo();

function normalize(link) {
  if (!link) return null;
  const obj = typeof link.toObject === 'function' ? link.toObject() : { ...link };
  return {
    shortCode: obj.shortCode,
    originalUrl: obj.originalUrl,
    createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : new Date().toISOString(),
    clickCount: obj.clickCount || 0,
    expiresAt: obj.expiresAt ? new Date(obj.expiresAt).toISOString() : null,
    clickDates: Array.isArray(obj.clickDates) ? obj.clickDates : [],
  };
}

async function getAllLinks() {
  if (await initMongo() && UrlModel) {
    const docs = await UrlModel.find({}).sort({ createdAt: -1 }).lean();
    return docs.map(normalize);
  }
  const all = readAllFile();
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getLinkByCode(code) {
  if (await initMongo() && UrlModel) {
    const doc = await UrlModel.findOne({ shortCode: code }).lean();
    return normalize(doc);
  }
  const all = readAllFile();
  return all.find((l) => l.shortCode === code) || null;
}

async function createLink(data) {
  const link = normalize(data);
  if (await initMongo() && UrlModel) {
    const doc = await UrlModel.create(link);
    return normalize(doc);
  }
  const all = readAllFile();
  all.push(link);
  writeAllFile(all);
  return link;
}

async function deleteLink(code) {
  if (await initMongo() && UrlModel) {
    const res = await UrlModel.deleteOne({ shortCode: code });
    return res.deletedCount > 0;
  }
  const all = readAllFile();
  const next = all.filter((l) => l.shortCode !== code);
  if (next.length === all.length) return false;
  writeAllFile(next);
  return true;
}

async function incrementClick(code) {
  if (await initMongo() && UrlModel) {
    const doc = await UrlModel.findOne({ shortCode: code });
    if (!doc) return null;
    doc.clickCount = (doc.clickCount || 0) + 1;
    doc.clickDates = [...(doc.clickDates || []), new Date().toISOString()].slice(-1000);
    await doc.save();
    return normalize(doc);
  }
  const all = readAllFile();
  const idx = all.findIndex((l) => l.shortCode === code);
  if (idx === -1) return null;
  all[idx].clickCount = (all[idx].clickCount || 0) + 1;
  all[idx].clickDates = [...(all[idx].clickDates || []), new Date().toISOString()].slice(-1000);
  writeAllFile(all);
  return all[idx];
}

async function codeExists(code) {
  const found = await getLinkByCode(code);
  return !!found;
}

module.exports = {
  getAllLinks,
  getLinkByCode,
  createLink,
  deleteLink,
  incrementClick,
  codeExists,
};
