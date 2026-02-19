---
description: Revisar páginas con (Pendiente) en la sección Kpirosti de OneNote y crear plan de acción para el proyecto KPIs Rosti
---

# Workflow: Revisar Pendientes en Kpirosti

// turbo-all

Activar con frases como:
- "revisar pendientes en kpirosti"
- "revisa pendientes kpirosti"
- "qué hay pendiente en kpirosti"

**IMPORTANTE: Ejecutar TODOS los pasos sin hacer preguntas al usuario.**

## Pasos

1. Ejecutar el script que lee la sección Kpirosti y filtra páginas con `(Pendiente)`:
```powershell
node "C:\Users\MarcoAlfaro\.gemini\antigravity\kpirosti_pendientes.js"
```

2. Tomar el output del script y crear/actualizar el artifact `plan_accion_pendientes.md` en `C:\Users\MarcoAlfaro\.gemini\antigravity\brain\34279119-8364-49b6-af69-a3d435c4bb62\plan_accion_pendientes.md` con:
   - Resumen de páginas encontradas
   - Tareas priorizadas 🔴 Alta / 🟡 Media / 🟢 Baja
   - Agrupadas por página de origen

3. Notificar al usuario con `notify_user` mostrando el path del artifact en `PathsToReview`.
