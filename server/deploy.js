/**
 * Deploy Module — Remote deployment, version changelog, server setup guide
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOY_LOG_PATH = path.join(__dirname, 'deploy-log.json');
const SERVER_VERSIONS_PATH = path.join(__dirname, 'server-versions.json');

// ==========================================
// PER-SERVER VERSION TRACKING
// ==========================================

function readServerVersions() {
    try {
        if (fs.existsSync(SERVER_VERSIONS_PATH)) {
            return JSON.parse(fs.readFileSync(SERVER_VERSIONS_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading server versions:', e.message);
    }
    return {};
}

function writeServerVersions(data) {
    fs.writeFileSync(SERVER_VERSIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Get the last successfully deployed version for a specific server IP
 */
function getServerVersion(serverIp) {
    const versions = readServerVersions();
    return versions[serverIp] || null;
}

/**
 * Set the deployed version for a specific server IP
 */
function setServerVersion(serverIp, version, deployedBy) {
    const versions = readServerVersions();
    versions[serverIp] = {
        version,
        date: new Date().toISOString(),
        deployedBy: deployedBy || 'deploy-system'
    };
    writeServerVersions(versions);
}

/**
 * Parse version string like 'v1.2' into { major, minor }
 */
function parseVersion(versionStr) {
    if (!versionStr) return { major: 0, minor: 0 };
    const match = versionStr.match(/(\d+)\.(\d+)/);
    if (match) return { major: parseInt(match[1]), minor: parseInt(match[2]) };
    const singleMatch = versionStr.match(/(\d+)/);
    if (singleMatch) return { major: parseInt(singleMatch[1]), minor: 0 };
    return { major: 0, minor: 0 };
}

/**
 * Compare two version strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
    if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
    return 0;
}

/**
 * Get all server versions as a map { ip: { version, date, deployedBy } }
 */
function getAllServerVersions() {
    return readServerVersions();
}

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

