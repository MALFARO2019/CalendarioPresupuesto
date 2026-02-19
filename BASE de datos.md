# BASE DE DATOS - KPIs Rosti

## Información del Servidor

**Servidor SQL Server:** `10.29.1.14`  
**Usuario:** `sa`  
**Base de Datos Principal:** `RP_BI_RESUMENES`

---

## Tablas de la Aplicación

### **1. Base de datos: RP_BI_RESUMENES**

Esta es la base de datos principal donde se almacenan los datos de alcance, usuarios, configuración y eventos.

#### Tablas de Datos de Ventas

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `RSM_ALCANCE_DIARIO` | Datos diarios de alcance de ventas, transacciones y TQP | `Fecha`, `Año`, `Mes`, `Dia`, `Local`, `CODALMACEN`, `Canal`, `Tipo`, `MontoReal`, `Monto`, `Monto_Acumulado`, `MontoAnterior`, `MontoAnterior_Acumulado`, `MontoAnteriorAjustado`, `MontoAnteriorAjustado_Acumulado` |

#### Tablas de Seguridad y Usuarios

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `APP_USUARIOS` | Usuarios de la aplicación con credenciales y permisos | `Id`, `Email`, `Nombre`, `Clave`, `Activo`, `AccesoTendencia`, `AccesoTactica`, `AccesoEventos`, `AccesoPresupuesto`, `AccesoTiempos`, `AccesoEvaluaciones`, `AccesoInventarios`, `EsAdmin`, `EsProtegido`, `DashboardLocales`, `ComparativePeriod` |
| `APP_ALMACENES_PERMITIDOS` | Almacenes/locales permitidos por usuario | `Id`, `UsuarioId`, `NombreAlmacen` |

#### Tablas de Eventos

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `DIM_EVENTOS` | Catálogo de eventos (feriados, promociones, etc.) | `IDEVENTO`, `EVENTO`, `ESFERIADO`, `USARENPRESUPUESTO`, `ESINTERNO` |
| `DIM_EVENTOS_FECHAS` | Fechas asociadas a eventos específicos | `ID`, `IDEVENTO`, `FECHA`, `FECHA_EFECTIVA`, `Canal`, `GrupoAlmacen`, `USUARIO_MODIFICACION`, `FECHA_MODIFICACION` |

#### Tablas de Configuración

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `APP_CONFIGURACION` | Configuraciones de la aplicación (prompts AI, etc.) | `Clave`, `Valor`, `FechaModificacion`, `UsuarioModificacion` |
| `APP_DB_CONFIG` | Configuración de conexión a base de datos | `Id`, `Server`, `Database`, `Username`, `Password`, `IsActive`, `CreatedDate`, `ModifiedDate` |

---

### **2. Base de datos: ROSTIPOLLOS_P.DBO** (Producción de Rosti Pollos)

Esta es la base de datos principal de producción que contiene información de almacenes y grupos.

