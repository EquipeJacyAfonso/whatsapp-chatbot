"""
Serviço de envio de mensagens via Evolution API (local/Docker).
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)


class WhatsAppService:
    def __init__(self):
        self.api_url = os.getenv("EVOLUTION_API_URL", "http://localhost:8080")
        self.api_key = os.getenv("EVOLUTION_API_KEY", "")
        self.instance = os.getenv("EVOLUTION_INSTANCE", "bot")

        self.headers = {
            "Content-Type": "application/json",
            "apikey": self.api_key,
        }

    def send_message(self, to: str, text: str) -> bool:
        """
        Envia uma mensagem de texto pelo WhatsApp.
        Divide automaticamente mensagens longas (> 4000 chars).
        """
        if not text:
            return False

        # Divide mensagens muito longas
        chunks = self._split_message(text, max_len=4000)

        for chunk in chunks:
            success = self._send_chunk(to, chunk)
            if not success:
                return False

        return True

    def _send_chunk(self, to: str, text: str) -> bool:
        """Envia um trecho de mensagem."""
        url = f"{self.api_url}/message/sendText/{self.instance}"
        payload = {
            "number": to,
            "text": text,
        }

        try:
            resp = requests.post(url, json=payload, headers=self.headers, timeout=10)
            resp.raise_for_status()
            return True
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Evolution API offline em {self.api_url}")
            return False
        except Exception as e:
            logger.error(f"Erro ao enviar mensagem: {e}")
            return False

    def _split_message(self, text: str, max_len: int = 4000) -> list[str]:
        """Divide texto em partes respeitando parágrafos."""
        if len(text) <= max_len:
            return [text]

        parts = []
        while text:
            if len(text) <= max_len:
                parts.append(text)
                break
            # Tenta quebrar em parágrafo
            split_at = text.rfind("\n\n", 0, max_len)
            if split_at == -1:
                split_at = text.rfind("\n", 0, max_len)
            if split_at == -1:
                split_at = max_len
            parts.append(text[:split_at].strip())
            text = text[split_at:].strip()

        return parts
