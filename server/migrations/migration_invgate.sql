-- ================================================================
-- Migration Script: Invgate Integration
-- Database: InvGateData (separada)
-- Descripción: Crea las tablas necesarias para sincronizar
--              datos de Invgate Service Management
-- ================================================================

-- Crear base de datos si no existe
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'InvGateData')
BEGIN
    CREATE DATABASE InvGateData;
    PRINT '✅ Base de datos InvGateData creada';
END
ELSE
BEGIN
    PRINT 'ℹ️ Base de datos InvGateData ya existe';
END
GO

USE InvGateData;
GO

-- ================================================================
-- Tabla: InvgateTickets
-- Almacena todos los tickets sincronizados desde Invgate
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateTickets')
BEGIN
    CREATE TABLE InvgateTickets (
        -- Identificadores
        TicketID NVARCHAR(50) PRIMARY KEY,
        NumeroTicket NVARCHAR(50),
        
        -- Información básica
        Titulo NVARCHAR(500),
        Descripcion NVARCHAR(MAX),
        
        -- Clasificación
        Estado NVARCHAR(100),
        Prioridad NVARCHAR(50),
        Categoria NVARCHAR(200),
        Subcategoria NVARCHAR(200),
        Tipo NVARCHAR(100), -- Incidente, Solicitud, etc.
        
        -- Personas involucradas
        AsignadoA NVARCHAR(200),
        GrupoAsignado NVARCHAR(200),
        SolicitadoPor NVARCHAR(200),
        EmailSolicitante NVARCHAR(200),
        
        -- Fechas
        FechaCreacion DATETIME,
        FechaActualizacion DATETIME,
        FechaCierre DATETIME NULL,
        FechaVencimiento DATETIME NULL,
        
        -- Métricas de tiempo (en minutos)
        TiempoRespuesta INT NULL,
        TiempoResolucion INT NULL,
        TiempoEnEspera INT NULL,
        
        -- Información adicional
        Tags NVARCHAR(500),
        Impacto NVARCHAR(50),
        Urgencia NVARCHAR(50),
        Ubicacion NVARCHAR(200),
        Departamento NVARCHAR(200),
        
        -- Seguimiento
        NumeroComentarios INT DEFAULT 0,
        NumeroAdjuntos INT DEFAULT 0,
        
        -- JSON completo para referencia
        DatosJSON NVARCHAR(MAX),
        
        -- Control de sincronización
        UltimaSync DATETIME DEFAULT GETDATE(),
        
        -- Timestamps
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );

    -- Crear índices para mejorar performance de consultas
    CREATE INDEX IX_InvgateTickets_Estado ON InvgateTickets(Estado);
    CREATE INDEX IX_InvgateTickets_FechaCreacion ON InvgateTickets(FechaCreacion DESC);
    CREATE INDEX IX_InvgateTickets_Categoria ON InvgateTickets(Categoria);
    CREATE INDEX IX_InvgateTickets_Prioridad ON InvgateTickets(Prioridad);
    CREATE INDEX IX_InvgateTickets_AsignadoA ON InvgateTickets(AsignadoA);
    CREATE INDEX IX_InvgateTickets_SolicitadoPor ON InvgateTickets(SolicitadoPor);
    CREATE INDEX IX_InvgateTickets_FechaCierre ON InvgateTickets(FechaCierre);
    CREATE INDEX IX_InvgateTickets_NumeroTicket ON InvgateTickets(NumeroTicket);

    PRINT '✅ Tabla InvgateTickets creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla InvgateTickets ya existe';
END
GO

-- ================================================================
-- Tabla: InvgateSyncLog
-- Registro de todas las sincronizaciones ejecutadas
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateSyncLog')
BEGIN
    CREATE TABLE InvgateSyncLog (
        SyncID INT IDENTITY(1,1) PRIMARY KEY,
        FechaSync DATETIME DEFAULT GETDATE(),
        TipoSync NVARCHAR(50), -- 'FULL', 'INCREMENTAL'
        RegistrosProcesados INT DEFAULT 0,
        RegistrosNuevos INT DEFAULT 0,
        RegistrosActualizados INT DEFAULT 0,
        Estado NVARCHAR(50), -- 'SUCCESS', 'ERROR', 'PARTIAL'
        MensajeError NVARCHAR(MAX) NULL,
        TiempoEjecucionMs INT NULL,
        IniciadoPor NVARCHAR(100) DEFAULT 'SYSTEM', -- 'SYSTEM', 'MANUAL', Usuario
        DatosAdicionales NVARCHAR(MAX) NULL -- JSON con info adicional
    );

    CREATE INDEX IX_InvgateSyncLog_FechaSync ON InvgateSyncLog(FechaSync DESC);
    CREATE INDEX IX_InvgateSyncLog_Estado ON InvgateSyncLog(Estado);

    PRINT '✅ Tabla InvgateSyncLog creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla InvgateSyncLog ya existe';
END
GO

