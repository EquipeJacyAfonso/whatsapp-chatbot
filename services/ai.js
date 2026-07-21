/**
 * Serviço de IA Multi-Provedor (Groq, Gemini, Anthropic) com Roteamento Avançado e Ferramentas
 * Totalmente configurável via services/config.js — nenhuma estrutura de
 * planilha/banco/organização fixa no código.
 */

require("dotenv").config();
const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const { queryDB, listTables, describeTable } = require("./db");
const { readSheet, listSheets, groupSheetData, filterSheetAdvanced, resolveSpreadsheetId } = require("./sheets");
const { generatePDF } = require("./reports");
const { getConfig } = require("./config");

const DEFAULT_MODELS = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-4-5-20251001",
};

function resolveModel(cfg) {
  return cfg.aiModel || DEFAULT_MODELS[cfg.aiProvider];
}

function buildSystemPrompt(cfg) {
  const planilhasInfo = cfg.spreadsheets.length > 1
    ? `\nEsta organização tem MAIS DE UMA planilha configurada: [${cfg.spreadsheets.map(s => s.nome).join(", ")}]. Ao usar ferramentas de planilha, informe o parâmetro 'planilha' com o nome de qual delas usar (se o usuário não especificar, use a primeira/principal).`
    : "";

  let prompt = `Você é ${cfg.botName}, o assistente virtual administrativo de ${cfg.orgName}.
Responda sempre em ${cfg.language === "pt-BR" ? "português do Brasil" : cfg.language}, de forma clara e objetiva.

REGRA CRUCIAL DE SINTAXE:
Ao chamar qualquer ferramenta/função, você DEVE gerar os argumentos estritamente como um objeto JSON válido (usando chaves {}). Nunca adicione caracteres especiais, aspas ou colchetes grudados no nome da função.
Exemplo correto: {"aba": "Respostas ao formulário 1", "coluna": "Cidade"}

IMPORTANTE — A PLANILHA E O BANCO NÃO TÊM ESTRUTURA FIXA:
Você não sabe de antemão quais abas, colunas ou tabelas existem. NUNCA presuma nomes.
Sempre que for a primeira interação sobre planilha ou banco nesta conversa, ou se uma
chamada anterior retornar erro dizendo que algo não foi encontrado, descubra a estrutura
real primeiro (listar_abas_planilha / ler_planilha sem filtro para planilhas;
listar_tabelas_banco / descrever_tabela_banco para o banco de dados).${planilhasInfo}

Se uma ferramenta retornar um "Aviso para a IA" dizendo que algo não foi encontrado,
NUNCA invente dados — informe o usuário e, se fizer sentido, tente descobrir o nome
correto antes de desistir.`;

  if (cfg.systemPromptExtra && cfg.systemPromptExtra.trim()) {
    prompt += `\n\nINSTRUÇÕES ADICIONAIS ESPECÍFICAS DESTA INSTALAÇÃO:\n${cfg.systemPromptExtra.trim()}`;
  }

  return prompt;
}

/**
 * Monta a lista de tools dinamicamente conforme os toggles de features
 * na config (enableDb, enableSheets, enableDrive, enableCalendar,
 * enableWebSearch, enableReports). Ferramentas de integrações desativadas
 * nem aparecem para o modelo — evita erros de "não configurado" e reduz
 * chance de a IA tentar usar algo que o cliente não habilitou.
 */
