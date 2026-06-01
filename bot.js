/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
 * Usando Baileys (conexão direta, sem Docker, sem Evolution API)
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

// Logger silencioso (só erros no terminal)
const logger = pino({ level: "silent" });

// Pasta para salvar a sessão do WhatsApp (evita escanear QR toda vez)
const AUTH_DIR = path.join(__dirname, "auth_session");

// ID do grupo que o bot vai responder (preenche depois de rodar uma vez)
const GROUP_ID = process.env.GROUP_ID || "";

async function startBot() {
  // Inicia servidor de PDFs
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

  // Salva credenciais quando atualizar
  sock.ev.on("creds.update", saveCreds);

  // Gerencia conexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escaneie o QR Code abaixo com o WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n(Abra o WhatsApp > Dispositivos conectados > Conectar dispositivo)\n");
    }

    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!\n");

      // Lista os grupos para o usuário saber o ID
      if (!GROUP_ID) {
        console.log("ℹ️  GROUP_ID não configurado. Listando grupos disponíveis:\n");
        const groups = await sock.groupFetchAllParticipating();
        Object.values(groups).forEach((g) => {
          console.log(`  Nome: ${g.subject}`);
          console.log(`  ID:   ${g.id}`);
          console.log("");
        });
        console.log('👆 Copie o ID do grupo desejado e coloque em GROUP_ID= no arquivo .env\n');
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

  // Recebe mensagens
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        // Ignora mensagens antigas e do próprio bot
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const from = msg.key.remoteJid;

        // Só responde no grupo configurado
        if (GROUP_ID && from !== GROUP_ID) continue;

        // Extrai o texto da mensagem
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ""
        ).trim();

        if (!text) continue;

        // Pega o nome do remetente
        const sender =
          msg.pushName ||
          msg.key.participant?.split("@")[0] ||
          "alguém";

        console.log(`💬 [${sender}]: ${text.substring(0, 80)}`);

        // Indicador de digitando
        await sock.sendPresenceUpdate("composing", from);

        // Processa com Gemini
        const resposta = await processMessage(sender, text);

        // Envia resposta
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
