"""
Serviço de IA usando Google Gemini (gratuito via API Key).
Usa Function Calling para decidir automaticamente o que fazer.
"""

import os
import json
import logging
import re
import google.generativeai as genai
from datetime import datetime

logger = logging.getLogger(__name__)

# System prompt do bot
SYSTEM_PROMPT = """Você é o assistente virtual da administração do Jacy Afonso (PT/DF).
Você tem acesso a dados administrativos via PostgreSQL e Google Sheets.
Responda sempre em português, de forma clara e objetiva.
Ao gerar relatórios, informe o link para download.
Se não souber algo, diga que não encontrou os dados."""

# Definição das funções disponíveis para o Gemini
TOOLS = [
    {
        "function_declarations": [
            {
                "name": "consultar_banco",
                "description": "Executa uma consulta SQL no PostgreSQL para buscar dados administrativos",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "Query SQL SELECT para executar (somente leitura)"
                        },
                        "descricao": {
                            "type": "string",
                            "description": "Descrição do que está sendo buscado"
                        }
                    },
                    "required": ["sql"]
                }
            },
            {
                "name": "ler_planilha",
                "description": "Lê dados de uma aba específica do Google Sheets",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "aba": {
                            "type": "string",
                            "description": "Nome da aba/sheet a ser lida. Se não souber, deixe em branco para listar abas disponíveis."
                        },
                        "filtro": {
                            "type": "string",
                            "description": "Texto opcional para filtrar linhas (busca em todas as colunas)"
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "gerar_relatorio_pdf",
                "description": "Gera um relatório em PDF com os dados fornecidos e retorna o link para download",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "titulo": {
                            "type": "string",
                            "description": "Título do relatório"
                        },
                        "conteudo": {
                            "type": "string",
                            "description": "Conteúdo textual do relatório (pode incluir listas, tabelas em texto)"
                        },
                        "fonte_dados": {
                            "type": "string",
                            "description": "De onde vieram os dados: 'banco', 'planilha', ou 'pdf'"
                        }
                    },
                    "required": ["titulo", "conteudo"]
                }
            },
            {
                "name": "ler_pdf",
                "description": "Lê e extrai texto de um arquivo PDF da pasta local 'pdfs/'",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nome_arquivo": {
                            "type": "string",
                            "description": "Nome do arquivo PDF (ex: ata_reuniao.pdf). Se não souber, deixe em branco para listar PDFs disponíveis."
                        }
                    },
                    "required": []
                }
            }
        ]
    }
]


