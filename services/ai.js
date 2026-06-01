/**
 * Serviço de IA - Groq (Llama 3) com Function Calling
 */

const Groq = require("groq-sdk");
const { queryDB } = require("./db");
const { readSheet, listSheets } = require("./sheets");
const { generatePDF, extractPDFText, listPDFs } = require("./reports");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const SYSTEM_PROMPT = `Você é o assistente virtual da campanha do Jacy Afonso, candidato a Deputado Distrital pelo PT/DF.
Você tem acesso ao banco de dados da campanha (PostgreSQL) e ao Google Sheets.

O banco possui as seguintes tabelas:
- apoiadores: cadastro completo (nome_completo, primeiro_nome, profissao, area_atuacao, orgao_empresa, whatsapp, email, cidade, uf, cidade_votacao, presente_lancamento, apoiador, origem)
- demandas: pedidos recebidos (descricao, categoria, status: 'aberta'/'em_andamento'/'resolvida', nome_solicitante)
- eventos: agenda (titulo, data_evento, horario, local, tipo, status)
- presencas: presença em eventos

Views prontas:
- apoiadores_por_cidade
- apoiadores_por_area
- demandas_abertas
- resumo_campanha

IMPORTANTE: Sempre use as ferramentas para buscar dados reais antes de responder. Nunca invente dados.
Responda sempre em português, de forma clara e objetiva.`;

const tools = [
  {
    type: "function",
    function: {
      name: "consultar_banco",
      description: "Executa SQL SELECT no PostgreSQL para buscar dados reais da campanha",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Query SQL SELECT" }
        },
        required: ["sql"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_planilha",
      description: "Lê dados do Google Sheets. Use 'listar' para ver as abas disponíveis.",
      parameters: {
        type: "object",
        properties: {
          aba: { type: "string", description: "Nome da aba ou 'listar'" },
          filtro: { type: "string", description: "Texto para filtrar linhas (opcional)" }
        },
        required: ["aba", "filtro"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gerar_relatorio_pdf",
      description: "Gera PDF com os dados e retorna link para download",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título do relatório" },
          conteudo: { type: "string", description: "Conteúdo do relatório" }
        },
        required: ["titulo", "conteudo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_pdf",
      description: "Lê PDF da pasta pdfs/. Use 'listar' para ver os disponíveis.",
      parameters: {
        type: "object",
        properties: {
          nome_arquivo: { type: "string", description: "Nome do arquivo ou 'listar'" }
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
    // Remove aspas simples problemáticas fora de strings JSON
    return JSON.parse(raw);
  } catch (e) {
    // Tenta extrair apenas o objeto JSON da string
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return {};
  }
}

async function executarFuncao(nome, args) {
  try {
    if (nome === "consultar_banco") {
      const sql = (args.sql || "").trim();
      if (!/^\s*SELECT\b/i.test(sql)) return "Erro: apenas SELECT é permitido.";
      const { rows, fields } = await queryDB(sql);
      if (!rows.length) return "Nenhum resultado encontrado.";
      const colunas = fields.map((f) => f.name);
      const linhas = rows.slice(0, 50).map((r) =>
        colunas.map((c) => String(r[c] ?? "")).join(" | ")
      );
      let resultado = colunas.join(" | ") + "\n" + "-".repeat(40) + "\n" + linhas.join("\n");
      if (rows.length > 50) resultado += `\n... e mais ${rows.length - 50} registros`;
      return resultado;
    }

    if (nome === "ler_planilha") {
      const aba = (args.aba || "").trim();
      const filtro = args.filtro || "";
      if (!aba || aba.toLowerCase() === "listar") {
        const abas = await listSheets();
        return `Abas disponíveis: ${abas.join(", ")}`;
      }
      const dados = await readSheet(aba, filtro);
      if (!dados.length) return `Aba '${aba}' vazia ou não encontrada.`;
      return dados.slice(0, 50).map((row) => row.join(" | ")).join("\n");
    }

    if (nome === "gerar_relatorio_pdf") {
      const filename = await generatePDF(args.titulo || "Relatório", args.conteudo || "");
      return `PDF gerado! Link: ${BASE_URL}/reports/${filename}`;
    }

    if (nome === "ler_pdf") {
      const nomeArq = (args.nome_arquivo || "").trim();
      if (!nomeArq || nomeArq.toLowerCase() === "listar") {
        const lista = listPDFs();
        return lista.length ? `PDFs disponíveis: ${lista.join(", ")}` : "Nenhum PDF na pasta pdfs/";
      }
      const texto = await extractPDFText(nomeArq);
      return texto.length > 8000 ? texto.substring(0, 8000) + "\n[truncado]" : texto;
    }

    return `Função desconhecida: ${nome}`;
  } catch (err) {
    console.error(`Erro na função ${nome}:`, err.message);
    return `Erro: ${err.message}`;
  }
}

// Chama o Groq com retry automático em caso de rate limit
async function groqCall(groq, params, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (err) {
      const is429 = err.status === 429 || (err.message && err.message.includes("429"));
      if (is429 && i < tentativas - 1) {
        // Extrai tempo de espera da mensagem ou usa 15s
        const match = err.message && err.message.match(/try again in (\d+(\.\d+)?)s/i);
        const wait = match ? Math.ceil(parseFloat(match[1])) * 1000 + 500 : 15000;
        console.log(`⏳ Rate limit, aguardando ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

async function processMessage(sender, text) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    if (!historicos[sender]) historicos[sender] = [];

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...historicos[sender],
      { role: "user", content: text }
    ];

    let response = await groqCall(groq, { model, messages, tools, tool_choice: "auto", max_tokens: 2048 });
    let msg = response.choices[0].message;
    messages.push(msg);

    // Loop de function calling (máx 5 rodadas)
    for (let i = 0; i < 5; i++) {
      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      for (const call of msg.tool_calls) {
        const args = parseArgs(call.function.arguments);
        console.log(`🔧 ${call.function.name}(${JSON.stringify(args)})`);
        const result = await executarFuncao(call.function.name, args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: String(result),
        });
      }

      response = await groqCall(groq, { model, messages, tools, tool_choice: "auto", max_tokens: 2048 });
      msg = response.choices[0].message;
      messages.push(msg);
    }

    // Salva histórico (últimas 10 trocas)
    historicos[sender] = messages.slice(1).slice(-20);

    const resposta = msg.content || "Processado com sucesso.";

    // Se ainda tiver tags de função no texto, algo deu errado — responde genericamente
    if (resposta.includes("<function=") || resposta.includes("<formula=")) {
      return "Desculpe, tive um problema ao processar sua solicitação. Pode repetir de outra forma?";
    }

    return resposta;
  } catch (err) {
    console.error("Erro no Groq:", err.message);
    if (err.message && err.message.includes("429")) {
      return "⏳ Muitas mensagens ao mesmo tempo. Aguarde alguns segundos e tente novamente.";
    }
    return "❌ Erro ao processar sua mensagem. Tente novamente.";
  }
}

module.exports = { processMessage };
