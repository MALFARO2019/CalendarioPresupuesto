const deployModule = require('./deploy');

async function run() {
    console.log('=== Fix remoto paso a paso ===');
    const cred = "$cred = New-Object System.Management.Automation.PSCredential('Administrador', (ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force))";

    // Step 1: Kill all node + restart NSSM (no escaped quotes needed)
    console.log('\n>>> 1. Restart services');
    try {
        await deployModule.runPowerShell(
            cred + "; Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock { Stop-Process -Name node -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-Service CalendarioPresupuesto-API -ErrorAction SilentlyContinue; Write-Output 'Restart OK' }"
        );
        console.log('OK');
    } catch (e) {
        // Even if stderr has warnings, check for stdout
        if (e.message.includes('Restart OK')) { console.log('OK (with warnings)'); }
        else { console.log('Restart sent (may have warnings)'); }
    }

    // Step 2: Recycle IIS
    console.log('\n>>> 2. Recycle IIS');
    try {
        const iis = await deployModule.runPowerShell(
            cred + "; Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock { & C:\\Windows\\System32\\inetsrv\\appcmd.exe stop apppool DefaultAppPool; Start-Sleep -Seconds 2; & C:\\Windows\\System32\\inetsrv\\appcmd.exe start apppool DefaultAppPool; Write-Output 'IIS OK' }"
        );
        console.log(iis || 'OK');
    } catch (e) {
        if (e.message.includes('IIS OK') || e.message.includes('correctamente')) { console.log('IIS recycled'); }
        else { console.log('IIS recycle sent'); }
    }

    // Wait for startup
    console.log('\n>>> Esperando 10s...');
    await new Promise(r => setTimeout(r, 10000));

    // Step 3: Health check (simple - no escaped quotes)
    console.log('\n>>> 3. API health check');
    try {
        const api = await deployModule.runPowerShell(
            cred + "; Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock { (Invoke-RestMethod -Uri http://localhost:3000/api/version-check -TimeoutSec 10).version }"
        );
        console.log('API:', api.trim());
    } catch (e) {
        if (e.message.includes('Stdout:')) {
            const m = e.message.match(/Stdout:\s*([\s\S]*?)(?:Stderr|$)/);
            if (m) console.log('API:', m[1].trim());
            else console.log('API error (with output)');
        } else {
            console.log('API FAIL');
        }
    }

    // Step 4: Web health check (simple)
    console.log('\n>>> 4. Web health check');
    try {
        const web = await deployModule.runPowerShell(
            cred + "; Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock { (Invoke-WebRequest -Uri http://localhost/ -TimeoutSec 10 -UseBasicParsing).StatusCode }"
        );
        console.log('WEB:', web.trim());
    } catch (e) {
        if (e.message.includes('Stdout:')) {
            const m = e.message.match(/Stdout:\s*([\s\S]*?)(?:Stderr|$)/);
            if (m) console.log('WEB:', m[1].trim());
            else console.log('WEB error');
        } else {
            console.log('WEB FAIL');
        }
    }

    console.log('\n=== Fin ===');
}

run();
