"""
Serviço Google Drive - leitura de planilhas e arquivos.
"""

import logging
import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
import gspread

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


class GoogleDriveService:
    def __init__(self):
        creds_path = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")
        creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON")  # alternativa: JSON direto na env var

        if creds_json:
            info = json.loads(creds_json)
            self.credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        else:
            self.credentials = service_account.Credentials.from_service_account_file(
                creds_path, scopes=SCOPES
            )

        self.drive_service = build("drive", "v3", credentials=self.credentials)
        self.gc = gspread.authorize(self.credentials)

    def buscar(self, termo: str, tipo: str = "qualquer") -> dict:
        """Busca arquivos no Drive pelo nome."""
        mime_types = {
            "planilha": "application/vnd.google-apps.spreadsheet",
            "documento": "application/vnd.google-apps.document",
        }

        query = f"name contains '{termo}' and trashed = false"
        if tipo in mime_types:
            query += f" and mimeType = '{mime_types[tipo]}'"

        results = self.drive_service.files().list(
            q=query,
            pageSize=10,
            fields="files(id, name, mimeType, modifiedTime, webViewLink)",
        ).execute()

        files = results.get("files", [])
        if not files:
            return {"encontrado": False, "mensagem": f"Nenhum arquivo encontrado para '{termo}'"}

        return {
            "encontrado": True,
            "total": len(files),
            "arquivos": [
                {
                    "nome": f["name"],
                    "tipo": f["mimeType"].split(".")[-1],
                    "modificado": f.get("modifiedTime", ""),
                    "link": f.get("webViewLink", ""),
                    "id": f["id"],
                }
                for f in files
            ],
        }

    def ler_planilha(self, spreadsheet_id: str, aba: str = None) -> list[dict]:
        """Lê todos os dados de uma planilha Google Sheets."""
        sh = self.gc.open_by_key(spreadsheet_id)
        worksheet = sh.worksheet(aba) if aba else sh.sheet1
        records = worksheet.get_all_records()
        logger.info(f"Planilha {spreadsheet_id}: {len(records)} registros lidos")
        return records

    def buscar_em_planilha(self, spreadsheet_id: str, coluna: str, valor: str, aba: str = None) -> list[dict]:
        """Busca linhas em uma planilha onde a coluna contém o valor."""
        records = self.ler_planilha(spreadsheet_id, aba)
        return [
            r for r in records
            if valor.lower() in str(r.get(coluna, "")).lower()
        ]
