---
description: Regla automática - cada chat trabaja en su propia rama Git y se registra con un alias
---

# Git Branch por Chat - Regla Automática

> Esta regla se aplica AUTOMÁTICAMENTE al inicio de cada conversación que vaya a modificar archivos.

## Al INICIO del chat (antes de editar cualquier archivo):

### Paso 1: Pedir alias al usuario
Antes de hacer cualquier cosa, preguntar al usuario:
> "¿Cómo quiere llamar a este chat? (ej: 'Ajustes', 'Deploy', 'Mobile Fix')"

Guardar ese alias internamente. Este alias se usará para:
- Nombrar la rama Git
- Registrar el chat en `.agent/CHATS_ACTIVOS.md`
- Recordar al usuario después de cada tarea

### Paso 2: Crear rama Git

// turbo
```
git checkout main
```

// turbo
```
git checkout -b chat/<alias-en-minusculas-con-guiones>
```

### Paso 3: Registrar en CHATS_ACTIVOS.md
Agregar una fila en `.agent/CHATS_ACTIVOS.md` con:
- **Alias**: el nombre que dio el usuario
- **Rama**: `chat/<nombre>`
- **Estado**: 🔵 Activo
- **Descripción**: breve resumen de la tarea

---

## DURANTE el chat:

- Trabajar normalmente sobre la rama creada
- Hacer commits frecuentes con mensajes descriptivos
- **El ALIAS es FIJO para toda la conversación** — NO cambia aunque el tema evolucione. El alias refleja el nombre que eligió el usuario al inicio, no el contenido actual de la conversación.
- **AL INICIO de cada respuesta** (antes de empezar a trabajar), mostrar siempre:
  > "📌 **Chat: [ALIAS]** | Rama: `chat/xxx`"
- **ENTRE TAREAS** (al terminar un paso y antes de iniciar el siguiente), recordar:
  > "📌 **Chat: [ALIAS]** | Rama: `chat/xxx` — continuando..."
- **DESPUÉS de cada tarea completada**, recordar al usuario:
  > "📌 **Chat: [ALIAS]** | Rama: `chat/xxx` — ✅ tarea completada"

---

## Al FINAL del chat (cuando el trabajo está terminado):

// turbo
```
git add .
git commit -m "descripción del cambio"
```

// turbo
```
git checkout main
git merge chat/<nombre-de-la-rama>
```

Si hay conflictos, resolverlos revisando ambos cambios.

// turbo
```
git branch -d chat/<nombre-de-la-rama>
```

Actualizar `.agent/CHATS_ACTIVOS.md`:
- Cambiar estado a ✅ Completado, o borrar la fila

---

## Notas:
- NUNCA trabajar directamente en `main` si hay otros chats activos
- Si el usuario pide NO usar rama, respetar esa indicación
- Si el merge tiene conflictos complejos, avisar al usuario antes de resolver
- Las ramas `chat/*` son temporales y se borran después del merge
