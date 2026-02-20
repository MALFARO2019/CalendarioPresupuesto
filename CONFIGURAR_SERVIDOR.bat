@echo off
setlocal
title KPIs Rosti - CONFIGURACION INICIAL (Solo ejecutar 1 vez)

echo ===================================================
echo   CONFIGURACION INICIAL DEL SERVIDOR
echo   (Solo necesita ejecutarse UNA VEZ)
echo ===================================================
echo.

REM --- 1. Desactivar IIS permanentemente ---
echo [PASO 1/4] Desactivando IIS permanentemente...
iisreset /stop 2>nul
sc config W3SVC start= disabled
echo    - IIS detenido y desactivado del inicio automatico.
echo.

REM --- 2. Abrir puerto 80 en firewall ---
echo [PASO 2/4] Configurando firewall...
netsh advfirewall firewall add rule name="KPIs Rosti HTTP 80" dir=in action=allow protocol=TCP localport=80 2>nul
echo    - Puerto 80 abierto.
echo.

REM --- 3. Crear .env permanente ---
echo [PASO 3/4] Creando archivo de credenciales permanente...
echo DB_USER=sa > C:\Deploy\CalendarioPresupuesto\server\.env
echo DB_PASSWORD=masterkey >> C:\Deploy\CalendarioPresupuesto\server\.env
echo DB_SERVER=10.29.1.14 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo DB_DATABASE=RP_BI_RESUMENES >> C:\Deploy\CalendarioPresupuesto\server\.env
echo. >> C:\Deploy\CalendarioPresupuesto\server\.env
echo JWT_SECRET=R0st1p017 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo. >> C:\Deploy\CalendarioPresupuesto\server\.env
echo SMTP_HOST=smtp.office365.com >> C:\Deploy\CalendarioPresupuesto\server\.env
echo SMTP_PORT=587 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo SMTP_USER=alertas@rostipolloscr.com >> C:\Deploy\CalendarioPresupuesto\server\.env
echo SMTP_PASS=Rosti2020 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo. >> C:\Deploy\CalendarioPresupuesto\server\.env
echo GEMINI_API_KEY=AIzaSyBEuVeCka5ib3-POtEReONq8yYOUZH1MEM >> C:\Deploy\CalendarioPresupuesto\server\.env
echo. >> C:\Deploy\CalendarioPresupuesto\server\.env
echo ADMIN_PASSWORD=R0st1p017 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo. >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_CLIENT_ID=019c6eb1-0ee4-723d-91ce-5e547b33ab3b >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_CLIENT_SECRET=n3Pb449eA[04!o^<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_TOKEN_URL=https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_API_BASE_URL=https://rostipollos.cloud.invgate.net/api/v2 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_SYNC_ENABLED=true >> C:\Deploy\CalendarioPresupuesto\server\.env
echo INVGATE_SYNC_INTERVAL=1 >> C:\Deploy\CalendarioPresupuesto\server\.env
echo    - Archivo .env creado permanentemente.
echo.

REM --- 4. Crear tarea programada para auto-inicio ---
echo [PASO 4/4] Configurando inicio automatico al encender...

schtasks /delete /tn "KPIs_Rosti_Server" /f 2>nul
schtasks /create /tn "KPIs_Rosti_Server" /tr "cmd /c cd /d C:\Deploy\CalendarioPresupuesto\server && node server.js" /sc onstart /ru SYSTEM /rl HIGHEST /f
echo    - Tarea programada creada.

echo.
echo ===================================================
echo [LISTO] CONFIGURACION COMPLETADA
echo ===================================================
echo.
echo   - IIS: DESACTIVADO permanentemente
echo   - .env: CREADO en C:\Deploy\...\server\.env
echo   - Auto-inicio: CONFIGURADO (arranca solo al encender)
echo.
echo Para iniciar ahora, ejecute:
echo   cd C:\Deploy\CalendarioPresupuesto\server
echo   node server.js
echo.
pause
