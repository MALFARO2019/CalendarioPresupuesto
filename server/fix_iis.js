const { exec } = require('child_process');

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.from(script, 'utf16le');
        const encodedCmd = buffer.toString('base64');
        const psCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`;

        exec(psCmd, { maxBuffer: 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function fix() {
    console.log('Fixing IIS path...');
    const credBlock = `$cred = New-Object System.Management.Automation.PSCredential('Administrador', (ConvertTo-SecureString 'R0st1p017' -AsPlainText -Force))`;
    try {
        const result = await runPowerShell(`
            ${credBlock};
            Invoke-Command -ComputerName 10.29.1.25 -Credential $cred -ScriptBlock {
                & 'C:\\Windows\\System32\\inetsrv\\appcmd.exe' set vdir 'CalendarioPresupuesto/' -physicalPath:'C:\\Deploy\\CalendarioPresupuesto\\web-app\\dist'
                Write-Output 'IIS path updated'
            }
        `);
        console.log('Success:', result);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fix();
