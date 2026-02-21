@echo off
setlocal
title KPIs Rosti - INSTALACION COMPLETA
echo.
echo ============================================================
echo   INSTALACION COMPLETA - KPIs Rosti / Calendario Presupuesto
echo   Windows Server 2019/2022
echo ============================================================
echo.
echo PREREQUISITOS:
echo   - Windows Server 2019 o 2022
echo   - Acceso como Administrador
echo   - Conexion a internet
echo   - Carpeta compartida o USB con el codigo fuente
echo.
echo Presione una tecla para comenzar...
pause >nul

REM ===========================
REM PASO 1: INSTALAR NODE.JS
REM ===========================
echo.
echo [PASO 1/8] Verificando Node.js...
where node >nul 2>&1
if %errorlevel%==0 (
    echo    - Node.js ya instalado:
    node --version
) else (
    echo    - Node.js NO encontrado. Instalando...
    echo    - Descargando Node.js v22 LTS...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%TEMP%\node-install.msi'"
    echo    - Ejecutando instalador...
    msiexec /i "%TEMP%\node-install.msi" /qn
    echo    - Reinicie esta ventana despues de instalar Node.js
    echo    - y vuelva a ejecutar este script.
    pause
    exit /b 1
)

REM ===========================
REM PASO 2: INSTALAR GIT
REM ===========================
echo.
echo [PASO 2/8] Verificando Git...
where git >nul 2>&1
if %errorlevel%==0 (
    echo    - Git ya instalado:
    git --version
) else (
    echo    - Git NO encontrado.
    echo    - OPCION A: Instalar con winget:
    echo        winget install --id Git.Git -e --source winget
    echo    - OPCION B: Descargar de https://git-scm.com/download/win
    echo    - Si no necesita Git, puede copiar archivos manualmente.
    echo.
)

REM ===========================
REM PASO 3: CREAR DIRECTORIO
REM ===========================
echo.
echo [PASO 3/8] Creando directorio de la aplicacion...
if not exist "C:\Deploy\CalendarioPresupuesto" (
    mkdir "C:\Deploy\CalendarioPresupuesto"
    echo    - Directorio creado: C:\Deploy\CalendarioPresupuesto
) else (
    echo    - Directorio ya existe.
)

REM ===========================
REM PASO 4: COPIAR CODIGO
REM ===========================
echo.
echo [PASO 4/8] Copiando codigo fuente...
echo.
echo    IMPORTANTE: Copie TODO el contenido del proyecto a:
echo      C:\Deploy\CalendarioPresupuesto\
echo.
echo    Debe incluir estas carpetas:
echo      C:\Deploy\CalendarioPresupuesto\server\    (backend)
echo      C:\Deploy\CalendarioPresupuesto\web-app\   (frontend)
echo.
echo    Metodos de copia:
echo      - USB: Copiar desde USB a C:\Deploy\CalendarioPresupuesto\
echo      - Red: robocopy \\ORIGEN\CalendarioPresupuesto C:\Deploy\CalendarioPresupuesto /MIR /XD node_modules .git
echo      - Git: git clone -b production https://github.com/MALFARO2019/CalendarioPresupuesto.git C:\Deploy\CalendarioPresupuesto
echo.
echo    Presione una tecla cuando el codigo este copiado...
pause >nul

REM ===========================
REM PASO 5: CONFIGURAR .env
REM ===========================
echo.
echo [PASO 5/8] Creando archivo de configuracion (.env)...
echo PORT=80 > "C:\Deploy\CalendarioPresupuesto\server\.env"
echo DB_USER=sa >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo DB_PASSWORD=masterkey >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo DB_SERVER=10.29.1.14 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo DB_DATABASE=RP_BI_RESUMENES >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo. >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo JWT_SECRET=R0st1p017 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo. >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo SMTP_HOST=smtp.office365.com >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo SMTP_PORT=587 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo SMTP_USER=alertas@rostipolloscr.com >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo SMTP_PASS=Rosti2020 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo. >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo GEMINI_API_KEY=AIzaSyBEuVeCka5ib3-POtEReONq8yYOUZH1MEM >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo. >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo ADMIN_PASSWORD=R0st1p017 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo. >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_CLIENT_ID=019c6eb1-0ee4-723d-91ce-5e547b33ab3b >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_CLIENT_SECRET=n3Pb449eA[04!o^<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_TOKEN_URL=https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_API_BASE_URL=https://rostipollos.cloud.invgate.net/api/v2 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_SYNC_ENABLED=true >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo INVGATE_SYNC_INTERVAL=1 >> "C:\Deploy\CalendarioPresupuesto\server\.env"
echo    - Archivo .env creado.

REM ===========================
REM PASO 6: INSTALAR DEPENDENCIAS Y BUILD
REM ===========================
echo.
echo [PASO 6/8] Instalando dependencias del backend...
cd /d "C:\Deploy\CalendarioPresupuesto\server"
call npm install --production --no-audit
echo    - Dependencias backend listas.

echo.
echo [PASO 7/8] Instalando dependencias y construyendo frontend...
echo    (Esto puede tardar 2-5 minutos)
cd /d "C:\Deploy\CalendarioPresupuesto\web-app"
call npm install --no-audit
call npm run build
if %errorlevel% neq 0 (
    echo    [ERROR] Fallo el build del frontend.
    pause
    exit /b 1
)
echo    - Frontend construido exitosamente.

REM ===========================
REM PASO 7: CONFIGURAR FIREWALL E IIS
REM ===========================
echo.
echo [PASO 8/8] Configurando sistema operativo...

REM Desactivar IIS si existe
iisreset /stop 2>nul
sc config W3SVC start= disabled 2>nul
echo    - IIS desactivado (si existia).

REM Abrir puerto 80
netsh advfirewall firewall add rule name="KPIs Rosti HTTP 80" dir=in action=allow protocol=TCP localport=80 2>nul
echo    - Puerto 80 abierto en firewall.

REM Abrir WinRM para deploy remoto
netsh advfirewall firewall add rule name="WinRM HTTP" dir=in action=allow protocol=TCP localport=5985 2>nul
Enable-PSRemoting -Force -SkipNetworkProfileCheck 2>nul
echo    - WinRM habilitado para deploy remoto.

REM Crear tarea programada de respaldo
schtasks /delete /tn "KPIs_Rosti_Server" /f 2>nul
schtasks /create /tn "KPIs_Rosti_Server" /tr "cmd /c cd /d C:\Deploy\CalendarioPresupuesto\server && node server.js" /sc onstart /ru SYSTEM /rl HIGHEST /f 2>nul
echo    - Tarea programada de respaldo creada.

REM ===========================
REM LISTO
REM ===========================
echo.
echo ============================================================
echo   INSTALACION COMPLETADA EXITOSAMENTE
echo ============================================================
echo.
echo   Aplicacion: C:\Deploy\CalendarioPresupuesto
echo   Puerto:     80
echo   URL:        http://NOMBRE_O_IP_DEL_SERVIDOR
echo.
echo   Para iniciar ahora:
echo     cd C:\Deploy\CalendarioPresupuesto\server
echo     node server.js
echo.
echo   Para futuras actualizaciones:
echo     Usar el panel Publicacion en Configuracion del Sistema
echo     o ejecutar ACTUALIZAR.bat
echo.

cd /d "C:\Deploy\CalendarioPresupuesto\server"
echo Iniciando servidor...
node server.js

pause
