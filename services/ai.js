/**
 * Serviço de IA Multi-Provedor (Groq, Gemini, Anthropic) com Roteamento Avançado e Ferramentas
 */

require("dotenv").config();
const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const { queryDB } = require("./db");
const { readSheet, listSheets, groupSheetData, filterSheetAdvanced } = require("./sheets");
const { generatePDF } = require("./reports");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const SYSTEM_PROMPT = `Você é o assistente virtual administrativo da campanha do Jacy Afonso, candidato a Deputado Distrital pelo PT/DF.

REGRA CRUCIAL DE SINTAXE:
Ao chamar qualquer ferramenta/função, você DEVE gerar os argumentos estritamente como um objeto JSON válido (usando chaves {}). Nunca adicione caracteres especiais, aspas ou colchetes grudados no nome da função. 
Exemplo correto: {"aba": "Respostas ao formulário 1", "coluna": "Cidade"}

Abas da planilha: 
- "Respostas ao formulário 1" (Colunas principais: "Nome completo:", "WhatsApp (com DDD):  ", "Cidade:  ", "Bairro:", "Profissão:", "Área de atuação:")

Suas diretrizes:
1. Para buscas por cidade, bairro ou totais na planilha, use 'segmentar_apoiadores'.
2. Para cruzar dados, use 'filtrar_contatos_avancado'.
3. Para ver compromissos, use 'consultar_agenda_google'.
4. Para notícias e internet, use 'pesquisar_na_web'.`;

// CORREÇÃO: modelos padrão centralizados. Todos os providers agora leem
// a MESMA variável AI_MODEL (documentada no .env.example), com fallback
// específico por provedor apenas quando AI_MODEL não é definido.
const DEFAULT_MODELS = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-4-5-20251001", // atualizado para bater com .env.example
};

function resolveModel(provider) {
  return process.env.AI_MODEL || DEFAULT_MODELS[provider];
}

