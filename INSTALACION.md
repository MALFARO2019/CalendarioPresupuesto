# 📋 Manual de Instalación — KPIs Rosti / Calendario Presupuesto

## Requisitos del Servidor

| Componente | Requisito |
|---|---|
| **OS** | Windows Server 2019 / 2022 |
| **Node.js** | v20+ LTS (recomendado v22.14) |
| **RAM** | Mínimo 2 GB |
| **Disco** | Mínimo 1 GB libre |
| **Red** | Acceso a SQL Server 10.29.1.14 |
| **Puerto** | 80 (HTTP) libre |

---

## Instalación Automática (Recomendado)

1. Copiar toda la carpeta del proyecto a `C:\Deploy\CalendarioPresupuesto\`
2. Ejecutar como Administrador: **`INSTALAR.bat`**
3. El script hace todo: instala dependencias, crea `.env`, configura firewall, y arranca

---

## Instalación Manual Paso a Paso

### Paso 1: Instalar Node.js

Descargar de: https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi

```cmd
:: Verificar instalación
node --version
npm --version
```

### Paso 2: Copiar Código Fuente

Copiar todo el proyecto a `C:\Deploy\CalendarioPresupuesto\` por cualquier método:

```cmd
:: Opción A: Desde USB o red
robocopy \\ORIGEN\CalendarioPresupuesto C:\Deploy\CalendarioPresupuesto /MIR /XD node_modules .git

:: Opción B: Git (si está instalado)
cd C:\Deploy
git clone -b production https://github.com/MALFARO2019/CalendarioPresupuesto.git
```

Estructura esperada:
```
C:\Deploy\CalendarioPresupuesto\
├── server\          ← Backend Node.js
│   ├── server.js
│   ├── deploy.js
│   ├── package.json
│   └── ...
├── web-app\         ← Frontend React
│   ├── src\
│   ├── package.json
│   └── ...
├── INSTALAR.bat
├── ACTUALIZAR.bat
└── CONFIGURAR_SERVIDOR.bat
```

### Paso 3: Crear archivo .env

Crear el archivo `C:\Deploy\CalendarioPresupuesto\server\.env` con este contenido:

```env
PORT=80

DB_USER=sa
DB_PASSWORD=masterkey
DB_SERVER=10.29.1.14
DB_DATABASE=RP_BI_RESUMENES

JWT_SECRET=R0st1p017

SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=alertas@rostipolloscr.com
SMTP_PASS=Rosti2020

GEMINI_API_KEY=AIzaSyBEuVeCka5ib3-POtEReONq8yYOUZH1MEM

ADMIN_PASSWORD=R0st1p017

