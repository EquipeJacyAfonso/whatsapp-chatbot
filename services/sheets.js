/**
 * Serviço Google Sheets via Service Account
 * Genérico: não assume nome de aba, colunas, ou uma única planilha fixa.
 * Suporta múltiplas planilhas (ver services/config.js → spreadsheets[]).
 */

const { google } = require("googleapis");

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

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

function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Resolve qual spreadsheetId usar: se um id/nome específico for passado,
 * tenta encontrá-lo na lista configurada; senão usa o padrão (primeiro
 * da lista, ou process.env.SPREADSHEET_ID para retrocompatibilidade).
 */
function resolveSpreadsheetId(spreadsheets, planilhaGuess) {
  if (!planilhaGuess) {
    if (spreadsheets && spreadsheets.length) return spreadsheets[0].id;
    return process.env.SPREADSHEET_ID || "";
  }

  const guess = normalize(planilhaGuess);

  // Tenta casar por nome configurado ou pelo próprio ID
  const match = (spreadsheets || []).find(
    (s) => normalize(s.nome) === guess || normalize(s.nome).includes(guess) || s.id === planilhaGuess
  );
  if (match) return match.id;

  // Se não achou por nome mas parece um ID de planilha, usa como está
  if (/^[a-zA-Z0-9_-]{20,}$/.test(planilhaGuess)) return planilhaGuess;

  // Fallback: padrão
  if (spreadsheets && spreadsheets.length) return spreadsheets[0].id;
  return process.env.SPREADSHEET_ID || "";
}

async function listSheets(spreadsheetId) {
  const auth = getAuth();
  if (!auth) return ["Sheets não configurado"];
  if (!spreadsheetId) return ["Nenhuma planilha configurada"];

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    return res.data.sheets.map((s) => s.properties.title);
  } catch (error) {
    console.error("Erro ao listar abas:", error.message);
    return [`Erro ao aceder à planilha: ${error.message}`];
  }
}

