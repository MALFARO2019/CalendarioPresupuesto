# Quick status check
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = @()
    
    $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
    $out += "NODE_SVC: $($svc.Status)"
    
    $w3 = Get-Service 'W3SVC' -ErrorAction SilentlyContinue
    $out += "W3SVC: $($w3.Status) StartType=$($w3.StartType)"
    
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in @(80, 3000, 443) }
    foreach ($l in $listeners) {
        $p = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
        $out += "PORT $($l.LocalPort): PID=$($l.OwningProcess) ($($p.ProcessName))"
    }
    
    # .env PORT
    $env = Get-Content 'C:\Apps\CalendarioPresupuesto\server\.env' -Raw -ErrorAction SilentlyContinue
    $portMatch = [regex]::Match($env, 'PORT=(\d+)')
    $out += "ENV_PORT: $($portMatch.Groups[1].Value)"
    
    # API test on 3000
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 5
        $out += "API_3000: OK"
    } catch {
        $out += "API_3000: FAIL"
    }
    
    # API test on 80
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:80/api/columns' -TimeoutSec 5
        $out += "API_80: OK"
    } catch {
        $out += "API_80: FAIL"
    }
    
    # Frontend test
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 5
        $match = [regex]::Match($r.Content, 'index-[a-zA-Z0-9]+\.js')
        $out += "FRONTEND: $($match.Value) len=$($r.RawContentLength)"
    } catch {
        $out += "FRONTEND: FAIL"
    }
    
    # IIS site
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    $site = Get-Website -Name 'CalendarioPresupuesto' -ErrorAction SilentlyContinue
    if ($site) {
        $out += "IIS_SITE: State=$($site.State) Path=$($site.PhysicalPath)"
    } else {
        $out += "IIS_SITE: NOT FOUND"
    }
    
    $out -join "`n"
}

Write-Host $result
