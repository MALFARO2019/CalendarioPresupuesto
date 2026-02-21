---
description: Iniciar los servicios de desarrollo (servidor Node y web app Vite)
---

// turbo-all

## Pasos

1. Verificar si hay procesos Node.js corriendo en puertos 3000 o 5173:
```powershell
netstat -ano | Select-String "3000|5173"
```

2. Si hay procesos usando esos puertos, matarlos primero:
```powershell
taskkill /F /IM node.exe
```

3. Iniciar el servidor Node.js en una ventana separada:
```powershell
start cmd /k "title Servidor Node && node server.js"
```
Directorio: `c:\AntiGravityDev\CalendarioPresupuesto\server`

4. Iniciar la web app Vite en otra ventana separada:
```powershell
start cmd /k "title Web App Dev && npm run dev"
```
Directorio: `c:\AntiGravityDev\CalendarioPresupuesto\web-app`

5. Esperar 5 segundos y verificar que ambos servicios estén escuchando:
```powershell
Start-Sleep -Seconds 5; netstat -ano | Select-String "3000|5173"
```

6. Confirmar al usuario que los servicios están corriendo:
   - Backend: http://localhost:3000
   - Frontend: http://localhost:5173
