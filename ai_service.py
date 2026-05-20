"""
Serviço de IA — OpenAI GPT-4o com Function Calling.
"""

import json
import logging
import os
from openai import OpenAI

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é um assistente inteligente para WhatsApp que responde perguntas
com base em dados de um banco PostgreSQL e Google Drive.

Você tem acesso às seguintes funções:
- buscar_endereco: busca o endereço de uma pessoa pelo nome ou CPF
- contar_pessoas_localidade: conta quantas pessoas existem em uma cidade/estado/bairro
- listar_pessoas_localidade: lista pessoas em uma localidade
- buscar_no_drive: busca arquivos ou planilhas no Google Drive
- gerar_relatorio: gera um relatório PDF e retorna o link para download

Regras:
1. Responda sempre em português brasileiro
2. Seja direto e objetivo — estamos no WhatsApp, sem formatações complexas
3. Se não encontrar dados, informe claramente
4. Nunca invente dados — use apenas os retornados pelas funções
5. Para relatórios, confirme com o usuário antes de gerar se não estiver claro
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_endereco",
            "description": "Busca o endereço completo de uma pessoa pelo nome ou CPF.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nome": {"type": "string", "description": "Nome completo ou parcial"},
                    "cpf":  {"type": "string", "description": "CPF da pessoa (opcional)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contar_pessoas_localidade",
            "description": "Conta o número de pessoas cadastradas em uma cidade, estado ou bairro.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cidade": {"type": "string"},
                    "estado": {"type": "string", "description": "Sigla do estado, ex: SP"},
                    "bairro": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "listar_pessoas_localidade",
            "description": "Lista pessoas em uma localidade com nome e contato.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cidade":  {"type": "string"},
                    "estado":  {"type": "string"},
                    "bairro":  {"type": "string"},
                    "limite":  {"type": "integer", "description": "Máximo de registros (padrão 10)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_no_drive",
            "description": "Busca arquivos ou dados em planilhas do Google Drive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "termo": {"type": "string", "description": "Termo de busca"},
                    "tipo":  {"type": "string", "description": "planilha, documento ou qualquer"},
                },
                "required": ["termo"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "gerar_relatorio",
            "description": "Gera um relatório PDF com dados do banco e retorna o link para download.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tipo": {
                        "type": "string",
                        "enum": ["pessoas_por_cidade", "listagem_geral", "personalizado"],
                    },
                    "filtros": {
                        "type": "object",
                        "description": "Filtros opcionais: cidade, estado, bairro",
                    },
                    "titulo": {"type": "string", "description": "Título personalizado"},
                },
                "required": ["tipo"],
            },
        },
    },
]


class AIService:
    def __init__(self, db_service, gdrive_service, report_service):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        self.db = db_service
        self.drive = gdrive_service
        self.report = report_service
        self.conversation_history: dict[str, list] = {}

    def process_message(self, sender: str, message: str) -> str:
        """Processa a mensagem do usuário e retorna a resposta."""
        try:
            history = self.conversation_history.get(sender, [])
            history.append({"role": "user", "content": message})

            # Mantém no máximo as últimas 20 mensagens
            if len(history) > 20:
                history = history[-20:]

            response_text = self._call_openai(history)

            history.append({"role": "assistant", "content": response_text})
            self.conversation_history[sender] = history

            return response_text

        except Exception as e:
            logger.error(f"Erro ao processar mensagem: {e}", exc_info=True)
            return "Desculpe, ocorreu um erro interno. Tente novamente em instantes."

    def _call_openai(self, messages: list) -> str:
        """Chama a API da OpenAI com suporte a function calling."""
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        response = self.client.chat.completions.create(
            model=self.model,
            tools=TOOLS,
            tool_choice="auto",
            messages=full_messages,
        )

        # Loop até não haver mais chamadas de função
        while response.choices[0].finish_reason == "tool_calls":
            msg = response.choices[0].message
            full_messages.append(msg)  # adiciona a resposta do assistente com tool_calls

            for tool_call in msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                logger.info(f"Chamando função: {fn_name} | args: {fn_args}")
                result = self._execute_function(fn_name, fn_args)

                full_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

            response = self.client.chat.completions.create(
                model=self.model,
                tools=TOOLS,
                tool_choice="auto",
                messages=full_messages,
            )

        return response.choices[0].message.content or "Não consegui gerar uma resposta."

    def _execute_function(self, name: str, args: dict) -> dict:
        """Executa a função solicitada pelo modelo."""
        try:
            if name == "buscar_endereco":
                return self.db.buscar_endereco(**args)

            elif name == "contar_pessoas_localidade":
                return self.db.contar_pessoas_localidade(**args)

            elif name == "listar_pessoas_localidade":
                return self.db.listar_pessoas_localidade(**args)

            elif name == "buscar_no_drive":
                return self.drive.buscar(
                    termo=args["termo"],
                    tipo=args.get("tipo", "qualquer"),
                )

            elif name == "gerar_relatorio":
                dados = self.db.buscar_dados_relatorio(
                    tipo=args["tipo"],
                    filtros=args.get("filtros", {}),
                )
                link = self.report.gerar(
                    tipo=args["tipo"],
                    dados=dados,
                    titulo=args.get("titulo"),
                )
                return {"link": link, "registros": len(dados)}

            else:
                return {"erro": f"Função desconhecida: {name}"}

        except Exception as e:
            logger.error(f"Erro na função {name}: {e}", exc_info=True)
            return {"erro": str(e)}
