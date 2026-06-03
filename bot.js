/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
 * Arquitetura Autônoma Plug-and-Play via Baileys
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

const logger = pino({ level: "silent" });
const AUTH_DIR = path.join(__dirname, "auth_session");
const GROUP_ID = process.env.GROUP_ID || "";

async function startBot() {
  // Inicializa o servidor dinâmico de configurações e relatórios
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

    if (qr) {
      console.log("\n=============================================================");
      console.log("📱 QR CODE DISPONÍVEL! ESCANEIE COM SEU CELULAR NO WHATSAPP:");
      console.log("=============================================================\n");
      qrcode.generate(qr, { small: true });
      console.log("\n👉 Vá em: WhatsApp > Aparelhos Conectados > Conectar Aparelho\n");
    }

    if (connection === "open") {
      console.log("✅ Conexão estabelecida com o WhatsApp com sucesso!");

      // Coleta grupos vigentes e salva para alimentação do Painel Web
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
        }));
        fs.writeFileSync(path.join(__dirname, "grupos.json"), JSON.stringify(groupList, null, 2));
        console.log("📊 Sincronização de grupos concluída! Atualize o painel no seu navegador.");
      } catch (err) {
        console.error("Falha ao mapear grupos:", err.message);
      }

      if (!GROUP_ID) {
        console.log("\n[ATENÇÃO] Nenhum grupo foi selecionado ainda.");
        console.log("👉 Acesse a interface web, escolha o grupo alvo e clique em Salvar.\n");
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

        console.log(`✉️ Resposta enviada ao grupo.`);
      } catch (err) {
        console.error("Erro no processamento da mensagem:", err.message);
      }
    }
  });
}

startBot().catch(console.error);