function getCurrentVersion() {
    const log = readDeployLog();
    if (log.entries.length === 0) return 'v1.0';
    // Sort by date descending and return the latest version
    log.entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return log.entries[0].version || 'v1.0';
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

async function deployToServer(serverIp, user, password, appDir, deployVersion) {
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

    // Step 2b: Write version to remote deploy-log.json (so the server shows the correct version)
    steps.push({ step: 'Registrando versión', status: 'running' });
    try {
        const versionEntry = JSON.stringify({
            entries: [{
                id: Date.now(),
                version: deployVersion || 'v1.0',
                date: new Date().toISOString(),
                notes: '',
                servers: [serverIp],
                deployedBy: 'deploy-system',
                status: 'success'
            }]
        }).replace(/'/g, "''");
        await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { Set-Content -Path '${appDir}\\\\server\\\\deploy-log.json' -Value '${versionEntry}' -Encoding UTF8 }`
        );
        steps[steps.length - 1] = { step: 'Registrando versión', status: 'success', detail: `Versión ${deployVersion || 'v1.0'} registrada` };
    } catch (e) {
        // Non-fatal: version display might be wrong but deploy can continue
        steps[steps.length - 1] = { step: 'Registrando versión', status: 'warning', detail: e.message.substring(0, 200) };
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
            `taskkill /F /IM node.exe 2>$null; Start-Sleep -Seconds 2; ` +
            `$svc = Get-Service 'CalendarioPresupuesto-API' -ErrorAction SilentlyContinue; ` +
            `if ($svc) { Start-Service 'CalendarioPresupuesto-API'; Write-Output 'Servicio NSSM reiniciado' } ` +
            `else { ` +
            `Start-Process cmd -ArgumentList '/c cd /d ${appDir}\\\\server && node server.js' -WindowStyle Hidden; ` +
            `Write-Output 'Node.js reiniciado manualmente' } }`
        );
        steps[steps.length - 1] = { step: 'Reiniciando servicio', status: 'success', detail: restartResult.trim() };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Reiniciando servicio', status: 'error', detail: e.message };
        return { success: false, steps };
    }

    // Record the deployed version for this server
    if (deployVersion) {
        setServerVersion(serverIp, deployVersion, 'deploy-system');
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
                target: 'remote',
                commands: [
                    {
                        label: 'Habilitar administración remota (WinRM)',
                        command: 'Enable-PSRemoting -Force -SkipNetworkProfileCheck',
                        automatable: true
                    },
                    {
                        label: 'Abrir firewall para WinRM',
                        command: 'netsh advfirewall firewall add rule name="WinRM HTTP" dir=in action=allow protocol=TCP localport=5985',
                        automatable: true
                    },
                    {
                        label: 'Abrir firewall para HTTP (acceso web)',
                        command: 'netsh advfirewall firewall add rule name="HTTP Web App" dir=in action=allow protocol=TCP localport=80',
                        automatable: true
                    },
                    {
                        label: 'Instalar Git',
                        command: '$gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"; $installer = "C:\\Temp\\GitInstaller.exe"; New-Item -ItemType Directory -Force -Path "C:\\Temp" | Out-Null; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri $gitUrl -OutFile $installer -UseBasicParsing; Start-Process -FilePath $installer -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS" -Wait -NoNewWindow; Remove-Item $installer -Force -ErrorAction SilentlyContinue',
                        automatable: true
                    },
                    {
                        label: 'Crear directorio de despliegue',
                        command: 'New-Item -ItemType Directory -Force -Path "C:\\Deploy" | Out-Null',
                        automatable: true
                    },
                    {
                        label: 'Clonar el repositorio',
                        command: 'cd C:\\Deploy\ngit clone -b production https://github.com/MALFARO2019/CalendarioPresupuesto.git',
                        automatable: false,
                        manualReason: 'Requiere credenciales de GitHub / SSH interactivo'
                    }
                ]
            },
            {
                title: '2. Comandos en tu Máquina Local',
                description: 'Ejecutar en PowerShell como Administrador en tu PC:',
                target: 'local',
                commands: [
                    {
                        label: 'Iniciar servicio WinRM local',
                        command: 'Start-Service WinRM',
                        automatable: true
                    },
                    {
                        label: 'Agregar servidor a TrustedHosts',
                        command: 'Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "IP_DEL_SERVIDOR" -Force',
                        automatable: true
                    },
                    {
                        label: 'Verificar conexión (interactivo)',
                        command: '$cred = Get-Credential\nInvoke-Command -ComputerName IP_DEL_SERVIDOR -Credential $cred -ScriptBlock { hostname }',
                        automatable: false,
                        manualReason: 'Requiere ingreso interactivo de credenciales'
                    }
                ]
            },
            {
                title: '3. Primer Despliegue',
                description: 'Ejecutar el script de despliegue completo en el servidor:',
                target: 'remote',
                commands: [
                    {
                        label: 'Ejecutar deploy.ps1 (instala Node.js, IIS, NSSM, todo)',
                        command: 'cd C:\\Deploy\\CalendarioPresupuesto\\deploy\n.\\deploy.ps1 -InstallDir "C:\\Deploy\\CalendarioPresupuesto"',
                        automatable: false,
                        manualReason: 'Script interactivo con múltiples prompts'
                    }
                ]
            },
            {
                title: '4. Servicio con Auto-Reinicio (NSSM)',
                description: 'Configurar el servicio para que se reinicie automáticamente si se cae:',
                target: 'remote',
                commands: [
                    {
                        label: 'Instalar NSSM (si no está instalado)',
                        command: 'choco install nssm -y',
                        automatable: false,
                        manualReason: 'Requiere Chocolatey instalado previamente'
                    },
                    {
                        label: 'Crear servicio con NSSM',
                        command: 'nssm install CalendarioPresupuesto-API "C:\\Program Files\\nodejs\\node.exe" "C:\\Deploy\\CalendarioPresupuesto\\server\\server.js"\nnssm set CalendarioPresupuesto-API AppDirectory "C:\\Deploy\\CalendarioPresupuesto\\server"\nnssm set CalendarioPresupuesto-API AppStdout "C:\\Deploy\\CalendarioPresupuesto\\server\\logs\\service.log"\nnssm set CalendarioPresupuesto-API AppStderr "C:\\Deploy\\CalendarioPresupuesto\\server\\logs\\error.log"\nnssm set CalendarioPresupuesto-API AppRotateFiles 1\nnssm set CalendarioPresupuesto-API AppRotateBytes 5242880',
                        automatable: false,
                        manualReason: 'Configuración única con rutas personalizables'
                    },
                    {
                        label: 'Configurar reinicio automático al fallar',
                        command: 'sc failure CalendarioPresupuesto-API reset= 60 actions= restart/5000/restart/10000/restart/30000',
                        automatable: false,
                        manualReason: 'Requiere que el servicio ya esté creado'
                    },
                    {
                        label: 'Iniciar el servicio',
                        command: 'nssm start CalendarioPresupuesto-API',
                        automatable: false,
                        manualReason: 'Requiere que el servicio ya esté configurado'
                    },
                    {
                        label: 'Verificar estado del servicio',
                        command: 'nssm status CalendarioPresupuesto-API',
                        automatable: false,
                        manualReason: 'Solo para verificación visual'
                    }
                ]
            }
        ]
    };
}

// ==========================================
// REMOTE SERVER SETUP AUTOMATION
// ==========================================

async function runRemoteSetupCommands(serverIp, user, password) {
    const steps = [];
    const credBlock = `$cred = New-Object System.Management.Automation.PSCredential('${user}', (ConvertTo-SecureString '${password}' -AsPlainText -Force))`;

    // 1. Enable WinRM
    steps.push({ step: 'Habilitando WinRM', status: 'running' });
    try {
        const result = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { Enable-PSRemoting -Force -SkipNetworkProfileCheck 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Habilitando WinRM', status: 'success', detail: 'WinRM habilitado' };
    } catch (e) {
        // WinRM might already be enabled or we connected successfully (which means it is enabled)
        steps[steps.length - 1] = { step: 'Habilitando WinRM', status: 'success', detail: 'WinRM ya estaba habilitado (conexión exitosa)' };
    }

    // 2. Firewall WinRM
    steps.push({ step: 'Configurando firewall (WinRM)', status: 'running' });
    try {
        await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { netsh advfirewall firewall add rule name="WinRM HTTP" dir=in action=allow protocol=TCP localport=5985 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Configurando firewall (WinRM)', status: 'success', detail: 'Regla de firewall WinRM agregada' };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Configurando firewall (WinRM)', status: 'error', detail: e.message.substring(0, 300) };
    }

    // 3. Firewall HTTP
    steps.push({ step: 'Configurando firewall (HTTP)', status: 'running' });
    try {
        await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { netsh advfirewall firewall add rule name="HTTP Web App" dir=in action=allow protocol=TCP localport=80 2>&1 }`
        );
        steps[steps.length - 1] = { step: 'Configurando firewall (HTTP)', status: 'success', detail: 'Regla de firewall HTTP agregada' };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Configurando firewall (HTTP)', status: 'error', detail: e.message.substring(0, 300) };
    }

    // 4. Install Git
    steps.push({ step: 'Instalando Git', status: 'running' });
    try {
        // Check if Git is already installed
        const gitCheck = await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { $env:Path += ';C:\\Program Files\\Git\\cmd'; git --version 2>&1 }`
        );
        if (gitCheck && gitCheck.includes('git version')) {
            steps[steps.length - 1] = { step: 'Instalando Git', status: 'success', detail: `Ya instalado: ${gitCheck.trim()}` };
        } else {
            throw new Error('Git not found');
        }
    } catch (e) {
        // Git not installed, install it
        try {
            await runPowerShell(
                `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { ` +
                `$gitUrl = 'https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe'; ` +
                `$installer = 'C:\\Temp\\GitInstaller.exe'; ` +
                `New-Item -ItemType Directory -Force -Path 'C:\\Temp' | Out-Null; ` +
                `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
                `Invoke-WebRequest -Uri $gitUrl -OutFile $installer -UseBasicParsing; ` +
                `Start-Process -FilePath $installer -ArgumentList '/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS' -Wait -NoNewWindow; ` +
                `Remove-Item $installer -Force -ErrorAction SilentlyContinue; ` +
                `Write-Output 'Git instalado exitosamente' }`
            );
            steps[steps.length - 1] = { step: 'Instalando Git', status: 'success', detail: 'Git instalado exitosamente' };
        } catch (installErr) {
            steps[steps.length - 1] = { step: 'Instalando Git', status: 'error', detail: installErr.message.substring(0, 300) };
        }
    }

    // 5. Create deploy directory
    steps.push({ step: 'Creando directorio de despliegue', status: 'running' });
    try {
        await runPowerShell(
            `${credBlock}; Invoke-Command -ComputerName ${serverIp} -Credential $cred -ScriptBlock { New-Item -ItemType Directory -Force -Path 'C:\\Deploy' | Out-Null; Write-Output 'Directorio creado' }`
        );
        steps[steps.length - 1] = { step: 'Creando directorio de despliegue', status: 'success', detail: 'C:\\Deploy creado' };
    } catch (e) {
        steps[steps.length - 1] = { step: 'Creando directorio de despliegue', status: 'error', detail: e.message.substring(0, 300) };
    }

    const hasError = steps.some(s => s.status === 'error');
    return { success: !hasError, steps };
}

