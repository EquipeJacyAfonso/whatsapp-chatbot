/**
 * Serviço de Integração com o Google Drive
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

let driveClient = null;

// Inicializa o cliente do Google Drive reaproveitando o JSON do painel
function getDriveClient() {
  if (driveClient) return driveClient;

  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!credentialsJson || !folderId) {
    console.log("⚠️ [DRIVE] Integração não configurada ou sem ID de pasta ativa.");
    return null;
  }

  try {
    const credentials = JSON.parse(credentialsJson);
    const auth = google.auth.fromJSON(credentials);
    // Define escopo de leitura para segurança dos arquivos
    auth.scopes = ["https://www.googleapis.com/auth/drive.readonly"];
    
    driveClient = google.drive({ version: "v3", auth });
    return driveClient;
  } catch (err) {
    console.error("❌ [DRIVE] Erro na autenticação do Drive:", err.message);
    return null;
  }
}

/**
 * Lista todos os arquivos PDF dentro da pasta configurada
 */
async function listDrivePdfs() {
  const drive = getDriveClient();
  if (!drive) return [];

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(id, name, createdTime)",
      pageSize: 20,
    });
    return response.data.files || [];
  } catch (err) {
    console.error("❌ [DRIVE] Erro ao listar arquivos do Drive:", err.message);
    return [];
  }
}

/**
 * Baixa um PDF do Drive para a pasta local temporária para o bot ler
 */
async function downloadDrivePdf(fileId, fileName) {
  const drive = getDriveClient();
  if (!drive) return null;

  // Cria a pasta local temporária caso não exista
  const localDir = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const destPath = path.join(localDir, fileName);
  const destStream = fs.createWriteStream(destPath);

  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "stream" }
    );

    return new Promise((resolve, reject) => {
      response.data
        .on("end", () => {
          console.log(`📥 [DRIVE] Arquivo baixado com sucesso: ${fileName}`);
          resolve(destPath);
        })
        .on("error", (err) => {
          console.error("❌ [DRIVE] Erro no fluxo de download:", err);
          reject(err);
        })
        .pipe(destStream);
    });
  } catch (err) {
    console.error("❌ [DRIVE] Falha ao baixar arquivo:", err.message);
    return null;
  }
}

module.exports = { listDrivePdfs, downloadDrivePdf };