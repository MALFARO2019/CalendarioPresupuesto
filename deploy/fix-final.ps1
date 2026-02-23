# Strategy: stop IIS, run Node on port 80 directly
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

Write-Host "=== SWITCHING TO NODE ON PORT 80 (no IIS) ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    $envFile = 'C:\Apps\CalendarioPresupuesto\server\.env'
    
    # 1. Stop Node service first
    [void]$out.Add("1. Stopping Node service...")
    & $nssm stop CalendarioPresupuesto-API 2>$null | Out-Null
    Start-Sleep -Seconds 2
    taskkill /F /IM node.exe 2>$null | Out-Null
    Start-Sleep -Seconds 1
    
    # 2. Stop IIS completely to free port 80
    [void]$out.Add("2. Stopping IIS...")
    iisreset /stop 2>$null | Out-Null
    Start-Sleep -Seconds 2
    
    # Also disable W3SVC service
    Stop-Service W3SVC -Force -ErrorAction SilentlyContinue
    Set-Service W3SVC -StartupType Manual -ErrorAction SilentlyContinue
    [void]$out.Add("   IIS stopped and set to Manual start")
    
    # 3. Update .env to PORT=80
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match 'PORT=3000') {
        $envContent = $envContent -replace 'PORT=3000', 'PORT=80'
        [System.IO.File]::WriteAllText($envFile, $envContent, [System.Text.UTF8Encoding]::new($false))
        [void]$out.Add("3. .env updated: PORT=80")
    } elseif ($envContent -match 'PORT=') {
        $envContent = $envContent -replace 'PORT=\d+', 'PORT=80'
        [System.IO.File]::WriteAllText($envFile, $envContent, [System.Text.UTF8Encoding]::new($false))
        [void]$out.Add("3. .env updated: PORT=80")
    } else {
        Add-Content $envFile "`nPORT=80"
        [void]$out.Add("3. .env: Added PORT=80")
    }
    
    # Also update NSSM env
    & $nssm set CalendarioPresupuesto-API AppEnvironmentExtra "NODE_ENV=production`nPORT=80" 2>$null | Out-Null
    
    # 4. Verify port 80 is free
    $p80 = Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$out.Add("4. Port 80 free: $(if (-not $p80) { 'YES' } else { 'NO - PID ' + $p80.OwningProcess })")
    
    # 5. Start Node service
    [void]$out.Add("5. Starting Node service on port 80...")
    & $nssm start CalendarioPresupuesto-API 2>$null | Out-Null
    Start-Sleep -Seconds 8
    
    # 6. Check
    $svc = Get-Service CalendarioPresupuesto-API -ErrorAction SilentlyContinue
    [void]$out.Add("6. Service status: $($svc.Status)")
    
    $p80 = Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$out.Add("   Port 80: $(if ($p80) { 'LISTENING PID=' + $p80.OwningProcess } else { 'NOT LISTENING' })")
    
    # 7. API test
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost/api/columns' -TimeoutSec 10
        [void]$out.Add("7. API (localhost:80): OK - columns: $($r.columns.Count)")
    } catch {
        [void]$out.Add("7. API (localhost:80): ERROR - $($_.Exception.Message)")
    }
    
    # 8. Frontend test
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 10
        [void]$out.Add("8. Frontend (localhost:80): StatusCode=$($r.StatusCode) Length=$($r.RawContentLength)")
    } catch {
        [void]$out.Add("8. Frontend (localhost:80): ERROR - $($_.Exception.Message)")
    }
    
    return ($out -join "`n")
}

Write-Host $result