async function _readRaw(spreadsheetId, sheetName) {
  const cacheKey = `${spreadsheetId}::${sheetName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.rows;
  }

  const auth = getAuth();
  if (!auth) return null;

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const rows = res.data.values || [];
  cache.set(cacheKey, { rows, time: Date.now() });
  return rows;
}

async function resolveSheetName(spreadsheetId, sheetNameGuess) {
  const abas = await listSheets(spreadsheetId);
  if (!abas.length || abas[0].startsWith("Erro") || abas[0].includes("não configurad")) {
    return null;
  }

  const guess = normalize(sheetNameGuess);

  let match = abas.find((a) => normalize(a) === guess);
  if (match) return match;

  match = abas.find((a) => normalize(a).includes(guess) || guess.includes(normalize(a)));
  if (match) return match;

  return null;
}

function resolveColumnIndex(header, columnGuess) {
  const normalizedHeader = header.map(normalize);
  const guess = normalize(columnGuess);

  let idx = normalizedHeader.findIndex((h) => h === guess);
  if (idx !== -1) return idx;

  idx = normalizedHeader.findIndex((h) => h.startsWith(guess) || guess.startsWith(h));
  if (idx !== -1) return idx;

  idx = normalizedHeader.findIndex((h) => h.includes(guess) || guess.includes(h));
  return idx;
}

async function readSheet(sheetNameGuess, filtro = "", opts = {}) {
  const { spreadsheetId: spreadsheetIdParam, spreadsheets } = opts;
  const spreadsheetId = spreadsheetIdParam || resolveSpreadsheetId(spreadsheets, opts.planilha);

  const auth = getAuth();
  if (!auth) return [[`Aviso para a IA: Google Sheets não configurado.`]];
  if (!spreadsheetId) return [[`Aviso para a IA: Nenhuma planilha configurada.`]];

  try {
    const sheetName = await resolveSheetName(spreadsheetId, sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets(spreadsheetId);
      return [[`Aviso para a IA: A aba '${sheetNameGuess}' não existe. Abas disponíveis: [${abas.join(", ")}]. Chame listar_abas_planilha se precisar confirmar.`]];
    }

    const rows = await _readRaw(spreadsheetId, sheetName);
    if (!rows || !rows.length) return [];

    if (filtro) {
      const f = normalize(filtro);
      const header = rows[0];
      const filtered = rows.slice(1).filter((row) => row.some((cell) => normalize(cell).includes(f)));
      return [header, ...filtered];
    }

    return rows;
  } catch (error) {
    console.error("Erro na Planilha:", error.message);
    if (error.message.includes("Unable to parse range")) {
      return [[`Aviso para a IA: A aba '${sheetNameGuess}' não existe. Pergunte ao utilizador o nome correto ou chame listar_abas_planilha.`]];
    }
    return [[`Aviso para a IA: Falha ao ler a planilha: ${error.message}`]];
  }
}

async function groupSheetData(sheetNameGuess, columnGuess, opts = {}) {
  const { spreadsheetId: spreadsheetIdParam, spreadsheets } = opts;
  const spreadsheetId = spreadsheetIdParam || resolveSpreadsheetId(spreadsheets, opts.planilha);

  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Google Sheets não configurado.";
  if (!spreadsheetId) return "Aviso para a IA: Nenhuma planilha configurada.";

  try {
    const sheetName = await resolveSheetName(spreadsheetId, sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets(spreadsheetId);
      return `Aviso para a IA: A aba '${sheetNameGuess}' não foi encontrada. Abas disponíveis: [${abas.join(", ")}]`;
    }

    const rows = await _readRaw(spreadsheetId, sheetName);
    if (!rows || rows.length < 2) return `A aba '${sheetName}' não possui dados suficientes.`;

    const header = rows[0];
    const colIndex = resolveColumnIndex(header, columnGuess);

    if (colIndex === -1) {
      return `Aviso para a IA: A coluna referida a '${columnGuess}' não foi encontrada na aba '${sheetName}'. As colunas que existem são: [${header.join(", ")}]`;
    }

    const counts = {};
    for (let i = 1; i < rows.length; i++) {
      let val = (rows[i][colIndex] || "Não Informado").trim().toUpperCase();
      if (!val) val = "NÃO INFORMADO";
      counts[val] = (counts[val] || 0) + 1;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    let output = `📊 Relatório de Segmentação Numérica por '${header[colIndex]}' (aba '${sheetName}'):\nTotal de registros lidos: ${rows.length - 1}\n\n`;

    const limit = Math.min(30, sorted.length);
    for (let i = 0; i < limit; i++) {
      output += `${i + 1}. ${sorted[i][0]}: ${sorted[i][1]} pessoas\n`;
    }

    if (sorted.length > limit) {
      output += `\n... e mais ${sorted.length - limit} sub-categorias menores.`;
    }

    return output;
  } catch (error) {
    console.error("Erro na Segmentação:", error.message);
    return `Aviso para a IA: Erro ao segmentar dados - ${error.message}`;
  }
}

async function filterSheetAdvanced(sheetNameGuess, filtros, opts = {}) {
  const {
    spreadsheetId: spreadsheetIdParam,
    spreadsheets,
    colunaNomePrioritaria = "",
    colunaContatoPrioritaria = ["whatsapp", "telefone", "celular"],
  } = opts;
  const spreadsheetId = spreadsheetIdParam || resolveSpreadsheetId(spreadsheets, opts.planilha);

  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Google Sheets não configurado.";
  if (!spreadsheetId) return "Aviso para a IA: Nenhuma planilha configurada.";

  try {
    const sheetName = await resolveSheetName(spreadsheetId, sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets(spreadsheetId);
      return `Aviso para a IA: A aba '${sheetNameGuess}' não foi encontrada. Abas disponíveis: [${abas.join(", ")}]`;
    }

    const rows = await _readRaw(spreadsheetId, sheetName);
    if (!rows || rows.length < 2) return `A aba '${sheetName}' está vazia.`;

    const header = rows[0];

    const filtrosValidos = [];
    const filtrosInvalidos = [];
    for (const f of filtros) {
      const colIndex = resolveColumnIndex(header, f.coluna);
      if (colIndex !== -1) {
        filtrosValidos.push({ index: colIndex, valor: normalize(f.valor) });
      } else {
        filtrosInvalidos.push(f.coluna);
      }
    }

    if (filtrosValidos.length === 0) {
      return `Aviso para a IA: Nenhuma das colunas solicitadas foi encontrada na aba '${sheetName}'. Colunas disponíveis: [${header.join(", ")}]`;
    }

    const resultados = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let matchAll = true;

      for (const f of filtrosValidos) {
        const cellValue = normalize(row[f.index] || "");
        if (!cellValue.includes(f.valor)) {
          matchAll = false;
          break;
        }
      }

      if (matchAll) resultados.push(row);
    }

    if (resultados.length === 0) {
      let msg = `Nenhum contato encontrado com esses critérios específicos na aba '${sheetName}'.`;
      if (filtrosInvalidos.length) {
        msg += ` Atenção: as colunas [${filtrosInvalidos.join(", ")}] não foram reconhecidas e foram ignoradas.`;
      }
      return msg;
    }

    const limit = 20;
    let output = `🔍 Busca Avançada na aba '${sheetName}': Encontrados ${resultados.length} contatos que batem com os critérios exatos.\n\n`;

    // CORREÇÃO: colunas "nome" e "contato" prioritárias agora são
    // configuráveis (services/config.js → colunaNomePrioritaria /
    // colunaContatoPrioritaria), em vez de heurística fixa presa a
    // vocabulário de uma planilha específica.
    const normalizedHeader = header.map(normalize);

    let nomeIdx = -1;
    if (colunaNomePrioritaria) {
      nomeIdx = resolveColumnIndex(header, colunaNomePrioritaria);
    }
    if (nomeIdx === -1) {
      nomeIdx = normalizedHeader.findIndex((h) => h.includes("nome"));
    }

    let telIdx = -1;
    for (const termo of colunaContatoPrioritaria) {
      telIdx = normalizedHeader.findIndex((h) => h.includes(normalize(termo)));
      if (telIdx !== -1) break;
    }

    for (let i = 0; i < Math.min(limit, resultados.length); i++) {
      const r = resultados[i];
      const nome = nomeIdx !== -1 ? (r[nomeIdx] || "Sem Nome") : (r[0] || "Sem Nome");
      const tel = telIdx !== -1 ? (r[telIdx] || "Sem telefone") : "Sem telefone";

      const detalhes = r.map((dado, index) => `${header[index]}: ${dado}`).join(" | ");

      output += `👤 **${nome}** (📱 ${tel})\n   ℹ️ ${detalhes}\n\n`;
    }

    if (resultados.length > limit) {
      output += `... e mais ${resultados.length - limit} pessoas não listadas aqui para economizar memória.`;
    }

    if (filtrosInvalidos.length) {
      output += `\n\n⚠️ Colunas não reconhecidas e ignoradas: [${filtrosInvalidos.join(", ")}]`;
    }

    return output;
  } catch (error) {
    console.error("Erro na busca avançada:", error.message);
    return `Erro na busca avançada: ${error.message}`;
  }
}

module.exports = { listSheets, readSheet, groupSheetData, filterSheetAdvanced, resolveSpreadsheetId };
