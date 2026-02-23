# Copy frontend dist to the CORRECT location: web-app/dist/ (where server.js reads from)
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$SourceDir = Split-Path $PSScriptRoot
$WebAppDist = "$SourceDir\web-app\dist"

Write-Host "=== FIXING FRONTEND PATH ===" -ForegroundColor Cyan
Write-Host "Source: $WebAppDist" -ForegroundColor Gray

$session = New-PSSession -ComputerName 10.29.1.25 -Credential $cred -ErrorAction Stop
Write-Host "[OK] Session opened" -ForegroundColor Green

# 1. Clear old web-app/dist on server and recreate
Write-Host "[1] Cleaning remote web-app/dist..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    $distDir = 'C:\Apps\CalendarioPresupuesto\web-app\dist'
    if (Test-Path $distDir) {
        Remove-Item "$distDir\*" -Recurse -Force
    } else {
        New-Item -ItemType Directory -Path $distDir -Force | Out-Null
    }
    "Cleaned: $distDir"
}

# 2. Copy local dist to remote web-app/dist/
Write-Host "[2] Copying dist to web-app/dist/..." -ForegroundColor Yellow
Copy-Item -Path "$WebAppDist\*" -Destination "C:\Apps\CalendarioPresupuesto\web-app\dist" -ToSession $session -Recurse -Force
Write-Host "[OK] Files copied" -ForegroundColor Green

# 3. Verify
Write-Host "[3] Verifying..." -ForegroundColor Yellow
$verify = Invoke-Command -Session $session -ScriptBlock {
    $distDir = 'C:\Apps\CalendarioPresupuesto\web-app\dist'
    $out = @()
    $out += "index.html: $(Test-Path "$distDir\index.html")"
    $out += "assets/: $(Test-Path "$distDir\assets")"
    if (Test-Path "$distDir\assets") {
        $assets = (Get-ChildItem "$distDir\assets" -Name) -join ", "
        $out += "Assets: $assets"
    }
    # Show first few bytes of index.html to verify hash
    if (Test-Path "$distDir\index.html") {
        $content = Get-Content "$distDir\index.html" -Raw
        $match = [regex]::Match($content, 'index-[a-zA-Z0-9]+\.js')
        $out += "JS bundle: $($match.Value)"
    }
    $totalFiles = (Get-ChildItem $distDir -Recurse -File).Count
    $out += "Total files: $totalFiles"
    $out -join "`n"
}
Write-Host $verify -ForegroundColor Gray

# 4. Restart service 
Write-Host "[4] Restarting service..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    & $nssm restart CalendarioPresupuesto-API 2>$null | Out-Null
}
Start-Sleep -Seconds 6

# 5. Final test
$apiTest = Invoke-Command -Session $session -ScriptBlock {
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost/api/columns' -TimeoutSec 10
        "API: OK ($($r.columns.Count) cols)"
    } catch {
        "API: ERROR $($_.Exception.Message)"
    }
}
Write-Host "[5] $apiTest" -ForegroundColor Green

$htmlTest = Invoke-Command -Session $session -ScriptBlock {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 10
        $match = [regex]::Match($r.Content, 'index-[a-zA-Z0-9]+\.js')
        "Frontend: OK (bundle: $($match.Value), length: $($r.RawContentLength))"
    } catch {
        "Frontend: ERROR $($_.Exception.Message)"
    }
}
Write-Host "[5] $htmlTest" -ForegroundColor Green

Remove-PSSession $session

Write-Host "`n=== DONE ===" -ForegroundColor Green
