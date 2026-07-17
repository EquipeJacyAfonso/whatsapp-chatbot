# 🤖 Bot WhatsApp Administrativo — Jacy Afonso (PT/DF)

Bot que responde perguntas em linguagem natural sobre os dados da campanha diretamente no WhatsApp. Consulta automaticamente o **banco de dados PostgreSQL**, **Google Sheets** e **Google Drive**, e pode gerar **relatórios em PDF** que ficam disponíveis via link para download — tudo sem digitar uma única linha de SQL.

**Exemplos de perguntas que o bot responde:**
- *"Quantos apoiadores temos cadastrados por cidade?"*
- *"Quais demandas estão em aberto esta semana?"*
- *"Gere um PDF com os participantes do último evento"*
- *"Leia a ata da reunião que está no Drive e faça um resumo"*
- *"Mostre a planilha de voluntários filtrando por SP"*

---

## 🏗️ Arquitetura

```
WhatsApp ←→ Baileys (Node.js)
                 │
                 ▼
           services/ai.js  ←─ escolhe o provedor mais barato
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
      PostgreSQL Sheets  Drive/PDF
         └───────┴───────┘
                 │
                 ▼
         Relatório em texto
         ou PDF via link
```

**Stack completa:** Node.js · Baileys · Groq/Gemini/Claude · PostgreSQL · Google Sheets · Google Drive · PDFKit · Cloudflare Tunnel

---

## 💰 Custo Mensal Estimado

| Serviço | Plano | Custo |
|---|---|---|
| **Groq** (IA padrão) | Free — 1000 req/dia, 14400 tokens/min | **R$ 0** |
| **Gemini Flash** (alternativa) | Free — 1500 req/dia | **R$ 0** |
| **Claude Haiku** (mais inteligente) | Pago — ~$0.0008/1K tokens | ~**R$ 5-15/mês** |
| **Neon PostgreSQL** | Free — 0.5 GB | **R$ 0** |
| **Google Sheets / Drive** | Free | **R$ 0** |
| **Cloudflare Tunnel** | Free | **R$ 0** |

---

## 📋 Pré-requisitos

Você vai precisar de:

1. **Windows 10/11** com acesso à internet
2. **Node.js LTS** (versão 18 ou superior)
3. **Cloudflared** (para gerar links públicos dos PDFs)
4. Uma conta **Google Cloud** (gratuita) para acessar Sheets e Drive
5. Uma conta **Neon.tech** (gratuita) para o banco de dados PostgreSQL
6. Uma chave de API de IA (Groq é gratuito e recomendado)

---

## 🚀 Instalação Passo a Passo

### Passo 1 — Instalar Node.js

1. Acesse **https://nodejs.org**
2. Clique no botão verde **"LTS"** para baixar a versão estável
3. Execute o instalador e avance em todas as telas com "Next"
4. Para confirmar a instalação, abra o **Prompt de Comando** (tecla Windows + R → digite `cmd`) e execute:
   ```
   node --version
   ```
   Deve mostrar algo como `v20.x.x`. Se aparecer, está instalado.

---

### Passo 2 — Instalar Cloudflared

O Cloudflared cria um link HTTPS público temporário para que os links de PDF funcionem no WhatsApp.

Abra o **PowerShell como administrador** (clique com botão direito no menu iniciar → "Windows PowerShell (Admin)") e execute:

```powershell
winget install Cloudflare.cloudflared
```

Feche e reabra o terminal após a instalação.

---

### Passo 3 — Criar o banco de dados PostgreSQL (gratuito)

1. Acesse **https://neon.tech** e crie uma conta gratuita
2. Clique em **"New Project"** e dê um nome (ex: `jacy-campanha`)
3. Após criar, clique em **"Connection string"** e copie a URL que começa com `postgres://...`
4. Guarde essa URL — você vai precisar no Passo 7

> **Dica:** O plano gratuito do Neon suporta 0.5 GB e é suficiente para milhares de registros.

---

### Passo 4 — Criar a Conta de Serviço Google (Service Account)

A Service Account é o que permite o bot ler suas planilhas e arquivos no Drive de forma segura.

**4.1 — Criar o projeto no Google Cloud:**
1. Acesse **https://console.cloud.google.com**
2. No topo, clique em "Selecionar projeto" → **"Novo Projeto"**
3. Dê um nome (ex: `jacy-bot`) e clique em **"Criar"**

