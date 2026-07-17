@echo off
title Jacy Bot Admin — WhatsApp
color 0A
echo.
echo  =========================================================
echo     BOT WHATSAPP ADMINISTRATIVO — JACY AFONSO (PT/DF)
echo  =========================================================
echo.

REM Verifica Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Node.js nao encontrado!
    echo  Baixe em: https://nodejs.org  e instale a versao LTS.
    pause
    exit /b 1
)

REM Verifica cloudflared
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo  [AVISO] Cloudflared nao encontrado.
    echo  Links de PDF nao funcionarao no WhatsApp.
    echo  Para instalar: winget install Cloudflare.cloudflared
    echo.
)

REM Instala dependencias se necessario
if not exist node_modules (
    echo  [INFO] Instalando dependencias (primeira vez, pode demorar)...
    call npm install
    echo.
)

REM Cria .env se nao existir
if not exist .env (
    copy .env.example .env >nul
    echo  [INFO] Arquivo .env criado a partir do .env.example.
    echo  O painel de configuracao abrira no seu navegador.
    echo.
)

echo  [INFO] Iniciando bot...
echo  [INFO] O painel de configuracao abrira automaticamente no navegador.
echo.
echo  Para encerrar o bot, feche esta janela ou pressione Ctrl+C
echo.

node bot.js

pause
