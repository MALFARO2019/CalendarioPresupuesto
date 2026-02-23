# Quick health check for 10.29.1.25
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/columns' -TimeoutSec 10
        "API OK - Columnas: $($r.Count)"
    } catch {
        "Error: $($_.Exception.Message)"
    }
}
Write-Host "Resultado: $result"
