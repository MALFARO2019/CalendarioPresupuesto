@echo off
echo Creando archivo .env con credenciales seguras...

(
echo DB_USER=sa
echo DB_PASSWORD=masterkey
echo DB_SERVER=10.29.1.14
echo DB_DATABASE=RP_BI_RESUMENES
echo.
echo # JWT Secret for authentication
echo JWT_SECRET=R0st1p017
echo.
echo # Email configuration ^(Microsoft/Outlook^)
echo SMTP_HOST=smtp.office365.com
echo SMTP_PORT=587
echo SMTP_USER=alertas@rostipolloscr.com
echo SMTP_PASS=Rosti2020
echo.
echo # Gemini AI ^(for Tactica analysis^)
echo GEMINI_API_KEY=AIzaSyBEuVeCka5ib3-POtEReONq8yYOUZH1MEM
echo.
echo # Security
echo ADMIN_PASSWORD=R0st1p017
echo.
echo # InvGate Integration
echo INVGATE_CLIENT_ID=019c6eb1-0ee4-723d-91ce-5e547b33ab3b
echo INVGATE_CLIENT_SECRET=n3Pb449eA[04!o^<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP
echo INVGATE_TOKEN_URL=https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token
echo INVGATE_API_BASE_URL=https://rostipollos.cloud.invgate.net/api/v2
echo INVGATE_SYNC_ENABLED=true
echo INVGATE_SYNC_INTERVAL=1
) > server\.env

echo [EXITO] Archivo server\.env creado correctamente.
pause
