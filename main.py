"""
WhatsApp Chatbot — Evolution API + OpenAI + Render.com
"""
 
import os
import re
import logging
from collections import defaultdict
from time import time
 
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
 
db_service = DatabaseService()
gdrive_service = GoogleDriveService()
report_service = ReportService()
ai_service = AIService(db_service, gdrive_service, report_service)
whatsapp_service = WhatsAppService()
 
# --------------------------------------------------------------------------- #
#  Rate limiting simples (em memória — reinicia com o processo)               #
# --------------------------------------------------------------------------- #
_last_message: dict = defaultdict(float)
RATE_LIMIT_SECONDS: float = float(os.getenv("RATE_LIMIT_SECONDS", 1.5))
 
 
def _is_rate_limited(sender: str) -> bool:
    """Retorna True se o remetente enviou mensagem recentemente demais."""
    now = time()
    if now - _last_message[sender] < RATE_LIMIT_SECONDS:
        return True
    _last_message[sender] = now
    return False
 
 
# --------------------------------------------------------------------------- #
#  Helpers                                                                     #
# --------------------------------------------------------------------------- #
WHATSAPP_MAX_LENGTH = 4096
 
 
def _truncate_response(text: str) -> str:
    """Garante que a resposta não ultrapasse o limite do WhatsApp."""
    if len(text) <= WHATSAPP_MAX_LENGTH:
        return text
    truncated = text[: WHATSAPP_MAX_LENGTH - 100]
    last_break = truncated.rfind("\n")
    cut = last_break if last_break > 0 else WHATSAPP_MAX_LENGTH - 100
    return text[:cut] + "\n\n_(mensagem truncada)_"
 
 
# --------------------------------------------------------------------------- #
#  Rotas                                                                       #
# --------------------------------------------------------------------------- #
@app.route("/webhook/evolution", methods=["POST"])
def webhook_evolution():
    """Recebe mensagens do WhatsApp via Evolution API."""
 
    # --- Autenticação ---
    token = request.headers.get("apikey") or request.args.get("token")
    if token != os.getenv("WEBHOOK_SECRET"):
        logger.warning("Requisição não autorizada recebida no webhook.")
        return jsonify({"error": "unauthorized"}), 401
 
    try:
        data = request.json or {}
 
        if data.get("event") != "messages.upsert":
            return jsonify({"status": "ignored"}), 200
 
        message_data = data.get("data", {})
        key = message_data.get("key", {})
 
        # Ignora mensagens enviadas pelo próprio bot
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
 
        # --- Rate limiting ---
        if _is_rate_limited(sender):
            logger.info(f"Rate limit atingido para {sender}. Mensagem ignorada.")
            return jsonify({"status": "rate_limited"}), 200
 
        logger.info(f"Mensagem de {sender}: {message}")
 
        response_text = ai_service.process_message(sender, message)
        response_text = _truncate_response(response_text)
 
        whatsapp_service.send_message(sender, response_text)
        return jsonify({"status": "ok"}), 200
 
    except Exception as e:
        logger.error(f"Erro no webhook: {e}", exc_info=True)
        return jsonify({"error": "internal server error"}), 500
 
 
@app.route("/reports/<path:filename>")
def download_report(filename: str):
    """Serve os PDFs gerados para download."""
 
    # Valida o nome do arquivo para evitar path traversal
    if not re.match(r'^[\w\-]+\.pdf$', filename):
        logger.warning(f"Tentativa de acesso com filename inválido: {filename!r}")
        return jsonify({"error": "invalid filename"}), 400
 
    reports_dir = os.path.abspath(os.getenv("REPORTS_DIR", "reports"))
    return send_from_directory(reports_dir, filename, as_attachment=True)
 
 
@app.route("/health")
def health():
    return jsonify({"status": "running"}), 200
 
 
@app.route("/")
def home():
    return jsonify({"status": "online", "service": "whatsapp-chatbot"}), 200
 
 
# --------------------------------------------------------------------------- #
#  Entry point (desenvolvimento local)                                         #
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"Servidor iniciado na porta {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
 