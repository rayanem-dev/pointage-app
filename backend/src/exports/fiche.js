const ExcelJS = require('exceljs');
const { argb, mix, logo, newPdf, pdfCell } = require('./common');

const cellOf = (day) => day.statut || day.prevu || '';
const colorOf = (day, c) => (day.statut ? c[day.statut] : day.prevu ? c[`${day.prevu}_prevu`] : null);

async function xlsx(data) {
  const c = { T: data.params.couleur_T, R: data.params.couleur_R, ABS: data.params.couleur_ABS, T_prevu: data.params.couleur_T_prevu, R_prevu: data.params.couleur_R_prevu };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Pointage ${data.key}`, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 30 }, { width: 24 }, ...Array.from({ length: 31 }, () => ({ width: 4 })), { width: 2 }, { width: 6 }, { width: 6 }, { width: 6 }];
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const lines = data.params.client_entete.split('\n');
  lines.forEach((l, i) => { ws.getCell(1 + i, 1).value = l; ws.getCell(1 + i, 1).font = { size: 9 }; });
  ws.mergeCells('H2:Z3'); Object.assign(ws.getCell('H2'), { value: 'FICHE DE POINTAGE' });
  ws.getCell('H2').font = { size: 22, bold: true, italic: true }; ws.getCell('H2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('AA5:AK5'); ws.getCell('AA5').value = `Mois de : ${data.label}`; ws.getCell('AA5').font = { size: 14 }; ws.getCell('AA5').alignment = { horizontal: 'right' };
  ws.mergeCells('A7:AK7'); ws.getCell('A7').value = data.titre; ws.getCell('A7').font = { size: 14 }; ws.getCell('A7').alignment = { horizontal: 'center' };
  const lg = [['logo-client.png', 'F1:G5'], ['logo-societe.png', 'AF1:AK4']];
  lg.forEach(([n, range]) => { const f = logo(n); if (f) ws.addImage(wb.addImage({ filename: f, extension: 'png' }), range); });
  const H = 9;
  const head = ['Nom Et Prenom', '', ...Array.from({ length: 31 }, (_, i) => i + 1), '', 'T', 'CR', 'ABS'];
  head.forEach((v, i) => { const x = ws.getCell(H, i + 1); x.value = v; x.border = border; x.font = { bold: i === 0 }; x.alignment = { horizontal: i < 2 ? 'left' : 'center' }; });
  ['PERSONNEL', 'FONCTION'].forEach((v, i) => { const x = ws.getCell(H + 1, i + 1); x.value = v; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8EA9DB' } }; x.border = border; });
  data.rows.forEach((r, ri) => {
    const row = H + 2 + ri;
    ws.getCell(row, 1).value = r.nom; ws.getCell(row, 2).value = r.fonction;
    [1, 2].forEach((i) => { ws.getCell(row, i).border = border; });
    for (let d = 0; d < 31; d += 1) {
      const x = ws.getCell(row, 3 + d); x.border = border; x.alignment = { horizontal: 'center' };
      if (d >= data.nd) { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; continue; }
      const day = r.days[d]; x.value = cellOf(day) || null;
      const col = colorOf(day, c);
      if (col) { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(col) } }; x.font = { color: { argb: day.statut ? 'FF000000' : 'FF666666' }, italic: !day.statut }; }
    }
    const rng = `C${row}:AG${row}`;
    [['T', 36, r.mois.T], ['R', 37, r.mois.R], ['ABS', 38, r.mois.ABS]].forEach(([k, col, v]) => {
      const x = ws.getCell(row, col); x.value = { formula: `COUNTIF(${rng},"${k}")`, result: v }; x.border = border; x.alignment = { horizontal: 'center' };
    });
  });
  const last = H + 2 + data.rows.length + 1;
  ws.getCell(last, 3).value = 'T'; ws.getCell(last, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.T) } };
  ws.getCell(last, 4).value = 'CR'; ws.getCell(last, 4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.R) } };
  ws.getCell(last, 5).value = 'ABS'; ws.getCell(last, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.ABS) } };
  ws.getCell(last + 2, 1).value = data.params.pointage_signature_client; ws.getCell(last + 2, 26).value = data.params.pointage_signature_prestataire;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function pdf(data) {
  const c = { T: data.params.couleur_T, R: data.params.couleur_R, ABS: data.params.couleur_ABS, T_prevu: data.params.couleur_T_prevu, R_prevu: data.params.couleur_R_prevu };
  const { doc, done } = newPdf({ layout: 'landscape' });
  const left = 28;
  doc.font('Helvetica').fontSize(7.5).fillColor('#222').text(data.params.client_entete, left + 62, 34, { lineGap: 1 });
  const lc = logo('logo-client.png'); if (lc) doc.image(lc, left, 30, { fit: [55, 55] });
  const ls = logo('logo-societe.png'); if (ls) doc.image(ls, 700, 30, { fit: [110, 50] });
  doc.font('Helvetica-BoldOblique').fontSize(22).fillColor('#000').text('FICHE DE POINTAGE', 0, 42, { align: 'center', width: 842 });
  doc.font('Helvetica').fontSize(12).text(`Mois de : ${data.label}`, 0, 78, { align: 'right', width: 842 - left });
  doc.fontSize(13).text(data.titre, 0, 96, { align: 'center', width: 842 });
  const wName = 118; const wFn = 98; const wDay = 15; const wTot = 30; const gap = 8;
  let y = 120; const h = 16;
  const x0 = left; const xd = x0 + wName + wFn; const xt = xd + 31 * wDay + gap;
  pdfCell(doc, x0, y, wName, h, 'Nom Et Prenom', { align: 'left', size: 8 });
  pdfCell(doc, x0 + wName, y, wFn, h, '', {});
  for (let d = 0; d < 31; d += 1) pdfCell(doc, xd + d * wDay, y, wDay, h, d + 1, { size: 7, pad: 0 });
  ['T', 'CR', 'ABS'].forEach((t, i) => pdfCell(doc, xt + i * wTot, y, wTot, h, t, { size: 8 }));
  y += h;
  pdfCell(doc, x0, y, wName, h, 'PERSONNEL', { fill: '#8EA9DB', align: 'left' });
  pdfCell(doc, x0 + wName, y, wFn, h, 'FONCTION', { fill: '#8EA9DB', align: 'left' });
  for (let d = 0; d < 31; d += 1) pdfCell(doc, xd + d * wDay, y, wDay, h, '', { fill: '#8EA9DB' });
  for (let i = 0; i < 3; i += 1) pdfCell(doc, xt + i * wTot, y, wTot, h, '', { fill: '#8EA9DB' });
  y += h;
  const rh = Math.min(17, Math.max(11, (470 - y) / Math.max(1, data.rows.length)));
  data.rows.forEach((r) => {
    pdfCell(doc, x0, y, wName, rh, r.nom, { align: 'left', size: 8 });
    pdfCell(doc, x0 + wName, y, wFn, rh, r.fonction, { align: 'left', size: 8 });
    for (let d = 0; d < 31; d += 1) {
      if (d >= data.nd) { pdfCell(doc, xd + d * wDay, y, wDay, rh, '', { fill: '#D9D9D9' }); continue; }
      const day = r.days[d]; const col = colorOf(day, c);
      pdfCell(doc, xd + d * wDay, y, wDay, rh, cellOf(day), { fill: col || undefined, size: 8, pad: 0, color: day.statut ? '#000' : '#555', italic: !day.statut });
    }
    [r.mois.T, r.mois.R, r.mois.ABS].forEach((v, i) => pdfCell(doc, xt + i * wTot, y, wTot, rh, v, { size: 9 }));
    y += rh;
  });
  y += 8;
  [['T', c.T], ['CR', c.R], ['ABS', c.ABS]].forEach(([t, col], i) => pdfCell(doc, x0 + wName + wFn + i * 28, y, 28, 14, t, { fill: col, size: 8, border: '#000' }));
  y += 34;
  doc.font('Helvetica').fontSize(11).fillColor('#000').text(data.params.pointage_signature_client, x0 + 100, y, { width: 260 });
  doc.text(data.params.pointage_signature_prestataire, 520, y, { width: 280 });
  doc.end();
  return done;
}

module.exports = { xlsx, pdf };
