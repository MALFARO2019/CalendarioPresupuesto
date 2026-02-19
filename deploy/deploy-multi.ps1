<#
.SYNOPSIS
    Deploy simultaneo a multiples servidores - KPIs Rosti
.DESCRIPTION
    Compila el frontend UNA vez y luego despliega en paralelo a N servidores.
    Usa PowerShell Jobs para ejecucion concurrente sin bloqueos.
    
    MODOS:
      - Primera instalacion:  .\deploy-multi.ps1
      - Solo actualizacion:   .\deploy-multi.ps1 -Update
      - Solo frontend:        .\deploy-multi.ps1 -Update -SkipBackend
      - Solo backend:         .\deploy-multi.ps1 -Update -SkipFrontend

.EXAMPLE
    # Primer despliegue a dos servidores:
    .\deploy-multi.ps1

    # Actualizar solo el frontend en ambos servidores:
    .\deploy-multi.ps1 -Update -SkipBackend

.NOTES
    NO requiere ser Administrador local - los scripts remotos si corren como Admin via WinRM.
    WinRM debe estar habilitado en los servidores destino.
    Los servidores destino deben tener acceso a la red para descargar Node.js, etc.
#>

param(
    # --- CONFIGURACION DE SERVIDORES ---
    # Agrega o quita servidores aqui. Cada entrada tiene:
    #   Name      : Nombre amigable para mostrar en logs
    #   Host      : IP o nombre de host del servidor
    #   User      : Usuario con permisos de Administrador en el servidor
    #   Password  : Contrasena (considera usar Read-Host -AsSecureString en produccion)
    #   InstallDir: Directorio de instalacion en el servidor remoto
    #   IISPort   : Puerto de IIS (default 80)
    #   NodePort  : Puerto del backend Node.js (default 3000)
    [array]$Servers = @(
        @{
            Name       = "Servidor-1"
            Host       = "10.29.1.XX"   # <-- CAMBIAR
            User       = "Administrador"
            Password   = ""              # <-- CAMBIAR o dejar vacio para pedir interactivo
            InstallDir = "C:\Apps\CalendarioPresupuesto"
            IISPort    = 80
            NodePort   = 3000
        },
        @{
            Name       = "Servidor-2"
            Host       = "10.29.1.YY"   # <-- CAMBIAR
            User       = "Administrador"
            Password   = ""              # <-- CAMBIAR o dejar vacio para pedir interactivo
            InstallDir = "C:\Apps\CalendarioPresupuesto"
            IISPort    = 80
            NodePort   = 3000
        }
    ),

    # --- MODO ---
    [switch]$Update,        # Si se especifica, solo actualiza (no instala dependencias del sistema)
    [switch]$SkipFrontend,  # No actualizar frontend
    [switch]$SkipBackend,   # No actualizar backend

    # --- RUTAS LOCALES ---
    [string]$SourceDir  = (Split-Path $PSScriptRoot),   # Raiz del proyecto (carpeta padre de /deploy)
    [string]$ServiceName = "CalendarioPresupuesto-API"
)

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

