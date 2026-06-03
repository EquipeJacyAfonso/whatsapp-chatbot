/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
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
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const { processMessage } = require("./services/ai");
const { startServer } = require("./server");

// Logger silencioso
const logger = pino({ level: "silent" });
const AUTH_DIR = path.join(__dirname, "auth_session");

// Lê o GROUP_ID do .env
const GROUP_ID = process.env.GROUP_ID || "";

async function startBot() {
  startServer();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log("\n========================================");
  console.log("  Bot WhatsApp - Jacy Afonso (PT/DF)");
  console.log("========================================\n");

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ["Jacy Bot", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escaneie o QR Code abaixo com o WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n(Abra o WhatsApp > Dispositivos conectados > Conectar dispositivo)\n");
    }

    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!\n");

      // Salva os grupos no JSON para a interface ler
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
        }));
        fs.writeFileSync(path.join(__dirname, "grupos.json"), JSON.stringify(groupList, null, 2));
      } catch (err) {
        console.error("Erro ao salvar lista de grupos:", err.message);
      }

      if (!GROUP_ID) {
        console.log("ℹ️  GROUP_ID não configurado.");
        console.log("👉 Volte para a Interface no navegador (http://localhost:3000/config) e selecione o grupo!\n");
      } else {
        console.log(`✅ Monitorando grupo: ${GROUP_ID}\n`);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Reconectando...");
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ Sessão encerrada. Delete a pasta auth_session/ e reinicie para reconectar.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const from = msg.key.remoteJid;
        
        // Só responde no grupo configurado
        if (GROUP_ID && from !== GROUP_ID) continue;

        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ""
        ).trim();

        if (!text) continue;

        const sender = msg.pushName || msg.key.participant?.split("@")[0] || "alguém";

        console.log(`💬 [${sender}]: ${text.substring(0, 80)}`);

        await sock.sendPresenceUpdate("composing", from);
        const resposta = await processMessage(sender, text);
        await sock.sendMessage(from, { text: resposta });
        await sock.sendPresenceUpdate("paused", from);

        console.log(`✉️  Respondido para o grupo\n`);
      } catch (err) {
        console.error("Erro ao processar mensagem:", err.message);
      }
    }
  });
}

startBot().catch(console.error);