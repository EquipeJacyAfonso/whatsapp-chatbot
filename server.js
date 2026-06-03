/**
 * Servidor HTTP: Painel Administrativo de Configuração Visual (.env)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { exec } = require("child_process");

const REPORTS_DIR = path.join(__dirname, process.env.REPORTS_DIR || "reports");
const ENV_PATH = path.join(__dirname, ".env");
const GROUPS_PATH = path.join(__dirname, "grupos.json");

let currentPort = parseInt(process.env.PORT || 3000, 10);

if (!fs.existsSync(ENV_PATH)) {
  fs.writeFileSync(ENV_PATH, "");
}

function getEnvVariables() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const firstEq = trimmed.indexOf("=");
      const key = trimmed.substring(0, firstEq).trim();
      const value = trimmed.substring(firstEq + 1).trim();
      env[key] = value;
    }
  });
  return env;
}

function saveEnvVariables(newEnv) {
  let content = "";
  for (const [key, value] of Object.entries(newEnv)) {
    const cleanedValue = value.replace(/\r?\n|\r/g, "");
    content += `${key}=${cleanedValue}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

function startServer() {
  const server = http.createServer((req, res) => {
    
    // Rota Principal da Interface (GET)
    if (req.url === "/config" && req.method === "GET") {
      const env = getEnvVariables();
      
      let groupsHtml = `
        <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border: 1px solid #ffe69c; color: #664d03; margin-top: 5px; font-size: 14px;">
          ⏳ <b>Aguardando conexão com o WhatsApp...</b><br>
          Abra o terminal (tela preta), escaneie o QR Code com o seu celular e depois <a href="/config" style="color:#664d03; font-weight:bold; text-decoration: underline;">atualize esta página</a> para escolher o grupo.
        </div>
      `;

      if (fs.existsSync(GROUPS_PATH)) {
        try {
          const groups = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
          if (groups.length > 0) {
            groupsHtml = `
              <select name="GROUP_ID" required style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;">
                <option value="">-- Selecione o Grupo Alvo do Bot --</option>
                ${groups.map(g => `<option value="${g.id}" ${env.GROUP_ID === g.id ? 'selected' : ''}>${g.name} (${g.id.split('@')[0]})</option>`).join('')}
              </select>
              <div class="hint">O bot ignorará mensagens de fora deste grupo selecionado.</div>
            `;
          }
        } catch (e) {
          console.error("Erro ao ler grupos.json", e);
        }
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Painel do Jacy Bot</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; margin: 0; padding: 40px 20px; color: #333; }
            .container { max-width: 650px; background: #fff; padding: 35px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin: auto; }
            h1 { color: #1e293b; text-align: center; margin-top: 0; font-size: 26px; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; }
            h3 { color: #475569; margin-top: 25px; border-left: 4px solid #0284c7; padding-left: 10px; font-size: 16px; }
            label { font-weight: 600; display: block; margin-top: 15px; color: #475569; font-size: 14px; }
            input[type="text"], input[type="password"], textarea, select { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 14px; background: #f8fafc; transition: all 0.2s; }
            input:focus, textarea:focus, select:focus { border-color: #0284c7; background: #fff; outline: none; box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1); }
            button { background: #0284c7; color: white; border: none; padding: 15px; width: 100%; margin-top: 30px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
            button:hover { background: #0369a1; }
            .hint { font-size: 12px; color: #64748b; margin-top: 5px; }
            .file-box { background: #f1f5f9; padding: 15px; border: 2px dashed #cbd5e1; border-radius: 6px; margin-top: 6px; text-align: center; }
            .provider-select { background: #e2e8f0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚙️ Painel de Configuração — Jacy Bot</h1>
            <form action="/config" method="POST">
              
              <h3>1. Vinculação de Canal</h3>
              <label>Grupo do WhatsApp Monitorado</label>
              ${groupsHtml}

              <h3>2. Provedor de Inteligência Artificial (Mais Econômicos)</h3>
              <label>Escolha o Provedor Ativo</label>
              <select name="AI_PROVIDER" class="provider-select">
                <option value="groq" ${env.AI_PROVIDER === 'groq' ? 'selected' : ''}>Groq / Llama 3 (Custo: Gratuito / Mais Rápido)</option>
                <option value="gemini" ${env.AI_PROVIDER === 'gemini' ? 'selected' : ''}>Google AI Studio / Gemini Flash (Custo: Gratuito / Maior Contexto)</option>
                <option value="anthropic" ${env.AI_PROVIDER === 'anthropic' ? 'selected' : ''}>Anthropic / Claude 3.5 Haiku (Custo: Ultra Baixo / Mais Inteligente)</option>
              </select>

              <label>Chave de API (API Key)</label>
              <input type="password" name="AI_API_KEY" value="${env.AI_API_KEY || ''}" placeholder="Cole sua chave aqui (gsk_..., AIza..., or sk-ant-...)">
              <div class="hint">Obtenha sua chave no console da IA selecionada.</div>

              <h3>3. Armazenamento e Bancos de Dados</h3>
              <label>String de Conexão PostgreSQL (DATABASE_URL)</label>
              <input type="text" name="DATABASE_URL" value="${env.DATABASE_URL || ''}" placeholder="postgres://usuario:senha@host:porta/banco">

              <label>ID da Planilha Google (Sheets)</label>
              <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID || ''}" placeholder="Ex: 1BxiMVs0XRA5nFMdKvXdBAnbn...">

              <h3>4. Integração Google Cloud</h3>
              <label>Credenciais de Conta de Serviço (.json)</label>
              <div class="file-box">
                <span style="font-size: 13px; color: #475569; display: block; margin-bottom: 8px;">Arraste ou selecione o arquivo JSON original do Google:</span>
                <input type="file" id="upload_json" accept=".json">
              </div>
              <textarea id="output_json" name="GOOGLE_CREDENTIALS_JSON" rows="3" style="margin-top: 12px; font-family: monospace; font-size: 11px;" placeholder="O arquivo enviado acima será convertido em uma única linha contínua aqui automaticamente..." required>${env.GOOGLE_CREDENTIALS_JSON || ''}</textarea>

              <button type="submit">💾 Salvar Configurações e Aplicar</button>
            </form>
          </div>

          <script>
            document.getElementById('upload_json').addEventListener('change', function(e) {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = function(evt) {
                try {
                  const obj = JSON.parse(evt.target.result);
                  document.getElementById('output_json').value = JSON.stringify(obj);
                } catch (err) {
                  alert('O arquivo selecionado não é um JSON válido do Google Cloud.');
                  e.target.value = '';
                }
              };
              reader.readAsText(file);
            });
          </script>
        </body>
        </html>
      `);
      return;
    }

    // Gravação das configurações (POST)
    if (req.url === "/config" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk.toString(); });
      req.on("end", () => {
        const formData = querystring.parse(body);
        const currentEnv = getEnvVariables();
        const newEnv = { ...currentEnv, ...formData };
        saveEnvVariables(newEnv);
        
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 60px; color: #1e293b;">
            <h2 style="color: #10b981;">✅ Configurações Salvas com Sucesso!</h2>
            <p>A janela do terminal do bot foi encerrada para limpeza de cache.</p>
            <p style="font-weight: bold; color: #475569;">Por favor, execute o arquivo <u>iniciar.bat</u> novamente na sua pasta para ativar o bot.</p>
          </div>
        `);
        setTimeout(() => process.exit(0), 2500); // Mata o processo atual para forçar o reinício limpo
      });
      return;
    }

    // Download de PDFs gerados
    if (req.url.startsWith("/reports/")) {
      const filename = path.basename(req.url.replace("/reports/", ""));
      const filepath = path.join(REPORTS_DIR, filename);

      if (!fs.existsSync(filepath) || !filename.endsWith(".pdf")) {
        res.writeHead(404);
        res.end("Relatório não encontrado");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      fs.createReadStream(filepath).pipe(res);
      return;
    }

    res.writeHead(302, { Location: "/config" });
    res.end();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️  Porta ${currentPort} ocupada. Tentando automaticamente a porta ${currentPort + 1}...`);
      currentPort++;
      server.listen(currentPort);
    } else {
      console.error("❌ Erro fatal no servidor HTTP:", err.message);
    }
  });

  server.listen(currentPort, () => {
    console.log(`\n=============================================================`);
    console.log(`🛠️  PAINEL ADMIN ATIVO: http://localhost:${currentPort}/config`);
    console.log(`=============================================================`);
    
    // Dispara a abertura automática das janelas na porta correta
    exec(`start "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:${currentPort}"`);
    exec(`start http://localhost:${currentPort}/config`);
  });
}

module.exports = { startServer };