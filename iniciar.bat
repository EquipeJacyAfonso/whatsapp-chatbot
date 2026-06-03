@echo off
title Jacy Bot - Nucleo Administrativo
echo =======================================================
echo         SISTEMA DE INICIALIZACAO AUTONOMA
echo =======================================================
echo.

if not exist node_modules (
    echo [SISTEMA] Instalando pacotes de dependencias essenciais...
    call npm install
    echo.
)

echo [SISTEMA] Executando rotinas do bot.js...
echo [SISTEMA] O painel de configuracao abrira em seu navegador padrao.
echo.
node bot.js

pause