**4.2 — Ativar as APIs:**
1. No menu esquerdo, vá em **"APIs e Serviços" → "Biblioteca"**
2. Pesquise e ative **"Google Sheets API"** (clique em Ativar)
3. Pesquise e ative **"Google Drive API"** (clique em Ativar)

**4.3 — Criar a conta de serviço:**
1. Vá em **"APIs e Serviços" → "Credenciais"**
2. Clique em **"+ Criar Credenciais" → "Conta de serviço"**
3. Dê um nome (ex: `jacy-bot-reader`) e clique em **"Concluído"**
4. Clique na conta de serviço criada na lista
5. Vá na aba **"Chaves"** → **"Adicionar chave" → "Criar nova chave"**
6. Selecione **JSON** e clique em **"Criar"**
7. Um arquivo `.json` será baixado automaticamente — **guarde-o com cuidado**

**4.4 — Compartilhar sua planilha e pasta do Drive com o bot:**
1. Abra o arquivo `.json` baixado com o Bloco de Notas
2. Copie o valor do campo `"client_email"` (algo como `jacy-bot@projeto.iam.gserviceaccount.com`)
3. Abra sua **planilha do Google Sheets** → clique em **"Compartilhar"** → cole o e-mail → permissão **"Leitor"** → clique em **"Enviar"**
4. Abra a **pasta do Google Drive** com seus PDFs → clique em **"Compartilhar"** → cole o mesmo e-mail → permissão **"Leitor"**

---

### Passo 5 — Obter a chave de API da IA (gratuito com Groq)

1. Acesse **https://console.groq.com/keys**
2. Faça login (pode usar conta Google)
3. Clique em **"Create API Key"**
4. Copie a chave gerada (começa com `gsk_...`) — você vai usar no Passo 7

> **Alternativas gratuitas:**
> - Google Gemini: https://aistudio.google.com/app/apikey
> - Anthropic Claude (pago, mais preciso): https://console.anthropic.com/keys

---

### Passo 6 — Baixar e configurar o bot