# ============================================================
# FUNCIONES DE LOG
# ============================================================
function Write-Banner {
    param([string]$msg, [string]$color = "Magenta")
    Write-Host ""
    Write-Host "  =============================================" -ForegroundColor $color
    Write-Host "   $msg" -ForegroundColor $color
    Write-Host "  =============================================" -ForegroundColor $color
    Write-Host ""
}
function Write-Step { param([string]$msg) Write-Host "`n  >> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "     [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "     [!!] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "     [ERROR] $msg" -ForegroundColor Red }
function Write-Info { param([string]$msg) Write-Host "     [..] $msg" -ForegroundColor Gray }

# ============================================================
# PASO 0: COMPILAR FRONTEND LOCALMENTE (UNA SOLA VEZ)
# ============================================================
Write-Banner "KPIs ROSTI - DEPLOY MULTI-SERVIDOR"

$webAppSrc  = Join-Path $SourceDir "web-app"
$webAppDist = Join-Path $webAppSrc  "dist"
$serverSrc  = Join-Path $SourceDir  "server"
$deployDir  = $PSScriptRoot

Write-Info "Directorio fuente : $SourceDir"
Write-Info "Modo              : $(if ($Update) { 'ACTUALIZACION' } else { 'INSTALACION COMPLETA' })"
Write-Info "Servidores        : $($Servers.Count)"
Write-Host ""

if (-not $SkipFrontend) {
    Write-Step "Compilando frontend localmente (esto toma ~30 segundos)..."

    if (-not (Test-Path (Join-Path $webAppSrc "package.json"))) {
        Write-Err "No se encontro package.json en $webAppSrc"
        exit 1
    }

    Push-Location $webAppSrc
    $npmOut = & npm install 2>&1
    $buildOut = & npm run build 2>&1
    Pop-Location

    if (Test-Path $webAppDist) {
        $distSize = (Get-ChildItem $webAppDist -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Ok "Frontend compilado OK ($([math]::Round($distSize,1)) MB en $webAppDist)"
    }
    else {
        Write-Err "Error al compilar el frontend:"
        $buildOut | Select-Object -Last 20 | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
        exit 1
    }
}
else {
    if (-not (Test-Path $webAppDist)) {
        Write-Err "No existe dist/ y se especifico -SkipFrontend. Compile primero con 'npm run build' en web-app/"
        exit 1
    }
    Write-Info "Usando frontend ya compilado en $webAppDist"
}

# ============================================================
# PASO 1: PEDIR CREDENCIALES FALTANTES
# ============================================================
foreach ($srv in $Servers) {
    if ([string]::IsNullOrWhiteSpace($srv.Password)) {
        Write-Host ""
        Write-Host "  Credenciales para $($srv.Name) ($($srv.Host)):" -ForegroundColor Yellow
        $secPwd = Read-Host "  Contrasena para $($srv.User)" -AsSecureString
        $srv.Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPwd)
        )
    }
}

# ============================================================
# PASO 2: COPIAR ARCHIVOS AL SERVIDOR VIA WinRM (scriptblock remoto)
# ============================================================

# Script que se ejecuta en CADA servidor remoto
$RemoteDeployScript = {
    param(
        $SrvConfig,
        $IsUpdate,
        $DoFrontend,
        $DoBackend,
        $ServiceName,
        # Contenido de archivos enviados como bytes
        $DeployPs1Bytes,
        $UpdatePs1Bytes
    )

    $InstallDir  = $SrvConfig.InstallDir
    $NodePort    = $SrvConfig.NodePort
    $IISPort     = $SrvConfig.IISPort
    $SiteName    = "CalendarioPresupuesto"
    $TempDir     = "C:\Temp\KPIsRosti_Deploy_$(Get-Random)"

    function rlog { param($m, $c="Gray") Write-Host "  [$using_name] $m" -ForegroundColor $c }

    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # Guardar scripts auxiliares
    [IO.File]::WriteAllBytes("$TempDir\deploy.ps1",  $DeployPs1Bytes)
    [IO.File]::WriteAllBytes("$TempDir\update.ps1",  $UpdatePs1Bytes)

    # Establecer SourceDir apuntando al temp (los archivos .js los copiamos aparte)
    if ($IsUpdate) {
        # Modo actualizacion: correr update.ps1
        $args = @("-InstallDir", $InstallDir, "-ServiceName", $ServiceName, "-SourceDir", $TempDir)
        if (-not $DoFrontend) { $args += "-SkipFrontend" }
        if (-not $DoBackend)  { $args += "-SkipBackend" }

        & PowerShell -ExecutionPolicy Bypass -File "$TempDir\update.ps1" @args
    }
    else {
        # Instalacion completa
        $args = @("-InstallDir", $InstallDir, "-ServiceName", $ServiceName,
                  "-NodePort", $NodePort, "-IISPort", $IISPort,
                  "-SiteName", $SiteName, "-SourceDir", $TempDir)
        & PowerShell -ExecutionPolicy Bypass -File "$TempDir\deploy.ps1" @args
    }

    # Limpiar temp
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================================
# PASO 3: LANZAR JOBS EN PARALELO
# ============================================================
Write-Banner "INICIANDO DEPLOY EN PARALELO" "Cyan"

# Leer contenido de scripts para enviar
$deployPs1Bytes = [IO.File]::ReadAllBytes("$deployDir\deploy.ps1")
$updatePs1Bytes = [IO.File]::ReadAllBytes("$deployDir\update.ps1")

$Jobs = @()

foreach ($srv in $Servers) {
    Write-Step "Iniciando job para $($srv.Name) ($($srv.Host))..."

    $secPwd    = ConvertTo-SecureString $srv.Password -AsPlainText -Force
    $cred      = New-Object System.Management.Automation.PSCredential($srv.User, $secPwd)
    $srvName   = $srv.Name

    # Crear sesion PSRemoting
    try {
        $session = New-PSSession -ComputerName $srv.Host -Credential $cred -ErrorAction Stop
        Write-Ok "Sesion WinRM abierta con $($srv.Name)"
    }
    catch {
        Write-Err "No se pudo conectar con $($srv.Name): $_"
        Write-Warn "Asegurate de que WinRM este habilitado: winrm quickconfig"
        continue
    }

    # --- Copiar frontend (dist/) al servidor ---
    if (-not $SkipFrontend) {
        Write-Info "Copiando frontend compilado a $($srv.Name)..."
        try {
            $remoteTemp = "C:\Temp\KPIsRosti_Dist"
            Invoke-Command -Session $session -ScriptBlock {
                param($p)
                New-Item -ItemType Directory -Path $p -Force | Out-Null
            } -ArgumentList $remoteTemp

            Copy-Item -Path "$webAppDist\*" -Destination $remoteTemp -ToSession $session -Recurse -Force
            Write-Ok "Frontend copiado a $($srv.Name) -> $remoteTemp"
        }
        catch {
            Write-Warn "Error copiando frontend a $($srv.Name): $_"
        }
    }

    # --- Copiar server/ al servidor ---
    if (-not $SkipBackend) {
        Write-Info "Copiando backend a $($srv.Name)..."
        try {
            $remoteServerTemp = "C:\Temp\KPIsRosti_Server"
            Invoke-Command -Session $session -ScriptBlock {
                param($p)
                New-Item -ItemType Directory -Path $p -Force | Out-Null
            } -ArgumentList $remoteServerTemp

            Get-ChildItem -Path $serverSrc -Filter "*.js" | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination "$remoteServerTemp\$($_.Name)" -ToSession $session -Force
            }
            foreach ($f in @("package.json", "package-lock.json")) {
                $fp = Join-Path $serverSrc $f
                if (Test-Path $fp) {
                    Copy-Item -Path $fp -Destination "$remoteServerTemp\$f" -ToSession $session -Force
                }
            }
            Write-Ok "Backend copiado a $($srv.Name) -> $remoteServerTemp"
        }
        catch {
            Write-Warn "Error copiando backend a $($srv.Name): $_"
        }
    }

    # --- Lanzar el job de deploy remoto ---
    $srvCopy = $srv  # Captura para closure
    $job = Invoke-Command -Session $session -AsJob -ScriptBlock {
        param($InstallDir, $NodePort, $IISPort, $ServiceName, $IsUpdate, $DoFrontend, $DoBackend, $SiteName)

        $ErrorActionPreference = "Continue"
        $nssmPath = "$InstallDir\tools\nssm.exe"
        if (-not (Test-Path $nssmPath)) { $nssmPath = "nssm" }

        function rlog { param($m, $c="Gray") Write-Host "  $m" -ForegroundColor $c }

        # --- Frontend ---
        if ($DoFrontend) {
            $distSrc = "C:\Temp\KPIsRosti_Dist"
            $distDst = "$InstallDir\web-app"

            if (Test-Path $distSrc) {
                New-Item -ItemType Directory -Path $distDst -Force | Out-Null
                robocopy $distSrc $distDst /MIR /XF web.config /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
                rlog "Frontend actualizado OK" Green
            }
            else {
                rlog "WARN: No se encontro el frontend temporal en $distSrc" Yellow
            }
        }

        # --- Backend ---
        if ($DoBackend) {
            $serverSrc = "C:\Temp\KPIsRosti_Server"
            $serverDst = "$InstallDir\server"
            $logDir    = "$serverDst\logs"

            New-Item -ItemType Directory -Path $serverDst -Force | Out-Null
            New-Item -ItemType Directory -Path $logDir    -Force | Out-Null

            # Detener servicio si existe
            $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
            if ($svc) {
                & $nssmPath stop $ServiceName 2>$null | Out-Null
                Start-Sleep -Seconds 2
            }

            # Copiar archivos
            if (Test-Path $serverSrc) {
                Get-ChildItem $serverSrc | ForEach-Object {
                    Copy-Item $_.FullName -Destination "$serverDst\$($_.Name)" -Force
                }
            }

            rlog "Instalando dependencias npm..." Gray

            Push-Location $serverDst
            & npm install --omit=dev 2>&1 | Out-Null
            Pop-Location

            rlog "Dependencias instaladas" Green
        }

        # --- Instalar/Arrancar servicio (solo en modo full deploy) ---
        if (-not $IsUpdate) {
            # Verificar/Instalar Node
            $nodeVer = & node --version 2>$null
            if (-not $nodeVer) {
                rlog "Node.js no encontrado. Descargando..." Yellow
                $nodeUrl  = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
                $nodeMsi  = "$env:TEMP\node-installer.msi"
                Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
                Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn /norestart" -Wait -NoNewWindow
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
                rlog "Node.js instalado" Green
            }
            else {
                rlog "Node.js: $nodeVer" Green
            }

            # NSSM
            if (-not (Test-Path $nssmPath)) {
                $nssmZip = "$env:TEMP\nssm.zip"
                $nssmExt = "$env:TEMP\nssm-ext"
                New-Item -ItemType Directory -Path "$InstallDir\tools" -Force | Out-Null
                Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
                Expand-Archive $nssmZip $nssmExt -Force
                $exe = Get-ChildItem $nssmExt -Recurse -Filter "nssm.exe" | Where-Object { $_.DirectoryName -like "*win64*" } | Select-Object -First 1
                if (-not $exe) { $exe = Get-ChildItem $nssmExt -Recurse -Filter "nssm.exe" | Select-Object -First 1 }
                Copy-Item $exe.FullName "$InstallDir\tools\nssm.exe" -Force
                $nssmPath = "$InstallDir\tools\nssm.exe"
                rlog "NSSM instalado" Green
            }

            # Instalar/reinstalar servicio Windows
            $nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
            if ($nodePath) {
                $svcExisting = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
                if ($svcExisting) {
                    & $nssmPath stop $ServiceName 2>$null | Out-Null
                    & $nssmPath remove $ServiceName confirm 2>$null | Out-Null
                    Start-Sleep -Seconds 2
                }
                & $nssmPath install $ServiceName $nodePath "$InstallDir\server\server.js"
                & $nssmPath set $ServiceName AppDirectory "$InstallDir\server"
                & $nssmPath set $ServiceName Description "Backend API - KPIs Rosti"
                & $nssmPath set $ServiceName Start SERVICE_AUTO_START
                & $nssmPath set $ServiceName AppStdout "$InstallDir\server\logs\stdout.log"
                & $nssmPath set $ServiceName AppStderr "$InstallDir\server\logs\stderr.log"
                & $nssmPath set $ServiceName AppRotateFiles 1
                & $nssmPath set $ServiceName AppRotateSeconds 86400
                & $nssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
            }
        }

        # Crear .env si no existe
        $envFile = "$InstallDir\server\.env"
        if (-not (Test-Path $envFile)) {
            $jwt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
            @"
DB_USER=sa
DB_PASSWORD=masterkey
DB_SERVER=10.29.1.14
DB_DATABASE=RP_BI_RESUMENES
JWT_SECRET=$jwt
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=alertas@rostipolloscr.com
SMTP_PASS=Rosti2020
"@ | Set-Content $envFile -Encoding UTF8
            rlog "IMPORTANTE: Edite $envFile con credenciales de produccion" Yellow
        }

        # Crear/actualizar web.config
        $webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:${NodePort}/api/{R:1}" />
        </rule>
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
      <remove fileExtension=".json" /><mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".woff2" /><mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".woff" /><mimeMap fileExtension=".woff" mimeType="font/woff" />
    </staticContent>
  </system.webServer>
</configuration>
"@
        $webConfig | Set-Content "$InstallDir\web-app\web.config" -Encoding UTF8

        # Arrancar/reiniciar servicio
        $svc2 = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc2) {
            & $nssmPath restart $ServiceName 2>$null | Out-Null
        }
        else {
            & $nssmPath start $ServiceName 2>$null | Out-Null
        }
        Start-Sleep -Seconds 3

        $svcFinal = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svcFinal -and $svcFinal.Status -eq "Running") {
            rlog "Servicio $ServiceName: EJECUTANDO" Green
        }
        else {
            rlog "Servicio $ServiceName: verifique manualmente" Yellow
        }

        # Verificar API
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$NodePort/api/columns" -UseBasicParsing -TimeoutSec 10
            if ($r.StatusCode -eq 200) { rlog "API respondiendo OK en puerto $NodePort" Green }
        }
        catch { rlog "API aun iniciando (puede tardar con BD)" Yellow }

        # Limpiar temp
        Remove-Item "C:\Temp\KPIsRosti_Dist"   -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item "C:\Temp\KPIsRosti_Server" -Recurse -Force -ErrorAction SilentlyContinue

        rlog "Deploy completado en este servidor" Green

    } -ArgumentList $srvCopy.InstallDir, $srvCopy.NodePort, $srvCopy.IISPort, $ServiceName, $Update.IsPresent, (-not $SkipFrontend.IsPresent), (-not $SkipBackend.IsPresent), "CalendarioPresupuesto"

    $Jobs += [PSCustomObject]@{
        Name    = $srv.Name
        Host    = $srv.Host
        Job     = $job
        Session = $session
    }

    Write-Ok "Job lanzado para $($srv.Name)"
}

