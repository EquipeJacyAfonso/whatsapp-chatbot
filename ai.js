/**
 * Serviço de IA Multi-Provedor
 *
 * Suporta (em ordem de custo crescente):
 *   groq      → Llama 3 via Groq (GRÁTIS, rate-limited)
 *   gemini    → Gemini Flash via endpoint OpenAI-compat (GRÁTIS até 1500 req/dia)
 *   anthropic → Claude Haiku (pago, ~$0.0008/1K tokens de entrada)
 *
 * Selecione com AI_PROVIDER no .env.
 * A chave fica em AI_API_KEY (única variável independente do provedor).
 */

require("dotenv").config();
const { queryDB }           = require("./db");
const { listSheets, readSheet } = require("./sheets");
const { listDrivePdfs, downloadDrivePdf } = require("./drive");
const { generatePDF, extractPDFText, listPDFs } = require("./reports");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o assistente administrativo virtual da campanha do Jacy Afonso (PT/DF).

Sua função é responder perguntas sobre os dados da campanha consultando automaticamente:
  • Banco de dados PostgreSQL (tabelas: apoiadores, demandas, eventos, presencas)
  • Planilhas no Google Sheets
  • Documentos PDF armazenados no Google Drive

REGRAS:
1. Sempre use as ferramentas para buscar dados reais. Nunca invente números ou nomes.
2. Responda em português, de forma objetiva e direta.
3. Para WhatsApp, formate assim:
   - *Negrito* para títulos e totais importantes
   - Listas com • para múltiplos itens
   - Sem markdown complexo (sem ##, sem ---)
4. Se o usuário pedir PDF, gere com gerar_relatorio_pdf e envie o link.
5. Se não encontrar dados, diga claramente o que buscou.
6. Limite tabelas a 20 linhas; ofereça filtrar se houver mais.

SCHEMA DO BANCO:
- apoiadores: nome_completo, primeiro_nome, profissao, area_atuacao, orgao_empresa, whatsapp, email, cidade, uf, cidade_votacao, presente_lancamento, apoiador, origem
- demandas: descricao, categoria, status (aberta/em_andamento/resolvida), nome_solicitante
- eventos: titulo, data_evento, horario, local, tipo, status
- presencas: vincula apoiadores a eventos
Views: apoiadores_por_cidade, apoiadores_por_area, demandas_abertas, resumo_campanha`;

// ── Definição das ferramentas (formato OpenAI, compatível com Groq e Gemini) ──
const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultar_banco",
      description: "Executa SELECT no PostgreSQL para buscar dados reais da campanha.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Query SQL SELECT completa e válida" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ler_planilha",
      description: "Lê dados do Google Sheets. Use aba='listar' para ver as abas disponíveis.",
      parameters: {
        type: "object",
        properties: {
          aba:    { type: "string", description: "Nome da aba ou 'listar'" },
          filtro: { type: "string", description: "Texto para filtrar linhas (opcional)" },
        },
        required: ["aba"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_drive",
      description: "Lista os arquivos PDF disponíveis na pasta do Google Drive configurada.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ler_pdf_drive",
      description: "Baixa e extrai o texto de um PDF do Google Drive pelo nome do arquivo.",
      parameters: {
        type: "object",
        properties: {
          nome_arquivo: { type: "string", description: "Nome do arquivo PDF no Drive" },
        },
        required: ["nome_arquivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ler_pdf_local",
      description: "Lê PDF da pasta local pdfs/. Use nome_arquivo='listar' para ver os disponíveis.",
      parameters: {
        type: "object",
        properties: {
          nome_arquivo: { type: "string", description: "Nome do arquivo ou 'listar'" },
        },
        required: ["nome_arquivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gerar_relatorio_pdf",
      description: "Gera um relatório profissional em PDF e retorna o link de download para enviar no WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          titulo:   { type: "string", description: "Título do relatório" },
          conteudo: { type: "string", description: "Conteúdo completo e detalhado do relatório" },
        },
        required: ["titulo", "conteudo"],
      },
    },
  },
];

// Versão Anthropic das ferramentas (input_schema em vez de parameters)
const TOOLS_ANTHROPIC = TOOLS.map((t) => ({
  name:         t.function.name,
  description:  t.function.description,
  input_schema: t.function.parameters,
}));

// ── Execução das ferramentas ───────────────────────────────────────────────────
async function runTool(name, args) {
  try {
    if (name === "consultar_banco") {
      const sql = (args.sql || "").trim();
      if (!/^\s*SELECT\b/i.test(sql)) return "❌ Apenas consultas SELECT são permitidas por segurança.";
      const { rows, fields } = await queryDB(sql);
      if (!rows.length) return "Nenhum registro encontrado para essa busca.";
      const cols  = fields.map((f) => f.name);
      const lines = rows.slice(0, 50).map((r) => cols.map((c) => String(r[c] ?? "")).join(" | "));
      let out = cols.join(" | ") + "\n" + "─".repeat(40) + "\n" + lines.join("\n");
      if (rows.length > 50) out += `\n... e mais ${rows.length - 50} registros.`;
      return out;
    }

    if (name === "ler_planilha") {
      const aba    = (args.aba || "").trim();
      const filtro = args.filtro || "";
      if (!aba || aba.toLowerCase() === "listar") {
        const abas = await listSheets();
        return `Abas disponíveis: ${abas.join(", ")}`;
      }
      const dados = await readSheet(aba, filtro);
      if (!dados.length) return `Aba '${aba}' não encontrada ou vazia.`;
      return dados.slice(0, 50).map((r) => r.join(" | ")).join("\n");
    }

    if (name === "listar_drive") {
      const arquivos = await listDrivePdfs();
      if (!arquivos.length) return "Nenhum PDF encontrado na pasta do Drive configurada.";
      return "PDFs no Drive:\n" + arquivos.map((f) => `• ${f.name}`).join("\n");
    }

    if (name === "ler_pdf_drive") {
      const pdfParse = require("pdf-parse");
      const fs       = require("fs");
      const arquivos = await listDrivePdfs();
      const alvo     = arquivos.find((f) =>
        f.name.toLowerCase().includes((args.nome_arquivo || "").toLowerCase())
      );
      if (!alvo) return `Arquivo '${args.nome_arquivo}' não localizado no Drive. Use listar_drive para conferir os nomes.`;
      const caminho = await downloadDrivePdf(alvo.id, alvo.name);
      if (!caminho) return "Erro ao baixar arquivo do Drive.";
      const data  = await pdfParse(fs.readFileSync(caminho));
      const texto = data.text || "";
      return texto.length > 8000 ? texto.substring(0, 8000) + "\n[truncado]" : texto;
    }

    if (name === "ler_pdf_local") {
      const nomeArq = (args.nome_arquivo || "").trim();
      if (!nomeArq || nomeArq.toLowerCase() === "listar") {
        const lista = listPDFs();
        return lista.length ? `PDFs locais: ${lista.join(", ")}` : "Nenhum PDF na pasta pdfs/.";
      }
      const texto = await extractPDFText(nomeArq);
      return texto.length > 8000 ? texto.substring(0, 8000) + "\n[truncado]" : texto;
    }

    if (name === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório", args.conteudo || "");
      return `✅ PDF gerado!\n📄 Link para download: ${BASE_URL}/reports/${filename}`;
    }

    return `Ferramenta desconhecida: ${name}`;
  } catch (err) {
    console.error(`❌ Erro na ferramenta [${name}]:`, err.message);
    return `Erro ao executar ${name}: ${err.message}`;
  }
}

// ── Parse seguro de args ───────────────────────────────────────────────────────
function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch (_) {}
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return {};
}

// ── Retry em rate-limit ────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      const is429 = err.status === 429 || String(err.message).includes("429");
      if (is429 && i < retries - 1) {
        const m    = String(err.message).match(/try again in (\d+(\.\d+)?)s/i);
        const wait = m ? Math.ceil(parseFloat(m[1])) * 1000 + 500 : 12000;
        console.log(`⏳ Rate limit — aguardando ${(wait/1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else throw err;
    }
  }
}

