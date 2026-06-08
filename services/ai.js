/**
 * Serviço de IA Multi-Provedor (Groq, Gemini, Anthropic) com Roteamento Avançado e Ferramentas
 */

require("dotenv").config();
const Groq = require("groq-sdk");
const { queryDB } = require("./db");
const { readSheet, listSheets } = require("./sheets");
const { generatePDF, extractPDFText, listPDFs } = require("./reports");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const SYSTEM_PROMPT = `Você é o assistente virtual administrativo da campanha do Jacy Afonso, candidato a Deputado Distrital pelo PT/DF.
Você tem acesso ao banco de dados da campanha (PostgreSQL), planilhas do Google Sheets e a uma pasta compartilhada no Google Drive contendo documentos PDF.

O banco de dados possui as seguintes tabelas:
- apoiadores: cadastro completo (nome_completo, profissao, area_atuacao, orgao_empresa, whatsapp, cidade, apoiador, origem)
- demandas: pedidos recebidos (descricao, categoria, status, nome_solicitante)
- eventos: agenda (titulo, data_evento, horario, local, tipo, status)

Diretrizes importantes:
1. Sempre use as ferramentas para buscar dados reais (banco, planilhas ou arquivos) antes de responder.
2. Para ler planilhas, SEMPRE use a ferramenta 'listar_abas_planilha' primeiro para descobrir os nomes exatos das abas. Só depois use 'ler_planilha' passando o nome correto.
3. Se o usuário pedir para ver o que tem no Drive, use 'listar_google_drive'.
4. Responda sempre em português, de forma clara, profissional e sem inventar dados.`;

// Definição das ferramentas
const tools = [
  {
    type: "function",
    function: {
      name: "consultar_banco",
      description: "Executa SQL SELECT no PostgreSQL para buscar dados reais da campanha.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Query SQL SELECT completa e válida" }
        },
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
      description: "Lê o conteúdo de uma aba específica do Google Sheets. Você DEVE usar o nome exato da aba retornado por listar_abas_planilha.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "Nome exato da aba (ex: 'Página1')" },
          filtro: { type: "string", description: "Texto opcional para buscar informações específicas na planilha (ex: um nome ou cidade)" }
        },
        required: ["aba"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gerar_relatorio_pdf",
      description: "Gera um relatório profissional em PDF com os dados fornecidos e retorna o link para download.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título do relatório" },
          conteudo: { type: "string", description: "Conteúdo textual para o relatório" }
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
        properties: {
          nome_arquivo: { type: "string", description: "Nome do arquivo PDF (ex: relatorio.pdf)" }
        },
        required: ["nome_arquivo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_agenda_google",
      description: "Consulta a agenda do Google Calendar para ver os próximos eventos, compromissos e reuniões do candidato.",
      parameters: {
        type: "object",
        properties: {
          quantidade: { type: "integer", description: "Número de próximos eventos a procurar (padrão 10)" }
        }
      }
    }
  },
];

