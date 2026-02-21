# Contexto del Proyecto - KPIs Rosti

## ⚠️ REGLA OBLIGATORIA: Identificación de Chat

> [!CAUTION]
> **ANTES de hacer CUALQUIER otra cosa** al iniciar un nuevo chat, DEBES:
> 1. **Preguntar al usuario**: "¿Cómo quiere llamar a este chat? (ej: 'Ajustes', 'Deploy', 'Mobile Fix')"
> 2. **Crear una rama Git**: `git checkout main && git checkout -b chat/<alias-en-minusculas-con-guiones>`
> 3. **Registrar en** `.agent/CHATS_ACTIVOS.md` con: Alias, Rama, Estado (🔵 Activo), Descripción
> 4. **Después de cada tarea completada**, recordar al usuario: `📌 **Chat: [ALIAS]** | Rama: chat/xxx`
>
> Si el chat es solo conversacional (sin editar archivos), saltar la rama pero SIEMPRE pedir el nombre.
> Si el usuario no quiere rama, respetar pero SIEMPRE registrar en CHATS_ACTIVOS.md.
> Ver workflow completo: `/git-branch-por-chat`

## OneNote - Configuración
- **Bloc:** TI Registros
- **Sección:** Kpirosti (`ID: 1-5e20890c-f164-4de6-a094-74215920ae5d`)
- **Script:** `node "C:\Users\MarcoAlfaro\.gemini\antigravity\tmp_kpirosti.js"`

> Cuando el usuario diga "revisar pendientes en kpirosti", ejecutar el workflow `/revisar-pendientes-kpirosti` SIN preguntar nada.

## Servicios Locales
- **Backend**: `cd server && node server.js` → http://localhost:3000
- **Frontend**: `cd web-app && npm run dev` → http://localhost:5173

## Base de Datos
- **Servidor**: 10.29.1.14:1433 (SQL Server)
- **BD**: RP_BI_RESUMENES
- **Usuario**: sa
- Requiere VPN o red corporativa para conectar
