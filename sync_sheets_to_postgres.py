"""
sync_sheets_to_postgres.py
──────────────────────────
Sincroniza a planilha Google Sheets → PostgreSQL.

Estratégia:
- Usa o número da linha como chave única (coluna linha_planilha)
- INSERT novas linhas, UPDATE linhas existentes se houver diferença
- Nunca deleta registros do banco (segurança)
- Loga tudo: novas, atualizadas, sem alteração

Uso:
  python sync_sheets_to_postgres.py               # sync completo
  python sync_sheets_to_postgres.py --dry-run     # simula sem gravar
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google.oauth2 import service_account
import gspread

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("sync.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# ── Configurações ──────────────────────────────────────────────────
SPREADSHEET_ID  = os.getenv("SHEETS_SPREADSHEET_ID")   # ID da planilha no Google
ABA_NOME        = os.getenv("SHEETS_ABA", "Respostas ao formulário 1")
DATABASE_URL    = os.getenv("DATABASE_URL")
GOOGLE_CREDS    = os.getenv("GOOGLE_CREDENTIALS_JSON")
GOOGLE_CREDS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Mapeamento: coluna da planilha → campo no banco
COLUMN_MAP = {
    "Carimbo de data/hora":                          "carimbo_data_hora",
    "Nome completo:":                                "nome_completo",
    "Órgão ou empresa onde trabalha:  ":             "orgao_empresa",
    "Profissão:":                                    "profissao",
    "Área de atuação:":                              "area_atuacao",
    "WhatsApp (com DDD):  ":                         "whatsapp",
    "E-mail:  ":                                     "email",
    "Redes sociais (link ou @):":                    "redes_sociais",
    "Endereço completo (Rua, nº, e complemento):":   "endereco_completo",
    "Bairro:":                                       "bairro",
    "Cidade:  ":                                     "cidade",
    "UF (Estado):":                                  "uf",
    "CEP:":                                          "cep",
    "Cidade de votação:":                            "cidade_votacao",
    "Já apoia algum Deputado Federal? Se sim, qual? ": "apoia_deputado",
    "PAÍS":                                          "pais",
    "Esteve presente no lançamento da pré-campanha? ": "presente_lancamento",
    "APOIADOR":                                      "apoiador",
    "AGENDA":                                        "agenda",
    "ORIGEM":                                        "origem",
    "REPETIÇÃO":                                     "repeticao",
    "VALIDAÇÃO":                                     "validacao",
    "Data":                                          "data_coluna",
    "MAIÚSCULO":                                     "maiusculo",
    "PRIMEIRO NOME":                                 "primeiro_nome",
    "Endereço de e-mail":                            "email_endereco",
}

DB_FIELDS = list(COLUMN_MAP.values())


def get_google_client() -> gspread.Client:
    if GOOGLE_CREDS:
        info = json.loads(GOOGLE_CREDS)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        creds = service_account.Credentials.from_service_account_file(GOOGLE_CREDS_PATH, scopes=SCOPES)
    return gspread.authorize(creds)


def fetch_sheet_data() -> tuple[list[str], list[list]]:
    """Retorna (headers, linhas) da planilha."""
    logger.info(f"Conectando à planilha {SPREADSHEET_ID} | aba: {ABA_NOME}")
    gc = get_google_client()
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet(ABA_NOME)
    all_values = ws.get_all_values()

    if not all_values:
        raise ValueError("Planilha vazia")

    headers = all_values[0]
    rows = all_values[1:]
    logger.info(f"Planilha: {len(rows)} linhas, {len(headers)} colunas")
    return headers, rows


def normalize(value: str) -> str:
    """Limpa espaços e normaliza 'NÃO INFORMADO' para vazio."""
    v = str(value).strip() if value else ""
    if v.upper() in ("NÃO INFORMADO", "NAO INFORMADO", "N/A", "-", "--", "INDEFINIDO"):
        return ""
    return v


def row_to_dict(headers: list[str], row: list, linha_num: int) -> dict:
    """Converte uma linha da planilha em dict para o banco."""
    record = {"linha_planilha": linha_num}
    for i, header in enumerate(headers):
        db_field = COLUMN_MAP.get(header)
        if db_field:
            value = row[i] if i < len(row) else ""
            record[db_field] = normalize(value)
    # Garante todos os campos
    for field in DB_FIELDS:
        if field not in record:
            record[field] = ""
    return record


def get_existing_rows(conn) -> dict[int, dict]:
    """Busca todos os registros do banco indexados por linha_planilha."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"SELECT linha_planilha, {', '.join(DB_FIELDS)} FROM contatos")
        return {row["linha_planilha"]: dict(row) for row in cur.fetchall()}


