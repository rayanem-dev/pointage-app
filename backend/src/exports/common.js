const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ASSETS = path.join(__dirname, '../../assets');
// Logos facultatifs : déposer assets/logo-client.png et assets/logo-societe.png
const logo = (name) => { const f = path.join(ASSETS, name); return fs.existsSync(f) ? f : null; };

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;
const mix = (hex, t) => { // éclaircit une couleur (t = 0..1 vers le blanc)
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  const c = [1, 3, 5].map((i) => Math.round(n(i) + (255 - n(i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

function newPdf(options = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 28, ...options });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  return { doc, done };
}

// Cellule de tableau PDF : fond, bordure, texte centré/gauche.
function pdfCell(doc, x, y, w, h, text, { fill, color = '#000', bold = false, italic = false, align = 'center', size = 8, border = '#000', pad = 2 } = {}) {
  if (fill) doc.save().rect(x, y, w, h).fill(fill).restore();
  if (border) doc.save().lineWidth(0.5).strokeColor(border).rect(x, y, w, h).stroke().restore();
  if (text === '' || text == null) return;
  doc.save().fillColor(color).font(bold ? (italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(size);
  const th = doc.heightOfString(String(text), { width: w - pad * 2, align });
  doc.text(String(text), x + pad, y + Math.max(1, (h - th) / 2), { width: w - pad * 2, align, lineBreak: true });
  doc.restore();
}

module.exports = { logo, argb, mix, newPdf, pdfCell };
