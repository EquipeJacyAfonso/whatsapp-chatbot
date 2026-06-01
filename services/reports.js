/**
 * Serviço de relatórios
 * - Gera PDFs com PDFKit
 * - Extrai texto de PDFs com pdf-parse
 */

const PDFDocument = require("pdfkit");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(__dirname, "..", process.env.REPORTS_DIR || "reports");
const PDFS_DIR = path.join(__dirname, "..", "pdfs");

// Garante que as pastas existem
[REPORTS_DIR, PDFS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function generatePDF(titulo, conteudo) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .substring(0, 19);
    const nomeSafe = titulo.replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "_").substring(0, 40);
    const filename = `${nomeSafe}_${timestamp}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Cabeçalho
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text("Administração Jacy Afonso — PT/DF", { align: "center" });

    doc.moveDown(0.3);

    doc
      .fontSize(20)
      .fillColor("#1a1a2e")
      .text(titulo, { align: "center" });

    doc
      .moveTo(50, doc.y + 8)
      .lineTo(545, doc.y + 8)
      .strokeColor("#1a1a2e")
      .stroke();

    doc.moveDown(0.8);

    const geradoEm = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    doc
      .fontSize(9)
      .fillColor("#888888")
      .text(`Gerado em: ${geradoEm}`, { align: "center" });

    doc.moveDown(1);

    // Conteúdo
    doc.fontSize(11).fillColor("#000000");

    const linhas = conteudo.split("\n");
    let emTabela = false;
    let dadosTabela = [];

    for (const linha of linhas) {
      if (linha.includes("|") && linha.split("|").length >= 3) {
        // Acumula linhas de tabela
        if (!linha.match(/^[-| ]+$/)) {
          dadosTabela.push(linha.split("|").map((c) => c.trim()).filter((c) => c));
        }
        emTabela = true;
      } else {
        // Flush tabela acumulada
        if (emTabela && dadosTabela.length > 0) {
          renderTable(doc, dadosTabela);
          dadosTabela = [];
          emTabela = false;
          doc.moveDown(0.5);
        }

        if (linha.trim()) {
          doc.text(linha.trim(), { lineGap: 3 });
        } else {
          doc.moveDown(0.4);
        }
      }
    }

    // Flush tabela no final se houver
    if (dadosTabela.length > 0) {
      renderTable(doc, dadosTabela);
    }

    doc.end();

    stream.on("finish", () => resolve(filename));
    stream.on("error", reject);
  });
}

function renderTable(doc, data) {
  if (!data.length) return;

  const colCount = Math.max(...data.map((r) => r.length));
  const tableWidth = 495;
  const colWidth = tableWidth / colCount;
  const rowHeight = 20;
  const startX = 50;
  let startY = doc.y;

  // Cabeçalho
  doc.rect(startX, startY, tableWidth, rowHeight).fill("#1a1a2e");
  doc.fillColor("#ffffff").fontSize(9);
  data[0].forEach((cell, i) => {
    doc.text(cell, startX + i * colWidth + 4, startY + 5, {
      width: colWidth - 8,
      lineBreak: false,
    });
  });

  // Linhas de dados
  doc.fillColor("#000000");
  data.slice(1).forEach((row, rowIdx) => {
    startY += rowHeight;
    const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f0f4f8";
    doc.rect(startX, startY, tableWidth, rowHeight).fill(bg);
    doc.fillColor("#000000").fontSize(9);
    row.forEach((cell, i) => {
      doc.text(String(cell), startX + i * colWidth + 4, startY + 5, {
        width: colWidth - 8,
        lineBreak: false,
      });
    });
  });

  // Borda da tabela
  doc
    .rect(startX, doc.y - data.length * rowHeight + rowHeight, tableWidth, data.length * rowHeight)
    .strokeColor("#cccccc")
    .stroke();

  doc.moveDown(0.3);
}

async function extractPDFText(nomeArquivo) {
  const filepath = path.join(PDFS_DIR, nomeArquivo);
  if (!fs.existsSync(filepath)) {
    return `Arquivo '${nomeArquivo}' não encontrado na pasta pdfs/`;
  }
  const buffer = fs.readFileSync(filepath);
  const data = await pdfParse(buffer);
  return data.text.trim();
}

function listPDFs() {
  if (!fs.existsSync(PDFS_DIR)) return [];
  return fs.readdirSync(PDFS_DIR).filter((f) => f.endsWith(".pdf"));
}

module.exports = { generatePDF, extractPDFText, listPDFs };