// ── Loop de tool-calling genérico (OpenAI-compatible) ─────────────────────────
async function toolLoop(callFn) {
  let response = await withRetry(callFn);
  let msg      = response.choices[0].message;
  const msgs   = [msg];

  for (let i = 0; i < 6; i++) {
    if (!msg.tool_calls?.length) break;
    const toolMsgs = [];
    for (const call of msg.tool_calls) {
      const args   = parseArgs(call.function.arguments);
      console.log(`  🔧 ${call.function.name}(${JSON.stringify(args).substring(0, 80)})`);
      const result = await runTool(call.function.name, args);
      toolMsgs.push({ role: "tool", tool_call_id: call.id, content: String(result) });
    }
    msgs.push(...toolMsgs);
    response = await withRetry(() => callFn(msgs));
    msg      = response.choices[0].message;
    msgs.push(msg);
  }
  return msg.content || "Processado com sucesso.";
}

// ── Histórico em memória ───────────────────────────────────────────────────────
const historicos = {};
const MAX_HIST   = 20;

// ── Entry point ───────────────────────────────────────────────────────────────
async function processMessage(sender, text) {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const apiKey   = process.env.AI_API_KEY;

  if (!apiKey) {
    return "⚠️ Chave de API não configurada. Acesse o painel admin para configurar.";
  }

  if (!historicos[sender]) historicos[sender] = [];

  try {
    // ── GROQ ou GEMINI (ambos usam SDK/endpoint OpenAI-compatible) ─────────
    if (provider === "groq" || provider === "gemini") {
      const Groq = require("groq-sdk");

      const clientOpts = provider === "groq"
        ? { apiKey }
        : { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" };

      const client = new Groq(clientOpts);

      const model = process.env.AI_MODEL || (
        provider === "groq"   ? "llama-3.3-70b-versatile" :
                                "gemini-1.5-flash"
      );

      const buildMsgs = (extra = []) => [
        { role: "system", content: SYSTEM_PROMPT },
        ...historicos[sender],
        { role: "user",   content: text },
        ...extra,
      ];

      let allMsgs = buildMsgs();

      const call = (extraMsgs) => client.chat.completions.create({
        model,
        messages: extraMsgs ? [...allMsgs, ...extraMsgs] : allMsgs,
        tools,
        tool_choice: "auto",
        max_tokens:  2048,
      });

      // Tool loop inline para poder acumular msgs
      let response = await withRetry(() => call());
      let msg      = response.choices[0].message;
      allMsgs.push(msg);

      for (let i = 0; i < 6; i++) {
        if (!msg.tool_calls?.length) break;
        const toolMsgs = [];
        for (const tc of msg.tool_calls) {
          const args   = parseArgs(tc.function.arguments);
          console.log(`  🔧 ${tc.function.name}(${JSON.stringify(args).substring(0, 80)})`);
          const result = await runTool(tc.function.name, args);
          toolMsgs.push({ role: "tool", tool_call_id: tc.id, content: String(result) });
        }
        allMsgs.push(...toolMsgs);
        response = await withRetry(() => client.chat.completions.create({
          model, messages: allMsgs, tools: TOOLS, tool_choice: "auto", max_tokens: 2048,
        }));
        msg = response.choices[0].message;
        allMsgs.push(msg);
      }

      // Salva histórico (sem system prompt)
      historicos[sender] = allMsgs.slice(1).slice(-MAX_HIST);
      return msg.content || "Processado.";
    }

    // ── ANTHROPIC ───────────────────────────────────────────────────────────
    if (provider === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const client    = new Anthropic({ apiKey });
      const model     = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

      // Filtra apenas roles válidos para Anthropic (user / assistant)
      const cleanHist = historicos[sender]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content || "" }));

      let anthMsgs = [...cleanHist, { role: "user", content: text }];

      const call = () => client.messages.create({
        model,
        max_tokens: 2048,
        system:     SYSTEM_PROMPT,
        messages:   anthMsgs,
        tools:      TOOLS_ANTHROPIC,
      });

      let response = await withRetry(call);

      for (let i = 0; i < 6; i++) {
        if (response.stop_reason !== "tool_use") break;
        const toolBlocks = response.content.filter((b) => b.type === "tool_use");
        anthMsgs.push({ role: "assistant", content: response.content });
        const results = [];
        for (const block of toolBlocks) {
          console.log(`  🔧 ${block.name}(${JSON.stringify(block.input).substring(0, 80)})`);
          const result = await runTool(block.name, block.input);
          results.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
        }
        anthMsgs.push({ role: "user", content: results });
        response = await withRetry(call);
      }

      // Salva histórico
      historicos[sender] = anthMsgs.slice(-MAX_HIST);
      const textBlock    = response.content.find((b) => b.type === "text");
      return textBlock?.text || "Processado com sucesso.";
    }

    return "⚠️ Provedor de IA inválido. Configure AI_PROVIDER como groq, gemini ou anthropic.";

  } catch (err) {
    console.error(`❌ Erro [${provider}]:`, err.message);
    if (String(err.message).includes("429")) {
      return "⏳ Limite de requisições atingido. Aguarde alguns segundos e tente novamente.";
    }
    return "❌ Erro ao processar. Verifique as configurações no painel admin.";
  }
}

module.exports = { processMessage };
