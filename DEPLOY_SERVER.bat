@echo off
setlocal
title KPIs Rosti - DESPLIEGUE AUTOMATICO (GIT)

echo ===================================================
echo   DESPLEGANDO ULTIMA VERSION DESDE GITHUB
echo ===================================================
echo.

:: 1. Verificar Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git no esta instalado o no esta en el PATH.
    echo Por favor instala Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: 2. Inicializar repo si no existe (Solo la primera vez)
if not exist ".git" (
    echo [INFO] Inicializando repositorio...
    git init
    git remote add origin https://github.com/MALFARO2019/CalendarioPresupuesto.git
    echo [INFO] Bajando rama production...
    git fetch origin production
    git reset --hard origin/production
) else (
    echo [INFO] Descargando ultimos cambios...
    git fetch origin production
    git reset --hard origin/production
)

:: 3. Instalar dependencias Backend
echo.
echo [INFO] Instalando dependencias Backend...
call npm install --production --no-audit

:: 4. Construir Frontend
echo.
echo [INFO] Construyendo Frontend...
cd web-app
call npm install --no-audit
call npm run build
cd ..

:: 5. Reiniciar Servidor
echo.
echo [INFO] Reiniciando Servidor...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [EXITO] Sistema actualizado y reiniciado.
echo Iniciando aplicacion...
start cmd /k "node server/server.js"

:: Abrir navegador
timeout /t 5 /nobreak >nul
start http://localhost:3000

pause
