/**
 * Serviço de relatórios
 *  - Gera PDFs profissionais com PDFKit
 *  - Extrai texto de PDFs locais com pdf-parse
 */

const PDFDocument = require("pdfkit");
const pdfParse    = require("pdf-parse");
const fs          = require("fs");
const path        = require("path");

const REPORTS_DIR = path.join(__dirname, "..", process.env.REPORTS_DIR || "reports");
const PDFS_DIR    = path.join(__dirname, "..", "pdfs");

[REPORTS_DIR, PDFS_DIR].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Geração de PDF ─────────────────────────────────────────────────────────────
function generatePDF(titulo, conteudo) {
  return new Promise((resolve, reject) => {
    const ts       = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const safeName = titulo.replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "_").substring(0, 40);
    const filename = `${safeName}_${ts}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    const doc    = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Cabeçalho
    doc.fontSize(9).fillColor("#888888")
       .text("Administração Jacy Afonso — PT/DF", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(20).fillColor("#0f172a")
       .text(titulo, { align: "center" });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#0f172a").lineWidth(1).stroke();
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor("#888888")
       .text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, { align: "center" });
    doc.moveDown(1);

    // Conteúdo — detecta tabelas (linhas com |)
    doc.fontSize(11).fillColor("#000000");
    const linhas      = conteudo.split("\n");
    let tabelaBuf     = [];
    let textoBuf      = [];

    const flushTexto = () => {
      if (!textoBuf.length) return;
      doc.text(textoBuf.join("\n"), { lineGap: 4 });
      doc.moveDown(0.4);
      textoBuf = [];
    };

    const flushTabela = () => {
      if (!tabelaBuf.length) return;
      renderTable(doc, tabelaBuf);
      doc.moveDown(0.4);
      tabelaBuf = [];
    };

    for (const linha of linhas) {
      const isTableRow = linha.includes("|") && linha.split("|").length >= 3;
      const isSep      = /^[-|= ]+$/.test(linha.trim());
      if (isTableRow && !isSep) {
        flushTexto();
        tabelaBuf.push(linha.split("|").map((c) => c.trim()).filter(Boolean));
      } else if (!isSep) {
        flushTabela();
        if (linha.trim()) textoBuf.push(linha.trim());
        else if (textoBuf.length) { flushTexto(); doc.moveDown(0.3); }
      }
    }
    flushTexto();
    flushTabela();

    doc.end();
    stream.on("finish", () => resolve(filename));
    stream.on("error",  reject);
  });
}

function renderTable(doc, data) {
  if (!data.length) return;
  const cols      = Math.max(...data.map((r) => r.length));
  const W         = 495;
  const colW      = W / cols;
  const rowH      = 18;
  const x0        = 50;
  let   y         = doc.y;

  // Cabeçalho escuro
  doc.rect(x0, y, W, rowH).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(8.5);
  (data[0] || []).forEach((cell, i) => {
    doc.text(String(cell), x0 + i * colW + 3, y + 4, { width: colW - 6, lineBreak: false });
  });

  // Linhas de dados
  data.slice(1).forEach((row, ri) => {
    y += rowH;
    doc.rect(x0, y, W, rowH).fill(ri % 2 === 0 ? "#ffffff" : "#f1f5f9");
    doc.fillColor("#000000").fontSize(8.5);
    row.forEach((cell, i) => {
      doc.text(String(cell), x0 + i * colW + 3, y + 4, { width: colW - 6, lineBreak: false });
    });
  });

  // Borda
  doc.rect(x0, doc.y - (data.length - 1) * rowH, W, data.length * rowH)
     .strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  doc.moveDown(0.3);
}

// ── Extração de texto ──────────────────────────────────────────────────────────
async function extractPDFText(nomeArquivo) {
  const fp = path.join(PDFS_DIR, nomeArquivo);
  if (!fs.existsSync(fp)) return `Arquivo '${nomeArquivo}' não encontrado na pasta pdfs/.`;
  const data = await pdfParse(fs.readFileSync(fp));
  return (data.text || "").trim();
}

function listPDFs() {
  return fs.existsSync(PDFS_DIR)
    ? fs.readdirSync(PDFS_DIR).filter((f) => f.endsWith(".pdf"))
    : [];
}

module.exports = { generatePDF, extractPDFText, listPDFs };