def records_differ(db_row: dict, new_row: dict) -> bool:
    """Verifica se algum campo mudou."""
    for field in DB_FIELDS:
        if str(db_row.get(field) or "") != str(new_row.get(field) or ""):
            return True
    return False


def upsert_batch(conn, to_insert: list[dict], to_update: list[dict], dry_run: bool):
    if dry_run:
        logger.info(f"[DRY-RUN] Seriam inseridos: {len(to_insert)} | Atualizados: {len(to_update)}")
        return

    with conn.cursor() as cur:
        # INSERT em lote
        if to_insert:
            cols = ["linha_planilha"] + DB_FIELDS
            values_template = "(" + ", ".join(["%s"] * len(cols)) + ")"
            args = [
                tuple(r[c] for c in cols)
                for r in to_insert
            ]
            insert_sql = f"""
                INSERT INTO contatos ({", ".join(cols)})
                VALUES {values_template}
                ON CONFLICT (linha_planilha) DO NOTHING
            """
            psycopg2.extras.execute_many(cur, insert_sql, args)

        # UPDATE um a um (apenas os que mudaram)
        for r in to_update:
            set_clause = ", ".join([f"{f} = %s" for f in DB_FIELDS])
            set_clause += ", atualizado_em = NOW()"
            values = [r[f] for f in DB_FIELDS] + [r["linha_planilha"]]
            cur.execute(
                f"UPDATE contatos SET {set_clause} WHERE linha_planilha = %s",
                values,
            )

    conn.commit()


def sync(dry_run: bool = False):
    start = datetime.now()
    logger.info("═" * 60)
    logger.info(f"INÍCIO DA SINCRONIZAÇÃO | dry_run={dry_run}")

    headers, rows = fetch_sheet_data()

    conn = psycopg2.connect(DATABASE_URL)
    try:
        existing = get_existing_rows(conn)
        logger.info(f"Banco: {len(existing)} registros existentes")

        to_insert = []
        to_update = []
        unchanged = 0

        for i, row in enumerate(rows):
            linha_num = i + 2  # linha 2 em diante (linha 1 é cabeçalho)
            new_record = row_to_dict(headers, row, linha_num)

            if linha_num not in existing:
                to_insert.append(new_record)
            elif records_differ(existing[linha_num], new_record):
                to_update.append(new_record)
            else:
                unchanged += 1

        logger.info(f"Novos: {len(to_insert)} | Atualizados: {len(to_update)} | Sem alteração: {unchanged}")

        upsert_batch(conn, to_insert, to_update, dry_run)

        elapsed = (datetime.now() - start).total_seconds()
        logger.info(f"SYNC CONCLUÍDO em {elapsed:.1f}s")

    finally:
        conn.close()

    return {"inseridos": len(to_insert), "atualizados": len(to_update), "sem_alteracao": unchanged}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Google Sheets → PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem gravar no banco")
    args = parser.parse_args()

    if not SPREADSHEET_ID:
        logger.error("SHEETS_SPREADSHEET_ID não definida no .env")
        sys.exit(1)
    if not DATABASE_URL:
        logger.error("DATABASE_URL não definida no .env")
        sys.exit(1)

    result = sync(dry_run=args.dry_run)
    print(result)
