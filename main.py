"""
WhatsApp Chatbot — Gemini + Evolution API + Google Sheets/PostgreSQL
Rodando localmente no Windows com Cloudflare Tunnel
"""

import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("bot.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

from services.whatsapp_service import WhatsAppService
from services.ai_service import AIService
from services.db_service import DatabaseService
from services.sheets_service import SheetsService
from services.report_service import ReportService

app = Flask(__name__)

# Inicializa serviços
db = DatabaseService()
sheets = SheetsService()
report = ReportService()
ai = AIService(db, sheets, report)
whatsapp = WhatsAppService()


@app.route("/webhook/evolution", methods=["POST"])
def webhook_evolution():
    """Recebe mensagens do WhatsApp via Evolution API."""
    try:
        data = request.json or {}

        # Ignora eventos que não são mensagens
        if data.get("event") != "messages.upsert":
            return jsonify({"status": "ignored"}), 200

        message_data = data.get("data", {})
        key = message_data.get("key", {})

        # Ignora mensagens enviadas pelo próprio bot
        if key.get("fromMe"):
            return jsonify({"status": "ignored"}), 200

        sender = key.get("remoteJid", "")
        msg_content = message_data.get("message", {})

        # Suporte a texto normal e texto estendido
        message = (
            msg_content.get("conversation")
            or msg_content.get("extendedTextMessage", {}).get("text")
            or ""
        ).strip()

        if not message:
            return jsonify({"status": "ignored"}), 200

        logger.info(f"📩 Mensagem de {sender}: {message[:80]}")

        # Processa e responde
        response_text = ai.process_message(sender, message)
        whatsapp.send_message(sender, response_text)

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logger.error(f"Erro no webhook: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/reports/<filename>")
def download_report(filename):
    """Serve os PDFs gerados para download."""
    reports_dir = os.path.abspath(os.getenv("REPORTS_DIR", "reports"))
    return send_from_directory(reports_dir, filename, as_attachment=True)


@app.route("/health")
def health():
    return jsonify({"status": "running", "bot": "Jacy Afonso"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"🤖 Bot iniciado na porta {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
