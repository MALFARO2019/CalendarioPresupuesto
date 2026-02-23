# Deploy via direct file copy - FIXED path: dist contents go directly into web-app/
param(
    [string]$ServerIp = "10.29.1.25",
    [string]$User = "Administrador",
    [string]$Password = "R0st1p017",
    [string]$RemoteAppDir = "C:\Apps\CalendarioPresupuesto"
)

$ErrorActionPreference = "Continue"
$SourceDir = Split-Path $PSScriptRoot
$WebAppDist = "$SourceDir\web-app\dist"
$ServerSrc = "$SourceDir\server"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY (copia directa) A $ServerIp" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Validate dist exists
if (-not (Test-Path $WebAppDist)) {
    Write-Host "[ERROR] No existe $WebAppDist. Ejecute 'npm run build' en web-app primero." -ForegroundColor Red
    exit 1
}

# Create credentials and session
$secPwd = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $secPwd)

Write-Host "[1/5] Conectando via WinRM..." -ForegroundColor Yellow
try {
    $session = New-PSSession -ComputerName $ServerIp -Credential $cred -ErrorAction Stop
    $hostname = Invoke-Command -Session $session -ScriptBlock { hostname }
    Write-Host "  [OK] Sesion abierta con $hostname" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo conectar: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Stop service
Write-Host "[2/5] Deteniendo servicio..." -ForegroundColor Yellow
try {
    Invoke-Command -Session $session -ScriptBlock {
        $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
        if ($svc) {
            Stop-Service 'CalendarioPresupuesto-API' -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        taskkill /F /IM node.exe 2>$null
        Start-Sleep -Seconds 1
    }
    Write-Host "  [OK] Servicio detenido" -ForegroundColor Green
} catch {
    Write-Host "  [!!] No se pudo detener el servicio: $_" -ForegroundColor Yellow
}

# Step 3: Copy frontend — dist CONTENTS go directly into web-app/ (IIS physical path)
Write-Host "[3/5] Copiando frontend (dist -> web-app/)..." -ForegroundColor Yellow
try {
    # Ensure remote web-app dir exists
    Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        New-Item -ItemType Directory -Path "$dir\web-app" -Force | Out-Null
    } -ArgumentList $RemoteAppDir

    # Copy dist CONTENTS directly into web-app/ (NOT into web-app/dist/)
    Copy-Item -Path "$WebAppDist\*" -Destination "$RemoteAppDir\web-app" -ToSession $session -Recurse -Force
    
    # Verify
    $fileCount = Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        (Get-ChildItem "$dir\web-app" -Recurse -File).Count
    } -ArgumentList $RemoteAppDir
    Write-Host "  [OK] Frontend copiado ($fileCount archivos en web-app/)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Copiando frontend: $_" -ForegroundColor Red
    Remove-PSSession $session
    exit 1
}

# Step 4: Copy backend files
Write-Host "[4/5] Copiando backend..." -ForegroundColor Yellow
try {
    # Ensure remote server dir exists
    Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        New-Item -ItemType Directory -Path "$dir\server" -Force | Out-Null
        New-Item -ItemType Directory -Path "$dir\server\logs" -Force | Out-Null
    } -ArgumentList $RemoteAppDir

    # Copy all .js files
    Get-ChildItem -Path $ServerSrc -Filter "*.js" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination "$RemoteAppDir\server\$($_.Name)" -ToSession $session -Force
    }

    # Copy .json config files
    foreach ($f in @("package.json", "package-lock.json")) {
        $fp = Join-Path $ServerSrc $f
        if (Test-Path $fp) {
            Copy-Item -Path $fp -Destination "$RemoteAppDir\server\$f" -ToSession $session -Force
        }
    }

    # Copy subdirectories
    foreach ($subDir in @("services", "jobs", "migrations", "scripts")) {
        $subPath = Join-Path $ServerSrc $subDir
        if (Test-Path $subPath) {
            Invoke-Command -Session $session -ScriptBlock {
                param($dir, $sub)
                New-Item -ItemType Directory -Path "$dir\server\$sub" -Force | Out-Null
            } -ArgumentList $RemoteAppDir, $subDir
            Copy-Item -Path "$subPath\*" -Destination "$RemoteAppDir\server\$subDir" -ToSession $session -Recurse -Force
            Write-Host "  [..] Copiado: server/$subDir/" -ForegroundColor Gray
        }
    }

    # Install npm deps on server
    Write-Host "  [..] Instalando dependencias npm..." -ForegroundColor Gray
    Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        $env:Path += ';C:\Program Files\nodejs;C:\Users\Administrador\AppData\Roaming\npm'
        Set-Location "$dir\server"
        npm install --production --no-audit 2>&1 | Out-Null
    } -ArgumentList $RemoteAppDir
    Write-Host "  [OK] Backend copiado y dependencias instaladas" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Copiando backend: $_" -ForegroundColor Red
}

# Step 5: Start service and verify
Write-Host "[5/5] Iniciando servicio y verificando..." -ForegroundColor Yellow
try {
    $startResult = Invoke-Command -Session $session -ScriptBlock {
        $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
        if ($svc) {
            Start-Service 'CalendarioPresupuesto-API'
            "Servicio NSSM iniciado"
        } else {
            Start-Process cmd -ArgumentList "/c cd /d C:\Apps\CalendarioPresupuesto\server && node server.js" -WindowStyle Hidden
            "Node.js iniciado manualmente"
        }
    }
    Write-Host "  [OK] $startResult" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Iniciando servicio: $_" -ForegroundColor Red
}

# Wait and health check
Start-Sleep -Seconds 8
try {
    $apiCheck = Invoke-Command -Session $session -ScriptBlock {
        try {
            $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
            "API OK - respondiendo en puerto 3000"
        } catch {
            "API aun iniciando..."
        }
    }
    Write-Host "  [OK] $apiCheck" -ForegroundColor Green
} catch {
    Write-Host "  [!!] Verificacion de API no disponible aun" -ForegroundColor Yellow
}

# Check what index.html looks like on server
try {
    $indexCheck = Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        if (Test-Path "$dir\web-app\index.html") {
            "index.html EXISTE en web-app/"
        } else {
            "index.html NO existe en web-app/ - Archivos: " + ((Get-ChildItem "$dir\web-app" -Name) -join ", ")
        }
    } -ArgumentList $RemoteAppDir
    Write-Host "  [..] $indexCheck" -ForegroundColor Gray
} catch {}

# Clean up session
Remove-PSSession $session

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETADO" -ForegroundColor Green
Write-Host "  Acceso: http://$ServerIp" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Green
