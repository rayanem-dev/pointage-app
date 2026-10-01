// Pilote Google Sheets : un onglet = une table (ou un mois de pointage).
const fs = require('fs');
const { google } = require('googleapis');

const spreadsheetId = process.env.SPREADSHEET_ID;
let sheetsApi = null;
let tabIds = null; // titre -> sheetId

function client() {
  if (sheetsApi) return sheetsApi;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID manquant');
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const opts = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (raw) opts.credentials = JSON.parse(raw);
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) opts.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  else throw new Error('Compte de service Google manquant (GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS)');
  sheetsApi = google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth(opts) });
  return sheetsApi;
}

async function refreshTabs() {
  const res = await client().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  tabIds = {};
  for (const s of res.data.sheets) tabIds[s.properties.title] = s.properties.sheetId;
  return tabIds;
}

async function ensureTab(tab) {
  if (!tabIds) await refreshTabs();
  if (tabIds[tab] !== undefined) return false;
  await client().spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
  await refreshTabs();
  return true;
}

const q = (tab) => `'${tab.replace(/'/g, "''")}'`;

module.exports = {
  cacheable: true,
  async listTabs() { return Object.keys(await refreshTabs()); },
  async getRows(tab) {
    if (!tabIds) await refreshTabs();
    if (tabIds[tab] === undefined) return [];
    const res = await client().spreadsheets.values.get({ spreadsheetId, range: q(tab), valueRenderOption: 'FORMATTED_VALUE' });
    return res.data.values || [];
  },
  async setRows(tab, rows) {
    await ensureTab(tab);
    const api = client().spreadsheets.values;
    await api.clear({ spreadsheetId, range: q(tab) });
    if (rows.length) await api.update({ spreadsheetId, range: `${q(tab)}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: rows } });
  },
  // Règles de couleur T / R / ABS sur la grille d'un mois (dernier paramétrage).
  async decorateMonth(tab, colors, firstRow, lastRow) {
    await ensureTab(tab);
    const sheetId = tabIds[tab];
    const hex = (h) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255 });
    const range = { sheetId, startRowIndex: firstRow, endRowIndex: lastRow, startColumnIndex: 2, endColumnIndex: 33 };
    const rule = (v, c) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [range], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: v }] }, format: { backgroundColor: hex(c) } } } } });
    const meta = await client().spreadsheets.get({ spreadsheetId, fields: 'sheets(properties.sheetId,conditionalFormats)' });
    const existing = (meta.data.sheets.find((s) => s.properties.sheetId === sheetId) || {}).conditionalFormats || [];
    const requests = existing.map(() => ({ deleteConditionalFormatRule: { sheetId, index: 0 } }));
    requests.push(rule('T', colors.T), rule('R', colors.R), rule('ABS', colors.ABS));
    await client().spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  },
};
