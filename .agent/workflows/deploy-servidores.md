---
description: Deploy de KPIs Rosti a múltiples servidores simultáneamente
---

# Deploy Multi-Servidor

## Pre-requisitos (SOLO LA PRIMERA VEZ)

En CADA servidor destino, ejecutar como Administrador:
```powershell
winrm quickconfig -q
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "IP_DE_TU_PC" -Force
```

## Configurar servidores

Editar las IPs y credenciales en el archivo:
`C:\AntiGravityDev\CalendarioPresupuesto\deploy\deploy-multi.ps1`

Buscar el parámetro `$Servers = @(...)` y cambiar:
- `Host`: IP o nombre del servidor
- `User`: Usuario Administrador
- `Password`: Dejar vacío para que lo pida de forma segura al ejecutar

## Comandos de deploy

### Primera instalación completa en ambos servidores:
```powershell
cd C:\AntiGravityDev\CalendarioPresupuesto\deploy
.\deploy-multi.ps1
```

### Actualizar ambos servidores (frontend + backend):
```powershell
.\deploy-multi.ps1 -Update
```

### Actualizar SOLO el frontend:
```powershell
.\deploy-multi.ps1 -Update -SkipBackend
```

### Actualizar SOLO el backend:
```powershell
.\deploy-multi.ps1 -Update -SkipFrontend
```

## ¿Qué hace el script?

1. **Compila el frontend** localmente una sola vez (`npm run build`)
2. **Abre sesiones WinRM** en paralelo a cada servidor
3. **Copia los archivos** (dist/ y server/) a cada servidor
4. **Ejecuta el deploy** en cada servidor simultáneamente (PowerShell Jobs)
5. **Muestra el resultado** de cada servidor al finalizar

El deploy tarda lo mismo que deploying a 1 servidor (ambos corren en paralelo).
