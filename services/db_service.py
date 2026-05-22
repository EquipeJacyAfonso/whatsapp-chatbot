"""
Serviço de banco de dados PostgreSQL.
Queries baseadas na tabela real: contatos (planilha FORMULÁRIO DE CONTATOS THIAGO)
"""

import logging
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseService:
    def __init__(self):
        self.dsn = os.getenv("DATABASE_URL")

    @contextmanager
    def get_connection(self):
        conn = psycopg2.connect(self.dsn)
        try:
            yield conn
        finally:
            conn.close()

    def buscar_endereco(self, nome: str = None, whatsapp: str = None) -> dict:
        """Busca endereço e dados de contato de uma pessoa."""
        if not nome and not whatsapp:
            return {"erro": "Informe nome ou WhatsApp para buscar"}

        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                conditions, params = [], []

                if whatsapp:
                    numero = "".join(filter(str.isdigit, whatsapp))
                    conditions.append("whatsapp LIKE %s")
                    params.append(f"%{numero}%")

                if nome:
                    conditions.append("LOWER(nome_completo) LIKE LOWER(%s)")
                    params.append(f"%{nome}%")

                where = " AND ".join(conditions)
                cur.execute(
                    f"""
                    SELECT
                        nome_completo, profissao, orgao_empresa,
                        whatsapp, email, redes_sociais,
                        endereco_completo, bairro, cidade, uf, cep,
                        cidade_votacao, apoiador, origem
                    FROM contatos
                    WHERE {where}
                    ORDER BY nome_completo
                    LIMIT 5
                    """,
                    params,
                )
                rows = cur.fetchall()

                if not rows:
                    return {"encontrado": False, "mensagem": "Nenhuma pessoa encontrada"}

                return {"encontrado": True, "total": len(rows), "pessoas": [dict(r) for r in rows]}

    def contar_pessoas_localidade(
        self, cidade: str = None, estado: str = None, bairro: str = None
    ) -> dict:
        """Conta contatos em uma localidade."""
        if not any([cidade, estado, bairro]):
            return {"erro": "Informe pelo menos cidade, estado ou bairro"}

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                conditions, params = self._build_location_filter(cidade, estado, bairro)
                where = " AND ".join(conditions)
                cur.execute(f"SELECT COUNT(*) FROM contatos WHERE {where}", params)
                total = cur.fetchone()[0]
                localidade = ", ".join(filter(None, [bairro, cidade, estado]))
                return {"localidade": localidade, "total": total}

    def listar_pessoas_localidade(
        self,
        cidade: str = None,
        estado: str = None,
        bairro: str = None,
        limite: int = 10,
    ) -> dict:
        """Lista contatos em uma localidade."""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                conditions, params = self._build_location_filter(cidade, estado, bairro)
                where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
                params.append(min(limite, 50))

                cur.execute(
                    f"""
                    SELECT nome_completo, profissao, cidade, uf, bairro, whatsapp, apoiador
                    FROM contatos
                    {where}
                    ORDER BY nome_completo
                    LIMIT %s
                    """,
                    params,
                )
                rows = cur.fetchall()
                return {"total": len(rows), "pessoas": [dict(r) for r in rows]}

    def buscar_dados_relatorio(self, tipo: str, filtros: dict = None) -> list:
        """Busca dados para geração de relatório."""
        filtros = filtros or {}
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                if tipo == "pessoas_por_cidade":
                    cur.execute("""
                        SELECT cidade, uf AS estado, COUNT(*) AS total
                        FROM contatos
                        WHERE cidade IS NOT NULL AND cidade != ''
                        GROUP BY cidade, uf
                        ORDER BY total DESC
                    """)

                elif tipo == "listagem_geral":
                    conditions, params = self._build_generic_filter(filtros)
                    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
                    cur.execute(
                        f"""
                        SELECT
                            nome_completo, profissao, orgao_empresa,
                            whatsapp, email, cidade, uf, bairro,
                            endereco_completo, apoiador, origem
                        FROM contatos
                        {where}
                        ORDER BY nome_completo
                        LIMIT 1000
                        """,
                        params,
                    )

                else:
                    conditions, params = self._build_generic_filter(filtros)
                    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
                    cur.execute(
                        f"""
                        SELECT nome_completo, profissao, orgao_empresa, area_atuacao,
                               whatsapp, email, cidade, uf, bairro, apoiador, origem
                        FROM contatos {where}
                        LIMIT 1000
                        """,
                        params,
                    )

                return [dict(r) for r in cur.fetchall()]

    def _build_location_filter(self, cidade=None, estado=None, bairro=None):
        conditions, params = [], []
        if estado:
            conditions.append("LOWER(uf) = LOWER(%s)")
            params.append(estado)
        if cidade:
            conditions.append("LOWER(cidade) LIKE LOWER(%s)")
            params.append(f"%{cidade}%")
        if bairro:
            conditions.append("LOWER(bairro) LIKE LOWER(%s)")
            params.append(f"%{bairro}%")
        return conditions, params

    def _build_generic_filter(self, filtros: dict):
        conditions, params = [], []
        if filtros.get("estado"):
            conditions.append("LOWER(uf) = LOWER(%s)")
            params.append(filtros["estado"])
        if filtros.get("cidade"):
            conditions.append("LOWER(cidade) LIKE LOWER(%s)")
            params.append(f"%{filtros['cidade']}%")
        if filtros.get("bairro"):
            conditions.append("LOWER(bairro) LIKE LOWER(%s)")
            params.append(f"%{filtros['bairro']}%")
        if filtros.get("apoiador"):
            conditions.append("LOWER(apoiador) = LOWER(%s)")
            params.append(filtros["apoiador"])
        if filtros.get("origem"):
            conditions.append("LOWER(origem) LIKE LOWER(%s)")
            params.append(f"%{filtros['origem']}%")
        return conditions, params
