/**
 * Bot WhatsApp - Administração Jacy Afonso (PT/DF)
 * Arquitetura Autônoma com Ativação Exclusiva por @ ou "JacyBot"
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

// Envia logs em tempo real para o Painel Web Dashboard
function sendLog(type, message) {
  const io = getIo();
  if (io) io.emit("log", { type, msg: message });
  console.log(`[${type.toUpperCase()}] ${message}`);
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
      sendLog('sys', 'Novo QR Code gerado. A aguardar leitura no Painel Web.');
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
        sendLog('sys', `Monitorização ativa e inteligente configurada.`);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        sendLog('sys', 'Conexão interrompida. A reconectar em 3s...');
        setTimeout(startBot, 3000);
      } else {
        sendLog('sys', 'Sessão terminada. Elimine a pasta auth_session para reiniciar.');
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe || !msg.message) continue;

        const from = msg.key.remoteJid;
        
        // Se houver um grupo alvo configurado no .env, ignora mensagens de outros grupos
        if (GROUP_ID && from.endsWith("@g.us") && from !== GROUP_ID) continue;

        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ""
        ).trim();

        if (!text) continue;

        // --- FILTRO DE ATIVAÇÃO AJUSTADO ---
        const isGroup = from.endsWith("@g.us");
        
        if (isGroup) {
          // 1. Descobre o ID do próprio bot para ver se ele foi marcado (@)
          const meuId = sock.user && sock.user.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
          const marcacoes = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
          const foiMarcado = marcacoes.includes(meuId);

          // 2. MUDANÇA: Agora verifica se a palavra exata "jacybot" está no texto
          const textoMinusculo = text.toLowerCase();
          const falouNome = textoMinusculo.includes("jacybot");

          // Se não foi marcado por @ e nem digitaram "JacyBot", ignora e continua ouvindo
          if (!foiMarcado && !falouNome) {
            continue;
          }
        }
        // ------------------------------------------------------

        const sender = msg.pushName || msg.key.participant?.split("@")[0] || "Utilizador";
        
        // Regista o chamado no Dashboard Web
        sendLog('user', `${sender}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

        await sock.sendPresenceUpdate("composing", from);
        
        sendLog('sys', `Cérebro ativado! A processar resposta para ${sender}...`);
        const resposta = await processMessage(sender, text);
        
        await sock.sendMessage(from, { text: resposta });
        await sock.sendPresenceUpdate("paused", from);

        sendLog('bot', `Respondeu a ${sender}.`);

      } catch (err) {
        sendLog('sys', `Erro ao processar mensagem: ${err.message}`);
      }
    }
  });
}

startBot().catch(err => console.error("Erro Crítico:", err));