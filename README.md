# 🤖 WhatsApp Chatbot — OpenAI + Evolution API + Render.com

Chatbot para WhatsApp que responde perguntas em linguagem natural sobre dados do
PostgreSQL e Google Drive, com geração de relatórios em PDF. 100% gratuito.

---

## 🏗️ Arquitetura

```
WhatsApp → Evolution API → Flask (Render.com) → GPT-4o (Function Calling)
                                                      ├── PostgreSQL
                                                      ├── Google Drive
                                                      └── PDF (ReportLab)
```

---

## 📁 Estrutura

```
whatsapp_chatbot/
├── main.py                     # Flask app + webhook
├── render.yaml                 # Deploy automático no Render
├── requirements.txt
├── .env.example
├── schema.sql
└── services/
    ├── ai_service.py           # OpenAI GPT-4o + Function Calling
    ├── db_service.py           # Queries PostgreSQL
    ├── gdrive_service.py       # Google Drive / Sheets
    ├── report_service.py       # Geração de PDF
    └── whatsapp_service.py     # Envio via Evolution API
```

---

## 🚀 Passo a passo completo

### 1. Suba o código no GitHub

```bash
git init
git add .
git commit -m "primeiro commit"
git remote add origin https://github.com/seu-usuario/whatsapp-chatbot.git
git push -u origin main
```

### 2. Deploy no Render.com (bot principal)

1. Acesse [render.com](https://render.com) → crie conta gratuita
2. *New → Web Service → Connect a repository* → selecione o repositório
3. O Render detecta o `render.yaml` automaticamente
4. Vá em **Environment** e preencha as variáveis marcadas com `sync: false`:
   - `OPENAI_API_KEY` — sua chave em [platform.openai.com](https://platform.openai.com)
   - `DATABASE_URL` — connection string do PostgreSQL
   - `GOOGLE_CREDENTIALS_JSON` — conteúdo do JSON da Service Account em uma linha
   - `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` — após o passo 3
5. Clique em **Deploy** — o Render gera uma URL tipo `https://whatsapp-chatbot.onrender.com`
6. Copie essa URL e coloque em `BASE_URL` nas variáveis de ambiente

> ⚠️ O plano gratuito do Render dorme após 15 min de inatividade. Para manter ativo,
> use [UptimeRobot](https://uptimerobot.com) para fazer ping em `/health` a cada 5 min.

---

### 3. Evolution API no Render (ou VPS)

#### Opção A — Render (gratuito, mais fácil)

1. No Render, crie um novo *Web Service*
2. Use a imagem Docker: `atendai/evolution-api:latest`
3. Adicione as variáveis:
   ```
   AUTHENTICATION_API_KEY=crie-uma-chave-secreta-aqui
   DATABASE_ENABLED=false
   ```
4. Anote a URL gerada (ex: `https://evolution-api.onrender.com`)

#### Opção B — VPS / máquina local com ngrok

```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=minha-chave \
  atendai/evolution-api:latest
```

---

### 4. Conectar o WhatsApp

1. Acesse `https://SUA-EVOLUTION-URL/manager` (ou use a API REST)
2. Crie uma instância: `POST /instance/create` com `{"instanceName": "meu-bot"}`
3. Gere o QR Code: `GET /instance/connect/meu-bot`
4. Escaneie o QR Code com o WhatsApp do celular que vai ser o bot
5. Configure o webhook:
   ```
   POST /webhook/set/meu-bot
   {
     "url": "https://whatsapp-chatbot.onrender.com/webhook/evolution",
     "events": ["MESSAGES_UPSERT"]
   }
   ```

> ⚠️ Use um chip dedicado — o número conectado vira o bot e não pode ser usado normalmente.

---

### 5. Google Drive — Service Account

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto → ative **Drive API** e **Sheets API**
3. *IAM & Admin → Service Accounts → Criar → baixar JSON*
4. Para o Render, cole o conteúdo do JSON inteiro na variável `GOOGLE_CREDENTIALS_JSON`
5. Compartilhe suas planilhas/pastas com o e-mail da service account (`...@projeto.iam.gserviceaccount.com`)

---

### 6. Banco de dados PostgreSQL gratuito

Opções gratuitas compatíveis com o Render:

- **Render PostgreSQL** — crie em *New → PostgreSQL*, ele preenche `DATABASE_URL` automaticamente
- **Neon.tech** — plano gratuito generoso, ótima opção
- **Supabase** — também gratuito, tem painel visual

---

## 💬 Exemplos de uso no WhatsApp

| Mensagem | Ação |
|---|---|
| `Qual o endereço de João Silva?` | Busca no PostgreSQL |
| `Quantas pessoas moram em Recife?` | Conta registros por cidade |
| `Lista pessoas do bairro Boa Vista em PE` | Listagem filtrada |
| `Tem planilha de clientes no Drive?` | Busca no Google Drive |
| `Gera relatório de pessoas por cidade` | Cria PDF e envia link |

---

## 🔧 Rodar localmente (desenvolvimento)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # preencha o .env

# Para expor localmente e testar o webhook:
ngrok http 5000        # use a URL gerada na config do Evolution

python main.py
```
