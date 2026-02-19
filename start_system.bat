@echo off
echo Iniciando Rosti KPIs (Produccion)...

cd server
if not exist node_modules (
    echo Instalando dependencias del servidor...
    call npm install --silent --production
)

start "" http://localhost:3000
node server.js
pause