class AIService:
    def __init__(self, db_service, sheets_service, report_service):
        self.db = db_service
        self.sheets = sheets_service
        self.report = report_service

        # Configura Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY não encontrada no .env")

        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=SYSTEM_PROMPT,
            tools=TOOLS
        )

        # Histórico de conversa por usuário (em memória)
        self.historico = {}
        logger.info(f"✅ Gemini iniciado com modelo: {model_name}")

    def process_message(self, sender: str, message: str) -> str:
        """Processa uma mensagem e retorna a resposta."""
        try:
            # Pega ou cria histórico do usuário
            if sender not in self.historico:
                self.historico[sender] = []

            history = self.historico[sender]

            # Inicia chat com histórico
            chat = self.model.start_chat(history=history)

            # Envia mensagem
            response = chat.send_message(message)

            # Processa function calls em loop (Gemini pode chamar múltiplas funções)
            max_iterations = 5
            iteration = 0

            while iteration < max_iterations:
                iteration += 1
                tool_calls = self._extract_tool_calls(response)

                if not tool_calls:
                    break

                # Executa cada função chamada
                tool_results = []
                for call in tool_calls:
                    result = self._execute_tool(call["name"], call["args"])
                    tool_results.append({
                        "function_response": {
                            "name": call["name"],
                            "response": {"result": result}
                        }
                    })
                    logger.info(f"🔧 Função {call['name']} executada")

                # Envia resultados de volta ao Gemini
                response = chat.send_message(tool_results)

            # Extrai texto final
            final_text = self._extract_text(response)

            # Atualiza histórico (mantém últimas 10 trocas)
            self.historico[sender] = chat.history[-20:]

            return final_text

        except Exception as e:
            logger.error(f"Erro ao processar mensagem: {e}", exc_info=True)
            return "❌ Ocorreu um erro ao processar sua mensagem. Tente novamente."

    def _extract_tool_calls(self, response) -> list:
        """Extrai chamadas de função da resposta do Gemini."""
        calls = []
        try:
            for part in response.parts:
                if hasattr(part, "function_call") and part.function_call:
                    fc = part.function_call
                    calls.append({
                        "name": fc.name,
                        "args": dict(fc.args) if fc.args else {}
                    })
        except Exception:
            pass
        return calls

    def _extract_text(self, response) -> str:
        """Extrai texto da resposta do Gemini."""
        try:
            text = response.text
            return text.strip() if text else "Processado com sucesso."
        except Exception:
            return "Operação concluída."

    def _execute_tool(self, name: str, args: dict) -> str:
        """Executa a função solicitada pelo Gemini."""
        try:
            if name == "consultar_banco":
                return self._tool_consultar_banco(args)
            elif name == "ler_planilha":
                return self._tool_ler_planilha(args)
            elif name == "gerar_relatorio_pdf":
                return self._tool_gerar_relatorio(args)
            elif name == "ler_pdf":
                return self._tool_ler_pdf(args)
            else:
                return f"Função desconhecida: {name}"
        except Exception as e:
            logger.error(f"Erro na função {name}: {e}")
            return f"Erro ao executar {name}: {str(e)}"

    def _tool_consultar_banco(self, args: dict) -> str:
        sql = args.get("sql", "").strip()
        # Segurança: só permite SELECT
        if not re.match(r"^\s*SELECT\b", sql, re.IGNORECASE):
            return "Erro: apenas consultas SELECT são permitidas"

        rows, columns = self.db.query(sql)
        if not rows:
            return "Nenhum resultado encontrado"

        # Formata como texto
        lines = [" | ".join(str(c) for c in columns)]
        lines.append("-" * len(lines[0]))
        for row in rows[:50]:  # Limita 50 linhas
            lines.append(" | ".join(str(v) for v in row))

        if len(rows) > 50:
            lines.append(f"... e mais {len(rows) - 50} registros")

        return "\n".join(lines)

    def _tool_ler_planilha(self, args: dict) -> str:
        aba = args.get("aba", "")
        filtro = args.get("filtro", "")

        if not aba:
            abas = self.sheets.list_sheets()
            return f"Abas disponíveis: {', '.join(abas)}"

        dados = self.sheets.read_sheet(aba, filtro)
        if not dados:
            return f"Aba '{aba}' está vazia ou não foi encontrada"

        # Formata como texto
        lines = []
        for i, row in enumerate(dados[:50]):
            if i == 0:
                lines.append(" | ".join(str(v) for v in row))
                lines.append("-" * len(lines[0]))
            else:
                lines.append(" | ".join(str(v) for v in row))

        if len(dados) > 51:
            lines.append(f"... e mais {len(dados) - 51} linhas")

        return "\n".join(lines)

    def _tool_gerar_relatorio(self, args: dict) -> str:
        titulo = args.get("titulo", "Relatório")
        conteudo = args.get("conteudo", "")
        fonte = args.get("fonte_dados", "dados")

        filename = self.report.generate_pdf(titulo, conteudo, fonte)
        base_url = os.getenv("BASE_URL", "http://localhost:5000")
        link = f"{base_url}/reports/{filename}"

        return f"PDF gerado com sucesso! Link: {link}"

    def _tool_ler_pdf(self, args: dict) -> str:
        nome = args.get("nome_arquivo", "")
        pdfs_dir = os.path.abspath("pdfs")

        if not os.path.exists(pdfs_dir):
            os.makedirs(pdfs_dir)

        if not nome:
            arquivos = [f for f in os.listdir(pdfs_dir) if f.endswith(".pdf")]
            if not arquivos:
                return "Nenhum PDF encontrado na pasta 'pdfs/'"
            return f"PDFs disponíveis: {', '.join(arquivos)}"

        caminho = os.path.join(pdfs_dir, nome)
        if not os.path.exists(caminho):
            return f"Arquivo '{nome}' não encontrado na pasta 'pdfs/'"

        texto = self.report.extract_pdf_text(caminho)
        # Limita o texto para não sobrecarregar o contexto
        if len(texto) > 8000:
            texto = texto[:8000] + "\n\n[... texto truncado ...]"

        return texto
