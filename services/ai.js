/**
 * Serviço de IA Multi-Provedor (Groq, Gemini, Anthropic) com Function Calling e suporte a Google Drive
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
- apoiadores: cadastro completo (nome_completo, primeiro_nome, profissao, area_atuacao, orgao_empresa, whatsapp, email, cidade, uf, cidade_votacao, presente_lancamento, apoiador, origem)
- demandas: pedidos recebidos (descricao, categoria, status: 'aberta'/'em_andamento'/'resolvida', nome_solicitante)
- eventos: agenda (titulo, data_evento, horario, local, tipo, status)
- presencas: presença em eventos

Views prontas no Banco:
- apoiadores_por_cidade
- apoiadores_por_area
- demandas_abertas
- resumo_campanha

Diretrizes importantes:
1. Sempre use as ferramentas para buscar dados reais (banco, planilhas ou arquivos no Drive) antes de responder. Nunca invente dados ou estatísticas.
2. Se o usuário pedir para ver o que tem no Drive, use 'listar_google_drive'.
3. Se o usuário pedir para ler/resumir um documento do Drive, use 'ler_pdf_google_drive'.
4. Responda sempre em português, de forma clara, profissional e extremamente objetiva.`;

// Definição das ferramentas suportadas pelo sistema (Formato Padrão)
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
      name: "ler_planilha",
      description: "Lê dados do Google Sheets. Use 'listar' no parâmetro aba para ver as abas disponíveis.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "Nome exato da aba da planilha ou 'listar'" },
          filtro: { type: "string", description: "Texto opcional para filtrar linhas" }
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
          titulo: { type: "string", description: "Título que aparecerá no topo do relatório" },
          conteudo: { type: "string", description: "Conteúdo textual detalhado estruturado para o relatório" }
        },
        required: ["titulo", "conteudo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_pdf_local",
      description: "Lê o texto de um PDF armazenado na pasta local pdfs/. Use 'listar' para ver os disponíveis.",
      parameters: {
        type: "object",
        properties: {
          nome_arquivo: { type: "string", description: "Nome do arquivo local ou 'listar'" }
        },
        required: ["nome_arquivo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listar_google_drive",
      description: "Lista todos os arquivos PDF disponíveis na pasta configurada do Google Drive.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_pdf_google_drive",
      description: "Baixa automaticamente e extrai o texto completo de um arquivo PDF específico armazenado na nuvem do Google Drive.",
      parameters: {
        type: "object",
        properties: {
          nome_arquivo: { type: "string", description: "Nome exato ou aproximado do arquivo PDF presente no Drive (ex: ata_reuniao.pdf)" }
        },
        required: ["nome_arquivo"]
      }
    }
  }
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

// Executor Central de Funções e Ferramentas
async function executarFuncao(nome, args) {
  try {
    console.log(`🚀 Executando ferramenta local: ${nome}`);

    if (nome === "consultar_banco") {
      const sql = (args.sql || "").trim();
      if (!/^\s*SELECT\b/i.test(sql)) return "Erro: Apenas operações de consulta (SELECT) são permitidas por segurança.";
      const { rows, fields } = await queryDB(sql);
      if (!rows.length) return "Nenhum registro encontrado no banco de dados para esta busca.";
      const colunas = fields.map((f) => f.name);
      const linhas = rows.slice(0, 50).map((r) => colunas.map((c) => String(r[c] ?? "")).join(" | "));
      let resultado = colunas.join(" | ") + "\n" + "-".repeat(40) + "\n" + linhas.join("\n");
      if (rows.length > 50) resultado += `\n... e mais ${rows.length - 50} registros truncados por tamanho.`;
      return resultado;
    }

    if (nome === "ler_planilha") {
      const aba = (args.aba || "").trim();
      const filtro = args.filtro || "";
      if (!aba || aba.toLowerCase() === "listar") {
        const abas = await listSheets();
        return `Abas disponíveis na planilha do Google Sheets: ${abas.join(", ")}`;
      }
      const dados = await readSheet(aba, filtro);
      if (!dados.length) return `A aba '${aba}' está vazia ou não foi encontrada.`;
      return dados.slice(0, 50).map((row) => row.join(" | ")).join("\n");
    }

    if (nome === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório Campanha", args.conteudo || "");
      return `PDF criado com sucesso! Link seguro para baixar: ${BASE_URL}/reports/${filename}`;
    }

    if (nome === "ler_pdf_local") {
      const nomeArq = (args.nome_arquivo || "").trim();
      if (!nomeArq || nomeArq.toLowerCase() === "listar") {
        const lista = listPDFs();
        return lista.length ? `PDFs locais na pasta pdfs/: ${lista.join(", ")}` : "Nenhum arquivo encontrado na pasta local pdfs/.";
      }
      const texto = await extractPDFText(nomeArq);
      return texto.length > 8000 ? texto.substring(0, 8000) + "\n[Conteúdo Longo - Truncado]" : texto;
    }

    if (nome === "listar_google_drive") {
      const { listDrivePdfs } = require("./drive");
      const arquivos = await listDrivePdfs();
      if (!arquivos.length) return "Nenhum arquivo PDF encontrado na pasta vinculada do Google Drive.";
      return "Arquivos localizados no Google Drive:\n" + arquivos.map(f => `- 📄 ${f.name}`).join("\n");
    }

    if (nome === "ler_pdf_google_drive") {
      const { listDrivePdfs, downloadDrivePdf } = require("./drive");
      const pdfParse = require("pdf-parse");
      const fs = require("fs");
      
      const nomeArq = (args.nome_arquivo || "").trim();
      const arquivos = await listDrivePdfs();
      const arquivoAlvo = arquivos.find(f => 
        f.name.toLowerCase().includes(nomeArq.toLowerCase()) || 
        nomeArq.toLowerCase().includes(f.name.toLowerCase().replace(".pdf", ""))
      );

      if (!arquivoAlvo) {
        return `O arquivo '${nomeArq}' não foi localizado no Google Drive. Use a ferramenta listar_google_drive para conferir os nomes.`;
      }

      const caminhoLocal = await downloadDrivePdf(arquivoAlvo.id, arquivoAlvo.name);
      if (!caminhoLocal) return "Erro operacional ao tentar baixar o arquivo do Google Drive.";

      const dataBuffer = fs.readFileSync(caminhoLocal);
      const pdfDados = await pdfParse(dataBuffer);
      const texto = pdfDados.text || "";
      return texto.length > 8000 ? texto.substring(0, 8000) + "\n[Conteúdo Longo - Truncado]" : texto;
    }

    return `Função não cadastrada no motor de execução: ${nome}`;
  } catch (err) {
    console.error(`Erro na execução da ferramenta [${nome}]:`, err.message);
    return `Erro ao processar dados da ferramenta: ${err.message}`;
  }
}

// RETRY LOOP PARA RATE LIMITS (429)
async function callWithRetry(apiCallFn, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await apiCallFn();
    } catch (err) {
      const is429 = err.status === 429 || (err.message && err.message.includes("429"));
      if (is429 && i < tentativas - 1) {
        console.log(`⏳ Limite de requisições atingido. Aguardando 10 segundos antes do re-envio...`);
        await new Promise(r => setTimeout(r, 10000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * MOTOR CENTRAL DE PROCESSAMENTO DE MENSAGENS (ROUTING INTELIGENTE)
 */
