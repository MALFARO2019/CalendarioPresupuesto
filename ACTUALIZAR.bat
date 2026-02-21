@echo off
setlocal
title KPIs Rosti - ACTUALIZACION
echo.
echo ============================================================
echo   ACTUALIZACION - KPIs Rosti / Calendario Presupuesto
echo ============================================================
echo.

REM ===========================
REM PASO 1: DETENER SERVICIO
REM ===========================
echo [PASO 1/4] Deteniendo servicio...
net stop CalendarioPresupuesto-API 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo    - Servicio detenido.

REM ===========================
REM PASO 2: ACTUALIZAR CODIGO
REM ===========================
echo.
echo [PASO 2/4] Copie los archivos actualizados a:
echo    C:\Deploy\CalendarioPresupuesto\
echo.
echo    Archivos tipicos a actualizar:
echo      server\server.js          (backend principal)
echo      server\deploy.js          (modulo de deploy)
echo      server\*.js               (otros modulos backend)
echo      web-app\src\**            (codigo fuente frontend)
echo.
echo    Presione una tecla cuando los archivos esten copiados...
pause >nul

REM ===========================
REM PASO 3: INSTALAR Y BUILD
REM ===========================
echo.
echo [PASO 3/4] Instalando dependencias...
cd /d "C:\Deploy\CalendarioPresupuesto\server"
call npm install --production --no-audit
echo    - Backend listo.

echo.
echo    Construyendo frontend (2-5 min)...
cd /d "C:\Deploy\CalendarioPresupuesto\web-app"
call npm install --no-audit
call npm run build
if %errorlevel% neq 0 (
    echo    [ERROR] Fallo el build.
    pause
    exit /b 1
)
echo    - Frontend construido.

REM ===========================
REM PASO 4: REINICIAR
REM ===========================
echo.
echo [PASO 4/4] Reiniciando servicio...
net start CalendarioPresupuesto-API 2>nul
if %errorlevel% neq 0 (
    echo    - Servicio NSSM no encontrado, iniciando manualmente...
    cd /d "C:\Deploy\CalendarioPresupuesto\server"
    start "KPIs Rosti" node server.js
)

echo.
echo ============================================================
echo   ACTUALIZACION COMPLETADA
echo ============================================================
echo.
echo   Verifique en: http://localhost o http://IP_DEL_SERVIDOR
echo.
pause