1. Baixe ou clone este repositório para uma pasta no seu computador (ex: `C:\jacy-bot\`)
2. Dentro da pasta, você verá o arquivo **`iniciar.bat`**

---

### Passo 7 — Iniciar pela primeira vez

1. Dê **duplo clique** no arquivo **`iniciar.bat`**
2. O bot vai instalar as dependências automaticamente (pode demorar 1-2 minutos na primeira vez)
3. Após isso, uma **janela do navegador abrirá automaticamente** com o Painel de Configuração
4. Preencha todos os campos no painel:
   - **Grupo do WhatsApp:** aparece após você escanear o QR Code (veja abaixo)
   - **Provedor de IA:** escolha Groq (gratuito)
   - **Chave de API:** cole a chave do Passo 5
   - **DATABASE_URL:** cole a string de conexão do Passo 3
   - **ID da Planilha:** ID do Google Sheets (veja dica abaixo)
   - **ID da Pasta do Drive:** ID da pasta do Google Drive (veja dica abaixo)
   - **Credenciais Google:** faça upload do arquivo `.json` do Passo 4
5. Clique em **"Salvar e reiniciar bot"**

**Como encontrar o ID da planilha:**
Abra a planilha no navegador. A URL será algo como:
```
https://docs.google.com/spreadsheets/d/  1BxiMVs0XRA5nF...aquiéoID.../edit
```
Copie o trecho entre `/d/` e `/edit`.

**Como encontrar o ID da pasta do Drive:**
Abra a pasta no Drive. A URL será:
```
https://drive.google.com/drive/folders/  1aBcDeFg...aquiéoID...
```
Copie o trecho final após `/folders/`.

---

### Passo 8 — Conectar o WhatsApp

1. No terminal aberto pelo `iniciar.bat`, você verá um **QR Code** em texto
2. No seu celular, abra o **WhatsApp** → toque nos três pontinhos → **"Aparelhos conectados"** → **"Conectar aparelho"**
3. Aponte a câmera para o QR Code na tela do computador
4. O terminal mostrará `✅ WhatsApp conectado com sucesso!`

---

### Passo 9 — Selecionar o grupo

1. Após conectar o WhatsApp, o bot listará os grupos disponíveis
2. **Atualize a página do painel admin** no navegador (`http://localhost:3000/config`)
3. Um seletor de grupos aparecerá — escolha o grupo alvo
4. Clique em **"Salvar e reiniciar bot"**
5. Feche a janela preta do terminal e dê **duplo clique no `iniciar.bat`** novamente

O bot está pronto! Mande uma mensagem no grupo configurado.

---

## 📁 Estrutura de Arquivos

```
jacy-bot/
├── bot.js              # Ponto de entrada — conexão WhatsApp
├── server.js           # Painel admin + servidor de PDFs
├── iniciar.bat         # Atalho Windows para iniciar tudo
├── package.json        # Dependências Node.js
├── .env                # Suas configurações (não versionar!)
├── .env.example        # Modelo de configuração
├── services/
│   ├── ai.js           # Motor de IA multi-provedor (Groq/Gemini/Claude)
│   ├── db.js           # Conexão PostgreSQL
│   ├── sheets.js       # Leitura Google Sheets
│   ├── drive.js        # Listagem e download de PDFs do Drive
│   └── reports.js      # Geração de PDFs com PDFKit
├── reports/            # PDFs gerados (criado automaticamente)
└── pdfs/               # PDFs baixados do Drive (cache local)
```

---

## 🔁 Uso diário

Basta dar **duplo clique no `iniciar.bat`**. A sessão do WhatsApp fica salva — não precisa escanear o QR Code toda vez.

> ⚠️ **Se deslogar** (trocou de celular, ficou muito tempo offline etc): delete a pasta `auth_session/` e escaneie o QR Code novamente.

---

## 💬 Exemplos de uso no grupo

| Mensagem | O que o bot faz |
|---|---|
| `Quantos apoiadores temos?` | Consulta o PostgreSQL e responde com o total |
| `Apoiadores por cidade` | Usa a view `apoiadores_por_cidade` e formata a lista |
| `Demandas em aberto` | Consulta a view `demandas_abertas` |
| `Mostra a aba Voluntários da planilha` | Lê o Google Sheets |
| `Filtra a aba Voluntários por São Paulo` | Lê e filtra o Sheets |
| `O que tem no Drive?` | Lista os PDFs disponíveis na pasta configurada |
| `Leia a ata de abril e faça um resumo` | Baixa e lê o PDF do Drive |
| `Gere um relatório PDF dos eventos de junho` | Cria PDF e envia link |

---

## 🔧 Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `AI_PROVIDER` | `groq`, `gemini` ou `anthropic` |
| `AI_API_KEY` | Chave de API do provedor escolhido |
| `AI_MODEL` | Modelo específico (opcional; usa padrão se vazio) |
| `DATABASE_URL` | String de conexão PostgreSQL |
| `SPREADSHEET_ID` | ID da planilha Google Sheets |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta no Google Drive |
| `GOOGLE_CREDENTIALS_JSON` | JSON da Service Account em uma linha |
| `GROUP_ID` | ID do grupo WhatsApp monitorado |
| `BASE_URL` | URL pública do Cloudflare Tunnel |
| `PORT` | Porta do servidor local (padrão: 3000) |
| `REPORTS_DIR` | Pasta para salvar PDFs gerados (padrão: reports) |

---

## ❓ Perguntas frequentes

**O QR Code expirou antes de eu escanear.**
Aguarde — o bot gera um novo automaticamente após alguns segundos.

**O bot não responde minhas mensagens.**
Verifique se o `GROUP_ID` está configurado corretamente no painel. O bot ignora mensagens de outros grupos por segurança.

**Os links de PDF não funcionam no WhatsApp.**
A `BASE_URL` precisa ser a URL pública do Cloudflare Tunnel (começa com `https://`). Copie do terminal e cole no painel admin.

**"Chave de API não configurada" aparece nas respostas.**
Abra o painel (`http://localhost:3000/config`), verifique se a chave está preenchida e clique em Salvar.

**O Groq retorna erro de rate limit.**
O plano gratuito do Groq tem limite de requisições por minuto. O bot aguarda automaticamente e tenta de novo. Para uso intenso, considere mudar para Gemini ou Claude.
