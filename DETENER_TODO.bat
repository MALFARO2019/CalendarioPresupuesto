@echo off
title DETENER SERVICIOS
echo.
echo ==========================================
echo   DETENIENDO TODOS LOS SERVICIOS NODE.JS
echo ==========================================
echo.
echo Matando procesos node.exe...
taskkill /F /IM node.exe
echo.
echo Listo. Todo detenido.
pause