async function processMessage(sender, text) {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return "⚠️ Chave de API da Inteligência Artificial não configurada no Painel Admin. Acesse http://localhost:3000/config para ajustar.";
  }

  if (!historicos[sender]) historicos[sender] = [];

  try {
    // ROTEAMENTO 1 & 2: GROQ OU GEMINI (Ambos usam formato OpenAI SDK ou compatível)
    if (provider === "groq" || provider === "gemini") {
      let client;
      let model;

      if (provider === "groq") {
        client = new Groq({ apiKey });
        model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      } else {
        // Usa o endpoint de compatibilidade oficial do Google Gemini para economizar código e otimizar chamadas
        client = new Groq({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" });
        model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      }

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...historicos[sender],
        { role: "user", content: text }
      ];

      let response = await callWithRetry(() => client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 2048
      }));

      let msg = response.choices[0].message;
      messages.push(msg);

      // Loop de execução sequencial de ferramentas (Máximo 5 voltas)
      for (let i = 0; i < 5; i++) {
        if (!msg.tool_calls || msg.tool_calls.length === 0) break;

        for (const call of msg.tool_calls) {
          const args = parseArgs(call.function.arguments);
          const result = await executarFuncao(call.function.name, args);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: String(result),
          });
        }

        response = await callWithRetry(() => client.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 2048
        }));
        msg = response.choices[0].message;
        messages.push(msg);
      }

      historicos[sender] = messages.slice(1).slice(-20); // Mantém últimas interações salvas no cache
      return msg.content || "Relatório processado com sucesso pelas ferramentas.";
    }

    // ROTEAMENTO 3: ANTHROPIC CLAUDE HAIKU
    if (provider === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });
      const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

      // Converte histórico para o formato estrito da Anthropic (Sem mensagens de sistema misturadas)
      const filteredHistory = historicos[sender].filter(m => m.role !== "system").map(m => ({
        role: m.role === "tool" ? "user" : (m.role === "assistant" ? "assistant" : "user"),
        content: m.content || "Executando ação..."
      }));

      let anthropicMessages = [
        ...filteredHistory,
        { role: "user", content: text }
      ];

      const anthropicTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));

      let response = await callWithRetry(() => anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        tools: anthropicTools
      }));

      // Loop de Function Calling para o Claude
      for (let i = 0; i < 5; i++) {
        if (response.stop_reason !== "tool_use") break;

        const toolBlocks = response.content.filter(c => c.type === "tool_use");
        if (toolBlocks.length === 0) break;

        anthropicMessages.push({ role: "assistant", content: response.content });

        const toolResultContent = [];
        for (const block of toolBlocks) {
          const result = await executarFuncao(block.name, block.input);
          toolResultContent.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: String(result)
          });
        }

        anthropicMessages.push({ role: "user", content: toolResultContent });

        response = await callWithRetry(() => anthropic.messages.create({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
          tools: anthropicTools
        }));
      }

      // Salva o histórico limpo estruturado
      historicos[sender] = anthropicMessages.slice(-20);
      
      const textBlock = response.content.find(c => c.type === "text");
      return textBlock ? textBlock.text : "Comando concluído com sucesso.";
    }

    return "⚠️ Erro interno: Provedor de inteligência artificial desconhecido ou não suportado.";

  } catch (err) {
    console.error(`[AI ERROR] Falha crítica de processamento no provedor [${provider}]:`, err.message);
    if (err.message && err.message.includes("429")) {
      return "⏳ O limite de tráfego temporário da IA foi atingido. Aguarde alguns instantes e envie a sua pergunta novamente.";
    }
    return "❌ Desculpe, não consegui processar essa mensagem agora. Verifique suas conexões e chaves de API no painel admin.";
  }
}

module.exports = { processMessage };
