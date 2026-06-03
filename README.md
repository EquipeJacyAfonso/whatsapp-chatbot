# 🤖 Bot WhatsApp Administrativo — Jacy Afonso (PT/DF)

Chatbot administrativo inteligente projetado para gerar relatórios automatizados via mensagens no WhatsApp ou arquivos comprimidos em PDF a partir de consultas automáticas realizadas em bancos de dados estruturados (**PostgreSQL**) e planilhas integradas (**Google Sheets**).

O ecossistema opera de forma focada no menor custo possível, utilizando provedores econômicos ou com generosas camadas gratuitas de processamento cognitivo (Groq Llama 3, Google Gemini Flash ou Anthropic Claude Haiku).

---

## 🛠️ Guia do Usuário: Instalação Passo a Passo

Siga rigorosamente as etapas abaixo para ligar o chatbot no seu computador Windows sem precisar alterar nenhuma linha de código.

### Passo 1: Pré-requisitos do Sistema
Certifique-se de que o seu ambiente de trabalho possui as ferramentas de leitura ativas:
1. **Node.js:** Baixe e instale a versão estável recomendada (LTS) diretamente do site oficial: [nodejs.org](https://nodejs.org/).
2. **Cloudflared (Túnel Seguro):** Abra o menu iniciar do Windows, digite `PowerShell`, abra o terminal e execute o seguinte comando para instalar o gerador de links de PDF:
   ```powershell
   winget install Cloudflare.cloudflared