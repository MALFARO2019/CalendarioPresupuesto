---
description: Revisar páginas con (Pendiente) en OneNote y crear plan de acción
---

# Workflow: Revisar Pendientes de OneNote

Activar con frases como:
- "revisa pendientes de OneNote"
- "qué tengo pendiente en OneNote"
- "crea plan de acción de mis pendientes"
- "revisa mis notas pendientes"

## Pasos

// turbo
1. Ejecutar el script de búsqueda de pendientes:
```powershell
node "C:\Users\MarcoAlfaro\.gemini\antigravity\read_onenote.js" --search "(Pendiente)"
```

2. Para cada página encontrada con "(Pendiente)" en el título, leer su contenido:
```powershell
node "C:\Users\MarcoAlfaro\.gemini\antigravity\read_onenote.js" --page <page-id>
```

3. Con todo el contenido recopilado, crear un artifact `plan_accion_pendientes.md` en el directorio de artifacts de la conversación actual con:
   - Resumen de cada página pendiente encontrada
   - Lista de tareas priorizadas (Alta/Media/Baja)
   - Agrupadas por categoría o proyecto
   - Fecha de creación del plan

4. Notificar al usuario con el plan creado usando `notify_user`
