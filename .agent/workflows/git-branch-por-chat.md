---
description: Regla automática global - cada chat trabaja en su propia rama Git y se registra con un alias
---
# Git Branch por Chat - Regla Automática Global

> Esta regla se aplica AUTOMÁTICAMENTE en CUALQUIER proyecto que tenga un repositorio Git.

## Al INICIO del chat (antes de editar cualquier archivo):

### Paso 1: Pedir alias al usuario
Antes de hacer cualquier cosa, preguntar al usuario:
> "¿Cómo quiere llamar a este chat? (ej: 'Ajustes', 'Deploy', 'Mobile Fix')"

Guardar ese alias internamente. Este alias se usará para:
- Nombrar la rama Git
- Registrar el chat en `.agent/CHATS_ACTIVOS.md` del proyecto actual
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
Crear o actualizar `.agent/CHATS_ACTIVOS.md` en la raíz del proyecto con:
- **Alias**: el nombre que dio el usuario
- **Rama**: `chat/<nombre>`
- **Estado**: 🔵 Activo
- **Descripción**: breve resumen de la tarea

Si el archivo no existe, crearlo con el formato:
```markdown
# 📋 Chats Activos

| Alias | Rama | Estado | Descripción |
|-------|------|--------|-------------|
```

---

## DURANTE el chat:

- Trabajar normalmente sobre la rama creada
- Hacer commits frecuentes con mensajes descriptivos
- **DESPUÉS de cada tarea completada**, recordar al usuario:
  > "📌 **Chat: [ALIAS]** | Rama: `chat/xxx`"

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
- Si el proyecto NO tiene Git inicializado, saltar esta regla
- Si el chat es solo conversacional (preguntas, sin editar archivos), saltar esta regla