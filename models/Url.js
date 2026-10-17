// models/Url.js — Skema Mongoose (opsionale) + modeli i të dhënave
// Struktura sipas tutorialit: { shortCode, originalUrl, createdAt, clickCount }
// Fusha shtesë: expiresAt, clickDates (për analytics Sot / Këtë javë)

let UrlModel = null;

try {
  // eslint-disable-next-line global-require
  const mongoose = require('mongoose');

  const urlSchema = new mongoose.Schema({
    shortCode: { type: String, required: true, unique: true, index: true },
    originalUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clickCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    clickDates: { type: [String], default: [] },
  });

  UrlModel = mongoose.models.Url || mongoose.model('Url', urlSchema);
} catch (e) {
  // mongoose nuk është instaluar — app-i punon me file store (store.js)
  UrlModel = null;
}

module.exports = UrlModel;
