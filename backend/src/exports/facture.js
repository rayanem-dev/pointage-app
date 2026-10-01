const ExcelJS = require('exceljs');
const { logo, newPdf, pdfCell } = require('./common');
const { frDate } = require('../lib/dates');
const { money, int, amountInWords } = require('../lib/format');

const sentence = (d) => `ARRETEE LA PRESENTE FACTURE A LA SOMME DE: ${amountInWords(d.totalHT)} EN HORS TAXES.`;
const upper = (s) => (s || '').toUpperCase();

async function xlsx(d) {
  const p = d.params;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Facture', { pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  ws.columns = [{ width: 6 }, { width: 46 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 22 }];
  const b = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const put = (a, v, o = {}) => { const c = ws.getCell(a); c.value = v; Object.assign(c, o); return c; };
  ws.mergeCells('A1:C6'); put('A1', `${p.societe_nom}\n${p.societe_adresse}\n${p.societe_activite}`, { alignment: { wrapText: true, vertical: 'middle' }, font: { bold: true, size: 11 } });
  ws.mergeCells('D1:F2'); put('D1', `Facture N°: ${d.facture_numero}`, { font: { bold: true, size: 14 }, alignment: { vertical: 'middle' } });
  ws.mergeCells('D3:F6'); put('D3', `DOIT :\n${p.client_adresse_facture}`, { font: { bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells('A8:C13'); put('A8', `DIRECTION FINANCES ET COMPTABILITE\nCAPITAL SOCIAL: ${p.societe_capital}\nR C N° : ${p.societe_rc}\nNIS N° : ${p.societe_nis}\nNIF N° : ${p.societe_nif}\nA I N° : ${p.societe_ai}\nDOMICILIATION BANCAIRE\nRIB N° : ${p.societe_rib}\n${p.societe_banque}\n${p.societe_contact}`, { font: { italic: true, size: 9 }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells('D8:F8'); put('D8', `Contrat N°: ${d.contrat.numero}${d.contrat.date_contrat ? ` Du ${d.contrat.date_contrat}` : ''}`, { font: { bold: true } });
  ws.mergeCells('A15:F16'); put('A15', d.contrat.objet, { font: { italic: true, bold: true }, alignment: { wrapText: true, horizontal: 'center' } });
  put('A18', `Attachement N°: ${d.numero} Du ${frDate(d.attachement_date)}`, { font: { italic: true } });
  put('A19', `Période: Du ${frDate(d.debut)} Au ${frDate(d.fin)}`, { font: { italic: true } });
  const H = 21;
  ['N°', 'DESIGNATIONS', 'U/M', 'QTE.', 'P.UNITAIRE', 'MONTANT EN H.T'].forEach((t, i) => { put(ws.getCell(H, i + 1).address, t, { border: b, font: { bold: true }, alignment: { horizontal: 'center' } }); });
  d.lines.forEach((l, i) => {
    const r = H + 1 + i;
    [String(i + 1).padStart(2, '0'), l.designation, l.unite, l.mois, l.prix_unitaire, { formula: `D${r}*E${r}`, result: l.montant }].forEach((v, j) => {
      put(ws.getCell(r, j + 1).address, v, { border: b, alignment: { horizontal: j === 1 ? 'left' : j >= 4 ? 'right' : 'center' }, numFmt: j >= 4 ? '#,##0.00' : undefined });
    });
  });
  const t = H + Math.max(d.lines.length, 4) + 2;
  ws.mergeCells(`A${t}:E${t}`); put(`A${t}`, 'TOTAL EN HORS TAXES...', { font: { bold: true, italic: true }, alignment: { horizontal: 'center' }, border: b });
  put(`F${t}`, { formula: `SUM(F${H + 1}:F${H + d.lines.length})`, result: d.totalHT }, { border: b, font: { bold: true }, numFmt: '#,##0.00' });
  ws.mergeCells(`A${t + 2}:F${t + 3}`); put(`A${t + 2}`, sentence(d), { font: { bold: true }, alignment: { wrapText: true } });
  put(`E${t + 6}`, `Fait à: ${p.societe_ville}, Le : ${frDate(d.date)}`, { font: { bold: true } });
  put(`E${t + 7}`, 'Direction Finances et Comptabilité', { font: { bold: true } });
  const lg = logo('logo-societe.png'); if (lg) ws.addImage(wb.addImage({ filename: lg, extension: 'png' }), 'A1:B5');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function pdf(d) {
  const p = d.params;
  const { doc, done } = newPdf({ margin: 36 });
  const L = 36; const W = 523;
  const ls = logo('logo-societe.png'); if (ls) doc.image(ls, L + 4, 40, { fit: [160, 70] });
  pdfCell(doc, L, 36, 300, 82, '', { border: '#000' });
  pdfCell(doc, L + 300, 36, W - 300, 82, '', { border: '#000' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(`${p.societe_nom}\n${p.societe_adresse}`, L + 306, 42, { width: W - 312 });
  doc.font('Helvetica').fontSize(8).text(p.societe_activite, L + 306, 100, { width: W - 312 });
  pdfCell(doc, L, 126, 240, 118, '', { fill: '#E7E7E7' });
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#000').text(`DIRECTION FINANCES ET COMPTABILITE\nCAPITAL SOCIAL: ${p.societe_capital}\nR C N° : ${p.societe_rc}\nNIS N° : ${p.societe_nis}\nNIF N° : ${p.societe_nif}\nA I N° : ${p.societe_ai}\nDOMICILIATION BANCAIRE\nRIB N° : ${p.societe_rib}\n${p.societe_banque}\n${p.societe_contact}`, L + 6, 131, { width: 230, lineGap: 1 });
  pdfCell(doc, L + 260, 126, W - 260, 28, `Facture N°: ${d.facture_numero}`, { fill: '#E7E7E7', bold: true, size: 12, align: 'left', pad: 8 });
  pdfCell(doc, L + 260, 162, W - 260, 82, '', { fill: '#E7E7E7' });
  doc.font('Helvetica-Bold').fontSize(10).text(`DOIT :\n${p.client_adresse_facture}`, L + 266, 168, { width: W - 272 });
  pdfCell(doc, L + 260, 252, W - 260, 18, `Contrat N°: ${d.contrat.numero}${d.contrat.date_contrat ? ` Du ${d.contrat.date_contrat}` : ''}`, { fill: '#E7E7E7', bold: true, size: 10, align: 'left', pad: 6 });
  doc.font('Helvetica-BoldOblique').fontSize(11).text(d.contrat.objet, L, 290, { width: W, align: 'center' });
  const y1 = doc.y + 18;
  doc.font('Helvetica-Oblique').fontSize(10).text(`Attachement N°: ${d.numero} Du ${frDate(d.attachement_date)}\nPériode: Du ${frDate(d.debut)} Au ${frDate(d.fin)}`, L, y1, { lineGap: 3 });
  let y = y1 + 46;
  const cw = [30, 215, 55, 45, 85, 93];
  const row = (vals, h, o = {}) => { let x = L; vals.forEach((v, i) => { pdfCell(doc, x, y, cw[i], h, v, { bold: o.bold, size: o.size || 10, align: i === 1 ? 'left' : i >= 4 ? 'right' : 'center', pad: 5 }); x += cw[i]; }); y += h; };
  row(['N°', 'DESIGNATIONS', 'U/M', 'QTE.', 'P.UNITAIRE', 'MONTANT EN H.T'], 18, { bold: true, size: 9 });
  d.lines.forEach((l, i) => row([String(i + 1).padStart(2, '0'), l.designation, l.unite, int(l.mois), money(l.prix_unitaire), money(l.montant)], 20, { bold: false }));
  for (let i = d.lines.length; i < 4; i += 1) row(['', '', '', '', '', ''], 20);
  pdfCell(doc, L, y, cw.slice(0, 5).reduce((a, b) => a + b, 0), 20, 'TOTAL EN HORS TAXES...', { bold: true, italic: true, size: 10 });
  pdfCell(doc, L + cw.slice(0, 5).reduce((a, b) => a + b, 0), y, cw[5], 20, money(d.totalHT), { bold: true, align: 'right', size: 10, pad: 5 });
  y += 38;
  pdfCell(doc, L, y, W, 34, sentence(d), { fill: '#E7E7E7', bold: true, size: 9.5, align: 'left', pad: 6 });
  y += 70;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(`Fait à: ${p.societe_ville}, Le : ${frDate(d.date)}\nDirection Finances et Comptabilité`, L + 290, y, { width: 240, lineGap: 2 });
  doc.end();
  return done;
}

module.exports = { xlsx, pdf, upper };
