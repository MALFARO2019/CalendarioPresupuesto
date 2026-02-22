---
description: Iniciar los servicios de desarrollo (servidor Node y web app Vite)
---

// turbo-all

## Pasos

1. Matar cualquier proceso Node existente (ignorar error si no hay):
```powershell
taskkill /F /IM node.exe 2>$null; Write-Host "Limpieza completada"
```

2. Iniciar el servidor Node.js (puerto 3000):
```powershell
start cmd /k "title Servidor Node && node server.js"
```
Directorio: `c:\AntiGravityDev\CalendarioPresupuesto\server`

3. Iniciar la web app Vite (puerto 5173):
```powershell
start cmd /k "title Web App Dev && npm run dev"
```
Directorio: `c:\AntiGravityDev\CalendarioPresupuesto\web-app`

4. Verificar que los servicios estén levantados:
```powershell
Start-Sleep -Seconds 5; netstat -ano | Select-String "3000|5173"
```

5. Reportar al usuario: Backend http://localhost:3000, Frontend http://localhost:5173
