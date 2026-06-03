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
3. O script vai instalar as dependências automaticamente, buscará de forma inteligente uma porta livre e abrirá o seu navegador em uma **Interface de Configuração** (`http://localhost:3000/config` ou similar).

### Passo 3: Preencher o Painel de Configuração Inteligente
Na tela que se abrir no seu navegador, você preencherá as chaves necessárias sem precisar editar códigos:

| Campo | O que é e onde conseguir? |
|---|---|
| **📱 Seleção do Grupo** | Menu dinâmico para escolher o grupo monitorado (ficará disponível após o Passo 4). |
| **🧠 API Key da IA** | A "chave" para a inteligência artificial funcionar. Crie uma conta no [Groq Console](https://console.groq.com/keys) e gere uma API Key de graça. |
| **🗄️ Link do Banco de Dados** | Link do seu banco de dados PostgreSQL. Recomendamos o site [Neon.tech](https://neon.tech) (gratuito). Copie e cole a "Connection String" de lá. |
| **📊 ID da Planilha Google** | Abra sua planilha do Google Sheets. O ID é o código gigante presente na barra de endereços da URL, entre `/d/` e `/edit`. |
| **🔑 Credenciais JSON** | **Fácil e Automático!** Clique no botão de upload e escolha o arquivo `.json` da sua Service Account (Conta de Serviço) baixado do Google Cloud. A interface converte o arquivo inteiro em uma linha única para você! |

**Muito Importante:** Para o bot ler sua planilha do Google, vá na sua planilha -> Clique em "Compartilhar" -> e adicione o e-mail da sua Service Account (ex: `seu-projeto@...iam.gserviceaccount.com`).

Após preencher, clique em **Salvar e Reiniciar Bot**. A página fechará. Encerre a janela preta do terminal do bot e abra o `iniciar.bat` novamente.

### Passo 4: Conectar ao WhatsApp
Ao rodar o `iniciar.bat` após preencher os dados iniciais do painel:
1. Uma janela preta (terminal) mostrará um **QR Code**.
2. Abra o WhatsApp no seu celular » Dispositivos conectados » Conectar dispositivo.
3. Escaneie a tela do seu computador.
4. O bot se conectará e salvará os grupos ativos na memória. Recarregue a página de configuração no seu navegador (`http://localhost:3000/config`), selecione o seu grupo no menu de escolha que apareceu e clique em Salvar mais uma vez.

Pronto! Agora o bot está pronto e monitorando o grupo escolhido.

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