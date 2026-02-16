#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Script de despliegue automatizado para Calendario de Presupuesto
.DESCRIPTION
    Instala y configura todo lo necesario en el servidor de aplicaciones:
    - Node.js LTS
    - NSSM (gestor de servicios)
    - IIS con URL Rewrite y ARR
    - Frontend compilado + Backend Node.js
    - Servicio de Windows para Node.js
    - Reglas de Firewall
.NOTES
    Ejecutar como Administrador en el servidor de aplicaciones
#>

param(
    [string]$InstallDir = "C:\Apps\CalendarioPresupuesto",
    [string]$SourceDir = $PSScriptRoot,
    [string]$ServiceName = "CalendarioPresupuesto-API",
    [int]$NodePort = 3000,
    [int]$IISPort = 80,
    [string]$SiteName = "CalendarioPresupuesto"
)

# ============================================
# COLORES Y FUNCIONES AUXILIARES
# ============================================
function Write-Step { param([string]$msg) Write-Host "`n========================================" -ForegroundColor Cyan; Write-Host "  $msg" -ForegroundColor Cyan; Write-Host "========================================" -ForegroundColor Cyan }
function Write-Ok { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err { param([string]$msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor Gray }

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host "   CALENDARIO PRESUPUESTO - DESPLIEGUE v1.0" -ForegroundColor Magenta
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Directorio de instalacion: $InstallDir" -ForegroundColor White
Write-Host "  Directorio fuente:         $SourceDir" -ForegroundColor White
Write-Host "  Puerto IIS:                $IISPort" -ForegroundColor White
Write-Host "  Puerto Node.js:            $NodePort" -ForegroundColor White
Write-Host ""

# ============================================
# PASO 1: VERIFICAR/INSTALAR NODE.JS
# ============================================
Write-Step "PASO 1: Verificar Node.js"

$nodeInstalled = $false
try {
    $nodeVersion = & node --version 2>$null
    if ($nodeVersion) {
        Write-Ok "Node.js ya instalado: $nodeVersion"
        $nodeInstalled = $true
    }
}
catch {}

if (-not $nodeInstalled) {
    Write-Info "Descargando Node.js LTS..."
    $nodeInstallerUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    $nodeInstallerPath = "$env:TEMP\node-installer.msi"
    
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $nodeInstallerUrl -OutFile $nodeInstallerPath -UseBasicParsing
    
    Write-Info "Instalando Node.js (esto puede tardar unos minutos)..."
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstallerPath`" /qn /norestart" -Wait -NoNewWindow
    
    # Refrescar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    $nodeVersion = & node --version 2>$null
    if ($nodeVersion) {
        Write-Ok "Node.js instalado exitosamente: $nodeVersion"
    }
    else {
        Write-Err "No se pudo instalar Node.js. Instalelo manualmente desde https://nodejs.org"
        exit 1
    }
}

# ============================================
# PASO 2: INSTALAR NSSM
# ============================================
Write-Step "PASO 2: Verificar/Instalar NSSM"

$nssmPath = "$InstallDir\tools\nssm.exe"
$nssmInstalled = Test-Path $nssmPath

if (-not $nssmInstalled) {
    # Check if nssm is already in PATH
    try {
        $nssmCheck = & nssm version 2>$null
        if ($nssmCheck) {
            $nssmPath = (Get-Command nssm).Source
            $nssmInstalled = $true
            Write-Ok "NSSM ya disponible en PATH: $nssmPath"
        }
    }
    catch {}
}

if (-not $nssmInstalled) {
    Write-Info "Descargando NSSM..."
    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $nssmZip = "$env:TEMP\nssm.zip"
    $nssmExtract = "$env:TEMP\nssm-extract"
    
    Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
    
    # Crear directorio de herramientas
    New-Item -ItemType Directory -Path "$InstallDir\tools" -Force | Out-Null
    
    # Extraer
    Expand-Archive -Path $nssmZip -DestinationPath $nssmExtract -Force
    
    # Copiar el ejecutable correcto (64-bit)
    $nssm64 = Get-ChildItem -Path $nssmExtract -Recurse -Filter "nssm.exe" | Where-Object { $_.DirectoryName -like "*win64*" } | Select-Object -First 1
    if ($nssm64) {
        Copy-Item $nssm64.FullName -Destination $nssmPath -Force
    }
    else {
        # Fallback: cualquier nssm.exe encontrado
        $nssmAny = Get-ChildItem -Path $nssmExtract -Recurse -Filter "nssm.exe" | Select-Object -First 1
        Copy-Item $nssmAny.FullName -Destination $nssmPath -Force
    }
    
    Write-Ok "NSSM instalado en: $nssmPath"
    
    # Limpiar archivos temporales
    Remove-Item $nssmZip -Force -ErrorAction SilentlyContinue
    Remove-Item $nssmExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================
# PASO 3: INSTALAR IIS Y MODULOS
# ============================================
Write-Step "PASO 3: Configurar IIS"

# Verificar si IIS está instalado
$iisInstalled = (Get-WindowsFeature Web-Server).Installed

if (-not $iisInstalled) {
    Write-Info "Instalando IIS..."
    Install-WindowsFeature -Name Web-Server, Web-Common-Http, Web-Default-Doc, Web-Static-Content, Web-Http-Redirect, Web-Http-Logging, Web-Request-Monitor, Web-Filtering, Web-Stat-Compression, Web-Dyn-Compression -IncludeManagementTools
    Write-Ok "IIS instalado"
}
else {
    Write-Ok "IIS ya instalado"
}

# Verificar URL Rewrite
$urlRewriteInstalled = Test-Path "C:\Program Files\IIS\URL Rewrite\rewrite.dll" -ErrorAction SilentlyContinue
if (-not $urlRewriteInstalled) {
    # Try alternate location
    $urlRewriteInstalled = Get-WebGlobalModule -Name "RewriteModule" -ErrorAction SilentlyContinue
}

if (-not $urlRewriteInstalled) {
    Write-Info "Descargando URL Rewrite Module..."
    $urlRewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
    $urlRewritePath = "$env:TEMP\urlrewrite.msi"
    Invoke-WebRequest -Uri $urlRewriteUrl -OutFile $urlRewritePath -UseBasicParsing
    
    Write-Info "Instalando URL Rewrite..."
    Start-Process msiexec.exe -ArgumentList "/i `"$urlRewritePath`" /qn /norestart" -Wait -NoNewWindow
    Write-Ok "URL Rewrite instalado"
}
else {
    Write-Ok "URL Rewrite ya instalado"
}

# Verificar ARR
$arrInstalled = Test-Path "C:\Program Files\IIS\Application Request Routing\requestRouter.dll" -ErrorAction SilentlyContinue

if (-not $arrInstalled) {
    Write-Info "Descargando Application Request Routing (ARR)..."
    $arrUrl = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"
    $arrPath = "$env:TEMP\arr.msi"
    Invoke-WebRequest -Uri $arrUrl -OutFile $arrPath -UseBasicParsing
    
    Write-Info "Instalando ARR..."
    Start-Process msiexec.exe -ArgumentList "/i `"$arrPath`" /qn /norestart" -Wait -NoNewWindow
    Write-Ok "ARR instalado"
}
else {
    Write-Ok "ARR ya instalado"
}

# Habilitar ARR Proxy
Write-Info "Habilitando ARR Proxy..."
try {
    Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled" -value "True" -ErrorAction SilentlyContinue
    Write-Ok "ARR Proxy habilitado"
}
catch {
    Write-Warn "No se pudo habilitar ARR automaticamente. Habilitelo manualmente en IIS Manager -> Application Request Routing -> Server Proxy Settings"
}

# ============================================
# PASO 4: COPIAR ARCHIVOS
# ============================================
Write-Step "PASO 4: Copiar archivos de la aplicacion"

# Crear estructura de directorios
$dirs = @(
    "$InstallDir\web-app",
    "$InstallDir\server",
    "$InstallDir\server\logs"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Info "Creado: $dir"
    }
}

# Verificar que los archivos fuente existen
$webAppDist = Join-Path (Split-Path $SourceDir) "web-app\dist"
$serverSrc = Join-Path (Split-Path $SourceDir) "server"

# Compilar frontend si dist no existe
if (-not (Test-Path $webAppDist)) {
    Write-Info "Compilando frontend (npm run build)..."
    $webAppSrc = Join-Path (Split-Path $SourceDir) "web-app"
    
    Push-Location $webAppSrc
    $ErrorActionPreference = "Continue"
    & npm install 2>&1 | Out-Null
    & npm run build 2>&1
    $ErrorActionPreference = "Stop"
    Pop-Location
    
    if (Test-Path $webAppDist) {
        Write-Ok "Frontend compilado exitosamente"
    }
    else {
        Write-Err "Error al compilar el frontend. Ejecute 'npm run build' en la carpeta web-app manualmente."
        exit 1
    }
}

# Copiar frontend
Write-Info "Copiando frontend..."
robocopy "$webAppDist" "$InstallDir\web-app" /MIR /NFL /NDL /NJH /NJS /nc /ns /np 2>&1 | Out-Null
Write-Ok "Frontend copiado a $InstallDir\web-app"

# Copiar backend (todos los .js y package files, excluyendo node_modules y .env)
Write-Info "Copiando backend..."
# Copiar todos los archivos .js
Get-ChildItem -Path $serverSrc -Filter "*.js" | ForEach-Object {
    Copy-Item $_.FullName -Destination "$InstallDir\server\$($_.Name)" -Force
}
# Copiar package files
@("package.json", "package-lock.json") | ForEach-Object {
    $src = Join-Path $serverSrc $_
    if (Test-Path $src) {
        Copy-Item $src -Destination "$InstallDir\server\$_" -Force
    }
}
Write-Ok "Backend copiado a $InstallDir\server"

# Crear .env de produccion si no existe
$envFile = "$InstallDir\server\.env"
if (-not (Test-Path $envFile)) {
    Write-Info "Creando archivo .env de produccion..."
    
    # Generar JWT secret aleatorio
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    
    @"
# Conexion a Base de Datos
DB_USER=sa
DB_PASSWORD=masterkey
DB_SERVER=10.29.1.14
DB_DATABASE=RP_BI_RESUMENES

# JWT Secret (generado automaticamente)
JWT_SECRET=$jwtSecret

# Email (Office 365)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=alertas@rostipolloscr.com
SMTP_PASS=Rosti2020
"@ | Set-Content $envFile -Encoding UTF8
    
    Write-Ok "Archivo .env creado (REVISE y ajuste las credenciales)"
    Write-Warn "IMPORTANTE: Edite $envFile con las credenciales correctas de produccion"
}
else {
    Write-Ok "Archivo .env ya existe, no se sobreescribe"
}

# Instalar dependencias de Node.js
Write-Info "Instalando dependencias de Node.js..."
Push-Location "$InstallDir\server"
$ErrorActionPreference = "Continue"
& npm install --omit=dev 2>&1 | Out-Null
$ErrorActionPreference = "Stop"
Pop-Location
Write-Ok "Dependencias instaladas"

# ============================================
# PASO 5: CREAR WEB.CONFIG PARA IIS
# ============================================
Write-Step "PASO 5: Crear web.config (Reverse Proxy)"

$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <!-- Redirigir /api/* al backend Node.js -->
                <rule name="API Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://localhost:${NodePort}/api/{R:1}" />
                </rule>
                
                <!-- SPA fallback: servir index.html para rutas del frontend -->
                <rule name="SPA Fallback" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/" />
                </rule>
            </rules>
        </rewrite>
        
        <staticContent>
            <remove fileExtension=".json" />
            <mimeMap fileExtension=".json" mimeType="application/json" />
            <remove fileExtension=".woff2" />
            <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
            <remove fileExtension=".woff" />
            <mimeMap fileExtension=".woff" mimeType="font/woff" />
        </staticContent>
        
        <httpCompression>
            <dynamicTypes>
                <add mimeType="application/json" enabled="true" />
            </dynamicTypes>
        </httpCompression>
    </system.webServer>
</configuration>
"@

$webConfig | Set-Content "$InstallDir\web-app\web.config" -Encoding UTF8
Write-Ok "web.config creado"

# ============================================
# PASO 6: CREAR SITIO IIS
# ============================================
Write-Step "PASO 6: Configurar sitio en IIS"

Import-Module WebAdministration -ErrorAction SilentlyContinue

# Detener Default Web Site si existe y usa el mismo puerto
try {
    $defaultSite = Get-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
    if ($defaultSite -and $defaultSite.State -eq "Started") {
        $defaultBindings = Get-WebBinding -Name "Default Web Site" -ErrorAction SilentlyContinue
        $conflicting = $defaultBindings | Where-Object { $_.bindingInformation -like "*:${IISPort}:*" }
        if ($conflicting) {
            Write-Info "Deteniendo 'Default Web Site' (usa el mismo puerto $IISPort)..."
            Stop-Website -Name "Default Web Site"
            Write-Ok "Default Web Site detenido"
        }
    }
}
catch {}

# Crear o actualizar el sitio
$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue

if ($existingSite) {
    Write-Info "Actualizando sitio existente '$SiteName'..."
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value "$InstallDir\web-app"
    Write-Ok "Sitio actualizado"
}
else {
    Write-Info "Creando sitio '$SiteName'..."
    New-Website -Name $SiteName -PhysicalPath "$InstallDir\web-app" -Port $IISPort -Force | Out-Null
    Write-Ok "Sitio creado en puerto $IISPort"
}

# Iniciar el sitio
Start-Website -Name $SiteName -ErrorAction SilentlyContinue
Write-Ok "Sitio IIS en ejecucion"

# ============================================
# PASO 7: INSTALAR SERVICIO NODE.JS CON NSSM
# ============================================
Write-Step "PASO 7: Crear servicio de Windows para Node.js"

$nodePath = (Get-Command node).Source

# Verificar si el servicio ya existe
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($existingService) {
    Write-Info "Deteniendo servicio existente..."
    & $nssmPath stop $ServiceName 2>$null
    & $nssmPath remove $ServiceName confirm 2>$null
    Start-Sleep -Seconds 2
}

Write-Info "Instalando servicio '$ServiceName'..."
& $nssmPath install $ServiceName $nodePath "$InstallDir\server\server.js"
& $nssmPath set $ServiceName AppDirectory "$InstallDir\server"
& $nssmPath set $ServiceName Description "Backend API - Calendario de Presupuesto"
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath set $ServiceName AppStdout "$InstallDir\server\logs\stdout.log"
& $nssmPath set $ServiceName AppStderr "$InstallDir\server\logs\stderr.log"
& $nssmPath set $ServiceName AppRotateFiles 1
& $nssmPath set $ServiceName AppRotateSeconds 86400
& $nssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production"

Write-Info "Iniciando servicio..."
& $nssmPath start $ServiceName

Start-Sleep -Seconds 3

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Ok "Servicio '$ServiceName' en ejecucion"
}
else {
    Write-Warn "El servicio puede tardar unos segundos en iniciar. Verifique con: Get-Service $ServiceName"
}

# ============================================
# PASO 8: CONFIGURAR FIREWALL
# ============================================
Write-Step "PASO 8: Configurar Firewall"

# Puerto HTTP
$httpRule = Get-NetFirewallRule -DisplayName "CalendarioPresupuesto HTTP" -ErrorAction SilentlyContinue
if (-not $httpRule) {
    New-NetFirewallRule -DisplayName "CalendarioPresupuesto HTTP" -Direction Inbound -Protocol TCP -LocalPort $IISPort -Action Allow | Out-Null
    Write-Ok "Regla de firewall para puerto $IISPort creada"
}
else {
    Write-Ok "Regla de firewall HTTP ya existe"
}

# NO abrir puerto 3000 al exterior (Node.js solo escucha localmente)
Write-Ok "Puerto $NodePort NO expuesto (solo acceso interno via IIS)"

# ============================================
# PASO 9: VERIFICACION
# ============================================
Write-Step "PASO 9: Verificacion final"

# Verificar Node.js
$nodeCheck = & node --version 2>$null
if ($nodeCheck) { Write-Ok "Node.js: $nodeCheck" } else { Write-Err "Node.js no disponible" }

# Verificar servicio
$svcCheck = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svcCheck) { Write-Ok "Servicio: $($svcCheck.Status)" } else { Write-Warn "Servicio no encontrado" }

# Verificar puerto Node.js
Start-Sleep -Seconds 2
$portCheck = Get-NetTCPConnection -LocalPort $NodePort -ErrorAction SilentlyContinue
if ($portCheck) { Write-Ok "Puerto ${NodePort}: ESCUCHANDO" } else { Write-Warn "Puerto ${NodePort}: No detectado (puede tardar unos segundos)" }

# Verificar IIS
$siteCheck = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($siteCheck -and $siteCheck.State -eq "Started") { Write-Ok "Sitio IIS '$SiteName': En ejecucion" } else { Write-Warn "Sitio IIS: Verificar manualmente" }

# Probar API
try {
    $apiTest = Invoke-WebRequest -Uri "http://localhost:$NodePort/api/columns" -UseBasicParsing -TimeoutSec 10
    if ($apiTest.StatusCode -eq 200) {
        Write-Ok "API respondiendo correctamente en puerto $NodePort"
    }
}
catch {
    Write-Warn "API aun no responde (puede tardar al establecer conexion con BD)"
}

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Green
Write-Host "   DESPLIEGUE COMPLETADO" -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  $InstallDir\web-app" -ForegroundColor White
Write-Host "  Backend:   $InstallDir\server" -ForegroundColor White
Write-Host "  Servicio:  $ServiceName" -ForegroundColor White
Write-Host "  Logs:      $InstallDir\server\logs\" -ForegroundColor White
Write-Host ""

$serverIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
Write-Host "  Acceda a la aplicacion desde:" -ForegroundColor Cyan
Write-Host "    http://localhost" -ForegroundColor Yellow
if ($serverIP) {
    Write-Host "    http://$serverIP" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Comandos utiles:" -ForegroundColor Cyan
Write-Host "    Reiniciar API:    $nssmPath restart $ServiceName" -ForegroundColor Gray
Write-Host "    Ver logs:         Get-Content $InstallDir\server\logs\stdout.log -Tail 50" -ForegroundColor Gray
Write-Host "    Estado servicio:  Get-Service $ServiceName" -ForegroundColor Gray
Write-Host ""
