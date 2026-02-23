# Fix NSSM AppDirectory and restart service
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

Write-Host "=== FIXING SERVER ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    $nssmPath = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    $serviceName = 'CalendarioPresupuesto-API'
    
    # Check if NSSM exists at both locations
    $nssmApps = Test-Path $nssmPath
    $nssmDeploy = Test-Path 'C:\Deploy\CalendarioPresupuesto\tools\nssm.exe'
    [void]$out.Add("NSSM en Apps: $nssmApps, en Deploy: $nssmDeploy")
    
    # Find nssm
    if ($nssmApps) {
        $nssm = $nssmPath
    } elseif ($nssmDeploy) {
        $nssm = 'C:\Deploy\CalendarioPresupuesto\tools\nssm.exe'
    } else {
        # Try PATH
        $nssm = 'nssm'
    }
    [void]$out.Add("Usando NSSM: $nssm")
    
    # Get current config
    $currentDir = & $nssm get $serviceName AppDirectory 2>$null
    $currentApp = & $nssm get $serviceName Application 2>$null
    $currentArgs = & $nssm get $serviceName AppParameters 2>$null
    [void]$out.Add("ANTES - AppDirectory: $currentDir")
    [void]$out.Add("ANTES - Application: $currentApp")
    [void]$out.Add("ANTES - AppParameters: $currentArgs")
    
    # Stop service
    [void]$out.Add("Deteniendo servicio...")
    & $nssm stop $serviceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    taskkill /F /IM node.exe 2>$null | Out-Null
    Start-Sleep -Seconds 2
    
    # Fix AppDirectory to C:\Apps\CalendarioPresupuesto\server
    $newDir = 'C:\Apps\CalendarioPresupuesto\server'
    & $nssm set $serviceName AppDirectory $newDir 2>$null | Out-Null
    [void]$out.Add("AppDirectory actualizado a: $newDir")
    
    # Fix AppParameters to point to correct server.js
    $newParams = 'C:\Apps\CalendarioPresupuesto\server\server.js'
    & $nssm set $serviceName AppParameters $newParams 2>$null | Out-Null
    [void]$out.Add("AppParameters actualizado a: $newParams")
    
    # Fix stdout/stderr logs
    & $nssm set $serviceName AppStdout 'C:\Apps\CalendarioPresupuesto\server\logs\stdout.log' 2>$null | Out-Null
    & $nssm set $serviceName AppStderr 'C:\Apps\CalendarioPresupuesto\server\logs\stderr.log' 2>$null | Out-Null
    
    # Also fix the deploy-log.json BOM issue
    $deployLogPath = 'C:\Apps\CalendarioPresupuesto\server\deploy-log.json'
    if (Test-Path $deployLogPath) {
        $content = [System.IO.File]::ReadAllText($deployLogPath)
        # Remove BOM if present
        $content = $content.TrimStart([char]0xFEFF, [char]0xFFFE, [char]0xEF, [char]0xBB, [char]0xBF)
        # Also handle the byte sequence ï»¿
        if ($content.StartsWith('ï»¿')) {
            $content = $content.Substring(3)
        }
        [System.IO.File]::WriteAllText($deployLogPath, $content, [System.Text.UTF8Encoding]::new($false))
        [void]$out.Add("deploy-log.json BOM eliminado")
    }
    
    # Start service
    [void]$out.Add("Iniciando servicio...")
    & $nssm start $serviceName 2>$null | Out-Null
    Start-Sleep -Seconds 5
    
    # Verify
    $svc = Get-Service $serviceName -ErrorAction SilentlyContinue
    [void]$out.Add("Servicio estado: $($svc.Status)")
    
    $newDirCheck = & $nssm get $serviceName AppDirectory 2>$null
    [void]$out.Add("DESPUES - AppDirectory: $newDirCheck")
    
    # Check port
    Start-Sleep -Seconds 3
    $p3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$out.Add("Puerto 3000: $(if ($p3000) { 'SI PID=' + $p3000.OwningProcess } else { 'NO' })")
    
    # API test
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
        [void]$out.Add("API: OK")
    } catch {
        [void]$out.Add("API: ERROR - $($_.Exception.Message)")
    }
    
    return ($out -join "`n")
}

Write-Host $result
$result | Out-File "c:\AntiGravityDev\CalendarioPresupuesto\deploy\fix-output.txt" -Encoding UTF8
