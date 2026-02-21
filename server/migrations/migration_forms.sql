-- ================================================================
-- Migration Script: Microsoft Forms Integration
-- Database: KPIsRosti_WForms (separada)
-- Descripción: Crea las tablas necesarias para sincronizar
--              datos de Microsoft Forms vía Graph API
-- ================================================================

-- Crear base de datos si no existe
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'KPIsRosti_WForms')
BEGIN
    CREATE DATABASE KPIsRosti_WForms;
    PRINT '✅ Base de datos KPIsRosti_WForms creada';
END
ELSE
BEGIN
    PRINT 'ℹ️ Base de datos KPIsRosti_WForms ya existe';
END
GO

USE KPIsRosti_WForms;
GO

-- ================================================================
-- Tabla: FormResponses
-- Almacena todas las respuestas sincronizadas desde Microsoft Forms
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormResponses')
BEGIN
    CREATE TABLE FormResponses (
        -- Identificadores
        ResponseID NVARCHAR(100) PRIMARY KEY,
        FormID NVARCHAR(100),
        FormTitle NVARCHAR(500),
        
        -- Información del respondente
        RespondentEmail NVARCHAR(200),
        RespondentName NVARCHAR(200),
        
        -- Fechas
        SubmittedAt DATETIME,
        LastModifiedAt DATETIME,
        
        -- Datos de respuestas (JSON)
        Answers NVARCHAR(MAX), -- JSON con estructura { "pregunta": "respuesta", ... }
        RawDataJSON NVARCHAR(MAX), -- JSON completo de Microsoft Graph API
        
        -- Control de sincronización
        UltimaSync DATETIME DEFAULT GETDATE(),
        
        -- Timestamps
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );

    -- Índices para optimizar consultas
    CREATE INDEX IX_FormResponses_FormID ON FormResponses(FormID);
    CREATE INDEX IX_FormResponses_FormTitle ON FormResponses(FormTitle);
    CREATE INDEX IX_FormResponses_SubmittedAt ON FormResponses(SubmittedAt DESC);
    CREATE INDEX IX_FormResponses_RespondentEmail ON FormResponses(RespondentEmail);

    PRINT '✅ Tabla FormResponses creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla FormResponses ya existe';
END
GO

-- ================================================================
-- Tabla: FormsSyncLog
-- Registro de todas las sincronizaciones ejecutadas
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormsSyncLog')
BEGIN
    CREATE TABLE FormsSyncLog (
        SyncID INT IDENTITY(1,1) PRIMARY KEY,
        FechaSync DATETIME DEFAULT GETDATE(),
        TipoSync NVARCHAR(50), -- 'FULL', 'INCREMENTAL'
        RegistrosProcesados INT DEFAULT 0,
        RegistrosNuevos INT DEFAULT 0,
        RegistrosActualizados INT DEFAULT 0,
        Estado NVARCHAR(50), -- 'SUCCESS', 'ERROR', 'PARTIAL'
        MensajeError NVARCHAR(MAX) NULL,
        TiempoEjecucionMs INT NULL,
        IniciadoPor NVARCHAR(100) DEFAULT 'SYSTEM', -- 'SYSTEM', 'CRON', 'MANUAL', Usuario
        DatosAdicionales NVARCHAR(MAX) NULL -- JSON con info adicional
    );

    CREATE INDEX IX_FormsSyncLog_FechaSync ON FormsSyncLog(FechaSync DESC);
    CREATE INDEX IX_FormsSyncLog_Estado ON FormsSyncLog(Estado);

    PRINT '✅ Tabla FormsSyncLog creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla FormsSyncLog ya existe';
END
GO

-- ================================================================
-- Tabla: FormsConfig
-- Configuración de la integración con Microsoft Forms
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormsConfig')
BEGIN
    CREATE TABLE FormsConfig (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX),
        Descripcion NVARCHAR(500),
        UpdatedAt DATETIME DEFAULT GETDATE(),
        UpdatedBy NVARCHAR(100)
    );

    -- Insertar configuración por defecto
    INSERT INTO FormsConfig (ConfigKey, ConfigValue, Descripcion) VALUES
    ('TENANT_ID', '', 'Azure AD Tenant ID'),
    ('CLIENT_ID', '', 'Azure AD Application (Client) ID'),
    ('CLIENT_SECRET', '', 'Azure AD Client Secret'),
    ('SYNC_INTERVAL_HOURS', '1', 'Frecuencia de sincronización automática en horas'),
    ('SYNC_ENABLED', 'false', 'Habilitar/deshabilitar sincronización automática'),
    ('LAST_SYNC_DATE', '', 'Fecha de última sincronización exitosa (ISO 8601)'),
    ('FORM_IDS', '[]', 'JSON array con IDs de formularios a sincronizar');

    PRINT '✅ Tabla FormsConfig creada con valores por defecto';
