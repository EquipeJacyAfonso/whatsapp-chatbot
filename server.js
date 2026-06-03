/**
 * Servidor HTTP: Serve PDFs gerados e Interface de Configuração do .env
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
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  content.split("\n").forEach((line) => {
    const [key, ...values] = line.split("=");
    if (key && key.trim() && !key.startsWith("#")) {
      env[key.trim()] = values.join("=").trim();
    }
  });
  return env;
}

function saveEnvVariables(newEnv) {
  let content = "";
  for (const [key, value] of Object.entries(newEnv)) {
    // Garante que não haverá quebras de linha dentro do valor de cada variável no arquivo final
    const cleanedValue = value.replace(/\r?\n|\r/g, "");
    content += `${key}=${cleanedValue}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

function startServer() {
  const server = http.createServer((req, res) => {
    
    if (req.url === "/config" && req.method === "GET") {
      const env = getEnvVariables();
      
      let groupsHtml = `
        <div style="background: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffe69c; color: #664d03; margin-top: 5px;">
          ⚠️ <b>Nenhum grupo encontrado.</b><br>
          Vá no terminal (tela preta), escaneie o QR Code do WhatsApp e depois <a href="/config" style="color:#664d03; font-weight:bold;">recarregue esta página</a>.
        </div>
      `;

      if (fs.existsSync(GROUPS_PATH)) {
        try {
          const groups = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
          if (groups.length > 0) {
            groupsHtml = `
              <select name="GROUP_ID" required>
                <option value="">-- Selecione o Grupo do Bot --</option>
                ${groups.map(g => `<option value="${g.id}" ${env.GROUP_ID === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
              </select>
              <div class="hint">Selecione em qual grupo o bot deve responder.</div>
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
          <title>Configuração do Jacy Bot</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
            .container { max-width: 600px; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: auto; }
            h1 { color: #1a1a2e; text-align: center; }
            label { font-weight: bold; display: block; margin-top: 20px; }
            input[type="text"], input[type="password"], textarea, select { width: 100%; padding: 12px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
            input[type="file"] { margin-top: 5px; font-size: 14px; }
            button { background: #d32f2f; color: white; border: none; padding: 15px; width: 100%; margin-top: 25px; font-size: 16px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            button:hover { background: #b71c1c; }
            .hint { font-size: 12px; color: #666; margin-top: 4px; }
            .file-upload-box { background: #f9f9f9; padding: 15px; border: 1px dashed #bbb; border-radius: 4px; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚙️ Configuração do Chatbot</h1>
            <form action="/config" method="POST">
              
              <label>📱 Seleção do Grupo (WhatsApp)</label>
              ${groupsHtml}

              <label>🧠 API Key da Inteligência Artificial</label>
              <input type="password" name="GROQ_API_KEY" value="${env.GROQ_API_KEY || ''}" placeholder="gsk_...">
              <div class="hint">Crie a sua chave gratuita no Groq Console.</div>
              
              <label>🗄️ Link do Banco de Dados (PostgreSQL)</label>
              <input type="text" name="DATABASE_URL" value="${env.DATABASE_URL || ''}" placeholder="postgres://user:pass@host/db">
              
              <label>📊 ID da Planilha Google</label>
              <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID || ''}">
              
              <label>🔑 Credenciais JSON do Google Cloud (Service Account)</label>
              <div class="file-upload-box">
                <span style="font-size: 13px; color: #555; display: block; margin-bottom: 5px;">Selecione o arquivo .json baixado para conversão automática:</span>
                <input type="file" id="json_file" accept=".json">
              </div>
              <textarea id="google_json_textarea" name="GOOGLE_CREDENTIALS_JSON" rows="4" style="margin-top: 10px;" placeholder='O conteúdo do arquivo aparecerá aqui formatado em uma única linha...' required>${env.GOOGLE_CREDENTIALS_JSON || ''}</textarea>
              <div class="hint">O arquivo enviado acima será automaticamente transformado em uma linha contínua segura para o arquivo .env.</div>

              <button type="submit">Salvar e Reiniciar Bot</button>
            </form>
          </div>

          <script>
            // Escuta o upload do arquivo JSON
            document.getElementById('json_file').addEventListener('change', function(e) {
              const file = e.target.files[0];
              if (!file) return;
              
              const reader = new FileReader();
              reader.onload = function(evt) {
                try {
                  const jsonObj = JSON.parse(evt.target.result);
                  // Minimiza todo o JSON transformando-o em apenas uma linha contínua
                  document.getElementById('google_json_textarea').value = JSON.stringify(jsonObj);
                } catch (err) {
                  alert('Erro: O arquivo selecionado não contém um JSON válido. Certifique-se de carregar o arquivo .json baixado corretamente do painel do Google Cloud.');
                  e.target.value = ''; // Limpa o input em caso de erro
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
          <div style="font-family: Arial; text-align: center; margin-top: 50px;">
            <h2 style="color: green;">✅ Configurações Salvas com Sucesso!</h2>
            <p>O painel será fechado. Reinicie o arquivo <b>iniciar.bat</b> para aplicar as mudanças.</p>
          </div>
        `);
        setTimeout(() => process.exit(0), 3000);
      });
      return;
    }

    if (req.url.startsWith("/reports/")) {
      const filename = path.basename(req.url.replace("/reports/", ""));
      const filepath = path.join(REPORTS_DIR, filename);

      if (!fs.existsSync(filepath) || !filename.endsWith(".pdf")) {
        res.writeHead(404);
        res.end("PDF não encontrado");
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
      console.log(`⚠️  Porta ${currentPort} ocupada. Tentando a porta ${currentPort + 1}...`);
      currentPort++;
      server.listen(currentPort);
    } else {
      console.error("❌ Erro no servidor HTTP:", err.message);
    }
  });

  server.listen(currentPort, () => {
    console.log(`\n🛠  Painel de Configuração aberto em: http://localhost:${currentPort}/config`);
    exec(`start "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:${currentPort}"`);
    exec(`start http://localhost:${currentPort}/config`);
  });
}

module.exports = { startServer };