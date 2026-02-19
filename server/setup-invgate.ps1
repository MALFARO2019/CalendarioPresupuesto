# Script para configurar InvGate Integration
# Ejecuta migracion y configura credenciales

# Leer credenciales del .env
$envFile = Get-Content ".env"
$dbServer = ($envFile | Select-String "DB_SERVER=").ToString().Split("=")[1].Trim()
$dbUser = ($envFile | Select-String "DB_USER=").ToString().Split("=")[1].Trim()
$dbPassword = ($envFile | Select-String "DB_PASSWORD=").ToString().Split("=")[1].Trim()

Write-Host "Configurando InvGate Integration..." -ForegroundColor Cyan
Write-Host "   Servidor: $dbServer" -ForegroundColor Gray
Write-Host ""

# Ejecutar migracion
Write-Host "Ejecutando migracion SQL..." -ForegroundColor Yellow
sqlcmd -S $dbServer -U $dbUser -P $dbPassword -i "migrations\migration_invgate.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Base de datos InvGateData creada exitosamente" -ForegroundColor Green
    
    # Configurar credenciales por defecto
    Write-Host ""
    Write-Host "Configurando credenciales InvGate..." -ForegroundColor Yellow
    
    $apiKey = "019c6c8e-9c7c-738e-9dd5-69b6bd09860c"
    $apiUrl = "https://rostipolloscr.invgate.net/api/v1"
    
    $sqlConfig = @"
USE InvGateData;

UPDATE InvgateConfig SET ConfigValue = '$apiUrl', FechaModificacion = GETDATE(), UsuarioModificacion = 'SYSTEM_SETUP' WHERE ConfigKey = 'API_URL';
UPDATE InvgateConfig SET ConfigValue = '$apiKey', FechaModificacion = GETDATE(), UsuarioModificacion = 'SYSTEM_SETUP' WHERE ConfigKey = 'API_KEY';
UPDATE InvgateConfig SET ConfigValue = '1', FechaModificacion = GETDATE(), UsuarioModificacion = 'SYSTEM_SETUP' WHERE ConfigKey = 'SYNC_INTERVAL_HOURS';
UPDATE InvgateConfig SET ConfigValue = 'false', FechaModificacion = GETDATE(), UsuarioModificacion = 'SYSTEM_SETUP' WHERE ConfigKey = 'SYNC_ENABLED';

SELECT ConfigKey, 
       CASE 
           WHEN ConfigKey = 'API_KEY' THEN '****************'
           ELSE ConfigValue 
       END AS ConfigValue,
       FechaModificacion
FROM InvgateConfig
ORDER BY ConfigKey;
"@

    $sqlConfig | Out-File -FilePath "temp_invgate_config.sql" -Encoding UTF8
    sqlcmd -S $dbServer -U $dbUser -P $dbPassword -i "temp_invgate_config.sql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Credenciales configuradas" -ForegroundColor Green
    }
    
    Remove-Item "temp_invgate_config.sql" -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "CONFIGURACION COMPLETADA!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Credenciales configuradas:" -ForegroundColor Cyan
    Write-Host "  API URL: https://rostipolloscr.invgate.net/api/v1" -ForegroundColor Gray
    Write-Host "  API Key: 019c6c8e-****-****-****-********860c" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Proximos pasos:" -ForegroundColor Yellow
    Write-Host "  1. Acceder al Panel Admin -> Tab InvGate" -ForegroundColor White
    Write-Host "  2. Probar conexion" -ForegroundColor White
    Write-Host "  3. Habilitar sincronizacion automatica" -ForegroundColor White
    Write-Host "  4. Ejecutar primera sincronizacion completa" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host "Error en migracion SQL" -ForegroundColor Red
    exit 1
}