function buildTools(cfg) {
  const tools = [];

  if (cfg.enableDb) {
    tools.push({
      type: "function",
      function: {
        name: "listar_tabelas_banco",
        description: "Lista todas as tabelas disponíveis no banco de dados PostgreSQL. Use antes de qualquer consulta se ainda não souber os nomes das tabelas — o schema não é fixo.",
        parameters: { type: "object", properties: {} }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "descrever_tabela_banco",
        description: "Mostra as colunas (nome e tipo) de uma tabela específica do banco. Use depois de listar_tabelas_banco para entender a estrutura antes de escrever SQL.",
        parameters: {
          type: "object",
          properties: { tabela: { type: "string", description: "Nome exato da tabela" } },
          required: ["tabela"]
        }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "consultar_banco",
        description: "Executa SQL SELECT no PostgreSQL para buscar dados reais. Se não souber tabelas/colunas, use listar_tabelas_banco e descrever_tabela_banco primeiro.",
        parameters: {
          type: "object",
          properties: { sql: { type: "string", description: "Query SQL SELECT completa e válida" } },
          required: ["sql"]
        }
      }
    });
  }

  if (cfg.enableSheets) {
    const planilhaParam = cfg.spreadsheets.length > 1
      ? { planilha: { type: "string", description: "Nome da planilha a usar (obrigatório se houver mais de uma configurada)" } }
      : {};

    tools.push({
      type: "function",
      function: {
        name: "listar_abas_planilha",
        description: "Lista todas as abas disponíveis na planilha configurada. A estrutura pode ser diferente em cada instalação — SEMPRE use antes de ler/filtrar dados se ainda não souber o nome exato da aba.",
        parameters: { type: "object", properties: { ...planilhaParam } }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "ler_planilha",
        description: "Lê o conteúdo de uma aba, incluindo o cabeçalho. Use sem 'filtro' primeiro para descobrir os nomes reais das colunas.",
        parameters: {
          type: "object",
          properties: {
            aba: { type: "string", description: "Nome (aproximado) da aba" },
            filtro: { type: "string", description: "Texto opcional para filtrar linhas por qualquer coluna" },
            ...planilhaParam
          },
          required: ["aba"]
        }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "segmentar_apoiadores",
        description: "Conta e agrupa linhas da planilha com base em uma coluna (ex: contar por cidade, por status). Use nomes descobertos via listar_abas_planilha/ler_planilha.",
        parameters: {
          type: "object",
          properties: {
            aba: { type: "string", description: "Nome (aproximado) da aba" },
            coluna: { type: "string", description: "Nome (aproximado) da coluna a agrupar" },
            ...planilhaParam
          },
          required: ["aba", "coluna"]
        }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "filtrar_contatos_avancado",
        description: "Cruza dados para buscar linhas específicas com múltiplos filtros simultâneos (AND). Use nomes de coluna descobertos via ler_planilha.",
        parameters: {
          type: "object",
          properties: {
            aba: { type: "string", description: "Nome (aproximado) da aba" },
            filtros: {
              type: "array",
              items: {
                type: "object",
                properties: { coluna: { type: "string" }, valor: { type: "string" } }
              }
            },
            ...planilhaParam
          },
          required: ["aba", "filtros"]
        }
      }
    });
  }

  if (cfg.enableReports) {
    tools.push({
      type: "function",
      function: {
        name: "gerar_relatorio_pdf",
        description: "Gera um relatório profissional em PDF com os dados fornecidos.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título do relatório" },
            conteudo: { type: "string", description: "Conteúdo textual" }
          },
          required: ["titulo", "conteudo"]
        }
      }
    });
  }

  if (cfg.enableDrive) {
    tools.push({
      type: "function",
      function: {
        name: "listar_google_drive",
        description: "Lista todos os arquivos PDF disponíveis na pasta do Google Drive.",
        parameters: { type: "object", properties: {} }
      }
    });
    tools.push({
      type: "function",
      function: {
        name: "ler_pdf_google_drive",
        description: "Baixa e extrai o texto de um PDF específico do Google Drive.",
        parameters: {
          type: "object",
          properties: { nome_arquivo: { type: "string", description: "Nome do arquivo PDF" } },
          required: ["nome_arquivo"]
        }
      }
    });
  }

  if (cfg.enableCalendar) {
    tools.push({
      type: "function",
      function: {
        name: "consultar_agenda_google",
        description: "Consulta a agenda do Google Calendar para ver os próximos eventos.",
        parameters: {
          type: "object",
          properties: { quantidade: { type: "string", description: "Número de eventos (ex: '10')" } }
        }
      }
    });
  }

  if (cfg.enableWebSearch) {
    tools.push({
      type: "function",
      function: {
        name: "pesquisar_na_web",
        description: "Pesquisa no Google em tempo real para notícias e fact-checking.",
        parameters: {
          type: "object",
          properties: { termo_pesquisa: { type: "string", description: "Termo a ser pesquisado" } },
          required: ["termo_pesquisa"]
        }
      }
    });
  }

  return tools;
}

