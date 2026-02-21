/**
 * Deploy Module — Remote deployment, version changelog, server setup guide
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOY_LOG_PATH = path.join(__dirname, 'deploy-log.json');

// ==========================================
// DEPLOY LOG (CHANGELOG)
// ==========================================

function readDeployLog() {
    try {
        if (fs.existsSync(DEPLOY_LOG_PATH)) {
            return JSON.parse(fs.readFileSync(DEPLOY_LOG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading deploy log:', e.message);
    }
    return { entries: [] };
}

function writeDeployLog(data) {
    fs.writeFileSync(DEPLOY_LOG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getDeployLog() {
    const log = readDeployLog();
    // Return entries sorted by date descending
    log.entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return log;
}

function addDeployEntry(version, notes, servers, deployedBy, status = 'pending') {
    const log = readDeployLog();
    const entry = {
        id: Date.now(),
        version,
        date: new Date().toISOString(),
        notes,
        servers: servers || [],
        deployedBy: deployedBy || 'admin',
        status
    };
    log.entries.push(entry);
    writeDeployLog(log);
    return entry;
}

function updateDeployEntry(id, updates) {
    const log = readDeployLog();
    const idx = log.entries.findIndex(e => e.id === id);
    if (idx !== -1) {
        log.entries[idx] = { ...log.entries[idx], ...updates };
        writeDeployLog(log);
        return log.entries[idx];
    }
    return null;
}

// ==========================================
// REMOTE DEPLOY VIA POWERSHELL
// ==========================================

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`;
        exec(psCmd, { maxBuffer: 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function deployToServer(serverIp, user, password, appDir) {
    const steps = [];
    const credBlock = `$cred = New-Object System.Management.Automation.PSCredential('${user}', (ConvertTo-SecureString '${password}' -AsPlainText -Force))`;

    // Step 1: Test connection
    steps.push({ step: 'Verificando conexión', status: 'running' });
    try {
        const hostname = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { hostname }`
        );
        steps[steps.length - 1] = { step: 'Verificando conexión', status: 'success', detail: `Conectado a ${hostname.trim()}` };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Verificando conexión', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    // Step 2: Git pull
    // WinRM sessions don't inherit the full user PATH, so we must add Git's directory explicitly
    const gitPathFix = `$env:Path += ';C:\\Program Files\\Git\\cmd;C:\\Program Files (x86)\\Git\\cmd'`;
    steps.push({ step: 'Descargando código (git)', status: 'running' });
    try {
        const gitResult = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { ${gitPathFix}; Set-Location '${appDir}'; git fetch origin production 2>&1; git reset --hard origin/production 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Descargando código (git)', status: 'success', detail: gitResult.substring(0, 200) };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Descargando código (git)', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    // Step 3: Install server dependencies
    const nodePathFix = `$env:Path += ';C:\\Program Files\\nodejs;C:\\Users\\Administrador\\AppData\\Roaming\\npm'`;
    steps.push({ step: 'Instalando dependencias backend', status: 'running' });
    try {
        const npmResult = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { ${gitPathFix}; ${nodePathFix}; Set-Location '${appDir}\\server'; npm install --production --no-audit 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Instalando dependencias backend', status: 'success', detail: 'Dependencias instaladas' };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Instalando dependencias backend', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    // Step 4: Build frontend
    steps.push({ step: 'Construyendo frontend', status: 'running' });
    try {
        const buildResult = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { ${gitPathFix}; ${nodePathFix}; Set-Location '${appDir}\\web-app'; npm install --no-audit 2>&1; npm run build 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Construyendo frontend', status: 'success', detail: 'Build completado' };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Construyendo frontend', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    // Step 5: Restart service
    steps.push({ step: 'Reiniciando servicio', status: 'running' });
    try {
        const restartResult = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { ` +
            `$svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue; ` +
            `if ($svc) { Restart-Service 'CalendarioPresupuesto-API' -Force; Write-Output 'Servicio NSSM reiniciado' } ` +
            `else { taskkill /F /IM node.exe 2>$null; Start-Sleep -Seconds 2; ` +
            `Start-Process cmd -ArgumentList '/c cd /d ${appDir}\\server && node server.js' -WindowStyle Hidden; ` +
            `Write-Output 'Node.js reiniciado manualmente' } }`
        );
        steps[steps.length - 1] = { step: 'Reiniciando servicio', status: 'success', detail: restartResult.trim() };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Reiniciando servicio', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    return { success: true, steps };
}

// ==========================================
// SERVER SETUP GUIDE
// ==========================================

function getServerSetupGuide() {
    return {
        title: 'Guía de Configuración de Nuevo Servidor',
        sections: [
            {
                title: '1. Comandos en el Servidor Destino',
                description: 'Ejecutar en PowerShell como Administrador en el servidor nuevo:',
                commands: [
                    {
                        label: 'Habilitar administración remota (WinRM)',
                        command: 'Enable-PSRemoting -Force -SkipNetworkProfileCheck'
                    },
                    {
                        label: 'Abrir firewall para WinRM',
                        command: 'netsh advfirewall firewall add rule name="WinRM HTTP" dir=in action=allow protocol=TCP localport=5985'
                    },
                    {
                        label: 'Abrir firewall para HTTP (acceso web)',
                        command: 'netsh advfirewall firewall add rule name="HTTP Web App" dir=in action=allow protocol=TCP localport=80'
                    },
                    {
                        label: 'Instalar Git (descargar de https://git-scm.com)',
                        command: 'winget install --id Git.Git -e --source winget'
                    },
                    {
                        label: 'Clonar el repositorio',
                        command: 'cd C:\\Deploy\ngit clone -b production https://github.com/MALFARO2019/CalendarioPresupuesto.git'
                    }
                ]
            },
            {
                title: '2. Comandos en tu Máquina Local',
                description: 'Ejecutar en PowerShell como Administrador en tu PC:',
                commands: [
                    {
                        label: 'Iniciar servicio WinRM local',
                        command: 'Start-Service WinRM'
                    },
                    {
                        label: 'Agregar servidor a TrustedHosts (reemplazar IP)',
                        command: 'Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "IP_DEL_SERVIDOR" -Force'
                    },
                    {
                        label: 'Verificar conexión',
                        command: '$cred = Get-Credential\nInvoke-Command -ComputerName IP_DEL_SERVIDOR -Credential $cred -ScriptBlock { hostname }'
                    }
                ]
            },
            {
                title: '3. Primer Despliegue',
                description: 'Ejecutar el script de despliegue completo en el servidor:',
                commands: [
                    {
                        label: 'Ejecutar deploy.ps1 (instala Node.js, IIS, NSSM, todo)',
                        command: 'cd C:\\Deploy\\CalendarioPresupuesto\\deploy\n.\\deploy.ps1 -InstallDir "C:\\Deploy\\CalendarioPresupuesto"'
                    }
                ]
            },
            {
                title: '4. Servicio con Auto-Reinicio (NSSM)',
                description: 'Configurar el servicio para que se reinicie automáticamente si se cae. Ejecutar en PowerShell como Admin en el servidor:',
                commands: [
                    {
                        label: 'Instalar NSSM (si no está instalado)',
                        command: 'choco install nssm -y'
                    },
                    {
                        label: 'Crear servicio con NSSM',
                        command: 'nssm install CalendarioPresupuesto-API "C:\\Program Files\\nodejs\\node.exe" "C:\\Deploy\\CalendarioPresupuesto\\server\\server.js"\nnssm set CalendarioPresupuesto-API AppDirectory "C:\\Deploy\\CalendarioPresupuesto\\server"\nnssm set CalendarioPresupuesto-API AppStdout "C:\\Deploy\\CalendarioPresupuesto\\server\\logs\\service.log"\nnssm set CalendarioPresupuesto-API AppStderr "C:\\Deploy\\CalendarioPresupuesto\\server\\logs\\error.log"\nnssm set CalendarioPresupuesto-API AppRotateFiles 1\nnssm set CalendarioPresupuesto-API AppRotateBytes 5242880'
                    },
                    {
                        label: 'Configurar reinicio automático al fallar',
                        command: 'sc failure CalendarioPresupuesto-API reset= 60 actions= restart/5000/restart/10000/restart/30000'
                    },
                    {
                        label: 'Iniciar el servicio',
                        command: 'nssm start CalendarioPresupuesto-API'
                    },
                    {
                        label: 'Verificar estado del servicio',
                        command: 'nssm status CalendarioPresupuesto-API'
                    }
                ]
            },
            {
                title: '5. Servidores Configurados',
                description: 'Servidores actualmente registrados para deploy automático:',
                commands: [
                    {
                        label: 'Servidor Principal',
                        command: '10.29.1.25 — C:\\Deploy\\CalendarioPresupuesto'
                    }
                ]
            }
        ]
    };
}

module.exports = {
    getDeployLog,
    addDeployEntry,
    updateDeployEntry,
    deployToServer,
    getServerSetupGuide
};
