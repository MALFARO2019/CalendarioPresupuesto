@echo off
setlocal
title KPIs Rosti - ACTUALIZAR WEB

echo ===================================================
echo   FORZANDO ACTUALIZACION DE LA PAGINA WEB
echo ===================================================
echo.

cd web-app
echo [INFO] Eliminando version anterior...
rmdir /s /q "dist" 2>nul
rmdir /s /q ".vite" 2>nul

echo [INFO] Instalando dependencias nuevas (si las hay)...
call npm install

echo [INFO] Construyendo la nueva version WEB...
call npm run build

cd ..
echo.
echo [EXITO] Pagina actualizada correctamente.
echo Ahora puedes ejecutar START_APP.bat de nuevo.
echo.
pause
