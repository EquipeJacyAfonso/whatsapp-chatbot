@echo off
echo =========================================
echo   Bot WhatsApp - Administrativo Jacy
echo =========================================
echo.

REM Verifica se node_modules existe, senão instala
if not exist node_modules (
    echo [INFO] Instalando dependencias (isso so acontece na primeira vez)...
    call npm install
    echo.
)

REM Abre a janela do tunel do Cloudflare
echo [INFO] Abrindo tunel Cloudflare para PDFs...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

timeout /t 2 /nobreak >nul

REM Inicia o bot, mas abre a página de configuração no navegador caso falte a chave
start http://localhost:3000/config

echo [INFO] O Painel de Configuracao foi aberto no seu navegador!
echo [INFO] Se o bot ainda nao estiver configurado, preencha os dados e clique em Salvar.
echo.
echo [INFO] Iniciando o bot no terminal...
echo.
node bot.js

pause