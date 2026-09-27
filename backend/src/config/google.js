require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Configuration OAuth 2.0
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

// API Sheets
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Fonction pour obtenir les tokens
const getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Erreur obtention tokens:', error);
    throw error;
  }
};

// Fonction pour lire les données du Sheets
const readSheetData = async (auth, spreadsheetId, sheetName) => {
  try {
    const sheetsApi = google.sheets({ version: 'v4', auth });
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
    return response.data.values || [];
  } catch (error) {
    console.error('Erreur lecture Sheets:', error);
    throw error;
  }
};

// Fonction pour écrire dans le Sheets
const writeSheetData = async (auth, spreadsheetId, sheetName, range, values) => {
  try {
    const sheetsApi = google.sheets({ version: 'v4', auth });
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${range}`,
      valueInputOption: 'RAW',
      resource: { values },
    });
    return true;
  } catch (error) {
    console.error('Erreur écriture Sheets:', error);
    throw error;
  }
};

module.exports = {
  oauth2Client,
  getTokens,
  readSheetData,
  writeSheetData,
  sheets
};
