# Full diagnostic - service, ports, firewall
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    
    # Service
    $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
    [void]$out.Add("SERVICE: $($svc.Status)")
    
    # Node process
    $node = Get-Process node -ErrorAction SilentlyContinue
    [void]$out.Add("NODE: count=$($node.Count) PIDs=$($node.Id -join ',')")
    
    # Ports listening
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(80, 443, 3000, 8080) }
    foreach ($l in $listeners) {
        $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
        [void]$out.Add("PORT $($l.LocalPort): PID=$($l.OwningProcess) ($($proc.ProcessName)) LocalAddr=$($l.LocalAddress)")
    }
    if (-not $listeners) {
        [void]$out.Add("NO PORTS 80/443/3000/8080 LISTENING!")
    }
    
    # IIS status
    $w3svc = Get-Service W3SVC -ErrorAction SilentlyContinue
    [void]$out.Add("W3SVC (IIS): $($w3svc.Status) StartType=$($w3svc.StartType)")
    
    # Firewall rules for port 80
    $fwRules = Get-NetFirewallRule -Direction Inbound -Enabled True -ErrorAction SilentlyContinue | 
        Get-NetFirewallPortFilter -ErrorAction SilentlyContinue | 
        Where-Object { $_.LocalPort -eq 80 -or $_.LocalPort -eq 'Any' }
    [void]$out.Add("FIREWALL RULES for 80: $($fwRules.Count) rules found")
    
    # Check specific firewall rules
    $httpRule = Get-NetFirewallRule -DisplayName "World Wide Web Services (HTTP Traffic-In)" -ErrorAction SilentlyContinue
    $calRule = Get-NetFirewallRule -DisplayName "*Calendario*" -ErrorAction SilentlyContinue
    [void]$out.Add("IIS HTTP Rule: $(if ($httpRule) { $httpRule.Enabled } else { 'NOT FOUND' })")
    [void]$out.Add("Calendario Rule: $(if ($calRule) { "$($calRule.DisplayName) Enabled=$($calRule.Enabled)" } else { 'NOT FOUND' })")
    
    # All inbound allow rules for port 80
    $all80Rules = Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue |
        ForEach-Object { 
            $pf = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
            if ($pf.LocalPort -eq '80' -or $pf.LocalPort -eq 'Any') {
                [PSCustomObject]@{Name=$_.DisplayName; Port=$pf.LocalPort; Action=$_.Action}
            }
        }
    foreach ($r in $all80Rules) {
        if ($r) { [void]$out.Add("  FW: $($r.Name) Port=$($r.Port)") }
    }
    
    # NSSM config
    $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
    if (Test-Path $nssm) {
        $appDir = & $nssm get CalendarioPresupuesto-API AppDirectory 2>$null
        $appParams = & $nssm get CalendarioPresupuesto-API AppParameters 2>$null
        [void]$out.Add("NSSM AppDir: $appDir")
        [void]$out.Add("NSSM AppParams: $appParams")
    }
    
    # .env PORT value
    $envContent = Get-Content 'C:\Apps\CalendarioPresupuesto\server\.env' -Raw -ErrorAction SilentlyContinue
    $portMatch = [regex]::Match($envContent, 'PORT=(\d+)')
    [void]$out.Add("ENV PORT: $($portMatch.Groups[1].Value)")
    
    # API test locally
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost/api/columns' -TimeoutSec 5
        [void]$out.Add("LOCAL API TEST (port 80): OK cols=$($r.columns.Count)")
    } catch {
        [void]$out.Add("LOCAL API TEST (port 80): FAIL $($_.Exception.Message)")
    }
    
    # Stdout log last 3 lines
    $stdLog = 'C:\Apps\CalendarioPresupuesto\server\logs\stdout.log'
    if (Test-Path $stdLog) {
        $last = Get-Content $stdLog -Tail 3
        [void]$out.Add("STDOUT (last 3):")
        foreach ($l in $last) { [void]$out.Add("  $l") }
    }
    
    return ($out -join "`n")
}

$result | Out-File "c:\AntiGravityDev\CalendarioPresupuesto\deploy\diag2.txt" -Encoding UTF8
Write-Host $result
