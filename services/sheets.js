/**
 * Serviço Google Sheets via Service Account
 * Genérico: não assume nome de aba, colunas ou estrutura fixa.
 * Qualquer planilha compartilhada com a service account pode ser usada.
 */

const { google } = require("googleapis");

// Cache simples em memória por (spreadsheetId + aba), com TTL curto.
// Evita relançar a mesma leitura da API várias vezes na mesma pergunta
// (quando a IA chama listar/ler/segmentar/filtrar em sequência).
const CACHE_TTL_MS = 60 * 1000; // 60s
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

/**
 * Normaliza um texto para comparação robusta de nomes de coluna/aba:
 * remove acentos, espaços duplicados/à direita, dois-pontos residuais
 * (comum em cabeçalhos de formulário Google, ex: "Cidade:  "), e caixa.
 */
function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

/**
 * Lê os dados brutos de uma aba, com cache curto.
 * Retorna sempre um array de arrays (rows), incluindo o cabeçalho na posição 0.
 */
async function _readRaw(sheetName) {
  const cacheKey = `${process.env.SPREADSHEET_ID}::${sheetName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.rows;
  }

  const auth = getAuth();
  if (!auth) return null;

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values || [];
  cache.set(cacheKey, { rows, time: Date.now() });
  return rows;
}

/**
 * Encontra o nome real de uma aba a partir de um nome aproximado
 * fornecido pela IA (que pode vir com acentos/espaços diferentes).
 * Retorna null se não encontrar nenhuma correspondência razoável.
 */
async function resolveSheetName(sheetNameGuess) {
  const abas = await listSheets();
  if (!abas.length || abas[0].startsWith("Erro") || abas[0] === "Sheets não configurado") {
    return null;
  }

  const guess = normalize(sheetNameGuess);

  // 1. match exato (normalizado)
  let match = abas.find((a) => normalize(a) === guess);
  if (match) return match;

  // 2. match por substring em qualquer direção
  match = abas.find((a) => normalize(a).includes(guess) || guess.includes(normalize(a)));
  if (match) return match;

  return null;
}

/**
 * Encontra o índice de uma coluna a partir de um nome aproximado.
 * Prioriza match exato (normalizado) sobre match por substring, para
 * evitar confundir colunas parecidas (ex: "nome" vs "sobrenome").
 */
function resolveColumnIndex(header, columnGuess) {
  const normalizedHeader = header.map(normalize);
  const guess = normalize(columnGuess);

  // 1. match exato
  let idx = normalizedHeader.findIndex((h) => h === guess);
  if (idx !== -1) return idx;

  // 2. header começa com o termo buscado (evita "sobrenome" bater com "nome")
  idx = normalizedHeader.findIndex((h) => h.startsWith(guess) || guess.startsWith(h));
  if (idx !== -1) return idx;

  // 3. fallback: substring em qualquer posição
  idx = normalizedHeader.findIndex((h) => h.includes(guess) || guess.includes(h));
  return idx; // -1 se não achar
}

async function readSheet(sheetNameGuess, filtro = "") {
  const auth = getAuth();
  if (!auth) return [[`Aviso para a IA: Google Sheets não configurado.`]];

  try {
    const sheetName = await resolveSheetName(sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets();
      return [[`Aviso para a IA: A aba '${sheetNameGuess}' não existe. Abas disponíveis: [${abas.join(", ")}]. Chame listar_abas_planilha se precisar confirmar.`]];
    }

    const rows = await _readRaw(sheetName);
    if (!rows || !rows.length) return [];

    if (filtro) {
      const f = normalize(filtro);
      const header = rows[0];
      const filtered = rows.slice(1).filter((row) =>
        row.some((cell) => normalize(cell).includes(f))
      );
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

async function groupSheetData(sheetNameGuess, columnGuess) {
  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Google Sheets não configurado.";

  try {
    const sheetName = await resolveSheetName(sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets();
      return `Aviso para a IA: A aba '${sheetNameGuess}' não foi encontrada. Abas disponíveis: [${abas.join(", ")}]`;
    }

    const rows = await _readRaw(sheetName);
    if (!rows || rows.length < 2) return `A aba '${sheetName}' não possui dados suficientes.`;

    const header = rows[0];
    const colIndex = resolveColumnIndex(header, columnGuess);

    if (colIndex === -1) {
      return `Aviso para a IA: A coluna referida a '${columnGuess}' não foi encontrada na aba '${sheetName}'. As colunas que existem são: [${header.join(", ")}]`;
    }

    // Conta as ocorrências (Agrupamento numérico)
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

async function filterSheetAdvanced(sheetNameGuess, filtros) {
  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Google Sheets não configurado.";

  try {
    const sheetName = await resolveSheetName(sheetNameGuess);
    if (!sheetName) {
      const abas = await listSheets();
      return `Aviso para a IA: A aba '${sheetNameGuess}' não foi encontrada. Abas disponíveis: [${abas.join(", ")}]`;
    }

    const rows = await _readRaw(sheetName);
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

    // Tenta identificar colunas "nome"/"telefone" de forma genérica, sem
    // depender de nomes fixos de uma planilha específica.
    const normalizedHeader = header.map(normalize);
    const nomeIdx = normalizedHeader.findIndex((h) => h.includes("nome"));
    const telIdx = normalizedHeader.findIndex((h) => h.includes("whatsapp") || h.includes("telefone") || h.includes("celular"));

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

module.exports = { listSheets, readSheet, groupSheetData, filterSheetAdvanced };
