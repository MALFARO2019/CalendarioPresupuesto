# Script para ejecutar la migración de InvGate
# Lee las credenciales del .env y ejecuta el script SQL

# Leer archivo .env
$envFile = Get-Content ".env"
$dbServer = ($envFile | Select-String "DB_SERVER=").ToString().Split("=")[1].Trim()
$dbUser = ($envFile | Select-String "DB_USER=").ToString().Split("=")[1].Trim()
$dbPassword = ($envFile | Select-String "DB_PASSWORD=").ToString().Split("=")[1].Trim()

Write-Host "🔄 Ejecutando migración de InvGate..." -ForegroundColor Cyan
Write-Host "   Servidor: $dbServer" -ForegroundColor Gray
Write-Host "   Usuario: $dbUser" -ForegroundColor Gray
Write-Host ""

# Ejecutar script SQL
sqlcmd -S $dbServer -U $dbUser -P $dbPassword -i "migrations\migration_invgate.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migración completada exitosamente!" -ForegroundColor Green
    Write-Host "   Base de datos InvGateData creada" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ Error ejecutando migración" -ForegroundColor Red
    Write-Host "   Código de salida: $LASTEXITCODE" -ForegroundColor Gray
}
