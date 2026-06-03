/**
 * Servidor HTTP: Painel Administrativo de Configuração Visual (.env)
 * COM SUPORTE A WEBSOCKETS (Socket.IO) PARA QR CODE EM TEMPO REAL
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { exec } = require("child_process");
const { Server } = require("socket.io"); // <-- NOVO

const REPORTS_DIR = path.join(__dirname, process.env.REPORTS_DIR || "reports");
const ENV_PATH = path.join(__dirname, ".env");
const GROUPS_PATH = path.join(__dirname, "grupos.json");

let currentPort = parseInt(process.env.PORT || 3000, 10);
let io; // Variável global para o Socket.IO

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
      
      let groupsHtml = ``;
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
            
            /* Status Box Dynamics */
            #status-box { background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffe69c; color: #664d03; margin-top: 15px; text-align: center; transition: all 0.3s; }
            #qr-image { margin-top: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: none; margin-left: auto; margin-right: auto; }
          </style>
          
          <script src="/socket.io/socket.io.js"></script>
        </head>
        <body>
          <div class="container">
            <h1>⚙️ Painel de Configuração — Jacy Bot</h1>
            
            <div id="status-box">
              <span id="status-text">⏳ <b>Aguardando comunicação com o núcleo do WhatsApp...</b></span>
              <img id="qr-image" src="" alt="QR Code WhatsApp">
            </div>

            <form action="/config" method="POST">
              
              <h3>1. Vinculação de Canal</h3>
              <label>Grupo do WhatsApp Monitorado</label>
              ${groupsHtml || '<div class="hint" style="color:#ef4444;">Nenhum grupo sincronizado ainda. Conecte o WhatsApp primeiro.</div>'}

              <h3>2. Provedor de Inteligência Artificial</h3>
              <label>Escolha o Provedor Ativo</label>
              <select name="AI_PROVIDER" class="provider-select">
                <option value="groq" ${env.AI_PROVIDER === 'groq' ? 'selected' : ''}>Groq / Llama 3 (Custo: Gratuito)</option>
                <option value="gemini" ${env.AI_PROVIDER === 'gemini' ? 'selected' : ''}>Gemini Flash (Custo: Gratuito)</option>
                <option value="anthropic" ${env.AI_PROVIDER === 'anthropic' ? 'selected' : ''}>Claude 3.5 Haiku (Ultra Baixo)</option>
              </select>

              <label>Chave de API (API Key)</label>
              <input type="password" name="AI_API_KEY" value="${env.AI_API_KEY || ''}" placeholder="Cole sua chave aqui (gsk_..., AIza..., ou sk-ant-...)">
              
              <h3>3. Armazenamento e Bancos de Dados</h3>
              <label>String de Conexão PostgreSQL (DATABASE_URL)</label>
              <input type="text" name="DATABASE_URL" value="${env.DATABASE_URL || ''}" placeholder="postgres://usuario:senha@host:porta/banco">

              <label>📊 ID da Planilha Google (Sheets)</label>
              <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID || ''}" placeholder="Ex: 1BxiMVs0XRA5nFMdKvXdBAnbn...">

              <label>📁 ID da Pasta do Google Drive (GOOGLE_DRIVE_FOLDER_ID)</label>
              <input type="text" name="GOOGLE_DRIVE_FOLDER_ID" value="${env.GOOGLE_DRIVE_FOLDER_ID || ''}" placeholder="Ex: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ...">
              
              <h3>4. Integração Google Cloud</h3>
              <div class="file-box">
                <span style="font-size: 13px; color: #475569; display: block; margin-bottom: 8px;">Arraste ou selecione o arquivo JSON original do Google:</span>
                <input type="file" id="upload_json" accept=".json">
              </div>
              <textarea id="output_json" name="GOOGLE_CREDENTIALS_JSON" rows="3" style="margin-top: 12px; font-family: monospace; font-size: 11px;" placeholder="O arquivo enviado acima será convertido aqui..." required>${env.GOOGLE_CREDENTIALS_JSON || ''}</textarea>

              <button type="submit">💾 Salvar Configurações e Aplicar</button>
            </form>
          </div>

          <script>
            // Lógica do arquivo JSON
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

            // Comunicação Real-time (WebSocket)
            const socket = io();
            const statusBox = document.getElementById('status-box');
            const statusText = document.getElementById('status-text');
            const qrImage = document.getElementById('qr-image');

            socket.on('qr', (base64Data) => {
              statusBox.style.background = '#e0f2fe';
              statusBox.style.borderColor = '#bae6fd';
              statusBox.style.color = '#0c4a6e';
              statusText.innerHTML = '📱 <b>Abra o WhatsApp no celular e escaneie o código abaixo:</b>';
              qrImage.src = base64Data;
              qrImage.style.display = 'block';
            });

            socket.on('connected', () => {
              statusBox.style.background = '#dcfce7';
              statusBox.style.borderColor = '#bbf7d0';
              statusBox.style.color = '#14532d';
              statusText.innerHTML = '✅ <b>WhatsApp conectado com sucesso!</b> (Atualizando grupos...)';
              qrImage.style.display = 'none';
              
              // Recarrega a página automaticamente após 3 segundos para popular o select de grupos
              setTimeout(() => {
                window.location.reload();
              }, 3000);
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
            <p>O bot será reiniciado com as novas configurações.</p>
            <p style="font-weight: bold; color: #475569;">Pode fechar esta janela ou aguardar a reconexão automática do painel.</p>
          </div>
          <script>setTimeout(() => window.location.href="/config", 4000);</script>
        `);
        setTimeout(() => process.exit(0), 1500);
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

  // Inicializa o Socket.IO acoplado ao Servidor HTTP
  io = new Server(server);
  io.on("connection", (socket) => {
    // console.log("Interface Web conectada ao Socket.");
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
    
    // Abre no navegador silenciosamente
    exec(`start http://localhost:${currentPort}/config`);
  });
}

// Função para permitir que o bot.js pegue a instância do Socket.IO e envie eventos
function getIo() {
  return io;
}

module.exports = { startServer, getIo };