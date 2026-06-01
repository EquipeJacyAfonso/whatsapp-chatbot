/**
 * Serviço Google Sheets via Service Account
 */

const { google } = require("googleapis");

function getAuth() {
  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credsJson) return null;

  const creds = JSON.parse(credsJson);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

async function listSheets() {
  const auth = getAuth();
  if (!auth) return ["Sheets não configurado"];

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
  });
  return res.data.sheets.map((s) => s.properties.title);
}

async function readSheet(sheetName, filtro = "") {
  const auth = getAuth();
  if (!auth) return [];

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values || [];
  if (!rows.length) return [];

  if (filtro) {
    const f = filtro.toLowerCase();
    const header = rows[0];
    const filtered = rows.slice(1).filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(f))
    );
    return [header, ...filtered];
  }

  return rows;
}

module.exports = { listSheets, readSheet };
