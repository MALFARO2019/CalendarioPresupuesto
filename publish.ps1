$ErrorActionPreference = "Stop"

Write-Host "🚀 Iniciando preparación de Rosti KPIs..." -ForegroundColor Cyan

# 1. Frontend Build
Write-Host "`n📦 Construyendo Frontend (web-app)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\web-app"
if (!(Test-Path "node_modules")) {
    Write-Host "  Installing dependencies..."
    npm install --silent
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error en build de frontend" -ForegroundColor Red
    exit 1
}

# 2. Start Instructions
Write-Host "`n✅ Build completado exitosamente." -ForegroundColor Green
Write-Host "📂 Los archivos estáticos están en: web-app/dist"
Write-Host "`n➡️  Para iniciar el sistema en producción:"
Write-Host "   Ejecuta: .\start_system.bat"
Set-Location "$PSScriptRoot"
