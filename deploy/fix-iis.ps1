# Fix web.config and IIS proxy
$secPwd = ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('Administrador', $secPwd)

Write-Host "=== FIXING IIS PROXY ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
    $out = [System.Collections.ArrayList]@()
    $webConfigPath = 'C:\Apps\CalendarioPresupuesto\web-app\web.config'
    
    # Read current web.config
    $currentConfig = Get-Content $webConfigPath -Raw
    [void]$out.Add("Current web.config content:")
    [void]$out.Add($currentConfig)
    [void]$out.Add("---")
    
    # Check if it has the correct port (3000 not ${NodePort})
    if ($currentConfig -match '\$\{NodePort\}' -or $currentConfig -notmatch 'localhost:3000') {
        [void]$out.Add("web.config has incorrect port, FIXING...")
        
        # Write correct web.config
        $correctConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="API Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
                </rule>
                <rule name="SPA Fallback" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/" />
                </rule>
            </rules>
        </rewrite>
        <staticContent>
            <remove fileExtension=".json" />
            <mimeMap fileExtension=".json" mimeType="application/json" />
            <remove fileExtension=".woff2" />
            <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
            <remove fileExtension=".woff" />
            <mimeMap fileExtension=".woff" mimeType="font/woff" />
        </staticContent>
        <httpCompression>
            <dynamicTypes>
                <add mimeType="application/json" enabled="true" />
            </dynamicTypes>
        </httpCompression>
    </system.webServer>
</configuration>
'@
        Set-Content $webConfigPath $correctConfig -Encoding UTF8
        [void]$out.Add("web.config FIXED with port 3000")
    } else {
        [void]$out.Add("web.config already correct")
    }
    
    # Check IIS site state
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    $site = Get-Website -Name 'CalendarioPresupuesto' -ErrorAction SilentlyContinue
    if ($site) {
        [void]$out.Add("IIS Site: $($site.Name) State=$($site.State)")
        if ($site.State -ne 'Started') {
            Start-Website -Name 'CalendarioPresupuesto'
            [void]$out.Add("IIS Site started")
        }
    }
    
    # Check ARR proxy is enabled
    try {
        $proxy = Get-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled" -ErrorAction SilentlyContinue
        [void]$out.Add("ARR Proxy enabled: $($proxy.Value)")
        if (-not $proxy.Value) {
            Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled" -value "True"
            [void]$out.Add("ARR Proxy ENABLED")
        }
    } catch {
        [void]$out.Add("ARR Proxy check error: $($_.Exception.Message)")
    }
    
    # Recycle app pool
    try {
        $pool = (Get-Website -Name 'CalendarioPresupuesto').ApplicationPool
        Restart-WebAppPool -Name $pool
        [void]$out.Add("App pool '$pool' recycled")
    } catch {
        [void]$out.Add("App pool recycle error: $($_.Exception.Message)")
    }
    
    Start-Sleep -Seconds 3
    
    # Test IIS -> API proxy
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/api/columns' -UseBasicParsing -TimeoutSec 10
        [void]$out.Add("IIS proxy -> API: StatusCode=$($r.StatusCode) OK!")
    } catch {
        [void]$out.Add("IIS proxy -> API: ERROR $($_.Exception.Message)")
    }
    
    # Test IIS -> frontend
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 10
        [void]$out.Add("IIS -> Frontend: StatusCode=$($r.StatusCode) Length=$($r.RawContentLength)")
    } catch {
        [void]$out.Add("IIS -> Frontend: ERROR $($_.Exception.Message)")
    }
    
    return ($out -join "`n")
}

Write-Host $result
