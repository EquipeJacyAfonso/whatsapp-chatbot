"""
Serviço de IA — Google Gemini (substitui OpenAI GPT-4o)
Modelo padrão: gemini-2.5-flash-lite (gratuito: 15 RPM, 1.000 req/dia)
Para mais capacidade, troque para: gemini-2.5-flash (10 RPM, 250 req/dia)
"""

import os
import json
import logging
import google.generativeai as genai
from google.generativeai.types import FunctionDeclaration, Tool

logger = logging.getLogger(__name__)

# ── Configuração ──────────────────────────────────────────────────────────────
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite-preview-06-17")

SYSTEM_PROMPT = """Você é um assistente virtual da Administração do Jacy Afonso (PT/DF).
Responda sempre em português brasileiro, de forma clara e objetiva.
Você tem acesso a ferramentas para consultar o banco de dados PostgreSQL,
arquivos no Google Drive e gerar relatórios em PDF.
Sempre que o usuário pedir dados, use as ferramentas disponíveis antes de responder."""

# ── Declaração das ferramentas (Function Calling) ─────────────────────────────
TOOLS = Tool(function_declarations=[
    FunctionDeclaration(
        name="buscar_no_banco",
        description="Busca informações no banco de dados PostgreSQL. Use para consultas sobre pessoas, endereços, bairros, cidades ou qualquer dado cadastral.",
        parameters={
            "type": "object",
            "properties": {
                "query_type": {
                    "type": "string",
                    "enum": ["buscar_por_nome", "buscar_por_cidade", "buscar_por_bairro", "contar_por_cidade", "listar_todos"],
                    "description": "Tipo de consulta a ser executada"
                },
                "parametro": {
                    "type": "string",
                    "description": "Valor a ser pesquisado (nome, cidade, bairro, etc.)"
                }
            },
            "required": ["query_type"]
        }
    ),
    FunctionDeclaration(
        name="buscar_no_drive",
        description="Busca arquivos e planilhas no Google Drive. Use quando o usuário mencionar planilhas, documentos ou arquivos.",
        parameters={
            "type": "object",
            "properties": {
                "nome_arquivo": {
                    "type": "string",
                    "description": "Nome ou parte do nome do arquivo a buscar"
                }
            },
            "required": ["nome_arquivo"]
        }
    ),
    FunctionDeclaration(
        name="gerar_relatorio_pdf",
        description="Gera um relatório em PDF com os dados solicitados e retorna o link para download.",
        parameters={
            "type": "object",
            "properties": {
                "tipo_relatorio": {
                    "type": "string",
                    "description": "Descrição do relatório a ser gerado (ex: 'pessoas por cidade', 'lista do bairro X')"
                },
                "filtro": {
                    "type": "string",
                    "description": "Filtro a aplicar nos dados (opcional)"
                }
            },
            "required": ["tipo_relatorio"]
        }
    ),
])


class AIService:
    def __init__(self, db_service, gdrive_service, report_service):
        self.db_service = db_service
        self.gdrive_service = gdrive_service
        self.report_service = report_service

        self.model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=SYSTEM_PROMPT,
            tools=[TOOLS],
        )
        # Histórico de conversa por usuário (em memória)
        self._sessions: dict[str, list] = {}

    def _get_history(self, sender: str) -> list:
        return self._sessions.get(sender, [])

    def _save_history(self, sender: str, history: list):
        # Mantém apenas as últimas 20 mensagens para não estourar contexto
        self._sessions[sender] = history[-20:]

    def _execute_tool(self, tool_name: str, tool_args: dict) -> str:
        """Executa a ferramenta chamada pelo Gemini e retorna o resultado como string."""
        try:
            if tool_name == "buscar_no_banco":
                result = self.db_service.query(
                    tool_args.get("query_type"),
                    tool_args.get("parametro", "")
                )
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "buscar_no_drive":
                result = self.gdrive_service.search(tool_args.get("nome_arquivo", ""))
                return json.dumps(result, ensure_ascii=False, default=str)

            elif tool_name == "gerar_relatorio_pdf":
                url = self.report_service.generate(
                    tool_args.get("tipo_relatorio"),
                    tool_args.get("filtro", "")
                )
                return json.dumps({"url_download": url}, ensure_ascii=False)

            else:
                return json.dumps({"erro": f"Ferramenta '{tool_name}' não reconhecida."})

        except Exception as e:
            logger.error(f"Erro ao executar ferramenta '{tool_name}': {e}", exc_info=True)
            return json.dumps({"erro": str(e)})

    def process_message(self, sender: str, message: str) -> str:
        """Processa uma mensagem do WhatsApp e retorna a resposta do bot."""
        try:
            history = self._get_history(sender)
            chat = self.model.start_chat(history=history)

            response = chat.send_message(message)

            # Loop de Function Calling — o Gemini pode chamar ferramentas em sequência
            while True:
                # Verifica se há chamadas de função na resposta
                fn_calls = [
                    part.function_call
                    for candidate in response.candidates
                    for part in candidate.content.parts
                    if part.function_call.name  # parte não vazia
                ]

                if not fn_calls:
                    break  # Sem mais chamadas de função, sai do loop

                # Executa cada ferramenta e envia os resultados de volta
                tool_results = []
                for fn_call in fn_calls:
                    logger.info(f"Gemini chamou ferramenta: {fn_call.name} com args: {dict(fn_call.args)}")
                    result_str = self._execute_tool(fn_call.name, dict(fn_call.args))
                    tool_results.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=fn_call.name,
                                response={"result": result_str}
                            )
                        )
                    )

                response = chat.send_message(tool_results)

            # Extrai o texto final da resposta
            final_text = ""
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text:
                        final_text += part.text

            if not final_text:
                final_text = "Desculpe, não consegui processar sua mensagem. Tente novamente."

            # Salva histórico atualizado
            self._save_history(sender, chat.history)
            return final_text.strip()

        except Exception as e:
            logger.error(f"Erro ao processar mensagem de {sender}: {e}", exc_info=True)
            return "Ocorreu um erro interno. Por favor, tente novamente em alguns instantes."