const historicos = {};

function pushNormalized(sender, role, content, historySize) {
  if (!historicos[sender]) historicos[sender] = [];
  const text = typeof content === "string" ? content : JSON.stringify(content);
  if (!text || !text.trim()) return;
  historicos[sender].push({ role, content: text });
  historicos[sender] = historicos[sender].slice(-historySize);
}

function parseArgs(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    return JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return {};
  }
}

async function executarFuncao(nome, args, cfg) {
  try {
    console.log(`🚀 Executando ferramenta local: ${nome}`);

    const sheetOpts = {
      spreadsheets: cfg.spreadsheets,
      planilha: args.planilha,
      colunaNomePrioritaria: cfg.colunaNomePrioritaria,
      colunaContatoPrioritaria: cfg.colunaContatoPrioritaria,
    };

    if (nome === "listar_tabelas_banco") {
      const { tables, error } = await listTables();
      if (error) return `Aviso para a IA: ${error}`;
      if (!tables.length) return "Nenhuma tabela encontrada no banco (schema 'public' vazio ou banco não configurado).";
      return `Tabelas disponíveis: [${tables.join(", ")}]`;
    }

    if (nome === "descrever_tabela_banco") {
      const { columns, error } = await describeTable(args.tabela || "");
      if (error) return `Aviso para a IA: ${error}`;
      if (!columns.length) return `Tabela '${args.tabela}' não encontrada ou sem colunas.`;
      return columns.map((c) => `${c.column_name}: ${c.data_type}${c.is_nullable === "NO" ? " (obrigatório)" : ""}`).join("\n");
    }

    if (nome === "consultar_banco") {
      const sql = (args.sql || "").trim();
      if (!/^\s*SELECT\b/i.test(sql)) return "Erro: Apenas operações SELECT são permitidas.";
      const { rows, fields, error } = await queryDB(sql);
      if (error) return `Aviso para a IA: ${error}`;
      if (!rows || !rows.length) return "Nenhum registro encontrado.";

      const colunas = fields.map((f) => f.name);
      const rowLimit = cfg.sqlRowLimit;
      const linhas = rows.slice(0, rowLimit).map((r) => colunas.map((c) => String(r[c] ?? "")).join(" | "));
      let resultado = colunas.join(" | ") + "\n" + "-".repeat(40) + "\n" + linhas.join("\n");
      if (rows.length > rowLimit) resultado += `\n\n[Exibindo ${rowLimit} de ${rows.length} registros].`;
      return resultado;
    }

    if (nome === "consultar_agenda_google") {
      const { getUpcomingEvents } = require("./calendar");
      const qtd = parseInt(args.quantidade || "10", 10);
      return await getUpcomingEvents(qtd);
    }

    if (nome === "segmentar_apoiadores") {
      return await groupSheetData(args.aba || "", args.coluna || "", sheetOpts);
    }

    if (nome === "listar_abas_planilha") {
      const spreadsheetId = resolveSpreadsheetId(cfg.spreadsheets, args.planilha);
      const abas = await listSheets(spreadsheetId);
      return `Abas disponíveis nesta planilha: [${abas.join(", ")}].`;
    }

    if (nome === "pesquisar_na_web") {
      const { pesquisarWeb } = require("./web");
      return await pesquisarWeb(args.termo_pesquisa || "");
    }

    if (nome === "filtrar_contatos_avancado") {
      return await filterSheetAdvanced(args.aba || "", args.filtros || [], sheetOpts);
    }

    if (nome === "ler_planilha") {
      const aba = (args.aba || "").trim();
      const dados = await readSheet(aba, args.filtro || "", sheetOpts);
      if (!dados || dados.length === 0) return `A aba '${aba}' está vazia ou não existe.`;
      if (dados[0] && dados[0][0] && String(dados[0][0]).includes("Aviso para a IA")) return dados[0][0];

      const limit = cfg.sheetRowLimit;
      let resultado = dados.slice(0, limit).map((row) => row.join(" | ")).join("\n");
      if (dados.length > limit) {
        resultado += `\n\n[Exibindo ${limit} de ${dados.length} linhas. Para buscas amplas ou contagens, use segmentar_apoiadores ou filtrar_contatos_avancado em vez de pedir mais linhas cruas aqui.]`;
      }
      return resultado;
    }

    if (nome === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório", args.conteudo || "");
      return `PDF criado! Baixar em: ${process.env.BASE_URL || "http://localhost:3000"}/reports/${filename}`;
    }

    if (nome === "listar_google_drive") {
      const { listDrivePdfs } = require("./drive");
      const arquivos = await listDrivePdfs();
      if (!arquivos.length) return "Nenhum PDF no Drive.";
      return "Arquivos no Drive:\n" + arquivos.map(f => `- 📄 ${f.name}`).join("\n");
    }

    if (nome === "ler_pdf_google_drive") {
      const { listDrivePdfs, downloadDrivePdf } = require("./drive");
      const pdfParse = require("pdf-parse");
      const fs = require("fs");

      const nomeArq = (args.nome_arquivo || "").trim();
      const arquivos = await listDrivePdfs();
      const arquivoAlvo = arquivos.find(f => f.name.toLowerCase().includes(nomeArq.toLowerCase()));
      if (!arquivoAlvo) return `Arquivo '${nomeArq}' não encontrado.`;

      const caminhoLocal = await downloadDrivePdf(arquivoAlvo.id, arquivoAlvo.name);
      if (!caminhoLocal) return "Erro ao baixar do Drive.";

      const texto = (await pdfParse(fs.readFileSync(caminhoLocal))).text || "";
      return texto.length > 10000 ? texto.substring(0, 10000) + "\n[Truncado]" : texto;
    }

    return `Função desconhecida ou desativada nesta instalação: ${nome}`;
  } catch (err) {
    return `Erro técnico na ferramenta: ${err.message}`;
  }
}

