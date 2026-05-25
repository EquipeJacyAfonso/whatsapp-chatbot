@echo off
echo =========================================
echo   Bot WhatsApp - Jacy Afonso (PT/DF)
echo =========================================
echo.

REM Verifica se o Docker está rodando
docker ps >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Docker Desktop nao esta rodando!
    echo Abra o Docker Desktop e tente novamente.
    pause
    exit /b 1
)

REM Verifica se a Evolution API está rodando
docker ps --filter "name=evolution-api" --filter "status=running" | find "evolution-api" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Iniciando Evolution API...
    docker start evolution-api >nul 2>&1
    if errorlevel 1 (
        echo [AVISO] Container evolution-api nao encontrado.
        echo Rode o comando de instalacao do README primeiro.
    ) else (
        echo [OK] Evolution API iniciada!
    )
) else (
    echo [OK] Evolution API ja esta rodando.
)

echo.
echo [INFO] Abrindo tunel Cloudflare em nova janela...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:5000"

echo.
echo [INFO] Aguardando 3 segundos...
timeout /t 3 /nobreak >nul

echo.
echo [INFO] Iniciando o bot...
echo [DICA] Copie a URL do tunel Cloudflare e atualize BASE_URL no .env se mudou
echo.

call .venv\Scripts\activate.bat
python main.py

pause
