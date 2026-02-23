# Add PORT=3000 to .env and restart
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

Write-Host "=== FIXING PORT ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    $envFile = 'C:\Apps\CalendarioPresupuesto\server\.env'
    
    # Read current .env
    $envContent = Get-Content $envFile -Raw
    [void]$out.Add("Current .env has PORT: $($envContent -match 'PORT=')")
    
    # Add PORT=3000 if not present
    if ($envContent -notmatch '^\s*PORT\s*=') {
        Add-Content $envFile "`nPORT=3000"
        [void]$out.Add("Added PORT=3000 to .env")
    } else {
        [void]$out.Add("PORT already in .env")
    }
    
    # Also set via NSSM env
    & $nssm set CalendarioPresupuesto-API AppEnvironmentExtra "NODE_ENV=production`nPORT=3000" 2>$null | Out-Null
    [void]$out.Add("Set NSSM AppEnvironmentExtra with PORT=3000")
    
    # Restart
    & $nssm stop CalendarioPresupuesto-API 2>$null | Out-Null
    Start-Sleep -Seconds 2
    taskkill /F /IM node.exe 2>$null | Out-Null
    Start-Sleep -Seconds 2
    
    # Clear logs
    $logDir = 'C:\Apps\CalendarioPresupuesto\server\logs'
    if (Test-Path "$logDir\stderr.log") { Remove-Item "$logDir\stderr.log" -Force -ErrorAction SilentlyContinue }
    if (Test-Path "$logDir\stdout.log") { Remove-Item "$logDir\stdout.log" -Force -ErrorAction SilentlyContinue }
    
    & $nssm start CalendarioPresupuesto-API 2>$null | Out-Null
    [void]$out.Add("Service restarted")
    
    Start-Sleep -Seconds 8
    
    # Check
    $p3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$out.Add("Port 3000: $(if ($p3000) { 'LISTENING PID=' + $p3000.OwningProcess } else { 'NOT LISTENING' })")
    
    # Read new stdout
    if (Test-Path "$logDir\stdout.log") {
        $stdLog = Get-Content "$logDir\stdout.log" | Select-String "Server running"
        [void]$out.Add("Server line: $stdLog")
    }
    
    # API test
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
        [void]$out.Add("API (port 3000): OK!")
    } catch {
        [void]$out.Add("API (port 3000): ERROR - $($_.Exception.Message)")
    }
    
    # IIS via port 80
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/api/columns' -UseBasicParsing -TimeoutSec 10
        [void]$out.Add("IIS proxy (port 80 /api/columns): StatusCode=$($r.StatusCode)")
    } catch {
        [void]$out.Add("IIS proxy (port 80 /api/columns): ERROR - $($_.Exception.Message)")
    }
    
    return ($out -join "`n")
}

Write-Host $result
