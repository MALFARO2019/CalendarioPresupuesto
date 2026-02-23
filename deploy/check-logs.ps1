# Check logs and restart
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    
    # Stop everything
    & $nssm stop CalendarioPresupuesto-API 2>$null | Out-Null
    Start-Sleep -Seconds 2
    taskkill /F /IM node.exe 2>$null | Out-Null
    Start-Sleep -Seconds 2
    
    # Clear old logs  
    $logDir = 'C:\Apps\CalendarioPresupuesto\server\logs'
    if (Test-Path "$logDir\stderr.log") { Remove-Item "$logDir\stderr.log" -Force }
    if (Test-Path "$logDir\stdout.log") { Remove-Item "$logDir\stdout.log" -Force }
    
    # Check .env file
    $envFile = 'C:\Apps\CalendarioPresupuesto\server\.env'
    if (Test-Path $envFile) {
        [void]$out.Add(".env EXISTS")
    } else {
        [void]$out.Add(".env MISSING - This is likely the problem!")
        # Check if there's one in Deploy
        if (Test-Path 'C:\Deploy\CalendarioPresupuesto\server\.env') {
            Copy-Item 'C:\Deploy\CalendarioPresupuesto\server\.env' $envFile -Force
            [void]$out.Add(".env COPIED from Deploy dir")
        }
    }
    
    # Check server.js exists
    [void]$out.Add("server.js exists: $(Test-Path 'C:\Apps\CalendarioPresupuesto\server\server.js')")
    [void]$out.Add("node_modules exists: $(Test-Path 'C:\Apps\CalendarioPresupuesto\server\node_modules')")
    
    # Check what files are in server/
    $serverFiles = Get-ChildItem 'C:\Apps\CalendarioPresupuesto\server' -Name -File | Select-Object -First 20
    [void]$out.Add("Server files: $($serverFiles -join ', ')")
    
    # Start service
    [void]$out.Add("Starting service...")
    & $nssm start CalendarioPresupuesto-API 2>$null | Out-Null
    
    # Wait for it to start
    Start-Sleep -Seconds 8
    
    # Check port
    $p3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$out.Add("Port 3000 after start: $(if ($p3000) { 'YES PID=' + $p3000.OwningProcess } else { 'NO' })")
    
    # Check service status
    $svc = Get-Service CalendarioPresupuesto-API -ErrorAction SilentlyContinue
    [void]$out.Add("Service status: $($svc.Status)")
    
    # Read new logs
    if (Test-Path "$logDir\stderr.log") {
        $errLog = Get-Content "$logDir\stderr.log" -Raw
        if ($errLog) {
            [void]$out.Add("STDERR (new):")
            [void]$out.Add($errLog.Substring(0, [Math]::Min($errLog.Length, 500)))
        }
    }
    if (Test-Path "$logDir\stdout.log") {
        $stdLog = Get-Content "$logDir\stdout.log" -Raw
        if ($stdLog) {
            [void]$out.Add("STDOUT (new):")
            [void]$out.Add($stdLog.Substring(0, [Math]::Min($stdLog.Length, 500)))
        }
    }
    
    # API test
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
        [void]$out.Add("API TEST: OK!")
    } catch {
        [void]$out.Add("API TEST: ERROR - $($_.Exception.Message)")
    }
    
    return ($out -join "`n")
}

$result | Out-File "c:\AntiGravityDev\CalendarioPresupuesto\deploy\logs-output.txt" -Encoding UTF8
Write-Host $result
