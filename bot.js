/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
 * Arquitetura Autônoma Plug-and-Play com Sincronização Real-Time
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

// Caminhos baseados no diretório de execução para compatibilidade com .exe
const ROOT_DIR = process.cwd();
const AUTH_DIR = path.join(ROOT_DIR, "auth_session");
const GROUP_ID = process.env.GROUP_ID || "";
const logger = pino({ level: "silent" });

async function startBot() {
  // Inicializa o servidor dinâmico de UI + WebSockets
  startServer();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log("\n[SISTEMA] Inicializando núcleo do WhatsApp...");

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
    const io = getIo(); // Conexão com o frontend web

    if (qr) {
      console.log("\n[SISTEMA] Novo QR Code gerado! Abra o painel no navegador.");
      try {
        const qrImageBase64 = await qrcode.toDataURL(qr);
        if (io) io.emit("qr", qrImageBase64); // Manda o QR Code pro navegador
      } catch (err) {
        console.error("Erro ao gerar QR Code para a UI:", err.message);
      }
    }

    if (connection === "open") {
      console.log("✅ Conexão estabelecida com o WhatsApp com sucesso!");
      if (io) io.emit("connected"); // Manda sinal verde pro navegador

      // Coleta grupos e injeta DIRETO NA TELA DO USUÁRIO via WebSocket
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
        }));
        
        // Salva backup local e envia para a interface gráfica
        fs.writeFileSync(path.join(ROOT_DIR, "grupos.json"), JSON.stringify(groupList, null, 2));
        console.log("📊 Sincronização de grupos concluída!");
        
        if (io) io.emit("groups_ready", groupList); // <-- O PULO DO GATO AQUI

      } catch (err) {
        console.error("Falha ao mapear grupos:", err.message);
      }

      if (!GROUP_ID) {
        console.log("\n[ATENÇÃO] Nenhum grupo foi selecionado ainda.");
      } else {
        console.log(`📡 Monitorando mensagens ativas no grupo ID: ${GROUP_ID}\n`);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Conexão interrompida. Tentando reconectar automaticamente...");
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ Sessão encerrada. Delete a pasta auth_session/ para gerar um novo QR Code.");
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

        const sender = msg.pushName || msg.key.participant?.split("@")[0] || "Usuário";
        console.log(`💬 [${sender}]: ${text.substring(0, 60)}...`);

        await sock.sendPresenceUpdate("composing", from);
        const resposta = await processMessage(sender, text);
        
        await sock.sendMessage(from, { text: resposta });
        await sock.sendPresenceUpdate("paused", from);

      } catch (err) {
        console.error("Erro no processamento da mensagem:", err.message);
      }
    }
  });
}

startBot().catch(console.error);