/**
 * Serviço Google Drive — lista e baixa PDFs de uma pasta compartilhada
 */

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");

let driveClient = null;

function getClient() {
  if (driveClient) return driveClient;
  const raw      = process.env.GOOGLE_CREDENTIALS_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raw || !folderId) return null;
  try {
    const auth = google.auth.fromJSON(JSON.parse(raw));
    auth.scopes = ["https://www.googleapis.com/auth/drive.readonly"];
    driveClient = google.drive({ version: "v3", auth });
    return driveClient;
  } catch (err) {
    console.error("❌ Drive auth error:", err.message);
    return null;
  }
}

async function listDrivePdfs() {
  const drive    = getClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!drive || !folderId) return [];
  try {
    const res = await drive.files.list({
      q:         `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields:    "files(id, name)",
      pageSize:  30,
    });
    return res.data.files || [];
  } catch (err) {
    console.error("❌ Drive list error:", err.message);
    return [];
  }
}

async function downloadDrivePdf(fileId, fileName) {
  const drive   = getClient();
  if (!drive) return null;
  const dir     = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest    = path.join(dir, fileName);
  const writer  = fs.createWriteStream(dest);
  try {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    return new Promise((resolve, reject) => {
      res.data.pipe(writer);
      res.data.on("end",   () => resolve(dest));
      res.data.on("error", reject);
    });
  } catch (err) {
    console.error("❌ Drive download error:", err.message);
    return null;
  }
}

module.exports = { listDrivePdfs, downloadDrivePdf };