#### Tablas de Grupos de Almacenes

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB` | Catálogo de grupos de almacenes (zonas, corporativo, SSS) | `IDGRUPO`, `DESCRIPCION`, `CODVISIBLE` |
| `ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN` | Detalle de almacenes que pertenecen a cada grupo | `IDGRUPO`, `CODALMACEN` |

---

### **3. Base de datos: msdb.dbo** (Base de datos del sistema SQL Server)

Esta base de datos se utiliza para configuración de correos electrónicos.

#### Tablas de Configuración de Email

| Tabla | Descripción | Uso |
|-------|-------------|-----|
| `msdb.dbo.sysmail_profile` | Perfiles de correo de Database Mail | Verificación de servicio de correo |

---

## Resumen de Datos por Tipo

### **Datos de Ventas y KPIs**
- **Tabla principal:** `RSM_ALCANCE_DIARIO`
- **KPIs disponibles:** Ventas, Transacciones, TQP (Tiquete Promedio)
- **Dimensiones:** Local, Canal, Tipo, Día, Mes, Año
- **Métricas:** Real, Presupuesto, Año Anterior, Año Anterior Ajustado (todas con versiones acumuladas)

### **Gestión de Usuarios**
- **Tabla principal:** `APP_USUARIOS`
- **Permisos modulares:** Presupuesto, Tendencia, Táctica, Eventos, Tiempos, Evaluaciones, Inventarios
- **Control de acceso:** Por almacén/local específico
- **Autenticación:** Email + Clave (PIN de 6 dígitos)

### **Eventos y Calendarios**
- **Tablas:** `DIM_EVENTOS`, `DIM_EVENTOS_FECHAS`
- **Tipos de eventos:** Feriados, internos, eventos presupuestarios
- **Asociación:** Por fecha, canal y grupo de almacenes

### **Configuración de la Aplicación**
- **Tabla:** `APP_CONFIGURACION`
- **Configuraciones almacenadas:** Prompts de IA para análisis táctico, configuraciones generales

---

## Conexiones a Bases de Datos Externas

La aplicación utiliza el sistema de **Database Mail** de SQL Server para enviar correos electrónicos (recuperación de contraseñas, reportes).

**Configuración SMTP:**
- Host: `smtp.office365.com`
- Puerto: `587`
- Usuario: `alertas@rostipolloscr.com`

---

## Notas Importantes

1. **Convención de Nomenclatura:**
   - Tablas de aplicación empiezan con `APP_`
   - Tablas dimensionales empiezan con `DIM_`
   - Tablas de resúmenes empiezan con `RSM_`

2. **Códigos de Almacén:**
   - Almacenes individuales: CODALMACEN no empieza con 'G'
   - Grupos de almacenes: CODALMACEN empieza con 'G'

3. **Seguridad:**
   - Usuario protegido especial: `soporte@rostipolloscr.com` (EsProtegido = 1, no se puede eliminar)
   - Tokens JWT para autenticación desesiones
   - Secret JWT: almacenado en variable de entorno `JWT_SECRET`

4. **API Externa:**
   - **Google Gemini AI:** Utilizada para el análisis táctico
   - API Key almacenada en variable de entorno

---

## Sistema de Base de Datos Auxiliar (Failover Automático)

La aplicación incluye un sistema de alta disponibilidad que permite configurar una base de datos auxiliar como respaldo automático.

### Funcionalidad

**Failover Automático:**
- Si la base de datos principal no responde, el sistema cambia automáticamente a la BD auxiliar
- El cambio se realiza en cada sesión de usuario
- El sistema intenta reconectarse a la BD principal cada 30 segundos

**Reconexión Automática:**
- Una vez que la BD principal vuelve a estar disponible, el sistema vuelve automáticamente a usarla
- Los intentos de reconexión se detienen cuando la BD principal está activa

**Configuración desde Panel de Administración:**
- Acceso desde: Panel de Configuración > BD Auxiliar
- Configurar servidor, base de datos, usuario y contraseña
- Probar conexión antes de guardar
- Ver estado actual (BD activa, salud de BD principal)

**Sincronización de Datos:**
- Botón "Sincronizar Datos" para clonar datos de BD principal a BD auxiliar
- Sincroniza solo datos >= 2026 para tablas con fechas
- Tablas sincronizadas:
  - `RSM_ALCANCE_DIARIO` (solo Año >= 2026)
  - `APP_USUARIOS` (todos los registros)
  - `APP_ALMACENES_PERMITIDOS` (todos los registros)
  - `DIM_EVENTOS` (todos los registros)
  - `DIM_EVENTOS_FECHAS` (solo >= 2026-01-01)
  - `APP_CONFIGURACION` (todos los registros)

### Configuración Técnica

**Archivo:** `dbConnectionManager.js`
- Gestiona conexiones a BD principal y auxiliar
- Implementa health checks automáticos
- Maneja failover y reconexión

**Almacenamiento de Configuración:**
- Las credenciales de BD auxiliar se guardan en `APP_CONFIGURACION`:
  - `DB_AUX_SERVER`
  - `DB_AUX_DATABASE`
  - `DB_AUX_USERNAME`
  - `DB_AUX_PASSWORD`

**Endpoints API:**
- `POST /api/admin/db-config/auxiliary` - Guardar configuración
- `GET /api/admin/db-config/auxiliary` - Obtener configuración
- `POST /api/admin/db-config/test-auxiliary` - Probar conexión
- `GET /api/admin/db-status` - Estado actual
- `POST /api/admin/db-sync` - Sincronizar datos