END
ELSE
BEGIN
    PRINT 'ℹ️ Tabla FormsConfig ya existe';
END
GO

-- ================================================================
-- Vista: vw_RecentResponses
-- Vista con respuestas recientes (últimos 30 días)
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_RecentResponses')
    DROP VIEW vw_RecentResponses;
GO

CREATE VIEW vw_RecentResponses AS
SELECT 
    ResponseID,
    FormID,
    FormTitle,
    RespondentEmail,
    RespondentName,
    SubmittedAt,
    LastModifiedAt,
    DATEDIFF(DAY, SubmittedAt, GETDATE()) AS DiasDesdeRespuesta
FROM FormResponses
WHERE SubmittedAt >= DATEADD(DAY, -30, GETDATE());
GO

PRINT '✅ Vista vw_RecentResponses creada';
GO

-- ================================================================
-- Vista: vw_ResponsesByForm
-- Métricas resumidas por formulario
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_ResponsesByForm')
    DROP VIEW vw_ResponsesByForm;
GO

CREATE VIEW vw_ResponsesByForm AS
SELECT 
    FormID,
    FormTitle,
    COUNT(*) AS TotalResponses,
    MIN(SubmittedAt) AS PrimeraRespuesta,
    MAX(SubmittedAt) AS UltimaRespuesta,
    COUNT(DISTINCT RespondentEmail) AS RespondentesUnicos
FROM FormResponses
GROUP BY FormID, FormTitle;
GO

PRINT '✅ Vista vw_ResponsesByForm creada';
GO

-- ================================================================
-- Stored Procedure: sp_GetResponsesByForm
-- Obtiene respuestas filtradas por formulario con paginación
-- ================================================================
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetResponsesByForm')
    DROP PROCEDURE sp_GetResponsesByForm;
GO

CREATE PROCEDURE sp_GetResponsesByForm
    @FormID NVARCHAR(100) = NULL,
    @FormTitle NVARCHAR(500) = NULL,
    @FechaDesde DATETIME = NULL,
    @FechaHasta DATETIME = NULL,
    @Email NVARCHAR(200) = NULL,
    @PageSize INT = 50,
    @PageNumber INT = 1
AS
BEGIN
    SET NOCOUNT ON;

    WITH ResponsesPaginados AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (ORDER BY SubmittedAt DESC) AS RowNum,
            COUNT(*) OVER () AS TotalRegistros
        FROM FormResponses
        WHERE 
            (@FormID IS NULL OR FormID = @FormID)
            AND (@FormTitle IS NULL OR FormTitle = @FormTitle)
            AND (@FechaDesde IS NULL OR SubmittedAt >= @FechaDesde)
            AND (@FechaHasta IS NULL OR SubmittedAt <= @FechaHasta)
            AND (@Email IS NULL OR RespondentEmail LIKE '%' + @Email + '%')
    )
    SELECT 
        *,
        CEILING(CAST(TotalRegistros AS FLOAT) / @PageSize) AS TotalPaginas
    FROM ResponsesPaginados
    WHERE RowNum BETWEEN ((@PageNumber - 1) * @PageSize + 1) AND (@PageNumber * @PageSize);
END
GO

PRINT '✅ Stored Procedure sp_GetResponsesByForm creado';
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
PRINT '  - FormResponses';
PRINT '  - FormsSyncLog';
PRINT '  - FormsConfig';
PRINT '';
PRINT 'Vistas creadas:';
PRINT '  - vw_RecentResponses';
PRINT '  - vw_ResponsesByForm';
PRINT '';
PRINT 'Procedimientos creados:';
PRINT '  - sp_GetResponsesByForm';
PRINT '';
PRINT '========================================';
GO
