"""
Serviço Google Sheets via Service Account.
Lê dados de planilhas compartilhadas com a service account.
"""

import os
import json
import logging
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


class SheetsService:
    def __init__(self):
        self.spreadsheet_id = os.getenv("SPREADSHEET_ID", "")
        self.service = None

        creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON", "")
        if not creds_json:
            logger.warning("⚠️  GOOGLE_CREDENTIALS_JSON não configurado — Sheets desativado")
            return

        try:
            # Aceita tanto JSON em linha quanto multiline
            creds_data = json.loads(creds_json)
            creds = Credentials.from_service_account_info(creds_data, scopes=SCOPES)
            self.service = build("sheets", "v4", credentials=creds)
            logger.info("✅ Google Sheets conectado")
        except Exception as e:
            logger.error(f"Erro ao conectar Google Sheets: {e}")

    def list_sheets(self) -> list[str]:
        """Lista as abas disponíveis na planilha."""
        if not self.service or not self.spreadsheet_id:
            return ["Sheets não configurado"]
        try:
            meta = self.service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()
            return [s["properties"]["title"] for s in meta.get("sheets", [])]
        except Exception as e:
            logger.error(f"Erro ao listar abas: {e}")
            return []

    def read_sheet(self, sheet_name: str, filtro: str = "") -> list[list]:
        """
        Lê todos os dados de uma aba.
        Se filtro fornecido, retorna apenas linhas que contêm o texto.
        """
        if not self.service or not self.spreadsheet_id:
            return []
        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=sheet_name
            ).execute()

            rows = result.get("values", [])
            if not rows:
                return []

            if filtro:
                filtro_lower = filtro.lower()
                header = rows[0] if rows else []
                filtered = [header]
                for row in rows[1:]:
                    if any(filtro_lower in str(cell).lower() for cell in row):
                        filtered.append(row)
                return filtered

            return rows

        except Exception as e:
            logger.error(f"Erro ao ler aba '{sheet_name}': {e}")
            return []
