# Clean diagnostic - output to file
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $lines = [System.Collections.ArrayList]@()
    
    # Service
    $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
    [void]$lines.Add("SERVICIO: $($svc.Status)")
    
    # Node processes
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    [void]$lines.Add("NODE_PROCS: count=$($nodeProcs.Count), PIDs=$($nodeProcs.Id -join ',')")
    
    # Ports
    $p3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$lines.Add("PUERTO_3000: $(if ($p3000) { 'SI PID=' + $p3000.OwningProcess } else { 'NO' })")
    $p80 = Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue | Select-Object -First 1
    [void]$lines.Add("PUERTO_80: $(if ($p80) { 'SI PID=' + $p80.OwningProcess } else { 'NO' })")
    
    # IIS
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    $sites = Get-Website -ErrorAction SilentlyContinue
    foreach ($s in $sites) {
        [void]$lines.Add("IIS_SITE: name=$($s.Name) state=$($s.State) path=$($s.PhysicalPath)")
    }
    
    # Files in web-app
    $dir = 'C:\Apps\CalendarioPresupuesto\web-app'
    if (Test-Path $dir) {
        $items = Get-ChildItem $dir -Name
        [void]$lines.Add("WEBAPP_FILES: $($items -join ', ')")
        if (Test-Path "$dir\assets") {
            $assets = Get-ChildItem "$dir\assets" -Name
            [void]$lines.Add("ASSETS: $($assets -join ', ')")
        }
    }
    
    # web.config existence
    [void]$lines.Add("WEBCONFIG: $(Test-Path "$dir\web.config")")
    
    # API test
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 5
        [void]$lines.Add("API_3000: OK")
    } catch {
        [void]$lines.Add("API_3000: ERROR $($_.Exception.Message)")
    }
    
    # IIS test
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 5
        [void]$lines.Add("IIS_80: status=$($r.StatusCode) length=$($r.RawContentLength)")
    } catch {
        [void]$lines.Add("IIS_80: ERROR $($_.Exception.Message)")
    }
    
    # NSSM AppDirectory
    try {
        $nssmDir = & 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe' get CalendarioPresupuesto-API AppDirectory 2>$null
        [void]$lines.Add("NSSM_DIR: $nssmDir")
    } catch {
        [void]$lines.Add("NSSM_DIR: ERROR")
    }
    
    # stderr log (last 5 lines)
    $logFile = 'C:\Apps\CalendarioPresupuesto\server\logs\stderr.log'
    if (Test-Path $logFile) {
        $lastLines = Get-Content $logFile -Tail 5
        [void]$lines.Add("STDERR_LOG (last 5):")
        foreach ($l in $lastLines) { [void]$lines.Add("  $l") }
    }
    
    # stdout log (last 5 lines) 
    $stdoutLog = 'C:\Apps\CalendarioPresupuesto\server\logs\stdout.log'
    if (Test-Path $stdoutLog) {
        $lastLines = Get-Content $stdoutLog -Tail 5
        [void]$lines.Add("STDOUT_LOG (last 5):")
        foreach ($l in $lastLines) { [void]$lines.Add("  $l") }
    }
    
    return ($lines -join "`n")
}

$result | Out-File "c:\AntiGravityDev\CalendarioPresupuesto\deploy\diag-output.txt" -Encoding UTF8
Write-Host "Diagnostico guardado en diag-output.txt"
Write-Host $result
