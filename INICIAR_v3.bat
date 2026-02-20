@echo off
setlocal
title KPIs Rosti - SISTEMA INTEGRADO V3

echo ===================================================
echo   INICIANDO SISTEMA KPIS ROSTI (VERSION 3.0)
echo ===================================================
echo.

REM --- 0. Detener procesos viejos ---
echo [PASO 0/6] Deteniendo servidores anteriores...
taskkill /F /IM node.exe 2>nul
iisreset /stop 2>nul
timeout /t 2 /nobreak >nul

REM --- 1. Configurar Entorno Seguro (.env) ---
echo [PASO 1/6] Verificando codigo fuente...
findstr /C:"v2.0 - FIX" "web-app\src\components\LoginPage.tsx" >nul
if %errorlevel% neq 0 goto ERROR_SOURCE

echo    - Codigo fuente actualizado confirmado (v2.0 - FIX detectado).
echo.

echo [PASO 2/6] Configurando credenciales del sistema...
REM -- Creando archivo .env linea por linea para evitar errores de bloque --
echo DB_USER=sa > server\.env
echo DB_PASSWORD=masterkey >> server\.env
echo DB_SERVER=10.29.1.14 >> server\.env
echo DB_DATABASE=RP_BI_RESUMENES >> server\.env
echo. >> server\.env
echo # JWT Secret for authentication >> server\.env
echo JWT_SECRET=R0st1p017 >> server\.env
echo. >> server\.env
echo # Email configuration ^(Microsoft/Outlook^) >> server\.env
echo SMTP_HOST=smtp.office365.com >> server\.env
echo SMTP_PORT=587 >> server\.env
echo SMTP_USER=alertas@rostipolloscr.com >> server\.env
echo SMTP_PASS=Rosti2020 >> server\.env
echo. >> server\.env
echo # Gemini AI ^(for Tactica analysis^) >> server\.env
echo GEMINI_API_KEY=AIzaSyBEuVeCka5ib3-POtEReONq8yYOUZH1MEM >> server\.env
echo. >> server\.env
echo # Security >> server\.env
echo ADMIN_PASSWORD=R0st1p017 >> server\.env
echo. >> server\.env
echo # InvGate Integration >> server\.env
echo INVGATE_CLIENT_ID=019c6eb1-0ee4-723d-91ce-5e547b33ab3b >> server\.env
echo INVGATE_CLIENT_SECRET=n3Pb449eA[04!o^<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP >> server\.env
echo INVGATE_TOKEN_URL=https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token >> server\.env
echo INVGATE_API_BASE_URL=https://rostipollos.cloud.invgate.net/api/v2 >> server\.env
echo INVGATE_SYNC_ENABLED=true >> server\.env
echo INVGATE_SYNC_INTERVAL=1 >> server\.env

echo    - Archivo .env configurado correctamente.

REM --- 1. Forzar Reconstruccion Web (Eliminar versiones viejas) ---
echo.
echo [PASO 3/6] Limpiando versiones anteriores de la pagina web...
if exist "web-app\dist" (
    rmdir /s /q "web-app\dist" 2>nul
    echo    - Carpeta 'dist' eliminada para forzar actualizacion.
)

REM --- 2. Verificar/Instalar dependencias de Web App ---
echo.
echo [PASO 4/6] Verificando dependencias WEB...
cd web-app
call npm install
echo    - Dependencias WEB listas.

REM --- 3. Construir Web App ---
echo.
echo [PASO 5/6] CONSTRUYENDO NUEVA VERSION WEB (Espere unos minutos)...
call npm run build
if %errorlevel% neq 0 goto ERROR_BUILD

cd ..

REM --- 4. Verificar/Instalar dependencias del Servidor ---
echo.
echo [PASO 6/6] Verificando dependencias SERVIDOR...
cd server
call npm install --production
echo    - Dependencias SERVIDOR listas.

REM --- 5. Iniciar Servidor ---
echo.
echo ===================================================
echo [EXITO] SISTEMA ACTUALIZADO Y LISTO
echo ===================================================
echo.
echo   - Backend: http://localhost:3000
echo   - Frontend: Servido automaticamente (v2.0)
echo.
echo Iniciando... (No cierre esta ventana)

start "" "http://localhost:3000"
node server.js

echo.
echo El servidor se ha detenido.
pause
exit /b 0

:ERROR_SOURCE
echo.
echo =========================================================
echo [ERROR FATAL] EL CODIGO FUENTE EN EL SERVIDOR ES VIEJO.
echo =========================================================
echo.
echo La version nueva no se encuentra en "web-app\src\components\LoginPage.tsx".
echo.
echo SOLUCION:
echo 1. Copia la carpeta "web-app" de tu maquina local a este servidor (sobrescribir).
echo 2. Vuelve a ejecutar este archivo.
echo.
pause
exit /b 1

:ERROR_BUILD
echo.
echo [ERROR] Fallo la construccion de la pagina web.
pause
exit /b 1
