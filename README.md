# 🤖 Bot WhatsApp Administrativo — Jacy Afonso (PT/DF)

Este é um chatbot inteligente para WhatsApp criado para auxiliar na administração de campanhas e mandatos. Ele lê dados do **Google Sheets**, consulta bancos de dados (**PostgreSQL**), lê arquivos **PDF** de prestação de contas e gera relatórios automáticos dentro de grupos do WhatsApp.

Tudo isso rodando de forma econômica e acessível. A Inteligência Artificial utilizada (Llama 3 via Groq ou Google Gemini Flash) possui planos gratuitos extremamente generosos.

---

## 🛠️ Como instalar (Passo a Passo Detalhado)

Você não precisa entender de programação para rodar o bot. Siga estas etapas:

### Passo 1: Baixar os programas essenciais
Antes de rodar o bot, você precisa ter dois programas instalados no seu computador Windows:
1. **Node.js**: Acesse [nodejs.org](https://nodejs.org) e baixe a versão recomendada (LTS). Instale clicando em "Avançar" até concluir.
2. **Cloudflared**: Aperte a tecla `Windows` do seu teclado, digite `PowerShell`, abra-o e cole este comando e aperte Enter: `winget install Cloudflare.cloudflared`

### Passo 2: Executar o Bot
1. Acesse a pasta onde estão os arquivos deste bot.
2. Dê um **duplo clique no arquivo `iniciar.bat`**.
3. O script vai instalar as dependências automaticamente e abrirá o navegador em uma **Interface de Configuração** (`http://localhost:3000/config`).

### Passo 3: Preencher o Painel de Configuração
Na tela que se abrir no seu navegador, você precisará preencher os seguintes campos:

| Campo | O que é e onde conseguir? |
|---|---|
| **API Key da IA** | A "chave" para a inteligência artificial funcionar. Crie uma conta no [Groq Console](https://console.groq.com/keys) ou no [Google AI Studio](https://aistudio.google.com/app/apikey) e crie uma API Key. Custa R$ 0,00. |
| **DATABASE_URL** | Link do seu banco de dados PostgreSQL. Recomendamos o site [Neon.tech](https://neon.tech) (gratuito). Após criar um projeto lá, copie a "Connection String". |
| **SPREADSHEET_ID** | Abra sua planilha do Google Sheets. O ID é o código gigante que fica na barra de endereços, entre `/d/` e `/edit`. |
| **GOOGLE CREDENTIALS** | Crie um Projeto no Google Cloud, gere uma "Conta de Serviço" (Service Account) e crie uma chave JSON. Cole todo o conteúdo do arquivo JSON aqui. |

**Muito Importante:** Para o bot ler sua planilha do Google, vá na sua planilha -> Clique em "Compartilhar" -> e adicione o e-mail que está dentro do seu arquivo JSON do Google Cloud.

Após preencher, clique em **Salvar e Reiniciar Bot**. A página se encerrará. Feche a janela preta do terminal do bot e abra o `iniciar.bat` novamente.

### Passo 4: Conectar ao WhatsApp
Ao rodar o `iniciar.bat` pela segunda vez:
1. Uma janela preta (terminal) mostrará um **QR Code**.
2. Abra o WhatsApp no seu celular » Três pontinhos » Dispositivos conectados » Conectar dispositivo.
3. Escaneie a tela do seu computador.
4. O bot enviará no terminal a lista de Grupos que você participa com seus respectivos IDs. Copie o ID do grupo desejado, volte na interface `http://localhost:3000/config` e cole no campo **GROUP_ID**. Salve novamente.

Pronto! Agora o bot só responderá dentro daquele grupo específico.

---

## 💬 Como usar o Chatbot no WhatsApp?

Basta enviar mensagens naturais no grupo. O bot entende o contexto e decide qual ferramenta usar.

**Exemplos de uso:**
* *"Quantos apoiadores temos cadastrados na nossa planilha do Google?"*
* *"Consulte o banco de dados e me diga quais demandas estão com status 'pendente'."*
* *"Leia o arquivo ata_reuniao.pdf que está na pasta e faça um resumo dos tópicos."*
* *"Gere um relatório em PDF com as contas de maio."* -> (Ele enviará um link seguro usando o Cloudflare Tunnel para você baixar o PDF na hora).

---

## 📂 Como colocar PDFs para o bot ler?
Vá até a pasta onde este bot está instalado e procure a pasta `pdfs/`. Arraste os documentos para lá. No WhatsApp, basta dizer: *"Leia o arquivo [nome do arquivo].pdf..."*.

## 💡 Custos da Operação
Esta arquitetura foi feita para ter **custo zero** ou muito próximo a zero:
* **Hospedagem:** Seu próprio computador Windows.
* **Inteligência Artificial:** Groq Llama 3 (Plano Grátis) ou Gemini 1.5 Flash (Plano Grátis).
* **Banco de Dados:** Neon.tech (Plano Grátis de 500MB).
* **WhatsApp API:** Direto via biblioteca local (Baileys), sem custo de disparos da Meta.