async function callWithRetry(apiCallFn, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try { return await apiCallFn(); } catch (err) {
      if ((err.status === 429 || String(err.message).includes("429")) && i < tentativas - 1) {
        console.log(`⏳ Rate limit da IA. Aguardando 10s...`);
        await new Promise(r => setTimeout(r, 10000));
      } else { throw err; }
    }
  }
}

/**
 * @param {string} sender - identificador do remetente (para o histórico)
 * @param {string} text - mensagem do usuário
 * @param {string|null} groupId - ID do grupo do WhatsApp, usado para
 *   resolver overrides de configuração por grupo (multi-tenant opcional)
 */
async function processMessage(sender, text, groupId = null) {
  const cfg = await getConfig(groupId);

  if (!cfg.aiApiKey) return "⚠️ Chave de API da IA não configurada no Painel Admin.";
  if (!historicos[sender]) historicos[sender] = [];

  const SYSTEM_PROMPT = buildSystemPrompt(cfg);
  const tools = buildTools(cfg);
  const provider = cfg.aiProvider;
  const apiKey = cfg.aiApiKey;

  try {
    // ================= GOOGLE GEMINI =================
    if (provider === "gemini") {
      const aiInstance = new GoogleGenAI({ apiKey });
      const modelName = resolveModel(cfg);

      const geminiContents = historicos[sender].map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
      geminiContents.push({ role: "user", parts: [{ text: text }] });

      const functionDeclarations = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }));

      let response = await callWithRetry(() => aiInstance.models.generateContent({
        model: modelName,
        contents: geminiContents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined
        }
      }));

      for (let i = 0; i < 5; i++) {
        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) break;

        geminiContents.push(response.candidates[0].content);

        const functionParts = [];
        for (const call of functionCalls) {
          const result = await executarFuncao(call.name, call.args, cfg);
          functionParts.push({
            functionResponse: { name: call.name, response: { result: String(result) } }
          });
        }

        geminiContents.push({ role: "user", parts: functionParts });

        response = await callWithRetry(() => aiInstance.models.generateContent({
          model: modelName,
          contents: geminiContents,
          config: { systemInstruction: SYSTEM_PROMPT, tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined }
        }));
      }

      const finalText = response.text || "Análise concluída com sucesso.";
      pushNormalized(sender, "user", text, cfg.historySize);
      pushNormalized(sender, "assistant", finalText, cfg.historySize);
      return finalText;
    }

    // ================= GROQ (LLAMA 3) =================
    if (provider === "groq") {
      const client = new Groq({ apiKey });
      const model = resolveModel(cfg);

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...historicos[sender],
        { role: "user", content: text }
      ];

      let response = await callWithRetry(() => client.chat.completions.create({
        model, messages, tools: tools.length ? tools : undefined, tool_choice: tools.length ? "auto" : undefined, max_tokens: 2048
      }));

      let msg = response.choices[0].message;
      messages.push(msg);

      for (let i = 0; i < 5; i++) {
        if (!msg.tool_calls || msg.tool_calls.length === 0) break;

        for (const call of msg.tool_calls) {
          const args = parseArgs(call.function.arguments);
          const result = await executarFuncao(call.function.name, args, cfg);
          messages.push({ role: "tool", tool_call_id: call.id, content: String(result) });
        }

        response = await callWithRetry(() => client.chat.completions.create({
          model, messages, tools: tools.length ? tools : undefined, tool_choice: tools.length ? "auto" : undefined, max_tokens: 2048
        }));
        msg = response.choices[0].message;
        messages.push(msg);
      }

      const finalText = msg.content || "Processado.";
      pushNormalized(sender, "user", text, cfg.historySize);
      pushNormalized(sender, "assistant", finalText, cfg.historySize);
      return finalText;
    }

    // ================= ANTHROPIC (CLAUDE) =================
    if (provider === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });
      const model = resolveModel(cfg);

      const anthropicHistory = historicos[sender].map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }));

      let anthropicMessages = [...anthropicHistory, { role: "user", content: text }];
      const anthropicTools = tools.map(t => ({
        name: t.function.name, description: t.function.description, input_schema: t.function.parameters
      }));

      let response = await callWithRetry(() => anthropic.messages.create({
        model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: anthropicMessages,
        tools: anthropicTools.length ? anthropicTools : undefined
      }));

      for (let i = 0; i < 5; i++) {
        if (response.stop_reason !== "tool_use") break;
        const toolBlocks = response.content.filter(c => c.type === "tool_use");
        if (toolBlocks.length === 0) break;

        anthropicMessages.push({ role: "assistant", content: response.content });
        const toolResultContent = [];

        for (const block of toolBlocks) {
          const result = await executarFuncao(block.name, block.input, cfg);
          toolResultContent.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
        }

        anthropicMessages.push({ role: "user", content: toolResultContent });
        response = await callWithRetry(() => anthropic.messages.create({
          model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: anthropicMessages,
          tools: anthropicTools.length ? anthropicTools : undefined
        }));
      }

      const textBlock = response.content.find(c => c.type === "text");
      const finalText = textBlock ? textBlock.text : "Tarefa concluída.";
      pushNormalized(sender, "user", text, cfg.historySize);
      pushNormalized(sender, "assistant", finalText, cfg.historySize);
      return finalText;
    }

    return "⚠️ Erro: IA não configurada.";
  } catch (err) {
    console.error(`[AI ERROR] Falha no [${provider}]:`, err.message);
    return err.message.includes("429") ? "⏳ Limite de IA atingido, por favor aguarde uns segundos." : "❌ Falha na análise. Verifique as configurações no painel.";
  }
}

module.exports = { processMessage };
