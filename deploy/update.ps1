#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Script de actualizacion para Calendario de Presupuesto
.DESCRIPTION
    Actualiza la aplicacion en el servidor sin reinstalar todo:
    - Recompila el frontend (o copia una version precompilada)
    - Actualiza archivos del backend
    - Reinicia el servicio de Node.js
.NOTES
    Ejecutar como Administrador en el servidor de aplicaciones
#>

param(
    [string]$InstallDir = "C:\Apps\CalendarioPresupuesto",
    [string]$SourceDir = $PSScriptRoot,
    [string]$ServiceName = "CalendarioPresupuesto-API",
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

function Write-Step { param([string]$msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor Gray }
function Write-Err { param([string]$msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $SourceDir

Write-Host ""
Write-Host "  CALENDARIO PRESUPUESTO - ACTUALIZACION" -ForegroundColor Magenta
Write-Host ""

# Verificar que la instalacion existe
if (-not (Test-Path "$InstallDir\server\server.js")) {
    Write-Err "No se encontro la instalacion en $InstallDir. Ejecute deploy.ps1 primero."
    exit 1
}

# ============================================
# ACTUALIZAR FRONTEND
# ============================================
if (-not $SkipFrontend) {
    Write-Step "Actualizando Frontend"
    
    $webAppSrc = Join-Path $projectRoot "web-app"
    $webAppDist = Join-Path $webAppSrc "dist"
    
    # Compilar si tenemos el codigo fuente
    if (Test-Path (Join-Path $webAppSrc "package.json")) {
        Write-Info "Compilando frontend..."
        Push-Location $webAppSrc
        & npm install 2>&1 | Out-Null
        & npm run build 2>&1
        Pop-Location
        
        if (Test-Path $webAppDist) {
            Write-Info "Copiando frontend compilado..."
            robocopy "$webAppDist" "$InstallDir\web-app" /MIR /XF web.config /NFL /NDL /NJH /NJS /nc /ns /np 2>&1 | Out-Null
            Write-Ok "Frontend actualizado"
        } else {
            Write-Err "Error al compilar frontend"
        }
    } elseif (Test-Path $webAppDist) {
        # Si solo tenemos dist, copiarlo directamente
        Write-Info "Copiando frontend precompilado..."
        robocopy "$webAppDist" "$InstallDir\web-app" /MIR /XF web.config /NFL /NDL /NJH /NJS /nc /ns /np 2>&1 | Out-Null
        Write-Ok "Frontend actualizado"
    } else {
        Write-Err "No se encontro el frontend compilado en $webAppDist"
    }
} else {
    Write-Info "Frontend omitido (flag -SkipFrontend)"
}

# ============================================
# ACTUALIZAR BACKEND
# ============================================
if (-not $SkipBackend) {
    Write-Step "Actualizando Backend"
    
    $serverSrc = Join-Path $projectRoot "server"
    
    # Detener servicio antes de copiar
    Write-Info "Deteniendo servicio..."
    $nssmPath = "$InstallDir\tools\nssm.exe"
    if (-not (Test-Path $nssmPath)) { $nssmPath = "nssm" }
    
    & $nssmPath stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    
    # Copiar archivos del backend
    $backendFiles = @("server.js", "db.js", "auth.js", "emailService.js", "eventos.js", "tendencia.js", "package.json", "package-lock.json")
    foreach ($file in $backendFiles) {
        $src = Join-Path $serverSrc $file
        if (Test-Path $src) {
            Copy-Item $src -Destination "$InstallDir\server\$file" -Force
        }
    }
    Write-Ok "Archivos del backend copiados"
    
    # Actualizar dependencias si package.json cambio
    Write-Info "Verificando dependencias..."
    Push-Location "$InstallDir\server"
    & npm install --production 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Dependencias actualizadas"
    
    # Reiniciar servicio
    Write-Info "Reiniciando servicio..."
    & $nssmPath start $ServiceName
    Start-Sleep -Seconds 3
    
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Ok "Servicio reiniciado correctamente"
    } else {
        Write-Err "El servicio no inicio. Revise los logs en $InstallDir\server\logs\"
    }
} else {
    Write-Info "Backend omitido (flag -SkipBackend)"
}

# ============================================
# VERIFICACION
# ============================================
Write-Step "Verificacion"

Start-Sleep -Seconds 2

try {
    $apiTest = Invoke-WebRequest -Uri "http://localhost:3000/api/columns" -UseBasicParsing -TimeoutSec 10
    if ($apiTest.StatusCode -eq 200) {
        Write-Ok "API respondiendo correctamente"
    }
} catch {
    Write-Info "API aun iniciando... espere unos segundos"
}

Write-Host ""
Write-Host "  ACTUALIZACION COMPLETADA" -ForegroundColor Green
Write-Host ""
