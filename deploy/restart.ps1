# Quick restart and verify
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

Write-Host "Connecting..." -ForegroundColor Yellow
try {
    $session = New-PSSession -ComputerName 10.29.1.25 -Credential $cred -ErrorAction Stop
    Write-Host "Connected!" -ForegroundColor Green
    
    $result = Invoke-Command -Session $session -ScriptBlock {
        $out = @()
        
        # Check service
        $svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
        $out += "Service: $($svc.Status)"
        
        # Check if node is running and on what port
        $node = Get-Process node -ErrorAction SilentlyContinue
        $out += "Node PIDs: $($node.Id -join ',')"
        
        # Check all listening ports
        $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | 
            Where-Object { $_.LocalPort -in @(80, 3000, 8080) }
        foreach ($l in $listeners) {
            $out += "Listening: port=$($l.LocalPort) PID=$($l.OwningProcess) addr=$($l.LocalAddress)"
        }
        
        if (-not $listeners) {
            $out += "NOTHING listening on 80/3000/8080!"
            
            # Try to restart
            $nssm = 'C:\Apps\CalendarioPresupuesto\tools\nssm.exe'
            taskkill /F /IM node.exe 2>$null | Out-Null
            Start-Sleep -Seconds 2
            & $nssm restart CalendarioPresupuesto-API 2>$null
            Start-Sleep -Seconds 6
            
            $svc2 = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue
            $out += "After restart: $($svc2.Status)"
            
            $newListeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | 
                Where-Object { $_.LocalPort -in @(80, 3000) }
            foreach ($l in $newListeners) {
                $out += "Now listening: port=$($l.LocalPort) PID=$($l.OwningProcess)"
            }
            
            # Check stderr
            $log = 'C:\Apps\CalendarioPresupuesto\server\logs\stderr.log'
            if (Test-Path $log) {
                $out += "STDERR:"
                (Get-Content $log -Tail 5) | ForEach-Object { $out += "  $_" }
            }
            $log2 = 'C:\Apps\CalendarioPresupuesto\server\logs\stdout.log'
            if (Test-Path $log2) {
                $out += "STDOUT:"
                (Get-Content $log2 -Tail 5) | ForEach-Object { $out += "  $_" }
            }
        }
        
        # API test
        try {
            $r = Invoke-RestMethod -Uri 'http://localhost:80/api/columns' -TimeoutSec 5
            $out += "API port 80: OK"
        } catch {
            $out += "API port 80: FAIL"
        }
        
        $out -join "`n"
    }
    
    Write-Host $result
    Remove-PSSession $session
} catch {
    Write-Host "WinRM Failed: $_" -ForegroundColor Red
}