-- ================================================================
-- Tabla: InvgateConfig
-- Configuración de la integración con Invgate
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateConfig')
BEGIN
    CREATE TABLE InvgateConfig (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX),
        Descripcion NVARCHAR(500),
        UpdatedAt DATETIME DEFAULT GETDATE(),
        UpdatedBy NVARCHAR(100)
    );

    -- Insertar configuración por defecto
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue, Descripcion) VALUES
    ('API_URL', '', 'URL base del API de Invgate (ej: https://tu-empresa.invgate.net/api/v1)'),
    ('API_KEY', '', 'API Key para autenticación'),
    ('SYNC_INTERVAL_HOURS', '1', 'Frecuencia de sincronización automática en horas'),
    ('SYNC_ENABLED', 'false', 'Habilitar/deshabilitar sincronización automática'),
    ('LAST_SYNC_DATE', '', 'Fecha de última sincronización exitosa'),
    ('SYNC_PAGE_SIZE', '100', 'Cantidad de registros por página al sincronizar');

    PRINT '✅ Tabla InvgateConfig creada con valores por defecto';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla InvgateConfig ya existe';
END
GO

-- ================================================================
-- Vista: vw_InvgateTicketsActivos
-- Vista con tickets activos (no cerrados)
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InvgateTicketsActivos')
    DROP VIEW vw_InvgateTicketsActivos;
GO

CREATE VIEW vw_InvgateTicketsActivos AS
SELECT 
    TicketID,
    NumeroTicket,
    Titulo,
    Estado,
    Prioridad,
    Categoria,
    AsignadoA,
    SolicitadoPor,
    FechaCreacion,
    FechaActualizacion,
    DATEDIFF(DAY, FechaCreacion, GETDATE()) AS DiasAbierto,
    TiempoRespuesta,
    TiempoResolucion
FROM InvgateTickets
WHERE FechaCierre IS NULL;
GO

PRINT '✅ Vista vw_InvgateTicketsActivos creada';
GO

-- ================================================================
-- Vista: vw_InvgateMetricasResumen
-- Métricas resumidas de tickets
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InvgateMetricasResumen')
    DROP VIEW vw_InvgateMetricasResumen;
GO

CREATE VIEW vw_InvgateMetricasResumen AS
SELECT 
    COUNT(*) AS TotalTickets,
    SUM(CASE WHEN FechaCierre IS NULL THEN 1 ELSE 0 END) AS TicketsAbiertos,
    SUM(CASE WHEN FechaCierre IS NOT NULL THEN 1 ELSE 0 END) AS TicketsCerrados,
    AVG(CASE WHEN TiempoResolucion IS NOT NULL THEN TiempoResolucion ELSE NULL END) AS TiempoPromedioResolucion,
    MAX(FechaActualizacion) AS UltimaActualizacion
FROM InvgateTickets;
GO

PRINT '✅ Vista vw_InvgateMetricasResumen creada';
GO

-- ================================================================
-- Stored Procedure: sp_GetTicketsPorEstado
-- Obtiene tickets filtrados por estado
-- ================================================================
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetTicketsPorEstado')
    DROP PROCEDURE sp_GetTicketsPorEstado;
GO

CREATE PROCEDURE sp_GetTicketsPorEstado
    @Estado NVARCHAR(100) = NULL,
    @FechaDesde DATETIME = NULL,
    @FechaHasta DATETIME = NULL,
    @PageSize INT = 50,
    @PageNumber INT = 1
AS
BEGIN
    SET NOCOUNT ON;

    WITH TicketsPaginados AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (ORDER BY FechaCreacion DESC) AS RowNum,
            COUNT(*) OVER () AS TotalRegistros
        FROM InvgateTickets
        WHERE 
            (@Estado IS NULL OR Estado = @Estado)
            AND (@FechaDesde IS NULL OR FechaCreacion >= @FechaDesde)
            AND (@FechaHasta IS NULL OR FechaCreacion <= @FechaHasta)
    )
    SELECT 
        *,
        CEILING(CAST(TotalRegistros AS FLOAT) / @PageSize) AS TotalPaginas
    FROM TicketsPaginados
    WHERE RowNum BETWEEN ((@PageNumber - 1) * @PageSize + 1) AND (@PageNumber * @PageSize);
END
GO

PRINT '✅ Stored Procedure sp_GetTicketsPorEstado creado';
GO

-- ================================================================
-- Verificación final
-- ================================================================
PRINT '';
PRINT '========================================';
PRINT '✅ MIGRACIÓN COMPLETADA EXITOSAMENTE';
PRINT '========================================';
PRINT '';
PRINT 'Tablas creadas:';
PRINT '  - InvgateTickets';
PRINT '  - InvgateSyncLog';
PRINT '  - InvgateConfig';
PRINT '';
PRINT 'Vistas creadas:';
PRINT '  - vw_InvgateTicketsActivos';
PRINT '  - vw_InvgateMetricasResumen';
PRINT '';
PRINT 'Procedimientos creados:';
PRINT '  - sp_GetTicketsPorEstado';
PRINT '';
PRINT '========================================';
GO
