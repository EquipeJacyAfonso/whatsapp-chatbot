/**
 * Bot WhatsApp Administrativo
 * Responde perguntas sobre dados do PostgreSQL, Google Sheets e Google Drive
 * via mensagens no WhatsApp, gerando relatórios em texto ou PDF.
 */

require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino   = require("pino");
const path   = require("path");
const fs     = require("fs");

const { processMessage } = require("./services/ai");
const { startServer }    = require("./server");

const logger   = pino({ level: "silent" });
const AUTH_DIR = path.join(__dirname, "auth_session");

async function startBot() {
  startServer();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  console.log("\n========================================================");
  console.log("   Bot WhatsApp Administrativo — iniciando...");
  console.log("========================================================\n");

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ["Bot Admin", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n══════════════════════════════════════════════════════");
      console.log("📱  ESCANEIE O QR CODE COM O WHATSAPP:");
      console.log("    Abra o app → Aparelhos conectados → Conectar aparelho");
      console.log("══════════════════════════════════════════════════════\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n✅ WhatsApp conectado com sucesso!\n");

      try {
        const groups     = await sock.groupFetchAllParticipating();
        const groupList  = Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
        fs.writeFileSync(path.join(__dirname, "grupos.json"), JSON.stringify(groupList, null, 2));
        console.log(`📋 ${groupList.length} grupo(s) sincronizado(s). Painel admin: http://localhost:${process.env.PORT || 3000}/config\n`);
      } catch (err) {
        console.error("Aviso: não foi possível listar grupos.", err.message);
      }

      const groupId = process.env.GROUP_ID;
      if (!groupId) {
        console.log("⚠️  GROUP_ID não configurado (ou multi-tenant: qualquer grupo autorizado pode ser usado).");
        console.log("   Acesse o painel admin, selecione o grupo e salve.\n");
      } else {
        console.log(`📡 Monitorando grupo: ${groupId}\n`);
      }
    }

    if (connection === "close") {
      const code            = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Reconectando em 3 segundos...");
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ Sessão encerrada. Delete a pasta auth_session/ e reinicie.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe || !msg.message) continue;

        const from    = msg.key.remoteJid;
        const groupId = process.env.GROUP_ID;

        // Se GROUP_ID estiver configurado, só responde nesse grupo (modo single-tenant).
        // Se não estiver configurado, responde em qualquer grupo (modo multi-tenant via
        // bot_configs — cada grupo pode ter sua própria planilha/config no banco).
        if (groupId && from !== groupId) continue;

        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ""
        ).trim();

        if (!text) continue;

        const sender = msg.pushName || msg.key.participant?.split("@")[0] || "Usuário";
        console.log(`💬 [${sender}]: ${text.substring(0, 80)}${text.length > 80 ? "..." : ""}`);

        await sock.sendPresenceUpdate("composing", from);

        // CORREÇÃO: 'from' (o próprio grupo) é passado como groupId para
        // que services/config.js possa resolver overrides específicos
        // desse grupo (planilha diferente, provider de IA diferente, etc.)
        const resposta = await processMessage(sender, text, from);

        const chunks = splitMessage(resposta, 4000);
        for (const chunk of chunks) {
          await sock.sendMessage(from, { text: chunk });
        }

        await sock.sendPresenceUpdate("paused", from);
        console.log(`✉️  Resposta enviada (${resposta.length} chars)\n`);

      } catch (err) {
        console.error("Erro ao processar mensagem:", err.message);
      }
    }
  });
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  while (text.length > 0) {
    if (text.length <= maxLen) { parts.push(text); break; }
    let cut = text.lastIndexOf("\n\n", maxLen);
    if (cut === -1) cut = text.lastIndexOf("\n", maxLen);
    if (cut === -1) cut = maxLen;
    parts.push(text.substring(0, cut).trim());
    text = text.substring(cut).trim();
  }
  return parts;
}

startBot().catch(console.error);
