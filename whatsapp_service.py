"""
Serviço WhatsApp — Evolution API.
"""

import logging
import os
import requests

logger = logging.getLogger(__name__)


class WhatsAppService:
    def __init__(self):
        self.base_url = os.getenv("EVOLUTION_API_URL", "http://localhost:8080")
        self.api_key = os.getenv("EVOLUTION_API_KEY")
        self.instance = os.getenv("EVOLUTION_INSTANCE")

    def send_message(self, to: str, text: str):
        """Envia mensagem de texto via Evolution API."""
        # Divide mensagens muito longas (WhatsApp tem limite de ~4096 caracteres)
        chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
        for chunk in chunks:
            self._post(chunk, to)

    def _post(self, text: str, to: str):
        url = f"{self.base_url}/message/sendText/{self.instance}"
        headers = {"apikey": self.api_key, "Content-Type": "application/json"}
        payload = {"number": to, "text": text}
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            resp.raise_for_status()
            logger.info(f"Mensagem enviada para {to}")
        except requests.RequestException as e:
            logger.error(f"Erro ao enviar mensagem para {to}: {e}")
