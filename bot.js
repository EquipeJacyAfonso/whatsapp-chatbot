/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
 * Arquitetura Autônoma Plug-and-Play com Logs na Web
 */

require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const { processMessage } = require("./services/ai");
const { startServer, getIo } = require("./server");

const ROOT_DIR = process.cwd();
const AUTH_DIR = path.join(ROOT_DIR, "auth_session");
const GROUP_ID = process.env.GROUP_ID || "";
const logger = pino({ level: "silent" });

// Função auxiliar para enviar logs para a Interface Web
function sendLog(type, message) {
  const io = getIo();
  if (io) io.emit("log", { type, msg: message });
  console.log(`[${type.toUpperCase()}] ${message}`); // Mantém no console para dev
}

async function startBot() {
  startServer();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sendLog('sys', 'A iniciar núcleo de comunicação com a Meta/WhatsApp...');

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ["Jacy Bot Admin", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const io = getIo();

    if (qr) {
      sendLog('sys', 'Novo QR Code gerado. A aguardar leitura do utilizador.');
      try {
        const qrImageBase64 = await qrcode.toDataURL(qr);
        if (io) io.emit("qr", qrImageBase64);
      } catch (err) {}
    }

    if (connection === "open") {
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
        }));
        
        fs.writeFileSync(path.join(ROOT_DIR, "grupos.json"), JSON.stringify(groupList, null, 2));
        if (io) io.emit("groups_ready", groupList); 

      } catch (err) {
        sendLog('sys', `Falha ao mapear grupos: ${err.message}`);
      }

      if (GROUP_ID) {
        sendLog('sys', `Monitorização ativa no grupo configurado.`);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        sendLog('sys', 'Conexão interrompida (Possível queda de internet). A reconectar em 3s...');
        setTimeout(startBot, 3000);
      } else {
        sendLog('sys', 'Sessão terminada pelo telemóvel. Elimine a pasta auth_session para reiniciar.');
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe || !msg.message) continue;

        const from = msg.key.remoteJid;
        if (GROUP_ID && from !== GROUP_ID) continue;

        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ""
        ).trim();

        if (!text) continue;

        const sender = msg.pushName || msg.key.participant?.split("@")[0] || "Utilizador";
        
        // Regista a entrada no Dashboard Web
        sendLog('user', `${sender}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

        await sock.sendPresenceUpdate("composing", from);
        
        sendLog('sys', `A processar resposta via IA para ${sender}...`);
        const resposta = await processMessage(sender, text);
        
        await sock.sendMessage(from, { text: resposta });
        await sock.sendPresenceUpdate("paused", from);

        // Regista a saída no Dashboard Web
        sendLog('bot', `Bot respondeu: ${resposta.substring(0, 50)}...`);

      } catch (err) {
        sendLog('sys', `Erro ao processar mensagem: ${err.message}`);
      }
    }
  });
}

startBot().catch(err => console.error("Erro Crítico:", err));