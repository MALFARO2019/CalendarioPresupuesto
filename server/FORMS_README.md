# Microsoft Forms Integration - README

## Descripción

Integración con Microsoft Forms usando Microsoft Graph API para sincronización automática de respuestas de formularios.

## Componentes Implementados

### Backend

#### Bases de Datos
- **WindowsFormsData** - Base de datos separada
  - `FormResponses` - Respuestas de formularios
  - `FormsSyncLog` - Registro de sincronizaciones
  - `FormsConfig` - Configuración de Azure AD y sincronización

#### Servicios
- `formsDb.js` - Conexión a base de datos WindowsFormsData
- `services/formsService.js` - Cliente de Microsoft Graph API con OAuth 2.0
- `services/formsSyncService.js` - Lógica de sincronización (Full/Incremental)
- `jobs/formsCron.js` - Cron job para sincronización automática

#### API Endpoints
Ver `forms_endpoints.js` para código completo. Endpoints implementados:

**Configuración:**
- `POST /api/forms/config` - Actualizar configuración
- `GET /api/forms/config` - Obtener configuración

**Sincronización:**
- `POST /api/forms/sync` - Trigger manual
- `GET /api/forms/sync-status` - Estado actual
- `GET /api/forms/sync-logs` - Historial con paginación

**Datos:**  
- `GET /api/forms/list` - Listar formularios
- `GET /api/forms/responses` - Respuestas con filtros
- `GET /api/forms/responses/:id` - Detalle de respuesta

**Reportes:**
- `GET /api/forms/reports/summary` - Resumen general
- `GET /api/forms/reports/by-form` - Estadísticas por formulario
- `GET /api/forms/reports/by-date` - Tendencia temporal

**Pruebas:**
- `POST /api/forms/test-connection` - Verificar credenciales Azure AD

## Pendientes

### 1. Agregar Endpoints a server.js

**Acción requerida**: Copiar el contenido de `forms_endpoints.js` y pegarlo en `server.js` ANTES de la línea `app.listen(port, ...)` (alrededor de la línea 1773).

El código debe ir después del último endpoint de Invgate y antes de `app.listen`.

###  2. Ejecutar Migración SQL

```bash
# Conéctate a SQL Server y ejecuta:
sqlcmd -S localhost -U sa -P <PASSWORD> -i server/migrations/migration_forms.sql
```

Esto creará:
- Base de datos `WindowsFormsData`
- Tablas, vistas y stored procedures

### 3. Configurar en la Aplicación

Una vez completados los pasos anteriores:

1. **Reiniciar servidor**:
   ```bash
   cd server
   npm start
   ```

2. **Navegar a la página de configuración de Forms** (a crear en frontend)

3. **Ingresar credenciales de Azure AD**:
   - Tenant ID: `70dff046e-e545-44c7-ae8c-21c53272ee6e`
   - Client ID: `44490c35-76d8-451c-a10f-05c526df8e38`
   - Client Secret: `(Ver en Azure Portal)`

4. **Activar sincronización**:
   - Habilitar sync automático
   - Configurar intervalo (1, 6, 12 o 24 horas)
   - Ejecutar primer sync manual

## Configuración de Azure AD (COMPLETADA ✅)

Ya configurado:
- ✅ Aplicación registrada: "CalendarioPresupuesto Forms Integration"
- ✅ Tenant ID obtenido
- ✅ Client ID obtenido
- ✅ Client Secret creado (expira 17/2/2028)
- ✅ Permisos configurados: `Forms.Read.All`, `Forms.ReadWrite.All`
- ✅ Consentimiento de administrador otorgado

## Arquitectura

```
Microsoft 365 Forms
       ↓
Microsoft Graph API (OAuth 2.0)
       ↓
formsService.js (Client Credentials Flow)
       ↓
formsSyncService.js (Full/Incremental Sync)
       ↓
WindowsFormsData Database
       ↓
API Endpoints (/api/forms/*)
       ↓
Frontend React (a implementar)
```

## Cron Job Automático

El cron job se inicia automáticamente cuando arranca el servidor si `SYNC_ENABLED = 'true'` en `FormsConfig`.

**Expresiones cron según intervalo:**
- 1 hora: `0 * * * *`
- 6 horas: `0 */6 * * *`
- 12 horas: `0 */12 * * *`
- 24 horas: `0 0 * * *`

## Seguridad

- Todos los endpoints requieren autenticación (`authMiddleware`)
- Endpoints de configuración/sync son solo para administradores (`esAdmin`)
- Client Secret se enmascara en respuestas GET (`••••••••`)
- **Pending**: Implementar encriptación de Client Secret en base de datos

## Notas

- **Rate Limiting**: El servicio incluye delays de 500ms entre páginas para evitar límites de Graph API
- **Paginación**: Tanto en backend como frontend (50 por página por defecto)
- **JSON Flexible**: Columna `Answers` almacena cualquier es tructura de formulario
- **Consistencia**: Patrón idéntico a Invgate integration para mantenibilidad

## Próximos Pasos

1. Agregar endpoints a `server.js`
2. Ejecutar migración SQL
3. Reiniciar servidor
4. Implementar componentes React:
   - `FormsConfigPage.tsx`
   - `FormsResponsesPage.tsx`
   - `FormsReportsPage.tsx`
5. Agregar rutas en App.tsx
6. Agregar menú de navegación
7. Probar conexión y primera sincronización
