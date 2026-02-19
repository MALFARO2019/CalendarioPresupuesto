# Script para configurar Microsoft Forms con credenciales
# Ejecuta migracion y configura credenciales automaticamente

# Leer credenciales del .env
$envFile = Get-Content ".env"
$dbServer = ($envFile | Select-String "DB_SERVER=").ToString().Split("=")[1].Trim()
$dbUser = ($envFile | Select-String "DB_USER=").ToString().Split("=")[1].Trim()
$dbPassword = ($envFile | Select-String "DB_PASSWORD=").ToString().Split("=")[1].Trim()

Write-Host "Configurando Microsoft Forms Integration..." -ForegroundColor Cyan
Write-Host "   Servidor: $dbServer" -ForegroundColor Gray
Write-Host ""

# Paso 1: Ejecutar migracion
Write-Host "Paso 1: Ejecutando migracion SQL..." -ForegroundColor Yellow
sqlcmd -S $dbServer -U $dbUser -P $dbPassword -i "migrations\migration_forms.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Base de datos WindowsFormsData creada" -ForegroundColor Green
}
else {
    Write-Host "Error en migracion SQL" -ForegroundColor Red
    exit 1
}

# Paso 2: Insertar credenciales Azure AD
Write-Host ""
Write-Host "Paso 2: Configurando credenciales Azure AD..." -ForegroundColor Yellow

$tenantId = "70dff046e-e545-44c7-ae8c-21c53272ee6e"
$clientId = "44490c35-76d8-451c-a10f-05c526df8e38"
$clientSecret = "q2l8Q~F6ul3dMZHQUmmF5FCPa5eIHzEWOU5pIaZI"

$sqlUpdate = @"
USE WindowsFormsData;

UPDATE FormsConfig SET ConfigValue = '$tenantId', UpdatedAt = GETDATE(), UpdatedBy = 'SYSTEM_SETUP' WHERE ConfigKey = 'TENANT_ID';
UPDATE FormsConfig SET ConfigValue = '$clientId', UpdatedAt = GETDATE(), UpdatedBy = 'SYSTEM_SETUP' WHERE ConfigKey = 'CLIENT_ID';
UPDATE FormsConfig SET ConfigValue = '$clientSecret', UpdatedAt = GETDATE(), UpdatedBy = 'SYSTEM_SETUP' WHERE ConfigKey = 'CLIENT_SECRET';
UPDATE FormsConfig SET ConfigValue = 'false', UpdatedAt = GETDATE(), UpdatedBy = 'SYSTEM_SETUP' WHERE ConfigKey = 'SYNC_ENABLED';
UPDATE FormsConfig SET ConfigValue = '4', UpdatedAt = GETDATE(), UpdatedBy = 'SYSTEM_SETUP' WHERE ConfigKey = 'SYNC_INTERVAL_HOURS';

SELECT ConfigKey, 
       CASE 
           WHEN ConfigKey = 'CLIENT_SECRET' THEN '****************'
           ELSE ConfigValue 
       END AS ConfigValue,
       UpdatedAt
FROM FormsConfig
ORDER BY ConfigKey;
"@

# Guardar SQL en archivo temporal
$sqlUpdate | Out-File -FilePath "temp_forms_config.sql" -Encoding UTF8

# Ejecutar update
sqlcmd -S $dbServer -U $dbUser -P $dbPassword -i "temp_forms_config.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Credenciales configuradas exitosamente" -ForegroundColor Green
}
else {
    Write-Host "Error configurando credenciales" -ForegroundColor Red
    Remove-Item "temp_forms_config.sql" -ErrorAction SilentlyContinue
    exit 1
}

# Limpiar archivo temporal
Remove-Item "temp_forms_config.sql" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "CONFIGURACION COMPLETADA!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Credenciales configuradas:" -ForegroundColor Cyan
Write-Host "  Tenant ID: 70dff046e-****-****-****-**********6e" -ForegroundColor Gray
Write-Host "  Client ID: 44490c35-****-****-****-**********38" -ForegroundColor Gray
Write-Host "  Client Secret: q2l8Q~*****************" -ForegroundColor Gray
Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Reiniciar el servidor Node.js" -ForegroundColor White
Write-Host "  2. Acceder a la aplicacion web" -ForegroundColor White
Write-Host "  3. Ir al Panel Admin -> Tab Forms" -ForegroundColor White
Write-Host "  4. Agregar Form IDs a sincronizar" -ForegroundColor White
Write-Host "  5. Habilitar sincronizacion automatica" -ForegroundColor White
Write-Host "  6. Ejecutar primera sincronizacion" -ForegroundColor White
Write-Host ""
