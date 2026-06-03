/**
 * Servidor HTTP: Serve PDFs gerados e Interface de Configuração do .env
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const REPORTS_DIR = path.join(__dirname, process.env.REPORTS_DIR || "reports");
const ENV_PATH = path.join(__dirname, ".env");
const PORT = process.env.PORT || 3000;

// Garante que o arquivo .env exista
if (!fs.existsSync(ENV_PATH)) {
  fs.writeFileSync(ENV_PATH, "");
}

// Lê as variáveis atuais do .env
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

// Salva as variáveis no .env
function saveEnvVariables(newEnv) {
  let content = "";
  for (const [key, value] of Object.entries(newEnv)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

function startServer() {
  const server = http.createServer((req, res) => {
    // Rota da Interface de Configuração (GET)
    if (req.url === "/config" && req.method === "GET") {
      const env = getEnvVariables();
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
            label { font-weight: bold; display: block; margin-top: 15px; }
            input[type="text"], input[type="password"], textarea { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            button { background: #d32f2f; color: white; border: none; padding: 15px; width: 100%; margin-top: 20px; font-size: 16px; border-radius: 4px; cursor: pointer; }
            button:hover { background: #b71c1c; }
            .hint { font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚙️ Configuração do Chatbot</h1>
            <form action="/config" method="POST">
              <label>API Key da IA (Groq ou Gemini)</label>
              <input type="password" name="GROQ_API_KEY" value="${env.GROQ_API_KEY || ''}" placeholder="gsk_...">
              <div class="hint">Recomendado usar Groq (Llama 3) por ser rápido e gratuito.</div>

              <label>ID do Grupo do WhatsApp (GROUP_ID)</label>
              <input type="text" name="GROUP_ID" value="${env.GROUP_ID || ''}" placeholder="Ex: 120363000000000000@g.us">
              
              <label>Link do Banco de Dados (PostgreSQL / Neon.tech)</label>
              <input type="text" name="DATABASE_URL" value="${env.DATABASE_URL || ''}" placeholder="postgres://user:pass@host/db">
              
              <label>ID da Planilha Google (SPREADSHEET_ID)</label>
              <input type="text" name="SPREADSHEET_ID" value="${env.SPREADSHEET_ID || ''}">
              
              <label>Credenciais JSON do Google (Service Account)</label>
              <textarea name="GOOGLE_CREDENTIALS_JSON" rows="4" placeholder='{"type": "service_account", ...}'>${env.GOOGLE_CREDENTIALS_JSON || ''}</textarea>

              <button type="submit">Salvar e Reiniciar Bot</button>
            </form>
          </div>
        </body>
        </html>
      `);
      return;
    }

    // Rota para salvar as configurações (POST)
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
            <p>Por favor, reinicie o <b>iniciar.bat</b> para que o bot leia as novas configurações.</p>
          </div>
        `);
        setTimeout(() => process.exit(0), 3000); // Encerra para forçar o usuário a reiniciar
      });
      return;
    }

    // Rota para baixar PDFs gerados
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

    // Redireciona a raiz para a config
    res.writeHead(302, { Location: "/config" });
    res.end();
  });

  server.listen(PORT, () => {
    console.log(`\n🛠️  Painel de Configuração aberto em: http://localhost:${PORT}/config`);
    console.log(`📄 Servidor de PDFs rodando na mesma porta.`);
  });
}

module.exports = { startServer };