// Definição das ferramentas estruturada
const tools = [
  {
    type: "function",
    function: {
      name: "consultar_banco",
      description: "Executa SQL SELECT no PostgreSQL para buscar dados reais da campanha.",
      parameters: {
        type: "object",
        properties: { sql: { type: "string", description: "Query SQL SELECT completa e válida" } },
        required: ["sql"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listar_abas_planilha",
      description: "Lista todas as abas disponíveis na planilha do Google Sheets. Use sempre antes de ler a planilha.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_planilha",
      description: "Lê o conteúdo de uma aba específica do Google Sheets.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "Nome exato da aba" },
          filtro: { type: "string", description: "Texto opcional para filtrar" }
        },
        required: ["aba"]
      }
    }
  },
  {
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
  },
  {
    type: "function",
    function: {
      name: "listar_google_drive",
      description: "Lista todos os arquivos PDF disponíveis na pasta do Google Drive.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
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
  },
  {
    type: "function",
    function: {
      name: "segmentar_apoiadores",
      description: "Conta e agrupa a quantidade de pessoas na planilha com base em uma coluna específica.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "O nome da aba" },
          coluna: { type: "string", description: "O nome da coluna" }
        },
        required: ["aba", "coluna"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "filtrar_contatos_avancado",
      description: "Cruza dados para buscar pessoas específicas na planilha com múltiplos filtros simultâneos.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "Nome exato da aba" },
          filtros: {
            type: "array",
            items: {
              type: "object",
              properties: { coluna: { type: "string" }, valor: { type: "string" } }
            }
          }
        },
        required: ["aba", "filtros"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_agenda_google",
      description: "Consulta a agenda do Google Calendar para ver os próximos eventos.",
      parameters: {
        type: "object",
        properties: { quantidade: { type: "string", description: "Número de eventos (ex: '10')" } }
      }
    }
  },
  {
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
  }
];

// CORREÇÃO: histórico agora é normalizado em um formato único e simples
// { role: "user"|"assistant", content: string } independentemente do provedor.
// Isso evita que, ao trocar de AI_PROVIDER no meio de uma conversa, mensagens
// com estrutura específica de um provedor (ex: role "tool" do Groq, ou blocos
// tool_use/tool_result do Anthropic) sejam repassadas cruas para outro
// provedor que não as reconhece.
const historicos = {};
const MAX_HIST = 6;

function pushNormalized(sender, role, content) {
  if (!historicos[sender]) historicos[sender] = [];
  const text = typeof content === "string" ? content : JSON.stringify(content);
  if (!text || !text.trim()) return;
  historicos[sender].push({ role, content: text });
  historicos[sender] = historicos[sender].slice(-MAX_HIST);
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

async function executarFuncao(nome, args) {
  try {
    console.log(`🚀 Executando ferramenta local: ${nome}`);

    if (nome === "consultar_banco") {
      const sql = (args.sql || "").trim();
      if (!/^\s*SELECT\b/i.test(sql)) return "Erro: Apenas operações SELECT são permitidas.";
      const { rows, fields, error } = await queryDB(sql);
      if (error) return error;
      if (!rows || !rows.length) return "Nenhum registro encontrado.";

      const colunas = fields.map((f) => f.name);
      const linhas = rows.slice(0, 100).map((r) => colunas.map((c) => String(r[c] ?? "")).join(" | "));
      let resultado = colunas.join(" | ") + "\n" + "-".repeat(40) + "\n" + linhas.join("\n");
      if (rows.length > 100) resultado += `\n\n[Exibindo 100 de ${rows.length} registros].`;
      return resultado;
    }

    if (nome === "consultar_agenda_google") {
      const { getUpcomingEvents } = require("./calendar");
      const qtd = parseInt(args.quantidade || "10", 10);
      return await getUpcomingEvents(qtd);
    }

    if (nome === "segmentar_apoiadores") {
      return await groupSheetData(args.aba || "", args.coluna || "");
    }

    if (nome === "listar_abas_planilha") {
      const abas = await listSheets();
      return `Abas disponíveis nesta planilha: [${abas.join(", ")}].`;
    }

    if (nome === "pesquisar_na_web") {
      const { pesquisarWeb } = require("./web");
      return await pesquisarWeb(args.termo_pesquisa || "");
    }

    if (nome === "filtrar_contatos_avancado") {
      return await filterSheetAdvanced(args.aba || "", args.filtros || []);
    }

    if (nome === "ler_planilha") {
      const aba = (args.aba || "").trim();
      const dados = await readSheet(aba, args.filtro || "");
      if (!dados || dados.length === 0) return `A aba '${aba}' está vazia ou não existe.`;
      if (dados[0] && dados[0][0] && String(dados[0][0]).includes("Aviso para a IA")) return dados[0][0];

      const limit = 15;
      let resultado = dados.slice(0, limit).map((row) => row.join(" | ")).join("\n");
      if (dados.length > limit) resultado += `\n\n[Exibindo ${limit} de ${dados.length} linhas para economizar memória].`;
      return resultado;
    }

    if (nome === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório", args.conteudo || "");
      return `PDF criado! Baixar em: ${BASE_URL}/reports/${filename}`;
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

    return `Função desconhecida: ${nome}`;
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

async function processMessage(sender, text) {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey) return "⚠️ Chave de API da IA não configurada no Painel Admin.";
  if (!historicos[sender]) historicos[sender] = [];

  try {
    // ================= GOOGLE GEMINI =================
    if (provider === "gemini") {
      const aiInstance = new GoogleGenAI({ apiKey });
      const modelName = resolveModel("gemini");

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
          tools: [{ functionDeclarations }]
        }
      }));

      for (let i = 0; i < 5; i++) {
        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) break;

        geminiContents.push(response.candidates[0].content);

        const functionParts = [];
        for (const call of functionCalls) {
          const result = await executarFuncao(call.name, call.args);
          functionParts.push({
            functionResponse: {
              name: call.name,
              response: { result: String(result) }
            }
          });
        }

        geminiContents.push({ role: "user", parts: functionParts });

        response = await callWithRetry(() => aiInstance.models.generateContent({
          model: modelName,
          contents: geminiContents,
          config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations }] }
        }));
      }

      const finalText = response.text || "Análise concluída com sucesso.";

      pushNormalized(sender, "user", text);
      pushNormalized(sender, "assistant", finalText);

      return finalText;
    }

    // ================= GROQ (LLAMA 3) =================
    if (provider === "groq") {
      const client = new Groq({ apiKey });
      const model = resolveModel("groq");

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...historicos[sender],
        { role: "user", content: text }
      ];

      let response = await callWithRetry(() => client.chat.completions.create({
        model, messages, tools, tool_choice: "auto", max_tokens: 2048
      }));

      let msg = response.choices[0].message;
      messages.push(msg);

      for (let i = 0; i < 5; i++) {
        if (!msg.tool_calls || msg.tool_calls.length === 0) break;

        for (const call of msg.tool_calls) {
          const args = parseArgs(call.function.arguments);
          const result = await executarFuncao(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: String(result) });
        }

        response = await callWithRetry(() => client.chat.completions.create({
          model, messages, tools, tool_choice: "auto", max_tokens: 2048
        }));
        msg = response.choices[0].message;
        messages.push(msg);
      }

      const finalText = msg.content || "Processado.";

      pushNormalized(sender, "user", text);
      pushNormalized(sender, "assistant", finalText);

      return finalText;
    }

    // ================= ANTHROPIC (CLAUDE) =================
    if (provider === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });
      const model = resolveModel("anthropic");

      const anthropicHistory = historicos[sender].map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }));

      let anthropicMessages = [...anthropicHistory, { role: "user", content: text }];
      const anthropicTools = tools.map(t => ({
        name: t.function.name, description: t.function.description, input_schema: t.function.parameters
      }));

      let response = await callWithRetry(() => anthropic.messages.create({
        model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: anthropicMessages, tools: anthropicTools
      }));

      for (let i = 0; i < 5; i++) {
        if (response.stop_reason !== "tool_use") break;
        const toolBlocks = response.content.filter(c => c.type === "tool_use");
        if (toolBlocks.length === 0) break;

        anthropicMessages.push({ role: "assistant", content: response.content });
        const toolResultContent = [];

        for (const block of toolBlocks) {
          const result = await executarFuncao(block.name, block.input);
          toolResultContent.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
        }

        anthropicMessages.push({ role: "user", content: toolResultContent });
        response = await callWithRetry(() => anthropic.messages.create({
          model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: anthropicMessages, tools: anthropicTools
        }));
      }

      const textBlock = response.content.find(c => c.type === "text");
      const finalText = textBlock ? textBlock.text : "Tarefa concluída.";

      pushNormalized(sender, "user", text);
      pushNormalized(sender, "assistant", finalText);

      return finalText;
    }

    return "⚠️ Erro: IA não configurada.";
  } catch (err) {
    console.error(`[AI ERROR] Falha no [${provider}]:`, err.message);
    return err.message.includes("429") ? "⏳ Limite de IA atingido, por favor aguarde uns segundos." : "❌ Falha na análise. Verifique as configurações no painel.";
  }
}

module.exports = { processMessage };
