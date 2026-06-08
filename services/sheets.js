/**
 * Serviço Google Sheets via Service Account
 */

const { google } = require("googleapis");

function getAuth() {
  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credsJson) return null;

  try {
    const creds = JSON.parse(credsJson);
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  } catch (e) {
    console.error("Erro ao ler credenciais do Google:", e.message);
    return null;
  }
}

async function listSheets() {
  const auth = getAuth();
  if (!auth) return ["Sheets não configurado"];

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
    });
    return res.data.sheets.map((s) => s.properties.title);
  } catch (error) {
    console.error("Erro ao listar abas:", error.message);
    return [`Erro ao aceder à planilha: ${error.message}`];
  }
}

async function readSheet(sheetName, filtro = "") {
  const auth = getAuth();
  if (!auth) return [];

  try {
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
  } catch (error) {
    console.error("Erro na Planilha:", error.message);
    
    // MUDANÇA: Amortecedor de erros.
    if (error.message.includes("Unable to parse range")) {
      // Retornamos um array fingindo ser uma linha de tabela para a IA ler e compreender
      return [[`Aviso para a IA: A aba '${sheetName}' não existe. Pergunte ao utilizador o nome correto.`]];
    }
    
    return [[`Aviso para a IA: Falha ao ler a planilha: ${error.message}`]];
  }
}

module.exports = { listSheets, readSheet };