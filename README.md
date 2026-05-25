# 🤖 WhatsApp Chatbot — Jacy Afonso (PT/DF)

Chatbot administrativo rodando **100% gratuito** no seu PC Windows.

**Stack:** Gemini Flash · Evolution API (Docker) · Flask · PostgreSQL (Neon) · Google Sheets · Cloudflare Tunnel

---

## ⚠️ Antes de tudo: segurança

Se você tinha um `.env` público no GitHub com senhas reais, **revogue tudo agora**:

1. **Gemini:** https://aistudio.google.com/app/apikey → delete a chave antiga, crie nova
2. **Neon PostgreSQL:** https://console.neon.tech → Settings → Reset password
3. **Google Service Account:** https://console.cloud.google.com → IAM → Service Accounts → sua conta → Keys → delete a chave antiga, crie nova (JSON)

Depois, remova o `.env` do histórico do git:
```
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env" --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```

---

## 🛠️ Instalação (passo a passo)

### 1. Pré-requisitos no Windows

- **Python 3.11+** → https://python.org/downloads (marque "Add to PATH")
- **Docker Desktop** → https://docker.com/products/docker-desktop
- **Cloudflared** → https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Para instalar o Cloudflared via winget (PowerShell):
```powershell
winget install --id Cloudflare.cloudflared
```

---

### 2. Configurar o projeto

```cmd
cd whatsapp-chatbot
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Abra o `.env` no Bloco de Notas e preencha os valores (veja seção abaixo).

---

### 3. Preencher o .env

#### Gemini (IA) — gratuito
1. Acesse https://aistudio.google.com/app/apikey
2. Clique em "Create API Key"
3. Cole em `GEMINI_API_KEY=`

#### Evolution API (chave)
Crie qualquer senha aleatória para `EVOLUTION_API_KEY=` (ex: `minha-chave-secreta-123`)

#### PostgreSQL — Neon.tech (gratuito)
1. Crie conta em https://neon.tech
2. Crie um projeto → copie a "Connection string"
3. Cole em `DATABASE_URL=`

#### Google Sheets
1. Pegue o ID da sua planilha na URL (parte entre `/d/` e `/edit`)
2. Cole em `SPREADSHEET_ID=`
3. Para converter o JSON da Service Account em uma linha, execute:
```cmd
python -c "import json; print(json.dumps(json.load(open('credenciais.json'))))"
```
4. Cole o resultado em `GOOGLE_CREDENTIALS_JSON=`
5. **Compartilhe a planilha** com o e-mail da service account (`...@projeto.iam.gserviceaccount.com`)

---

### 4. Subir a Evolution API (Docker)

Abra o **Docker Desktop** e deixe rodando. Depois, no terminal:

```cmd
docker run -d ^
  --name evolution-api ^
  --restart always ^
  -p 8080:8080 ^
  -e AUTHENTICATION_API_KEY=SUA_CHAVE_AQUI ^
  atendai/evolution-api:latest
```

Substitua `SUA_CHAVE_AQUI` pelo mesmo valor que colocou em `EVOLUTION_API_KEY` no `.env`.

Verifique se subiu: http://localhost:8080

---

### 5. Criar instância e conectar o WhatsApp

No terminal (com o Docker rodando):

```cmd
REM Cria a instância
curl -X POST http://localhost:8080/instance/create ^
  -H "Content-Type: application/json" ^
  -H "apikey: SUA_CHAVE_AQUI" ^
  -d "{\"instanceName\": \"PT-JACY\"}"

REM Gera o QR Code (acesse no navegador)
curl http://localhost:8080/instance/connect/PT-JACY ^
  -H "apikey: SUA_CHAVE_AQUI"
```

Ou acesse **http://localhost:8080/manager** no navegador para interface visual.

Escaneie o QR Code com o WhatsApp do chip que vai ser o bot.

> ⚠️ Use um chip dedicado — o número conectado vira o bot!

---

### 6. Abrir o túnel Cloudflare (URL pública gratuita)

Em um terminal separado:

```cmd
cloudflared tunnel --url http://localhost:5000
```

Vai aparecer uma URL tipo: `https://abc-def-123.trycloudflare.com`

Copie essa URL e coloque no `.env`:
```
BASE_URL=https://abc-def-123.trycloudflare.com
```

---

### 7. Configurar o webhook da Evolution API

```cmd
curl -X PUT http://localhost:8080/webhook/set/PT-JACY ^
  -H "Content-Type: application/json" ^
  -H "apikey: SUA_CHAVE_AQUI" ^
  -d "{\"url\": \"https://SEU-TUNEL.trycloudflare.com/webhook/evolution\", \"events\": [\"MESSAGES_UPSERT\"]}"
```

---

### 8. Iniciar o bot

```cmd
.venv\Scripts\activate
python main.py
```

Pronto! Mande uma mensagem para o número conectado e o bot vai responder.

---

## 📁 PDFs para análise

Para que o bot possa ler PDFs, coloque os arquivos na pasta `pdfs/`:
```
whatsapp-chatbot/
└── pdfs/
    ├── ata_reuniao_jan.pdf
    ├── relatorio_financeiro.pdf
    └── ...
```

Depois peça ao bot: *"Leia o arquivo ata_reuniao_jan.pdf e me faça um resumo"*

---

## 💬 Exemplos de uso

| Mensagem | O que o bot faz |
|---|---|
| `Quem mora na quadra 5?` | Consulta o PostgreSQL |
| `Mostra a aba Moradores da planilha` | Lê o Google Sheets |
| `Gera um relatório de inadimplentes` | Cria PDF para download |
| `Leia o arquivo ata_março.pdf` | Extrai e resume o PDF |
| `Quantas pessoas estão em dia?` | Consulta banco + responde |

---

## 🔁 Para reiniciar (toda vez que ligar o PC)

```cmd
REM 1. Docker Desktop já sobe automaticamente se configurado
REM 2. Terminal 1 — túnel
cloudflared tunnel --url http://localhost:5000

REM 3. Terminal 2 — bot
cd whatsapp-chatbot
.venv\Scripts\activate
python main.py
```

> Dica: crie um arquivo `iniciar.bat` com esses comandos para facilitar.

---

## 💰 Custo mensal estimado

| Serviço | Plano | Custo |
|---|---|---|
| Gemini Flash | Free (1500 req/dia) | R$ 0 |
| Neon PostgreSQL | Free (0.5 GB) | R$ 0 |
| Google Sheets | Free | R$ 0 |
| Evolution API | Self-hosted | R$ 0 |
| Cloudflare Tunnel | Free | R$ 0 |
| **Total** | | **R$ 0** |
