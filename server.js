/**
 * Servidor HTTP simples para servir os PDFs gerados
 * Roda junto com o bot na porta 3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(__dirname, process.env.REPORTS_DIR || "reports");
const PORT = process.env.PORT || 3000;

function startServer() {
  const server = http.createServer((req, res) => {
    // Só serve arquivos da rota /reports/
    if (!req.url.startsWith("/reports/")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

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
  });

  server.listen(PORT, () => {
    console.log(`📄 Servidor de PDFs rodando em http://localhost:${PORT}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️  Porta ${PORT} ocupada. Tentando porta ${PORT + 1}...`);
      server.listen(PORT + 1);
    } else {
      console.error("Erro no servidor:", err.message);
    }
  });
}

module.exports = { startServer };
