---
description: Subir cambios a GitHub (main) y reiniciar servicios de desarrollo
---

// turbo-all

1. Matar todos los procesos node existentes:
```
taskkill /F /IM node.exe 2>$null; Write-Host "Procesos limpiados"
```

2. Agregar todos los cambios, hacer commit y push a main:
```
git add -A; git status --short
```

3. Si hay cambios, hacer commit con mensaje descriptivo basado en los archivos modificados, y push:
```
git commit -m "<mensaje descriptivo>"; git push origin main
```
Si no hay cambios pendientes, reportar "Sin cambios pendientes" y continuar.

4. Iniciar el servidor backend:
```
node server.js
```
Ejecutar desde: `c:\AntiGravityDev\CalendarioPresupuesto\server`

5. Iniciar el frontend:
```
npm run dev
```
Ejecutar desde: `c:\AntiGravityDev\CalendarioPresupuesto\web-app`

6. Confirmar que ambos servicios están corriendo y reportar el estado final.
