# Integración con InvGate - Instrucciones de Configuración

## ✅ Infraestructura Completada

Se ha implementado la integración completa con InvGate Service Management que incluye:

### Backend
- ✅ Base de datos separada **`KPIsRosti_InvGate`** con tablas optimizadas
- ✅ Servicio de conexión al API de InvGate
- ✅ Sistema de sincronización automática (full e incremental)
- ✅ Cron job configurable para sincronización horaria
- ✅ 13 endpoints REST para gestión y reportes

### Estructura de Archivos Creados
```
server/
├── invgateDb.js                     # Conexión a BD KPIsRosti_InvGate
├── services/
│   ├── invgateService.js            # Cliente API InvGate
│   └── invgateSyncService.js        # Lógica de sincronización
├── jobs/
│   └── invgateCron.js               # Automatización
└── migrations/
    └── migration_invgate.sql        # Script de creación de BD
```

---

## 🚀 Pasos de Configuración

### 1. Ejecutar Migración de Base de Datos

**Debes ejecutar el script SQL manualmente en SQL Server Management Studio:**

Archivo: `server/migrations/migration_invgate.sql`

Este script creará:
- Base de datos `KPIsRosti_InvGate`
- Tablas: `InvgateTickets`, `InvgateSyncLog`, `InvgateConfig`
- Vistas y stored procedures para reportes

### 2. Configurar API Key de InvGate

Una vez que la aplicación esté corriendo:

1. **Iniciar sesión como administrador**
2. **Ir al Panel de Administración**
3. **Buscar la sección "Configuración de InvGate"**
4. **Ingresar:**
   - **API URL**: `https://[tu-empresa].invgate.net/api/v1`
   - **API Key**: `019c6c8e-9c7c-738e-9dd5-69b6bd09860c`
   - **Frecuencia de sincronización**: `1 hora` (recomendado)
   - **Habilitar sincronización automática**: ✅

5. **Guardar configuración**

### 3. Primera Sincronización

Después de configurar:

1. **Hacer clic en el botón "Sincronizar Ahora"**
2. **Seleccionar "Sincronización Completa" (primera vez)**
3. **Esperar que complete** (puede tomar varios minutos dependiendo del número de tickets)
4. **Revisar el log de sincronización**

De ahí en adelante, la sincronización será automática cada hora con actualización incremental (solo tickets nuevos/modificados).

---

## 📊 Endpoints Disponibles

### Configuración
- `POST /api/invgate/config` - Actualizar configuración
- `GET /api/invgate/config` - Obtener configuración actual
- `POST /api/invgate/test-connection` - Probar conexión con API

### Sincronización
- `POST /api/invgate/sync` - Iniciar sincronización manual
- `GET /api/invgate/sync-status` - Estado de sincronización
- `GET /api/invgate/sync-logs` - Historial de sincronizaciones

### Consulta de Tickets
- `GET /api/invgate/tickets` - Listar tickets (con filtros y paginación)
- `GET /api/invgate/tickets/:id` - Obtener ticket específico

### Reportes
- `GET /api/invgate/reports/summary` - Resumen general
- `GET /api/invgate/reports/by-status` - Tickets por estado
- `GET /api/invgate/reports/by-category` - Tickets por categoría
- `GET /api/invgate/reports/by-priority` - Tickets por prioridad

---

## ⚙️ Cómo Funciona la Sincronización

### Automática (Cron Job)
- Se ejecuta cada **1 hora** por defecto (configurable)
- Tipo: **Incremental** (solo busca tickets nuevos o modificados)
- Se puede pausar/reanudar desde el panel de administración

### Manual
- Desde el panel de admin
- Opciones:
  - **Incremental**: Actualiza solo cambios recientes (rápido)
  - **Completa**: Descarga todos los tickets nuevamente (lento, usar solo si hay problemas)

### Proceso
1. El servicio le pregunta al API de InvGate: "¿Qué tickets son nuevos o se modificaron?"
2. Los descarga en lotes de 100 tickets
3. Los guarda/actualiza en la base de datos local `KPIsRosti_InvGate`
4. Registra el resultado en `InvgateSyncLog`

---

## 🎯 Siguiente Fase: Frontend

Próximos componentes a creat:
1. **Panel de Administración de InvGate** (configuración, sync manual, logs)
2. **Dashboard de Reportes** (métricas, gráficos)
3. **Tabla de Tickets** (filtros, búsqueda, paginación)
4. **Modal de Detalle de Ticket**

---

## 🔧 Troubleshooting

### La sincronización falla
- Verificar que la API Key sea correcta
- Verificar que la URL del API esté bien formada
- Revisar logs en `InvgateSyncLog`

### No aparecen tickets
- Verificar que la primera sincronización completa haya terminado exitosamente
- Revisar que la base de datos `KPIsRosti_InvGate` existe y tiene datos

### Sincronización automática no funciona
- Verificar que `SYNC_ENABLED` esté en `true` en la configuración
- Reiniciar el servidor Node.js después de cambios de configuración
