@echo off
setlocal
title KPIs Rosti - Sistema Integrado

echo ===================================================
echo   INICIANDO SISTEMA KPIS ROSTI
echo ===================================================
echo.

REM --- 1. Verificar/Instalar dependencias de Web App ---
cd web-app
if not exist "node_modules" (
    echo [INFO] Primera ejecucion detectada. Instalando dependencias de la WEB APP...
    call npm install
)

REM --- 2. Verificar/Construir Web App ---
if not exist "dist" (
    echo [INFO] Construyendo la aplicacion WEB -esto puede tardar unos minutos-...
    call npm run build
)
cd ..

REM --- 3. Verificar/Instalar dependencias del Servidor ---
cd server
if not exist "node_modules" (
    echo [INFO] Instalando dependencias del SERVIDOR...
    call npm install --production
)

REM --- 4. Iniciar Servidor ---
echo.
echo [EXITO] Todo listo. Iniciando servidor...
echo.
echo   - Backend: http://localhost:3000
echo   - Frontend: Servido automaticamente
echo.

start "" "http://localhost:3000"
node server.js

echo.
echo El servidor se ha detenido.
pause
