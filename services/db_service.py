"""
Serviço de banco de dados PostgreSQL.
Conexão com o Neon.tech (ou qualquer PostgreSQL).
"""

import os
import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseService:
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            logger.warning("⚠️  DATABASE_URL não configurada — banco desativado")

    @contextmanager
    def _get_connection(self):
        """Gerenciador de conexão com auto-close."""
        conn = psycopg2.connect(self.database_url)
        try:
            yield conn
        finally:
            conn.close()

    def query(self, sql: str, params=None) -> tuple[list, list]:
        """
        Executa uma query SELECT e retorna (linhas, colunas).
        Retorna ([], []) em caso de erro ou banco não configurado.
        """
        if not self.database_url:
            return [], []

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, params)
                    columns = [desc[0] for desc in cur.description]
                    rows = cur.fetchall()
                    logger.info(f"SQL retornou {len(rows)} linhas")
                    return rows, columns
        except Exception as e:
            logger.error(f"Erro SQL: {e}\nQuery: {sql}")
            raise

    def get_tables(self) -> list[str]:
        """Lista todas as tabelas do banco."""
        sql = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """
        rows, _ = self.query(sql)
        return [r[0] for r in rows]

    def get_table_schema(self, table_name: str) -> str:
        """Retorna o schema de uma tabela (colunas e tipos)."""
        sql = """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = 'public'
            ORDER BY ordinal_position
        """
        rows, _ = self.query(sql, (table_name,))
        if not rows:
            return f"Tabela '{table_name}' não encontrada"
        return "\n".join(f"  {col}: {dtype}" for col, dtype in rows)
