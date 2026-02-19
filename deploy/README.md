# Despliegue - KPIs Rosti

## Deploy a UN solo servidor

### Instalación inicial (primera vez en el servidor)

1. Copiar la carpeta `CalendarioPresupuesto` al servidor
2. Abrir PowerShell como Administrador en el servidor
3. Ejecutar:
```powershell
cd C:\ruta\...\CalendarioPresupuesto\deploy
.\deploy.ps1
```

### Actualizar
```powershell
.\update.ps1                   # Frontend + Backend
.\update.ps1 -SkipBackend     # Solo frontend
.\update.ps1 -SkipFrontend    # Solo backend
```

---

## Deploy a DOS (o más) servidores simultáneamente

### Pre-requisito: habilitar WinRM en CADA servidor (una sola vez)
En cada servidor remoto, como Administrador:
```powershell
winrm quickconfig -q
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
```

### Configurar IPs y credenciales
Editar `deploy-multi.ps1` → parámetro `$Servers`:
```powershell
$Servers = @(
    @{ Name="Servidor-1"; Host="10.29.1.XX"; User="Administrador"; Password=""; InstallDir="C:\Apps\..." },
    @{ Name="Servidor-2"; Host="10.29.1.YY"; User="Administrador"; Password=""; InstallDir="C:\Apps\..." }
)
```
> Deja `Password=""` para que lo pida de forma segura al ejecutar.

### Ejecutar el deploy paralelo (desde TU PC)
```powershell
cd C:\AntiGravityDev\CalendarioPresupuesto\deploy

# Primera instalacion completa en ambos servidores:
.\deploy-multi.ps1

# Actualizar frontend + backend en ambos:
.\deploy-multi.ps1 -Update

# Solo frontend:
.\deploy-multi.ps1 -Update -SkipBackend

# Solo backend:
.\deploy-multi.ps1 -Update -SkipFrontend
```

El script:
1. Compila el frontend **una sola vez** localmente
2. Copia y despliega en **ambos servidores al mismo tiempo** (PowerShell Jobs)
3. Tarda igual que deploying a 1 servidor

---

## Post-instalación (primera vez)

Editar credenciales de producción en cada servidor:
```powershell
notepad C:\Apps\CalendarioPresupuesto\server\.env
```
Cambiar: `DB_PASSWORD`, `JWT_SECRET`, `SMTP_PASS`