# ============================================================
# PASO 4: ESPERAR JOBS Y MOSTRAR RESULTADOS
# ============================================================
if ($Jobs.Count -eq 0) {
    Write-Err "No se pudo conectar a ningun servidor. Verifica la conectividad WinRM."
    exit 1
}

Write-Banner "ESPERANDO RESULTADOS (ejecutando en paralelo)..." "Yellow"
Write-Info "Los $($Jobs.Count) servidores estan siendo actualizados al mismo tiempo."
Write-Info "Esto puede tomar entre 2 y 10 minutos segun velocidad de red..."
Write-Host ""

# Mostrar progreso mientras esperan
$allDone = $false
$spinner  = @("   |", "   /", "   -", "   \")
$i = 0
while (-not $allDone) {
    $pending = $Jobs | Where-Object { $_.Job.State -eq "Running" }
    if ($pending.Count -gt 0) {
        $names = $pending.Name -join ", "
        Write-Host "`r$($spinner[$i % 4])  Esperando: $names    " -NoNewline
        $i++
        Start-Sleep -Milliseconds 400
    }
    else {
        $allDone = $true
    }
}
Write-Host "`r                                                              " -NoNewline
Write-Host ""

# ============================================================
# PASO 5: RESUMEN FINAL
# ============================================================
Write-Banner "RESUMEN DE DEPLOY" "Green"

$allOk = $true
foreach ($j in $Jobs) {
    Write-Host "  --- $($j.Name) ($($j.Host)) ---" -ForegroundColor Cyan

    if ($j.Job.State -eq "Failed") {
        Write-Err "El job fallo completamente"
        $allOk = $false
    }
    else {
        # Mostrar output del job remoto
        $output = Receive-Job -Job $j.Job 2>&1
        foreach ($line in $output) {
            if ($line -match "\[OK\]")    { Write-Host "   $line" -ForegroundColor Green }
            elseif ($line -match "\[ERROR\]") { Write-Host "   $line" -ForegroundColor Red; $allOk = $false }
            elseif ($line -match "\[!!\]")   { Write-Host "   $line" -ForegroundColor Yellow }
            else { Write-Host "   $line" -ForegroundColor Gray }
        }
    }

    # Cerrar sesion
    Remove-PSSession $j.Session -ErrorAction SilentlyContinue
    Remove-Job $j.Job -ErrorAction SilentlyContinue
    Write-Host ""
}

if ($allOk) {
    Write-Host "  =============================================" -ForegroundColor Green
    Write-Host "   TODOS LOS SERVIDORES ACTUALIZADOS OK" -ForegroundColor Green
    Write-Host "  =============================================" -ForegroundColor Green
}
else {
    Write-Host "  =============================================" -ForegroundColor Yellow
    Write-Host "   DEPLOY COMPLETADO CON ADVERTENCIAS" -ForegroundColor Yellow
    Write-Host "   Revisa los errores arriba" -ForegroundColor Yellow
    Write-Host "  =============================================" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Modo: $(if ($Update) { 'ACTUALIZACION' } else { 'INSTALACION COMPLETA' })" -ForegroundColor White
Write-Host "  Frontend: $(if (-not $SkipFrontend) { 'Actualizado' } else { 'Sin cambios' })" -ForegroundColor White
Write-Host "  Backend:  $(if (-not $SkipBackend)  { 'Actualizado' } else { 'Sin cambios' })" -ForegroundColor White
Write-Host ""
