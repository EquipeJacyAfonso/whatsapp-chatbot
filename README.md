# 🤖 Bot WhatsApp — Jacy Afonso (PT/DF)

Bot administrativo para grupo do WhatsApp. Sem Docker, sem servidor externo — roda direto no Windows.

**Stack:** Baileys · Gemini Flash · PostgreSQL (Neon) · Google Sheets · Cloudflare Tunnel

---

## ⚡ Instalação rápida

### 1. Pré-requisitos
- **Node.js** (qualquer versão ≥ 18) → https://nodejs.org
- **Cloudflared** → `winget install Cloudflare.cloudflared` no PowerShell

### 2. Configurar

```cmd
cd jacy-bot
copy .env.example .env
```

Abra o `.env` e preencha:

| Variável | Como obter |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| `DATABASE_URL` | https://neon.tech → Connection string |
| `SPREADSHEET_ID` | ID na URL da planilha (entre `/d/` e `/edit`) |
| `GOOGLE_CREDENTIALS_JSON` | JSON da Service Account em uma linha (veja abaixo) |

**Converter JSON da Service Account para uma linha:**
```cmd
node -e "const f=require('./credenciais.json');console.log(JSON.stringify(f))"
```
Cole o resultado em `GOOGLE_CREDENTIALS_JSON=`

**Compartilhar a planilha com o bot:**
Abra a planilha → Compartilhar → cole o e-mail da service account (`...@projeto.iam.gserviceaccount.com`)

### 3. Iniciar

Dê duplo clique em **`iniciar.bat`**

Na primeira vez:
1. Um QR Code vai aparecer no terminal
2. Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
3. Escaneie o QR
4. O bot vai listar os grupos disponíveis com seus IDs
5. Copie o ID do grupo desejado e cole em `GROUP_ID=` no `.env`
6. Feche e abra o `iniciar.bat` novamente

---

## 📁 PDFs para leitura

Coloque arquivos PDF na pasta `pdfs/` e peça ao bot para ler:

> *"Leia o arquivo ata_reuniao.pdf e faça um resumo"*

---

## 💬 Exemplos de uso no grupo

| Mensagem | O que o bot faz |
|---|---|
| `Quem está inadimplente?` | Consulta o PostgreSQL |
| `Mostra a aba Moradores` | Lê o Google Sheets |
| `Gera relatório de pagamentos de maio` | Cria PDF + envia link |
| `Leia o arquivo ata_abril.pdf` | Extrai e resume o PDF |
| `Quantos moradores temos cadastrados?` | Consulta o banco |

---

## 🔁 Uso diário

Basta dar duplo clique no `iniciar.bat`. A sessão do WhatsApp fica salva na pasta `auth_session/` — não precisa escanear o QR toda vez.

> ⚠️ Se deslogar (trocar de celular, etc), delete a pasta `auth_session/` e escaneie novamente.

---

## 💰 Custo mensal

| Serviço | Plano | Custo |
|---|---|---|
| Gemini Flash | Free (1500 req/dia) | R$ 0 |
| Neon PostgreSQL | Free (0.5 GB) | R$ 0 |
| Google Sheets | Free | R$ 0 |
| Cloudflare Tunnel | Free | R$ 0 |
| **Total** | | **R$ 0** |
