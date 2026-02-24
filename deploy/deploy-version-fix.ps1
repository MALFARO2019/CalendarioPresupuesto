# Deploy version fix: copy updated package.json and deploy.js to server
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$sourceDir = Split-Path $PSScriptRoot

Write-Host "=== DEPLOYING VERSION FIX ===" -ForegroundColor Cyan

$session = New-PSSession -ComputerName 10.29.1.25 -Credential $cred -ErrorAction Stop
Write-Host "[OK] Connected" -ForegroundColor Green

# 1. Copy package.json
Write-Host "[1] Copying package.json..." -ForegroundColor Yellow
Copy-Item "$sourceDir\server\package.json" -Destination "C:\Apps\CalendarioPresupuesto\server\package.json" -ToSession $session -Force

# 2. Copy deploy.js
Write-Host "[2] Copying deploy.js..." -ForegroundColor Yellow
Copy-Item "$sourceDir\server\deploy.js" -Destination "C:\Apps\CalendarioPresupuesto\server\deploy.js" -ToSession $session -Force

Write-Host "[OK] Files copied" -ForegroundColor Green

# 3. Restart service
Write-Host "[3] Restarting service..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    & $nssm restart CalendarioPresupuesto-API 2>$null | Out-Null
}
Start-Sleep -Seconds 5

# 4. Verify version
Write-Host "[4] Checking version..." -ForegroundColor Yellow
$versionResult = Invoke-Command -Session $session -ScriptBlock {
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/version-check' -TimeoutSec 10
        "Version: $($r.version) | DB: $($r.db)"
    } catch {
        "FAIL: $($_.Exception.Message)"
    }
}
Write-Host "  $versionResult" -ForegroundColor Green

Remove-PSSession $session
Write-Host "`n=== DONE ===" -ForegroundColor Green
