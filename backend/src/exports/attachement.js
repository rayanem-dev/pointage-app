const ExcelJS = require('exceljs');
const { logo, newPdf, pdfCell } = require('./common');
const { frDate } = require('../lib/dates');
const { int } = require('../lib/format');

const HEAD = ['N°', 'Désignation', 'Nombre de Position (a)', 'Unité', 'Délai de Mobilisation (b)', 'Quantité Contrat (c) = (a)*(b)', 'Quantité Précédente', 'Quantité du Mois', 'Quantité Cumulée'];
const rowOf = (l) => [l.n, l.designation, l.positions, l.unite, l.delai, l.contrat, l.precedente, l.mois, l.cumulee];

async function xlsx(d) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Attachement ${d.numero}`, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 6 }, { width: 38 }, { width: 14 }, { width: 9 }, { width: 16 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const b = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  ws.mergeCells('A2:I2'); ws.getCell('A2').value = `Attachement N° : ${d.numero}`; ws.getCell('A2').font = { bold: true, size: 14, name: 'Times New Roman' };
  ws.mergeCells('A3:I3'); ws.getCell('A3').value = `Période : Du ${frDate(d.debut)} Au ${frDate(d.fin)}`; ws.getCell('A3').font = { bold: true, underline: true, size: 13, name: 'Times New Roman' };
  ['A2', 'A3'].forEach((a) => { ws.getCell(a).alignment = { horizontal: 'center' }; });
  ws.mergeCells('H4:I4'); ws.getCell('H4').value = `Date : ${frDate(d.fin)}`; ws.getCell('H4').alignment = { horizontal: 'right' };
  const info = [['Client : ', d.contrat.client], ['Contrat : ', `N° ${d.contrat.numero}.`], ['Objet : ', d.contrat.objet]];
  info.forEach(([k, v], i) => { const r = 6 + i * 2; ws.mergeCells(`A${r}:I${r}`); ws.getCell(`A${r}`).value = { richText: [{ text: k, font: { bold: true, underline: true } }, { text: v, font: { bold: true } }] }; ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }; });
  ws.getRow(10).height = 34;
  const H = 12;
  ws.getRow(H).height = 40;
  HEAD.forEach((t, i) => { const x = ws.getCell(H, i + 1); x.value = t; x.border = b; x.font = { bold: true }; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  d.lines.forEach((l, i) => {
    const r = H + 1 + i; ws.getRow(r).height = 28;
    rowOf(l).forEach((v, j) => { const x = ws.getCell(r, j + 1); x.value = v; x.border = b; x.alignment = { horizontal: j === 1 ? 'left' : 'center', vertical: 'middle' }; if (j === 5) x.value = { formula: `C${r}*E${r}`, result: v }; if (j === 8) x.value = { formula: `G${r}+H${r}`, result: v }; });
  });
  const f = H + d.lines.length + 3;
  ws.getCell(f, 1).value = `Représentant ${d.params.societe_nom}`; ws.getCell(f, 1).font = { bold: true };
  ws.getCell(f, 8).value = `Représentant ${d.contrat.client.split(/\s+/).slice(0, 1).join(' ')} ${d.contrat.rep_client || ''}`.trim(); ws.getCell(f, 8).font = { bold: true };
  if (d.contrat.rep_prestataire) ws.getCell(f + 5, 1).value = d.contrat.rep_prestataire;
  const lc = logo('logo-societe.png'); if (lc) ws.addImage(wb.addImage({ filename: lc, extension: 'png' }), 'A1:B1');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function pdf(d) {
  const { doc, done } = newPdf({ layout: 'landscape' });
  const W = 842;
  const ls = logo('logo-societe.png'); if (ls) doc.image(ls, 40, 28, { fit: [120, 60] });
  const lc = logo('logo-client.png'); if (lc) doc.image(lc, 700, 28, { fit: [100, 60] });
  doc.font('Times-Bold').fontSize(14).fillColor('#000').text(`Attachement N° : ${d.numero}`, 0, 62, { align: 'center', width: W });
  doc.fontSize(13).text(`Période : Du ${frDate(d.debut)} Au ${frDate(d.fin)}`, 0, 82, { align: 'center', width: W, underline: true });
  doc.fontSize(10).text(`Date : ${frDate(d.fin)}`, 0, 108, { align: 'right', width: W - 40, underline: true });
  doc.font('Times-Bold').fontSize(10.5);
  let y = 135;
  [['Client : ', d.contrat.client], ['Contrat : ', `N° ${d.contrat.numero}.`], ['Objet : ', d.contrat.objet]].forEach(([k, v]) => {
    doc.text(k + v, 40, y, { width: W - 80 }); y += doc.heightOfString(k + v, { width: W - 80 }) + 12;
  });
  y += 8;
  const cw = [36, 190, 70, 56, 86, 100, 90, 90, 90]; const x0 = (W - cw.reduce((a, b) => a + b, 0)) / 2;
  const row = (vals, h, opt = {}) => { let x = x0; vals.forEach((v, i) => { pdfCell(doc, x, y, cw[i], h, v, { size: opt.size || 9.5, bold: opt.bold, align: i === 1 && !opt.bold ? 'left' : 'center', pad: 5 }); x += cw[i]; }); y += h; };
  row(HEAD, 44, { bold: true, size: 9 });
  d.lines.forEach((l) => row(rowOf(l).map((v, i) => (i === 0 || i === 1 || i === 3 ? v : int(v))), 34));
  y += 24;
  doc.font('Times-Bold').fontSize(10.5).text(`Représentant ${d.params.societe_nom}`, x0, y);
  doc.text(`Représentant ${d.contrat.client.split(/\s+/)[0]} ${d.contrat.rep_client || ''}`.trim(), 560, y, { width: 240 });
  if (d.contrat.rep_prestataire) doc.font('Times-Roman').text(d.contrat.rep_prestataire, x0, y + 70);
  doc.end();
  return done;
}

module.exports = { xlsx, pdf };
