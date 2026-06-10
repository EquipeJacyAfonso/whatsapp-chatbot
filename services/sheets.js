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

async function groupSheetData(sheetName, columnName) {
  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Google Sheets não configurado.";

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: sheetName,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return `A aba '${sheetName}' não possui dados suficientes.`;

    // Normaliza o cabeçalho para facilitar a busca (ignora maiúsculas e espaços)
    const header = rows[0].map(h => String(h).trim().toLowerCase());
    const searchCol = columnName.trim().toLowerCase();
    
    // Procura a coluna exata ou aproximada (ex: "cidade" encontra "Cidade:  ")
    let colIndex = header.findIndex(h => h.includes(searchCol) || searchCol.includes(h));
    
    if (colIndex === -1) {
       return `Aviso para a IA: A coluna referida a '${columnName}' não foi encontrada. As colunas que existem na aba são: [${rows[0].join(', ')}]`;
    }

    // Conta as ocorrências (Agrupamento numérico)
    const counts = {};
    for (let i = 1; i < rows.length; i++) {
      let val = (rows[i][colIndex] || "Não Informado").trim().toUpperCase();
      if (!val) val = "NÃO INFORMADO";
      counts[val] = (counts[val] || 0) + 1;
    }

    // Ordena do maior para o menor
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    // Formata o resultado para a Inteligência Artificial ler (Top 30 para poupar memória)
    let output = `📊 Relatório de Segmentação Numérica por '${rows[0][colIndex]}':\nTotal de registros lidos: ${rows.length - 1}\n\n`;
    
    const limit = Math.min(30, sorted.length);
    for(let i = 0; i < limit; i++) {
        output += `${i + 1}. ${sorted[i][0]}: ${sorted[i][1]} pessoas\n`;
    }
    
    if(sorted.length > limit) {
       output += `\n... e mais ${sorted.length - limit} sub-categorias menores.`;
    }
    
    return output;
  } catch (error) {
    console.error("Erro na Segmentação:", error.message);
    return `Aviso para a IA: Erro ao segmentar dados - ${error.message}`;
  }
}

module.exports = { listSheets, readSheet, groupSheetData };