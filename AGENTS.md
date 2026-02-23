# KPIs Rosti — Instrucciones para Agentes IA

## Proyecto
Plataforma modular de análisis de KPIs para restaurantes **Rosti**.
Módulos: Alcance de Presupuesto, Inocuidad, Quejas (InvGate), Carnets, Modelo Presupuesto.

## Stack Tecnológico
| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 18+ / Express |
| Frontend | React 18 + TypeScript + Vite |
| Base de datos | SQL Server (10.29.1.14:1433, DB: RP_BI_RESUMENES) |
| Estilos | CSS vanilla (sin Tailwind) |
| Deploy | Servidores Windows internos |

## Estructura del Proyecto
```
├── server/          # Backend Express (puerto 3000)
│   ├── server.js    # Entry point
│   ├── db.js        # Conexión SQL Server
│   └── *_endpoints.js  # Rutas agrupadas por módulo
├── web-app/         # Frontend React + Vite (puerto 5173)
│   └── src/
│       ├── components/  # Componentes React
│       ├── pages/       # Vistas principales
│       └── App.tsx      # Router principal
├── .agent/          # Config Antigravity (Google)
├── .opencode/       # Config OpenCode
└── AGENTS.md        # Este archivo (ChatGPT/Codex)
```

## Comandos
```bash
# Backend
cd server && npm install && node server.js
# Frontend
cd web-app && npm install && npm run dev
```

## Convenciones de Código
- **Idioma del código**: inglés (variables, funciones, nombres de archivo)
- **Idioma de UI y comentarios**: español
- **Frontend**: componentes funcionales React con hooks, TypeScript strict
- **Backend**: CommonJS (`require`), archivos `*_endpoints.js` separados por módulo
- **Estilos**: CSS vanilla en archivos `.css` junto a cada componente
- **Diseño mobile-first**: todo debe funcionar bien en iPhone y Android
- **IDs únicos**: todo elemento interactivo debe tener un `id` descriptivo

## ⚠️ Regla de Coordinación Multi-Agente

> **Eres uno de varios agentes IA (Antigravity, OpenCode, ChatGPT) trabajando simultáneamente en este proyecto.**

### Reglas obligatorias:
1. **Antes de editar un archivo**, revisa `git diff` y `git status` para detectar cambios no commiteados por otro agente
2. **Haz commits frecuentes** con mensajes descriptivos después de cada tarea completada
3. **No reorganices archivos** ni hagas refactors grandes sin que el usuario lo solicite
4. **Consulta `.agent/CHATS_ACTIVOS.md`** para ver qué otros chats están trabajando
5. **Si hay conflictos**, avisa al usuario antes de resolver — NO los resuelvas automáticamente
6. **No modifiques archivos de configuración de otros agentes** (`.agent/`, `.opencode/`, `AGENTS.md`)

## Archivos NO tocar (generados/secretos)
- `.agent/.onenote_token.json`
- `.agent/read_onenote.js`
- `server/fix_forms_config.js`
- `server/setup-forms.ps1`
- `server/server-versions.json`