const historicos = {};

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
      if (rows.length > 100) resultado += `\n\n[Exibindo 100 de ${rows.length} registros. Se precisar de mais, refine o SQL].`;
      return resultado;
    }

    if (nome === "consultar_agenda_google") {
      const { getUpcomingEvents } = require("./calendar");
      const qtd = args.quantidade || 10;
      return await getUpcomingEvents(qtd);
    }

    if (nome === "listar_abas_planilha") {
      const abas = await listSheets();
      return `Abas disponíveis nesta planilha do Google Sheets: [${abas.join(", ")}]. Use a ferramenta 'ler_planilha' com um destes nomes para ver os dados.`;
    }

    if (nome === "ler_planilha") {
      const aba = (args.aba || "").trim();
      const filtro = args.filtro || "";
      
      const dados = await readSheet(aba, filtro);
      
      if (!dados || dados.length === 0) {
        return `A aba '${aba}' está vazia ou não existe. Use a ferramenta listar_abas_planilha para confirmar os nomes corretos.`;
      }

      // Verifica se é a mensagem de erro do Try/Catch (proteção que fizemos no ficheiro anterior)
      if (dados[0] && dados[0][0] && String(dados[0][0]).includes("Aviso para a IA")) {
        return dados[0][0];
      }

      const limit = 15; // Limite generoso de leitura para a IA analisar de uma vez
      const amostra = dados.slice(0, limit).map((row) => row.join(" | ")).join("\n");
      let resultado = amostra;
      
      if (dados.length > limit) {
         resultado += `\n\n[ATENÇÃO: A aba possui ${dados.length} linhas, mas apenas as primeiras ${limit} foram enviadas para evitar sobrecarga de memória. Se o utilizador procura algo específico que não está aqui, refaça a busca utilizando o parâmetro 'filtro'].`;
      }
      return resultado;
    }

    if (nome === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório Campanha", args.conteudo || "");
      return `PDF criado com sucesso! Link seguro para baixar: ${BASE_URL}/reports/${filename}`;
    }

    if (nome === "listar_google_drive") {
      const { listDrivePdfs } = require("./drive");
      const arquivos = await listDrivePdfs();
      if (!arquivos.length) return "Nenhum PDF encontrado no Drive.";
      return "Arquivos no Drive:\n" + arquivos.map(f => `- 📄 ${f.name}`).join("\n");
    }

    if (nome === "ler_pdf_google_drive") {
      const { listDrivePdfs, downloadDrivePdf } = require("./drive");
      const pdfParse = require("pdf-parse");
      const fs = require("fs");
      
      const nomeArq = (args.nome_arquivo || "").trim();
      const arquivos = await listDrivePdfs();
      const arquivoAlvo = arquivos.find(f => 
        f.name.toLowerCase().includes(nomeArq.toLowerCase())
      );

      if (!arquivoAlvo) return `Arquivo '${nomeArq}' não encontrado no Drive.`;

      const caminhoLocal = await downloadDrivePdf(arquivoAlvo.id, arquivoAlvo.name);
      if (!caminhoLocal) return "Erro ao baixar do Drive.";

      const dataBuffer = fs.readFileSync(caminhoLocal);
      const pdfDados = await pdfParse(dataBuffer);
      const texto = pdfDados.text || "";
      return texto.length > 10000 ? texto.substring(0, 10000) + "\n[Conteúdo Truncado]" : texto;
    }

    return `Função desconhecida: ${nome}`;
  } catch (err) {
    console.error(`Erro na ferramenta [${nome}]:`, err.message);
    return `Erro técnico ao processar: ${err.message}`;
  }
}

async function callWithRetry(apiCallFn, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await apiCallFn();
    } catch (err) {
      if ((err.status === 429 || String(err.message).includes("429")) && i < tentativas - 1) {
        console.log(`⏳ Rate limit da IA. Aguardando 10s...`);
        await new Promise(r => setTimeout(r, 10000));
      } else {
        throw err;
      }
    }
  }
}

async function processMessage(sender, text) {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey) return "⚠️ Chave de API da IA não configurada no Painel Admin.";
  if (!historicos[sender]) historicos[sender] = [];

  try {
    if (provider === "groq" || provider === "gemini") {
      let client, model;

      if (provider === "groq") {
        client = new Groq({ apiKey });
        model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      } else {
        client = new Groq({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" });
        model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      }

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

      historicos[sender] = messages.slice(1).slice(-20);
      return msg.content || "Análise concluída.";
    }

    if (provider === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });
      const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

      const filteredHistory = historicos[sender].filter(m => m.role !== "system").map(m => ({
        role: m.role === "tool" ? "user" : (m.role === "assistant" ? "assistant" : "user"),
        content: m.content || "Ação em processamento..."
      }));

      let anthropicMessages = [...filteredHistory, { role: "user", content: text }];
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

      historicos[sender] = anthropicMessages.slice(-20);
      const textBlock = response.content.find(c => c.type === "text");
      return textBlock ? textBlock.text : "Tarefa concluída com sucesso.";
    }

    return "⚠️ Erro: IA não configurada.";
  } catch (err) {
    console.error(`[AI ERROR] Falha no [${provider}]:`, err.message);
    return err.message.includes("429") ? "⏳ Limite de IA atingido, por favor aguarde uns segundos." : "❌ Desculpe, ocorreu uma falha na análise. Verifique o painel.";
  }
}

module.exports = { processMessage };