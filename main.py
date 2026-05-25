"""
WhatsApp Chatbot — Evolution API + OpenAI + Railway
"""

import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

from services.whatsapp_service import WhatsAppService
from services.ai_service import AIService
from services.db_service import DatabaseService
from services.gdrive_service import GoogleDriveService
from services.report_service import ReportService

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Inicialização dos Serviços com segurança
db_service = DatabaseService()

try:
    gdrive_service = GoogleDriveService()
except Exception as e:
    logger.error(f"Falha ao iniciar GoogleDriveService: {e}", exc_info=True)
    gdrive_service = None

report_service = ReportService()
ai_service = AIService(db_service, gdrive_service, report_service)
whatsapp_service = WhatsAppService()


@app.route("/")
def home():
    return "Chatbot online", 200


@app.route("/webhook/evolution", methods=["POST"])
def webhook_evolution():
    """Recebe mensagens do WhatsApp via Evolution API."""
    try:
        data = request.json or {}

        if data.get("event") != "messages.upsert":
            return jsonify({"status": "ignored"}), 200

        message_data = data.get("data", {})
        key = message_data.get("key", {})

        if key.get("fromMe"):
            return jsonify({"status": "ignored"}), 200

        sender = key.get("remoteJid", "")
        msg_content = message_data.get("message", {})
        message = (
            msg_content.get("conversation")
            or msg_content.get("extendedTextMessage", {}).get("text")
            or ""
        ).strip()

        if not message:
            return jsonify({"status": "ignored"}), 200

        logger.info(f"Mensagem de {sender}: {message}")
        response_text = ai_service.process_message(sender, message)
        whatsapp_service.send_message(sender, response_text)

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
    return jsonify({"status": "running"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"Servidor iniciado na porta {port}")
    app.run(host="0.0.0.0", port=port)