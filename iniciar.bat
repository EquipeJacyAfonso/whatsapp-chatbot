@echo off
echo =========================================
echo   Bot WhatsApp - Jacy Afonso (PT/DF)
echo =========================================
echo.

REM Verifica se o .env existe
if not exist .env (
    echo [ERRO] Arquivo .env nao encontrado!
    echo Copie o .env.example para .env e preencha as variaveis.
    pause
    exit /b 1
)

REM Verifica se node_modules existe
if not exist node_modules (
    echo [INFO] Instalando dependencias pela primeira vez...
    call npm install
    echo.
)

echo [INFO] Abrindo tunel Cloudflare em nova janela...
echo [DICA] Copie a URL gerada e coloque em BASE_URL no .env
echo.
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

timeout /t 2 /nobreak >nul

echo [INFO] Iniciando o bot...
echo.
node bot.js

pause