INVGATE_CLIENT_ID=019c6eb1-0ee4-723d-91ce-5e547b33ab3b
INVGATE_CLIENT_SECRET=n3Pb449eA[04!o<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP
INVGATE_TOKEN_URL=https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token
INVGATE_API_BASE_URL=https://rostipollos.cloud.invgate.net/api/v2
INVGATE_SYNC_ENABLED=true
INVGATE_SYNC_INTERVAL=1
```

### Paso 4: Instalar Dependencias

```cmd
:: Backend
cd C:\Deploy\CalendarioPresupuesto\server
npm install --production --no-audit

:: Frontend
cd C:\Deploy\CalendarioPresupuesto\web-app
npm install --no-audit
```

### Paso 5: Construir Frontend

```cmd
cd C:\Deploy\CalendarioPresupuesto\web-app
npm run build
```

Esto genera la carpeta `web-app\dist\` que el servidor sirve automáticamente.

### Paso 6: Configurar Windows

Ejecutar en **PowerShell como Administrador**:

```powershell
# Desactivar IIS (usa el mismo puerto 80)
iisreset /stop
sc config W3SVC start= disabled

# Abrir puerto 80 en firewall
netsh advfirewall firewall add rule name="KPIs Rosti HTTP 80" dir=in action=allow protocol=TCP localport=80

# Habilitar WinRM (para deploy remoto futuro)
Enable-PSRemoting -Force -SkipNetworkProfileCheck
netsh advfirewall firewall add rule name="WinRM HTTP" dir=in action=allow protocol=TCP localport=5985
```

### Paso 7: Iniciar Servidor

```cmd
cd C:\Deploy\CalendarioPresupuesto\server
node server.js
```

Debería mostrar:
```
🚀 Server running at http://localhost:80
🌐 Frontend served from: C:\Deploy\CalendarioPresupuesto\web-app\dist
📊 Database mode: primary
🛡️ Crash protection: ACTIVE
```

Abrir en el navegador: `http://NOMBRE_O_IP_DEL_SERVIDOR`

---

## Servicio Permanente (Auto-Reinicio)

Para que el servidor se mantenga corriendo permanentemente y se reinicie solo si falla:

### Opción A: Tarea Programada (Básico)

```cmd
schtasks /create /tn "KPIs_Rosti_Server" /tr "cmd /c cd /d C:\Deploy\CalendarioPresupuesto\server && node server.js" /sc onstart /ru SYSTEM /rl HIGHEST /f
```

### Opción B: NSSM (Recomendado)

```powershell
# Instalar NSSM (requiere Chocolatey)
choco install nssm -y

# Crear servicio
nssm install CalendarioPresupuesto-API "C:\Program Files\nodejs\node.exe" "C:\Deploy\CalendarioPresupuesto\server\server.js"
nssm set CalendarioPresupuesto-API AppDirectory "C:\Deploy\CalendarioPresupuesto\server"
nssm set CalendarioPresupuesto-API AppStdout "C:\Deploy\CalendarioPresupuesto\server\logs\service.log"
nssm set CalendarioPresupuesto-API AppStderr "C:\Deploy\CalendarioPresupuesto\server\logs\error.log"
nssm set CalendarioPresupuesto-API AppRotateFiles 1
nssm set CalendarioPresupuesto-API AppRotateBytes 5242880

# Configurar reinicio automático al fallar (5s, 10s, 30s)
sc failure CalendarioPresupuesto-API reset= 60 actions= restart/5000/restart/10000/restart/30000

# Crear carpeta de logs
mkdir "C:\Deploy\CalendarioPresupuesto\server\logs" 2>$null

# Iniciar servicio
nssm start CalendarioPresupuesto-API
```

Comandos útiles del servicio:
```powershell
nssm status CalendarioPresupuesto-API    # Ver estado
nssm restart CalendarioPresupuesto-API   # Reiniciar
nssm stop CalendarioPresupuesto-API      # Detener
nssm remove CalendarioPresupuesto-API    # Eliminar servicio
```

---

## Actualización Manual

Para aplicar cambios a un servidor ya instalado:

### Método 1: Usar ACTUALIZAR.bat
1. Copiar archivos actualizados a `C:\Deploy\CalendarioPresupuesto\`
2. Ejecutar `ACTUALIZAR.bat` como Administrador

### Método 2: Manual
```cmd
:: 1. Detener servicio
net stop CalendarioPresupuesto-API

:: 2. Copiar archivos nuevos (sobrescribir)
robocopy \\ORIGEN\CalendarioPresupuesto C:\Deploy\CalendarioPresupuesto /MIR /XD node_modules .git dist

:: 3. Instalar dependencias nuevas (si hay)
cd C:\Deploy\CalendarioPresupuesto\server
npm install --production --no-audit

:: 4. Reconstruir frontend
cd C:\Deploy\CalendarioPresupuesto\web-app
npm install --no-audit
npm run build

:: 5. Reiniciar
net start CalendarioPresupuesto-API
```

### Método 3: Deploy Remoto (desde tu PC)
```powershell
$cred = Get-Credential
$session = New-PSSession -ComputerName 10.29.1.25 -Credential $cred

# Copiar archivos
Copy-Item -Path "C:\AntiGravityDev\CalendarioPresupuesto\server\*" -Destination "C:\Deploy\CalendarioPresupuesto\server\" -ToSession $session -Force -Recurse
Copy-Item -Path "C:\AntiGravityDev\CalendarioPresupuesto\web-app\src\*" -Destination "C:\Deploy\CalendarioPresupuesto\web-app\src\" -ToSession $session -Force -Recurse

# Build y reiniciar
Invoke-Command -Session $session -ScriptBlock {
    cd C:\Deploy\CalendarioPresupuesto\web-app
    npm run build
    Restart-Service CalendarioPresupuesto-API
}
```

---

## Solución de Problemas

| Problema | Solución |
|---|---|
| Puerto 80 ocupado | `netstat -ano \| findstr :80` → identificar proceso → `taskkill /PID XXXX /F` |
| IIS interfiere | `iisreset /stop` y `sc config W3SVC start= disabled` |
| No conecta a BD | Verificar que 10.29.1.14 sea accesible: `Test-NetConnection 10.29.1.14 -Port 1433` |
| Servicio se cae | Ver logs en `server\logs\error.log` o ejecutar `node server.js` directo para ver errores |
| WinRM no conecta | `Enable-PSRemoting -Force` en el servidor destino |
| Build falla | Eliminar `web-app\node_modules` y `npm install` de nuevo |

---

## Servidores Actuales

| Servidor | IP | Directorio | Estado |
|---|---|---|---|
| Producción | 10.29.1.25 | `C:\Deploy\CalendarioPresupuesto` | ✅ Activo (NSSM) |
