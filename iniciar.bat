@echo off
echo =========================================
echo   Bot WhatsApp - Administrativo Jacy
echo =========================================
echo.

REM Verifica se node_modules existe, senao instala
if not exist node_modules (
    echo [INFO] Instalando dependencias - isso so acontece na primeira vez...
    call npm install
    echo.
)

echo [INFO] Iniciando o bot no terminal...
echo [INFO] O Painel e o Tunel serao abertos automaticamente.
echo.
node bot.js

pause