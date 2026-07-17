/**
 * Servidor HTTP:
 *  - Painel admin visual para configurar o .env sem editar arquivo
 *  - Rota de download dos PDFs gerados pelo bot
 */

const http        = require("http");
const fs          = require("fs");
const path        = require("path");
const querystring = require("querystring");
const { exec }    = require("child_process");

const REPORTS_DIR  = path.join(__dirname, process.env.REPORTS_DIR || "reports");
const ENV_PATH     = path.join(__dirname, ".env");
const GROUPS_PATH  = path.join(__dirname, "grupos.json");
let   currentPort  = parseInt(process.env.PORT || "3000", 10);

// Garante que a pasta de relatórios existe
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ── Helpers .env ───────────────────────────────────────────────────────────────
function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env = {};
  fs.readFileSync(ENV_PATH, "utf8").split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;
    const eq  = line.indexOf("=");
    if (eq === -1) return;
    env[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
  });
  return env;
}

function writeEnv(data) {
  const out = Object.entries(data)
    .map(([k, v]) => `${k}=${String(v).replace(/\r?\n|\r/g, "")}`)
    .join("\n") + "\n";
  fs.writeFileSync(ENV_PATH, out, "utf8");
}

// ── HTML do painel ─────────────────────────────────────────────────────────────
function buildPanel(env, port) {
  // Monta selector de grupos dinamicamente se grupos.json existir
  let groupWidget = `
    <div class="info-box">
      ⏳ <b>Aguardando conexão WhatsApp...</b><br>
      Escaneie o QR Code no terminal e <a href="/config">atualize esta página</a> para selecionar o grupo.
    </div>`;

  if (fs.existsSync(GROUPS_PATH)) {
    try {
      const groups = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
      if (groups.length > 0) {
        const opts = groups.map(g =>
          `<option value="${g.id}" ${env.GROUP_ID === g.id ? "selected" : ""}>${g.name}</option>`
        ).join("");
        groupWidget = `
          <select name="GROUP_ID">
            <option value="">— Selecione o grupo —</option>
            ${opts}
          </select>
          <p class="hint">Apenas mensagens enviadas neste grupo serão respondidas pelo bot.</p>`;
      }
    } catch (_) {}
  }

  // Label dinâmico conforme provedor
  const provider   = env.AI_PROVIDER || "groq";
  const keyLabels  = {
    groq:      "Chave Groq (começa com <code>gsk_</code>) — <a href='https://console.groq.com/keys' target='_blank'>obter grátis</a>",
    gemini:    "Chave Google AI Studio (começa com <code>AIza</code>) — <a href='https://aistudio.google.com/app/apikey' target='_blank'>obter grátis</a>",
    anthropic: "Chave Anthropic Claude (começa com <code>sk-ant-</code>) — <a href='https://console.anthropic.com/keys' target='_blank'>obter chave</a>",
  };
  const keyLabel = keyLabels[provider] || "Chave de API da IA";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel — Jacy Bot</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;padding:32px 16px}
    .card{max-width:680px;margin:auto;background:#fff;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.08);overflow:hidden}
    .card-header{background:#0f172a;color:#fff;padding:24px 32px}
    .card-header h1{font-size:22px;font-weight:700}
    .card-header p{font-size:13px;color:#94a3b8;margin-top:4px}
    .card-body{padding:28px 32px}
    .section{margin-bottom:28px}
    .section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px}
    label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px;margin-top:14px}
    label:first-of-type{margin-top:0}
    input[type=text],input[type=password],textarea,select{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;background:#f8fafc;transition:border .15s,box-shadow .15s}
    input:focus,textarea:focus,select:focus{border-color:#3b82f6;background:#fff;outline:none;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
    .hint{font-size:12px;color:#64748b;margin-top:5px;line-height:1.5}
    .hint a{color:#3b82f6}
    .info-box{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:13px;color:#713f12;line-height:1.5}
    .info-box a{color:#92400e;font-weight:600}
    .drop-zone{border:2px dashed #cbd5e1;border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:border .15s;background:#f8fafc}
    .drop-zone:hover{border-color:#3b82f6;background:#eff6ff}
    .drop-zone span{font-size:13px;color:#64748b}
    .drop-zone input{display:none}
    .btn{display:block;width:100%;padding:14px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;margin-top:24px;transition:background .15s}
    .btn:hover{background:#1e293b}
    .badge{display:inline-block;background:#dcfce7;color:#166534;border-radius:99px;font-size:11px;font-weight:700;padding:2px 8px;margin-left:6px;vertical-align:middle}
    code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
  </style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <h1>⚙️ Painel de Configuração — Jacy Bot</h1>
    <p>Bot administrativo WhatsApp • Relatórios via IA sobre Banco de Dados, Sheets e Drive</p>
  </div>
  <div class="card-body">
    <form action="/config" method="POST">

      <div class="section">
        <div class="section-title">1 · Grupo do WhatsApp</div>
        ${groupWidget}
      </div>

      <div class="section">
        <div class="section-title">2 · Inteligência Artificial <span class="badge">escolha uma</span></div>

        <label>Provedor</label>
        <select name="AI_PROVIDER" id="providerSelect" onchange="updateLabel()">
          <option value="groq"      ${provider==="groq"?"selected":""}>Groq / Llama 3 — Grátis, muito rápido</option>
          <option value="gemini"    ${provider==="gemini"?"selected":""}>Google Gemini Flash — Grátis, contexto longo</option>
          <option value="anthropic" ${provider==="anthropic"?"selected":""}>Anthropic Claude Haiku — Pago, mais inteligente</option>
        </select>
        <p class="hint">Recomendação de custo: <b>Groq</b> para uso geral, <b>Gemini</b> para documentos grandes, <b>Claude Haiku</b> para respostas mais precisas.</p>

        <label id="keyLabel">${keyLabel}</label>
        <input type="password" name="AI_API_KEY" value="${env.AI_API_KEY||""}" placeholder="Cole sua chave aqui">
      </div>

      <div class="section">
        <div class="section-title">3 · Banco de Dados PostgreSQL</div>
        <label>String de conexão <code>DATABASE_URL</code></label>
        <input type="text" name="DATABASE_URL" value="${env.DATABASE_URL||""}" placeholder="postgres://usuario:senha@host:5432/banco">
        <p class="hint">Serviço gratuito recomendado: <a href="https://neon.tech" target="_blank">neon.tech</a> (0.5 GB grátis)</p>
      </div>

      <div class="section">
        <div class="section-title">4 · Google Sheets</div>
        <label>ID da planilha <code>SPREADSHEET_ID</code></label>
        <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID||""}" placeholder="Ex: 1BxiMVs0XRA5nFMdKvBAnbn4oASs0FHa">
        <p class="hint">O ID fica na URL da planilha: <code>docs.google.com/spreadsheets/d/<b>ID_AQUI</b>/edit</code></p>
      </div>

      <div class="section">
        <div class="section-title">5 · Google Drive</div>
        <label>ID da pasta <code>GOOGLE_DRIVE_FOLDER_ID</code></label>
        <input type="text" name="GOOGLE_DRIVE_FOLDER_ID" value="${env.GOOGLE_DRIVE_FOLDER_ID||""}" placeholder="Ex: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ">
        <p class="hint">Abra a pasta no Drive — o ID está no final da URL do navegador.</p>
      </div>

      <div class="section">
        <div class="section-title">6 · Conta de Serviço Google (Service Account)</div>
        <p class="hint" style="margin-bottom:12px">
          Necessário para acessar Sheets e Drive. Faça o upload do arquivo <code>.json</code> baixado
          do <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank">Google Cloud Console</a>.
          Depois compartilhe a planilha e a pasta do Drive com o e-mail da service account.
        </p>
        <div class="drop-zone" onclick="document.getElementById('jsonFile').click()">
          <span>📎 Clique para selecionar o arquivo <b>credentials.json</b></span>
          <input type="file" id="jsonFile" accept=".json">
        </div>
        <textarea name="GOOGLE_CREDENTIALS_JSON" id="credJson" rows="3"
          style="margin-top:10px;font-family:monospace;font-size:11px"
          placeholder="O conteúdo do arquivo JSON aparecerá aqui automaticamente após o upload acima..."
        >${env.GOOGLE_CREDENTIALS_JSON||""}</textarea>

        <label style="margin-top:14px">URL pública do Cloudflare Tunnel <code>BASE_URL</code></label>
        <input type="text" name="BASE_URL" value="${env.BASE_URL||""}" placeholder="https://xxxx.trycloudflare.com">
        <p class="hint">Gerada automaticamente ao iniciar o bot. Copie do terminal e cole aqui para que links de PDF funcionem no WhatsApp.</p>
      </div>

      <button type="submit" class="btn">💾 Salvar e reiniciar bot</button>
    </form>
  </div>
</div>

<script>
const labels = {
  groq:      "Chave Groq (começa com <code>gsk_</code>) — <a href='https://console.groq.com/keys' target='_blank'>obter grátis ↗</a>",
  gemini:    "Chave Google AI Studio (começa com <code>AIza</code>) — <a href='https://aistudio.google.com/app/apikey' target='_blank'>obter grátis ↗</a>",
  anthropic: "Chave Anthropic (começa com <code>sk-ant-</code>) — <a href='https://console.anthropic.com/keys' target='_blank'>obter chave ↗</a>",
};
function updateLabel() {
  const p = document.getElementById("providerSelect").value;
  document.getElementById("keyLabel").innerHTML = labels[p] || "Chave de API";
}
document.getElementById("jsonFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const obj = JSON.parse(evt.target.result);
      document.getElementById("credJson").value = JSON.stringify(obj);
    } catch {
      alert("Arquivo inválido. Selecione o .json baixado do Google Cloud.");
      e.target.value = "";
    }
  };
  reader.readAsText(file);
});
</script>
</body>
</html>`;
}

// ── Servidor ────────────────────────────────────────────────────────────────────
function startServer() {
  const server = http.createServer((req, res) => {

    // GET /config — exibe painel
    if (req.url === "/config" && req.method === "GET") {
      const env = readEnv();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildPanel(env, currentPort));
      return;
    }

    // POST /config — salva .env e reinicia
    if (req.url === "/config" && req.method === "POST") {
      let body = "";
      req.on("data", c => { body += c.toString(); });
      req.on("end", () => {
        const form   = querystring.parse(body);
        const oldEnv = readEnv();
        writeEnv({ ...oldEnv, ...form });

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
          <title>Salvo!</title>
          <style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;margin:0}
          .box{text-align:center;background:#fff;padding:40px 48px;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
          h2{color:#166534;margin-bottom:12px}p{color:#475569;font-size:14px;line-height:1.6}</style></head>
          <body><div class="box">
            <h2>✅ Configurações salvas!</h2>
            <p>O bot será reiniciado automaticamente.<br>Feche e abra novamente o <b>iniciar.bat</b>.</p>
          </div></body></html>`);

        setTimeout(() => process.exit(0), 1500);
      });
      return;
    }

    // GET /reports/:filename — download de PDF
    if (req.url.startsWith("/reports/")) {
      const filename = path.basename(req.url.slice("/reports/".length));
      const filepath = path.join(REPORTS_DIR, filename);
      if (!filename.endsWith(".pdf") || !fs.existsSync(filepath)) {
        res.writeHead(404); res.end("PDF não encontrado"); return;
      }
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      fs.createReadStream(filepath).pipe(res);
      return;
    }

    // Redireciona tudo para o painel
    res.writeHead(302, { Location: "/config" });
    res.end();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      currentPort++;
      server.listen(currentPort);
    }
  });

  server.listen(currentPort, () => {
    const url = `http://localhost:${currentPort}/config`;
    console.log(`\n🛠️  Painel admin: ${url}`);
    // Abre navegador no Windows
    exec(`start "" "${url}"`, () => {});
    // Abre tunnel Cloudflare em segundo plano
    exec(`start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:${currentPort}"`, () => {});
  });
}

module.exports = { startServer };