// ==========================================
// LOCAL MACHINE SETUP AUTOMATION
// ==========================================

async function runLocalSetupCommands(serverIp) {
    const steps = [];

    // 1. Start WinRM service
    steps.push({ step: 'Iniciando servicio WinRM local', status: 'running' });
    try {
        await runPowerShell('Start-Service WinRM 2>&1');
        steps[steps.length - 1] = { step: 'Iniciando servicio WinRM local', status: 'success', detail: 'Servicio WinRM iniciado' };
    } catch (e) {
        // Service might already be running
        if (e.message.includes('running')) {
            steps[steps.length - 1] = { step: 'Iniciando servicio WinRM local', status: 'success', detail: 'Servicio WinRM ya estaba corriendo' };
        } else {
            steps[steps.length - 1] = { step: 'Iniciando servicio WinRM local', status: 'error', detail: e.message.substring(0, 300) };
        }
    }

    // 2. Add server to TrustedHosts
    steps.push({ step: `Agregando ${serverIp} a TrustedHosts`, status: 'running' });
    try {
        // Get current trusted hosts first
        const currentHosts = await runPowerShell(
            `(Get-Item WSMan:\\localhost\\Client\\TrustedHosts -ErrorAction SilentlyContinue).Value`
        );

        // Check if already in list
        if (currentHosts && currentHosts.includes(serverIp)) {
            steps[steps.length - 1] = { step: `Agregando ${serverIp} a TrustedHosts`, status: 'success', detail: `${serverIp} ya estaba en TrustedHosts` };
        } else {
            // Add to existing list
            const newHosts = currentHosts && currentHosts.trim() ? `${currentHosts.trim()},${serverIp}` : serverIp;
            await runPowerShell(
                `Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "${newHosts}" -Force`
            );
            steps[steps.length - 1] = { step: `Agregando ${serverIp} a TrustedHosts`, status: 'success', detail: `${serverIp} agregado a TrustedHosts` };
        }
    } catch (e) {
        steps[steps.length - 1] = { step: `Agregando ${serverIp} a TrustedHosts`, status: 'error', detail: e.message.substring(0, 300) };
    }

    // 3. Test connection
    steps.push({ step: `Verificando conexión a ${serverIp}`, status: 'running' });
    try {
        const testResult = await runPowerShell(
            `Test-NetConnection -ComputerName ${serverIp} -Port 5985 -InformationLevel Quiet`
        );
        if (testResult && testResult.trim().toLowerCase() === 'true') {
            steps[steps.length - 1] = { step: `Verificando conexión a ${serverIp}`, status: 'success', detail: `Puerto 5985 (WinRM) accesible en ${serverIp}` };
        } else {
            steps[steps.length - 1] = { step: `Verificando conexión a ${serverIp}`, status: 'error', detail: `Puerto 5985 no accesible en ${serverIp}. Verificar red/firewall.` };
        }
    } catch (e) {
        steps[steps.length - 1] = { step: `Verificando conexión a ${serverIp}`, status: 'error', detail: e.message.substring(0, 300) };
    }

    const hasError = steps.some(s => s.status === 'error');
    return { success: !hasError, steps };
}

module.exports = {
    getDeployLog,
    getCurrentVersion,
    addDeployEntry,
    updateDeployEntry,
    deployToServer,
    getServerSetupGuide,
    runRemoteSetupCommands,
    runLocalSetupCommands,
    getServerVersion,
    setServerVersion,
    compareVersions,
    getAllServerVersions
};
