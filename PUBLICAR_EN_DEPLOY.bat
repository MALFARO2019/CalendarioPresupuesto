@echo off
setlocal
title Publicar a C:\deploy\CalendarioPresupuesto

echo ===================================================
echo   PUBLICANDO EN C:\deploy\CalendarioPresupuesto
echo ===================================================
echo.

set DEST_DIR=c:\deploy\CalendarioPresupuesto
set SRC_DIR=%~dp0

:: 1. Build frontend
echo [INFO] Construyendo Frontend...
cd web-app
call npm install --no-audit
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Falló la construcción del frontend.
    pause
    exit /b 1
)
cd ..

:: 2. Crear carpetas de destino si no existen
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
if not exist "%DEST_DIR%\server" mkdir "%DEST_DIR%\server"
if not exist "%DEST_DIR%\web-app" mkdir "%DEST_DIR%\web-app"
if not exist "%DEST_DIR%\web-app\dist" mkdir "%DEST_DIR%\web-app\dist"

:: 3. Copiar Server
echo.
echo [INFO] Copiando backend (server)...
xcopy /E /I /Y "server\*" "%DEST_DIR%\server\" >nul
:: Excluir node_modules del backend para instalarlo limpio en destino
if exist "%DEST_DIR%\server\node_modules" rmdir /S /Q "%DEST_DIR%\server\node_modules"

:: 4. Copiar Frontend (solo dist)
echo [INFO] Copiando frontend (web-app\dist)...
xcopy /E /I /Y "web-app\dist\*" "%DEST_DIR%\web-app\dist\" >nul

:: 5. Copiar scripts principales en la raíz
echo [INFO] Copiando scripts raíz...
copy /Y "START_APP.bat" "%DEST_DIR%\" >nul
copy /Y "start_system.bat" "%DEST_DIR%\" >nul
copy /Y "package*.json" "%DEST_DIR%\" >nul 2>nul
if exist ".env" copy /Y ".env" "%DEST_DIR%\" >nul 2>nul

:: 6. Instalar dependencias en destino
echo.
echo [INFO] Instalando dependencias de producción en backend de destino...
cd /d "%DEST_DIR%\server"
call npm install --production --no-audit

cd /d "%SRC_DIR%"
echo.
echo ===================================================
echo [EXITO] ¡Proyecto publicado correctamente en C:\deploy!
echo ===================================================
echo Para iniciarlo, ve a %DEST_DIR% y ejecuta START_APP.bat o start_system.bat
echo.
pause
