/**
 * Servidor HTTP Centralizado: Painel Administrativo, Configurações (.env),
 * Assistente de Instalação (Wizard), Dashboard Real-time e WebSockets.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { exec } = require("child_process");
const { Server } = require("socket.io");

// Centralização de Caminhos (Compatível com .exe)
const ROOT_DIR = process.cwd();
const REPORTS_DIR = path.join(ROOT_DIR, process.env.REPORTS_DIR || "reports");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const GROUPS_PATH = path.join(ROOT_DIR, "grupos.json");

let currentPort = parseInt(process.env.PORT || 3000, 10);
let io;

if (!fs.existsSync(ENV_PATH)) {
  fs.writeFileSync(ENV_PATH, "");
}

// Gerenciador do Arquivo Único de Configurações (.env)
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
    
    // ROTA GET: Interface Gráfica Unificada (Wizard ou Dashboard)
    if (req.url === "/config" && req.method === "GET") {
      const env = getEnvVariables();
      // O sistema decide se abre o Dashboard ou o Instalador com base nas chaves essenciais
      const isConfigured = env.GROUP_ID && env.AI_API_KEY && env.SPREADSHEET_ID;

      let initialGroups = [];
      if (fs.existsSync(GROUPS_PATH)) {
        try { initialGroups = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8")); } 
        catch (e) {}
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Painel Central — JacyBot</title>
          <style>
            body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f1f5f9; margin: 0; padding: 40px 20px; color: #1e293b; }
            .container { max-width: 700px; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); margin: auto; }
            h1 { color: #0f172a; text-align: center; font-size: 24px; margin-top: 0; margin-bottom: 30px; }
            h3 { color: #334155; margin-top: 25px; border-left: 4px solid #3b82f6; padding-left: 10px; font-size: 16px; }
            
            /* Wizard Steps */
            .step { display: none; }
            .step.active { display: block; animation: fadeIn 0.4s ease; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            
            /* Inputs e UI */
            label { font-weight: 600; display: block; margin-top: 20px; color: #334155; font-size: 14px; }
            input, select, textarea { width: 100%; padding: 14px; margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-size: 14px; background: #f8fafc; transition: all 0.2s; }
            input:focus, select:focus, textarea:focus { border-color: #3b82f6; outline: none; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); background: #fff; }
            .hint { font-size: 12px; color: #64748b; margin-top: 6px; }
            .file-box { background: #f1f5f9; padding: 15px; border: 2px dashed #cbd5e1; border-radius: 6px; margin-top: 6px; text-align: center; }
            
            /* Botões */
            .btn-group { display: flex; justify-content: space-between; margin-top: 30px; }
            button { padding: 14px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; border: none; font-size: 14px; }
            .btn-primary { background: #3b82f6; color: white; width: 100%; }
            .btn-primary:hover { background: #2563eb; }
            .btn-secondary { background: #e2e8f0; color: #475569; width: 48%; }
            .btn-secondary:hover { background: #cbd5e1; }
            .btn-next { background: #10b981; color: white; width: 48%; }
            .btn-next:hover { background: #059669; }
            
            /* Status e Terminal */
            #status-box { background: #fef9c3; padding: 20px; border-radius: 12px; border: 1px solid #fef08a; color: #854d0e; text-align: center; margin-bottom: 20px; }
            #qr-image { margin-top: 20px; border-radius: 8px; display: none; margin-left: auto; margin-right: auto; max-width: 250px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .terminal { background: #0f172a; color: #38bdf8; font-family: monospace; padding: 15px; border-radius: 8px; height: 300px; overflow-y: auto; font-size: 13px; line-height: 1.5; margin-top: 20px; }
            .terminal p { margin: 4px 0; }
            .log-user { color: #f472b6; }
            .log-bot { color: #34d399; }
            .log-sys { color: #94a3b8; }
          </style>
          <script src="/socket.io/socket.io.js"></script>
        </head>
        <body>
          <div class="container">
            
            <!-- FORMULÁRIO 1: ASSISTENTE DE CONFIGURAÇÃO (WIZARD) -->
            <form action="/config" method="POST" id="wizard-form" style="display: ${isConfigured ? 'none' : 'block'};">
              <h1>🚀 Assistente de Instalação — JacyBot</h1>
              
              <!-- Passo 1: WhatsApp -->
              <div class="step active" id="step-1">
                <h3>Passo 1: Vinculação do WhatsApp</h3>
                <div id="status-box">
                  <span id="status-text">⏳ <b>Conectando ao núcleo do WhatsApp...</b></span>
                  <img id="qr-image" src="" alt="QR Code WhatsApp">
                </div>
                <div id="group-container">
                  <div class="hint" style="color:#ef4444;">⚠️ Conecte o WhatsApp para listar e selecionar o grupo alvo da campanha.</div>
                </div>
                <div class="btn-group">
                  <button type="button" class="btn-secondary" style="visibility:hidden;">Voltar</button>
                  <button type="button" class="btn-next" onclick="nextStep(1)">Avançar ➔</button>
                </div>
              </div>

              <!-- Passo 2: Inteligência Artificial -->
              <div class="step" id="step-2">
                <h3>Passo 2: Configuração do Cérebro (IA)</h3>
                <label>Provedor de Inteligência Artificial</label>
                <select name="AI_PROVIDER">
                  <option value="gemini" ${env.AI_PROVIDER === 'gemini' ? 'selected' : ''}>Google Gemini Flash (Recomendado / Estável)</option>
                  <option value="groq" ${env.AI_PROVIDER === 'groq' ? 'selected' : ''}>Groq / Llama 3 (Rápido)</option>
                  <option value="anthropic" ${env.AI_PROVIDER === 'anthropic' ? 'selected' : ''}>Anthropic Claude (Alta Precisão)</option>
                </select>
                
                <label>Chave de API (API Key)</label>
                <input type="password" name="AI_API_KEY" value="${env.AI_API_KEY || ''}" placeholder="Cole sua chave (AIza..., gsk_..., ou sk-...)" required>
                <div class="hint">Gerada gratuitamente nos painéis dos respectivos provedores.</div>
                
                <div class="btn-group">
                  <button type="button" class="btn-secondary" onclick="prevStep(2)">🡨 Voltar</button>
                  <button type="button" class="btn-next" onclick="nextStep(2)">Avançar ➔</button>
                </div>
              </div>

              <!-- Passo 3: Google Data Hub -->
              <div class="step" id="step-3">
                <h3>Passo 3: Conexão com Dados da Campanha</h3>
                <label>📊 ID da Planilha Google (Google Sheets)</label>
                <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID || ''}" placeholder="Ex: 1BxiMVs0XRA5nFMd..." required>
                
                <label>📁 ID da Pasta do Google Drive (Opcional)</label>
                <input type="text" name="GOOGLE_DRIVE_FOLDER_ID" value="${env.GOOGLE_DRIVE_FOLDER_ID || ''}" placeholder="Ex: 1aBcDeFgHiJk...">

                <label>📅 ID da Agenda Google Calendar (Opcional)</label>
                <input type="text" name="CALENDAR_ID" value="${env.CALENDAR_ID || ''}" placeholder="Ex: seu-email@gmail.com ou primary">
                
                <label>🔑 Credenciais Google Cloud (JSON)</label>
                <div class="file-box">
                  <span style="font-size: 13px; color: #475569; display: block; margin-bottom: 8px;">Arraste ou selecione o arquivo de chaves .json:</span>
                  <input type="file" id="upload_json" accept=".json">
                </div>
                <textarea id="output_json" name="GOOGLE_CREDENTIALS_JSON" rows="3" style="margin-top: 12px; font-family: monospace; font-size: 11px;" placeholder="O conteúdo do arquivo JSON aparecerá aqui...">${env.GOOGLE_CREDENTIALS_JSON || ''}</textarea>

                <div class="btn-group">
                  <button type="button" class="btn-secondary" onclick="prevStep(3)">🡨 Voltar</button>
                  <button type="submit" class="btn-primary">💾 Salvar Configurações e Lançar Bot</button>
                </div>
              </div>
            </form>

            <!-- INTERFACE 2: DASHBOARD DE OPERAÇÃO CENTRALIZADO -->
            <div id="dashboard" style="display: ${isConfigured ? 'block' : 'none'};">
              <h1>🤖 Central de Operações — JacyBot</h1>
              
              <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div>
                  <span style="display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Status da Conexão</span>
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <div id="status-dot" style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b;"></div>
                    <span id="dash-status-text" style="font-weight: 600; color: #334155;">Sincronizando...</span>
                  </div>
                </div>
                <button onclick="document.getElementById('dashboard').style.display='none'; document.getElementById('wizard-form').style.display='block';" style="background: transparent; color: #3b82f6; border: 1px solid #3b82f6; padding: 10px 20px; width: auto;">⚙️ Modificar Ajustes</button>
              </div>

              <label style="margin-top:25px;">Terminal de Atividades do Robô (Ao vivo):</label>
              <div class="terminal" id="terminal-logs">
                <p class="log-sys">>> Núcleo JacyBot carregado com sucesso.</p>
                <p class="log-sys">>> Aguardando interações no WhatsApp...</p>
              </div>
            </div>

          </div>

          <script>
            // Lógica do Assistente Passo a Passo
            function nextStep(current) {
              document.getElementById('step-' + current).classList.remove('active');
              document.getElementById('step-' + (current + 1)).classList.add('active');
            }
            function prevStep(current) {
              document.getElementById('step-' + current).classList.remove('active');
              document.getElementById('step-' + (current - 1)).classList.add('active');
            }

            // Conversor do Arquivo JSON do Google
            document.getElementById('upload_json').addEventListener('change', function(e) {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = function(evt) {
                try {
                  const obj = JSON.parse(evt.target.result);
                  document.getElementById('output_json').value = JSON.stringify(obj);
                } catch (err) {
                  alert('Arquivo JSON inválido.');
                  e.target.value = '';
                }
              };
              reader.readAsText(file);
            });

            // Lógica de Comunicação em Tempo Real (WebSocket)
            const socket = io();
            const savedGroupId = "${env.GROUP_ID || ''}";
            
            const statusBox = document.getElementById('status-box');
            const statusText = document.getElementById('status-text');
            const qrImage = document.getElementById('qr-image');
            const dashDot = document.getElementById('status-dot');
            const dashText = document.getElementById('dash-status-text');
            const terminal = document.getElementById('terminal-logs');

            function renderGroups(groups) {
              const container = document.getElementById('group-container');
              if (!groups || groups.length === 0) return;
              
              let html = '<label>Selecione o Grupo Alvo da Campanha</label><select name="GROUP_ID" required>';
              html += '<option value="">-- Escolha um Grupo Oficial --</option>';
              groups.forEach(g => {
                const isSelected = (g.id === savedGroupId) ? 'selected' : '';
                html += \`<option value="\${g.id}" \${isSelected}>\${g.name}</option>\`;
              });
              html += '</select><div class="hint">O JacyBot responderá apenas se for chamado neste grupo escolhido.</div>';
              container.innerHTML = html;
            }

            if(${initialGroups.length} > 0) renderGroups(${JSON.stringify(initialGroups)});

            socket.on('qr', (base64Data) => {
              statusBox.style.background = '#e0f2fe'; statusBox.style.borderColor = '#bae6fd'; statusBox.style.color = '#0c4a6e';
              statusText.innerHTML = '📱 <b>Abra o WhatsApp, vá em "Aparelhos Conectados" e escaneie:</b>';
              qrImage.src = base64Data; qrImage.style.display = 'block';
              
              dashDot.style.background = '#ef4444'; dashDot.style.boxShadow = '0 0 8px #ef4444';
              dashText.innerHTML = 'Desconectado (Aguardando QR Code)';
            });

            socket.on('groups_ready', (groupsList) => {
              renderGroups(groupsList);
              statusBox.style.background = '#dcfce7'; statusBox.style.borderColor = '#bbf7d0'; statusBox.style.color = '#14532d';
              statusText.innerHTML = '✅ <b>WhatsApp pareado com sucesso! Prossiga com as configurações.</b>';
              qrImage.style.display = 'none';
              
              dashDot.style.background = '#10b981'; dashDot.style.boxShadow = '0 0 8px #10b981';
              dashText.innerHTML = 'Online e Pronto';
              addLog('sys', 'WhatsApp autenticado e árvore de canais mapeada.');
            });

            socket.on('log', (data) => { addLog(data.type, data.msg); });

            function addLog(type, msg) {
              const p = document.createElement('p');
              const time = new Date().toLocaleTimeString('pt-BR');
              p.className = 'log-' + type;
              p.innerText = \`[\${time}] \${msg}\`;
              terminal.appendChild(p);
              terminal.scrollTop = terminal.scrollHeight;
            }
          </script>
        </body>
        </html>
      `);
      return;
    }

    // ROTA POST: Gravação centralizada das variáveis de ambiente
    if (req.url === "/config" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk.toString(); });
      req.on("end", () => {
        const formData = querystring.parse(body);
        const currentEnv = getEnvVariables();
        saveEnvVariables({ ...currentEnv, ...formData });
        
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 60px; color: #1e293b;">
            <h2 style="color: #10b981;">✅ Configurações Aplicadas com Sucesso!</h2>
            <p>O JacyBot está reiniciando os motores...</p>
          </div>
          <script>setTimeout(() => window.location.href="/config", 3000);</script>
        `);
        setTimeout(() => process.exit(0), 1000); // Força reinício automático controlado
      });
      return;
    }

    res.writeHead(302, { Location: "/config" });
    res.end();
  });

  io = new Server(server);

  // Escuta Inteligente de Portas Livres
  server.on("listening", () => {
    const portAtiva = server.address().port;
    console.log(`\n=============================================================`);
    console.log(`🛠️  PAINEL ADMIN ATIVO: http://localhost:${portAtiva}/config`);
    console.log(`=============================================================`);
    exec(`start http://localhost:${portAtiva}/config`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      currentPort++;
      server.listen(currentPort);
    } else {
      console.error("❌ Erro fatal no servidor HTTP:", err.message);
    }
  });

  server.listen(currentPort);
}

function getIo() { return io; }
module.exports = { startServer, getIo };