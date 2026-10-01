/**
 * Exports Excel / PDF : on construit le document dans un classeur Google temporaire (mise en forme fine),
 * puis on l'exporte via l'URL d'export de Google Sheets, et on met le classeur à la corbeille.
 */
var Export = (function () {
  var MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  function put(sheet, row, col, value, s) {
    var r = sheet.getRange(row, col);
    if (value !== undefined && value !== null) r.setValue(value);
    if (s) style(r, s);
    return r;
  }
  function style(r, s) {
    if (s.bold) r.setFontWeight('bold');
    if (s.italic) r.setFontStyle('italic');
    if (s.underline) r.setFontLine('underline');
    if (s.size) r.setFontSize(s.size);
    if (s.bg) r.setBackground(s.bg);
    if (s.color) r.setFontColor(s.color);
    if (s.align) r.setHorizontalAlignment(s.align);
    r.setVerticalAlignment(s.valign || 'middle');
    if (s.wrap) r.setWrap(true);
    if (s.border) r.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    if (s.format) r.setNumberFormat(s.format);
  }
  function merged(sheet, row, col, nr, nc, value, s) {
    var r = sheet.getRange(row, col, nr, nc);
    r.merge();
    if (value !== undefined) r.setValue(value);
    style(r, s || {});
    return r;
  }
  function logo(sheet, fileId, row, col) {
    if (!fileId) return;
    try { sheet.insertImage(DriveApp.getFileById(fileId).getBlob(), col, row); } catch (e) { Logger.log('Logo ignoré : ' + e.message); }
  }
  function widths(sheet, list) { list.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); }); }

  // ---------- Fiche de pointage ----------
  function buildFiche(sheet, d) {
    var p = d.params;
    var c = { T: p.couleur_T, R: p.couleur_R, ABS: p.couleur_ABS, T_prevu: p.couleur_T_prevu, R_prevu: p.couleur_R_prevu };
    var w = [190, 150]; for (var i = 0; i < 31; i += 1) w.push(26); w.push(10, 42, 42, 42);
    widths(sheet, w);
    (p.client_entete || '').split('\n').filter(Boolean).forEach(function (l, k) { put(sheet, 1 + k, 1, l, { size: 9 }); });
    logo(sheet, p.logo_client_id, 1, 6); logo(sheet, p.logo_prestataire_id, 1, 31);
    merged(sheet, 2, 8, 2, 19, 'FICHE DE POINTAGE', { bold: true, italic: true, size: 22, align: 'center' });
    merged(sheet, 5, 27, 1, 11, 'Mois de : ' + d.label, { size: 13, align: 'right' });
    merged(sheet, 7, 1, 1, 37, d.titre, { size: 13, align: 'center' });
    var H = 9;
    var head = ['Nom Et Prenom', '']; for (i = 1; i <= 31; i += 1) head.push(i); head = head.concat(['', 'T', 'CR', 'ABS']);
    var hr = sheet.getRange(H, 1, 1, 37); hr.setValues([head]); style(hr, { border: true, align: 'center' }); sheet.getRange(H, 1).setHorizontalAlignment('left').setFontWeight('bold');
    var pr = sheet.getRange(H + 1, 1, 1, 37); pr.setValues([['PERSONNEL', 'FONCTION'].concat(new Array(35).fill(''))]); style(pr, { border: true, bg: '#8EA9DB' });
    var n = d.rows.length;
    if (n) {
      var vals = []; var bgs = [];
      d.rows.forEach(function (r, idx) {
        var row = [r.nom, r.fonction]; var bg = ['#ffffff', '#ffffff'];
        for (var k = 0; k < 31; k += 1) {
          if (k >= d.nd) { row.push(''); bg.push('#D9D9D9'); continue; }
          var day = r.days[k]; var s = day.statut || day.prevu;
          row.push(s); bg.push(day.statut ? c[day.statut] : day.prevu ? c[day.prevu + '_prevu'] : '#ffffff');
        }
        var line = H + 2 + idx; var rng = 'C' + line + ':AG' + line;
        row.push('');
        // Formules seulement si aucun jour « prévu » n'est affiché (sinon elles les compteraient).
        row.push(d.prevu ? r.mois.T : '=COUNTIF(' + rng + ',"T")', d.prevu ? r.mois.R : '=COUNTIF(' + rng + ',"R")', d.prevu ? r.mois.ABS : '=COUNTIF(' + rng + ',"ABS")');
        bg.push('#ffffff', '#ffffff', '#ffffff', '#ffffff');
        vals.push(row); bgs.push(bg);
      });
      var body = sheet.getRange(H + 2, 1, n, 37);
      body.setValues(vals); body.setBackgrounds(bgs);
      style(body, { border: true });
      sheet.getRange(H + 2, 3, n, 31).setHorizontalAlignment('center');
      sheet.getRange(H + 2, 35, n, 3).setHorizontalAlignment('center');
    }
    var last = H + 2 + n + 1;
    put(sheet, last, 3, 'T', { bg: c.T, border: true, align: 'center' });
    put(sheet, last, 4, 'CR', { bg: c.R, border: true, align: 'center' });
    put(sheet, last, 5, 'ABS', { bg: c.ABS, border: true, align: 'center', color: '#ffffff' });
    put(sheet, last + 3, 1, p.signature_client || '', { size: 11 });
    put(sheet, last + 3, 26, p.signature_prestataire || ('le prestataire ' + (p.prestataire_nom || '')), { size: 11 });
  }

  // ---------- Attachement ----------
  function buildAttachement(sheet, d) {
    var p = d.params;
    widths(sheet, [40, 280, 90, 60, 110, 130, 110, 110, 110]);
    logo(sheet, p.logo_prestataire_id, 1, 1); logo(sheet, p.logo_client_id, 1, 8);
    merged(sheet, 2, 1, 1, 9, 'Attachement N° : ' + d.numero, { bold: true, size: 14, align: 'center' });
    merged(sheet, 3, 1, 1, 9, 'Période : Du ' + Dates.frDate(d.debut) + ' Au ' + Dates.frDate(d.fin), { bold: true, underline: true, size: 13, align: 'center' });
    merged(sheet, 4, 8, 1, 2, 'Date : ' + Dates.frDate(d.fin), { align: 'right', underline: true });
    [['Client : ', d.contrat.client], ['Contrat : ', 'N° ' + d.contrat.numero + '.'], ['Objet : ', d.contrat.objet]].forEach(function (kv, i) {
      merged(sheet, 6 + i * 2, 1, 1, 9, kv[0] + kv[1], { bold: true, wrap: true, valign: 'top' });
    });
    sheet.setRowHeight(10, 34);
    var H = 12;
    var head = ['N°', 'Désignation', 'Nombre de Position (a)', 'Unité', 'Délai de Mobilisation (b)', 'Quantité Contrat (c) = (a)*(b)', 'Quantité Précédente', 'Quantité du Mois', 'Quantité Cumulée'];
    var hr = sheet.getRange(H, 1, 1, 9); hr.setValues([head]); style(hr, { bold: true, border: true, align: 'center', wrap: true }); sheet.setRowHeight(H, 44);
    if (d.lines.length) {
      var vals = d.lines.map(function (l, i) {
        var r = H + 1 + i;
        return [l.n, l.designation, l.positions, l.unite, l.delai, '=C' + r + '*E' + r, l.precedente, l.mois, '=G' + r + '+H' + r];
      });
      var body = sheet.getRange(H + 1, 1, vals.length, 9);
      body.setValues(vals); style(body, { border: true, align: 'center' });
      sheet.getRange(H + 1, 2, vals.length, 1).setHorizontalAlignment('left');
    }
    var f = H + d.lines.length + 3;
    put(sheet, f, 1, 'Représentant ' + (p.prestataire_nom || 'du prestataire'), { bold: true });
    put(sheet, f, 8, ('Représentant ' + (d.contrat.client || '').split(/\s+/)[0] + ' ' + (d.contrat.rep_client || '')).trim(), { bold: true });
    if (d.contrat.rep_prestataire) put(sheet, f + 5, 1, d.contrat.rep_prestataire, { size: 13 });
  }

  // ---------- Facture ----------
  function buildFacture(sheet, d) {
    var p = d.params;
    widths(sheet, [45, 300, 70, 70, 120, 150]);
    logo(sheet, p.logo_prestataire_id, 1, 1);
    merged(sheet, 1, 1, 6, 3, (p.prestataire_nom || '') + '\n' + (p.prestataire_adresse || '') + '\n' + (p.prestataire_activite || ''), { bold: true, wrap: true });
    merged(sheet, 1, 4, 2, 3, 'Facture N°: ' + d.facture_numero, { bold: true, size: 14 });
    merged(sheet, 3, 4, 4, 3, 'DOIT :\n' + (p.client_adresse_facture || ''), { bold: true, wrap: true, valign: 'top' });
    var legal = ['DIRECTION FINANCES ET COMPTABILITE', 'CAPITAL SOCIAL: ' + p.prestataire_capital, 'R C N° : ' + p.prestataire_rc, 'NIS N° : ' + p.prestataire_nis, 'NIF N° : ' + p.prestataire_nif, 'A I N° : ' + p.prestataire_ai, 'DOMICILIATION BANCAIRE', 'RIB N° : ' + p.prestataire_rib, p.prestataire_banque, p.prestataire_contact].join('\n');
    merged(sheet, 8, 1, 6, 3, legal, { italic: true, size: 9, wrap: true, valign: 'top' });
    merged(sheet, 8, 4, 1, 3, 'Contrat N°: ' + d.contrat.numero + (d.contrat.date_contrat ? ' Du ' + d.contrat.date_contrat : ''), { bold: true });
    merged(sheet, 15, 1, 2, 6, d.contrat.objet, { italic: true, bold: true, wrap: true, align: 'center' });
    put(sheet, 18, 1, 'Attachement N°: ' + d.numero + ' Du ' + Dates.frDate(d.attachement_date), { italic: true });
    put(sheet, 19, 1, 'Période: Du ' + Dates.frDate(d.debut) + ' Au ' + Dates.frDate(d.fin), { italic: true });
    var H = 21;
    var hr = sheet.getRange(H, 1, 1, 6); hr.setValues([['N°', 'DESIGNATIONS', 'U/M', 'QTE.', 'P.UNITAIRE', 'MONTANT EN H.T']]); style(hr, { bold: true, border: true, align: 'center' });
    var n = d.lines.length;
    if (n) {
      var vals = d.lines.map(function (l, i) { var r = H + 1 + i; return [String(i + 1).length < 2 ? '0' + (i + 1) : String(i + 1), l.designation, l.unite, l.mois, l.prix_unitaire, '=D' + r + '*E' + r]; });
      var body = sheet.getRange(H + 1, 1, n, 6);
      body.setValues(vals); style(body, { border: true, align: 'center' });
      sheet.getRange(H + 1, 2, n, 1).setHorizontalAlignment('left');
      sheet.getRange(H + 1, 5, n, 2).setHorizontalAlignment('right').setNumberFormat('#,##0.00');
    }
    var t = H + Math.max(n, 4) + 2;
    merged(sheet, t, 1, 1, 5, 'TOTAL EN HORS TAXES...', { bold: true, italic: true, align: 'center', border: true });
    put(sheet, t, 6, n ? '=SUM(F' + (H + 1) + ':F' + (H + n) + ')' : 0, { bold: true, border: true, format: '#,##0.00', align: 'right' });
    merged(sheet, t + 2, 1, 2, 6, 'ARRETEE LA PRESENTE FACTURE A LA SOMME DE: ' + Format.amountInWords(d.totalHT) + ' EN HORS TAXES.', { bold: true, wrap: true });
    put(sheet, t + 6, 5, 'Fait à: ' + (p.prestataire_ville || '') + ', Le : ' + Dates.frDate(d.date), { bold: true });
    put(sheet, t + 7, 5, 'Direction Finances et Comptabilité', { bold: true });
  }

  var BUILDERS = { fiche: buildFiche, attachement: buildAttachement, facture: buildFacture };
  var LANDSCAPE = { fiche: true, attachement: true, facture: false };

  function render(doc, data, format, baseName) {
    format = format === 'pdf' ? 'pdf' : 'xlsx';
    var tmp = SpreadsheetApp.create('tmp_export_' + Date.now());
    var id = tmp.getId();
    try {
      var sheet = tmp.getSheets()[0];
      sheet.setName(baseName.slice(0, 90));
      sheet.setHiddenGridlines(true);
      BUILDERS[doc](sheet, data);
      SpreadsheetApp.flush();
      var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=' + format;
      if (format === 'pdf') url += '&size=A4&portrait=' + (LANDSCAPE[doc] ? 'false' : 'true') + '&fitw=true&gridlines=false&sheetnames=false&printtitle=false&pagenumbers=false&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4&horizontal_alignment=CENTER&gid=' + sheet.getSheetId();
      var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw httpErr_("Export impossible (code " + res.getResponseCode() + ')');
      var blob = res.getBlob();
      return { nom: baseName.replace(/[^\w.-]+/g, '_') + '.' + format, mime: MIME[format], base64: Utilities.base64Encode(blob.getBytes()) };
    } finally {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ignore */ }
    }
  }
  return { render: render, BUILDERS: BUILDERS };
})();
