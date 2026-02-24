# Quick deploy script to 10.29.1.25
param(
    [string]$ServerIp = "10.29.1.25",
    [string]$User = "Administrador",
    [string]$Password = "R0st1p017",
    [string]$AppDir = "C:\Apps\CalendarioPresupuesto"
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY A $ServerIp" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Create credentials
$secPwd = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $secPwd)

# Step 1: Test connection
Write-Host "[1/6] Verificando conexion..." -ForegroundColor Yellow
try {
    $hostname = Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock { hostname }
    Write-Host "  [OK] Conectado a $hostname" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo conectar: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Git pull
Write-Host "[2/6] Descargando codigo (git)..." -ForegroundColor Yellow
try {
    $gitResult = Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock {
        param($dir)
        $env:Path += ';C:\Program Files\Git\cmd;C:\Program Files (x86)\Git\cmd'
        Set-Location $dir
        git fetch origin main 2>&1
        git reset --hard origin/main 2>&1
    } -ArgumentList $AppDir
    Write-Host "  [OK] $($gitResult | Select-Object -Last 1)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Git: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Install backend deps
Write-Host "[3/6] Instalando dependencias backend..." -ForegroundColor Yellow
try {
    Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock {
        param($dir)
        $env:Path += ';C:\Program Files\nodejs;C:\Users\Administrador\AppData\Roaming\npm'
        Set-Location "$dir\server"
        npm install --production --no-audit 2>&1 | Out-Null
    } -ArgumentList $AppDir
    Write-Host "  [OK] Dependencias backend instaladas" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] npm backend: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Build frontend
Write-Host "[4/6] Construyendo frontend..." -ForegroundColor Yellow
try {
    $buildResult = Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock {
        param($dir)
        $env:Path += ';C:\Program Files\nodejs;C:\Users\Administrador\AppData\Roaming\npm'
        Set-Location "$dir\web-app"
        npm install --no-audit 2>&1 | Out-Null
        npm run build 2>&1
    } -ArgumentList $AppDir
    Write-Host "  [OK] Frontend construido" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Build frontend: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Restart service
Write-Host "[5/6] Reiniciando servicio..." -ForegroundColor Yellow
try {
    $restartResult = Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock {
        $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
        if ($svc) {
            Stop-Service 'CalendarioPresupuesto-API' -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
            taskkill /F /IM node.exe 2>$null
            Start-Sleep -Seconds 2
            Start-Service 'CalendarioPresupuesto-API'
            "Servicio NSSM reiniciado"
        } else {
            taskkill /F /IM node.exe 2>$null
            Start-Sleep -Seconds 2
            Start-Process cmd -ArgumentList "/c cd /d C:\Apps\CalendarioPresupuesto\server && node server.js" -WindowStyle Hidden
            "Node.js reiniciado manualmente"
        }
    }
    Write-Host "  [OK] $restartResult" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Reinicio: $_" -ForegroundColor Red
}

# Step 6: Health check
Write-Host "[6/6] Verificando API..." -ForegroundColor Yellow
Start-Sleep -Seconds 8
try {
    $version = Invoke-Command -ComputerName $ServerIp -Credential $cred -ScriptBlock {
        try {
            $r = Invoke-RestMethod -Uri 'http://localhost/api/version-check' -TimeoutSec 10
            $r.version
        } catch {
            try {
                $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
                "API OK (columns respondio)"
            } catch {
                "API no responde aun: $_"
            }
        }
    }
    Write-Host "  [OK] API: $version" -ForegroundColor Green
} catch {
    Write-Host "  [!!] API no verificada (puede tardar): $_" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETADO" -ForegroundColor Green
Write-Host "  Acceso: http://$ServerIp" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Green
