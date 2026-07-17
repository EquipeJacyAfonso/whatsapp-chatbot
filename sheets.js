/**
 * Serviço Google Sheets — leitura via Service Account
 */

const { google } = require("googleapis");

function getAuth() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  } catch (err) {
    console.error("❌ Erro ao parsear GOOGLE_CREDENTIALS_JSON:", err.message);
    return null;
  }
}

async function listSheets() {
  const auth = getAuth();
  if (!auth) return ["Google não configurado"];
  const sheets = google.sheets({ version: "v4", auth });
  const res    = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID });
  return res.data.sheets.map((s) => s.properties.title);
}

async function readSheet(sheetName, filtro = "") {
  const auth = getAuth();
  if (!auth) return [];
  const sheets = google.sheets({ version: "v4", auth });
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range:         sheetName,
  });
  const rows = res.data.values || [];
  if (!rows.length) return [];
  if (!filtro) return rows;
  const f      = filtro.toLowerCase();
  const header = rows[0];
  const body   = rows.slice(1).filter((r) => r.some((c) => String(c).toLowerCase().includes(f)));
  return [header, ...body];
}

module.exports = { listSheets, readSheet };
