/**
 * Serviço de Configuração Central
 *
 * Resolve a configuração efetiva do bot combinando:
 *   1. Valores padrão vindos do .env (globais)
 *   2. Overrides específicos por grupo do WhatsApp, armazenados na
 *      tabela `bot_configs` do Postgres (multi-tenant opcional)
 *
 * Se a tabela `bot_configs` não existir ou não houver override para
 * o grupo, o bot simplesmente usa os valores do .env — nada quebra
 * em instalações simples de um único grupo/planilha.
 */

const { queryDB } = require("./db");

function envBool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  return String(v).trim().toLowerCase() !== "false";
}

function parseSpreadsheets(raw) {
  // Formato esperado: [{"id":"abc123","nome":"Apoiadores"},{"id":"xyz","nome":"Financeiro"}]
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((s) => s && s.id);
  } catch (_) {
    console.warn("⚠️  SPREADSHEETS inválido no .env — deve ser um array JSON. Ignorando.");
  }
  return [];
}

function parseCsvList(raw, fallback) {
  if (!raw) return fallback;
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}

function getEnvDefaults() {
  const spreadsheets = parseSpreadsheets(process.env.SPREADSHEETS);

  return {
    // Identidade
    orgName: process.env.ORG_NAME || "sua organização",
    botName: process.env.BOT_NAME || "Assistente Virtual",
    language: process.env.BOT_LANGUAGE || "pt-BR",
    systemPromptExtra: process.env.SYSTEM_PROMPT_EXTRA || "",

    // IA
    aiProvider: (process.env.AI_PROVIDER || "groq").toLowerCase(),
    aiModel: process.env.AI_MODEL || "",
    aiApiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || "",

    // Planilhas — suporta uma única (SPREADSHEET_ID) ou várias (SPREADSHEETS)
    spreadsheetId: process.env.SPREADSHEET_ID || "",
    spreadsheets: spreadsheets.length
      ? spreadsheets
      : (process.env.SPREADSHEET_ID
          ? [{ id: process.env.SPREADSHEET_ID, nome: "Principal" }]
          : []),

    // Toggles de features
    enableDrive: envBool("ENABLE_DRIVE", true),
    enableCalendar: envBool("ENABLE_CALENDAR", true),
    enableWebSearch: envBool("ENABLE_WEB_SEARCH", true),
    enableDb: envBool("ENABLE_DB", true),
    enableSheets: envBool("ENABLE_SHEETS", true),
    enableReports: envBool("ENABLE_REPORTS", true),

    // Limites configuráveis
    sheetRowLimit: parseInt(process.env.SHEET_ROW_LIMIT || "200", 10),
    sqlRowLimit: parseInt(process.env.SQL_ROW_LIMIT || "100", 10),
    historySize: parseInt(process.env.HISTORY_SIZE || "6", 10),

    // Colunas prioritárias na planilha (para exibição de resumo em buscas)
    colunaNomePrioritaria: process.env.COLUNA_NOME_PRIORITARIA || "",
    colunaContatoPrioritaria: parseCsvList(
      process.env.COLUNA_CONTATO_PRIORITARIA,
      ["whatsapp", "telefone", "celular"]
    ),
  };
}

let tableChecked = false;
let tableExists = false;

async function ensureBotConfigsTable() {
  if (tableChecked) return tableExists;
  tableChecked = true;
  try {
    await queryDB(`
      CREATE TABLE IF NOT EXISTS bot_configs (
        group_id TEXT PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    tableExists = true;
  } catch (err) {
    console.warn("⚠️  Não foi possível garantir a tabela bot_configs (multi-tenant desativado):", err.message);
    tableExists = false;
  }
  return tableExists;
}

async function getGroupOverride(groupId) {
  if (!groupId) return {};
  const ok = await ensureBotConfigsTable();
  if (!ok) return {};

  try {
    const { rows } = await queryDB(
      "SELECT config FROM bot_configs WHERE group_id = $1 LIMIT 1",
      [groupId]
    );
    if (rows && rows.length && rows[0].config) {
      const cfg = rows[0].config;
      return typeof cfg === "string" ? JSON.parse(cfg) : cfg;
    }
  } catch (err) {
    console.warn(`⚠️  Erro ao ler bot_configs para grupo ${groupId}:`, err.message);
  }
  return {};
}

async function setGroupOverride(groupId, partialConfig) {
  if (!groupId) throw new Error("groupId é obrigatório");
  const ok = await ensureBotConfigsTable();
  if (!ok) throw new Error("Tabela bot_configs indisponível (banco não configurado?)");

  const current = await getGroupOverride(groupId);
  const merged = { ...current, ...partialConfig };

  await queryDB(
    `INSERT INTO bot_configs (group_id, config, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (group_id) DO UPDATE SET config = $2::jsonb, updated_at = now()`,
    [groupId, JSON.stringify(merged)]
  );

  return merged;
}

/**
 * Retorna a configuração efetiva para um grupo específico (ou global,
 * se groupId for omitido/null). Overrides por grupo têm prioridade
 * sobre os padrões do .env.
 */
async function getConfig(groupId = null) {
  const base = getEnvDefaults();
  const override = await getGroupOverride(groupId);
  return { ...base, ...override };
}

module.exports = { getConfig, setGroupOverride, getGroupOverride, ensureBotConfigsTable };
