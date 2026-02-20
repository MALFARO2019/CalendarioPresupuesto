-- ================================================================
-- Migration Script: InvGate V2 - Custom Fields & Lookups
-- Database: InvGateData
-- Descripción: Agrega tablas de lookup, custom fields EAV,
--              y columnas adicionales a InvgateTickets
-- ================================================================

USE InvGateData;
GO

-- ================================================================
-- Tabla: InvgateHelpdesks
-- Lookup de helpdesks sincronizados desde InvGate
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateHelpdesks')
BEGIN
    CREATE TABLE InvgateHelpdesks (
        HelpdeskID INT PRIMARY KEY,
        Nombre NVARCHAR(200),
        StatusID INT NULL,
        ParentID INT NULL,
        TypeID INT NULL,
        TotalMembers INT DEFAULT 0,
        UltimaSync DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla InvgateHelpdesks creada';
END
GO

-- ================================================================
-- Tabla: InvgateCategories
-- Lookup de categorías sincronizadas desde InvGate
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateCategories')
BEGIN
    CREATE TABLE InvgateCategories (
        CategoryID INT PRIMARY KEY,
        Nombre NVARCHAR(200),
        ParentCategoryID INT NULL,
        UltimaSync DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla InvgateCategories creada';
END
GO

-- ================================================================
-- Tabla: InvgateCustomFieldDefs
-- Definiciones de campos personalizados (nombre, tipo, visibilidad)
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateCustomFieldDefs')
BEGIN
    CREATE TABLE InvgateCustomFieldDefs (
        FieldID INT PRIMARY KEY,
        FieldName NVARCHAR(200) NOT NULL,
        FieldType NVARCHAR(50) DEFAULT 'text',  -- text, number, date, dropdown
        ShowInDashboard BIT DEFAULT 1,
        DisplayOrder INT DEFAULT 0,
        HelpdeskIDs NVARCHAR(500) NULL,  -- IDs de helpdesks donde aparece, CSV
        UpdatedAt DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla InvgateCustomFieldDefs creada';
END
GO

-- ================================================================
-- Tabla: InvgateTicketCustomFields
-- Valores de custom fields por ticket (EAV)
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvgateTicketCustomFields')
BEGIN
    CREATE TABLE InvgateTicketCustomFields (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        TicketID INT NOT NULL,
        FieldID INT NOT NULL,
        FieldValue NVARCHAR(MAX) NULL,
        FieldValueRaw NVARCHAR(MAX) NULL,
        CONSTRAINT UQ_TicketField UNIQUE (TicketID, FieldID)
    );

    CREATE INDEX IX_ITCF_TicketID ON InvgateTicketCustomFields(TicketID);
    CREATE INDEX IX_ITCF_FieldID ON InvgateTicketCustomFields(FieldID);
    CREATE INDEX IX_ITCF_FieldValue ON InvgateTicketCustomFields(FieldValue(200));
    
    PRINT '✅ Tabla InvgateTicketCustomFields creada con índices';
END
GO

-- ================================================================
-- Agregar columnas nuevas a InvgateTickets (si no existen)
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'HelpdeskID')
BEGIN
    ALTER TABLE InvgateTickets ADD HelpdeskID INT NULL;
    PRINT '✅ Columna HelpdeskID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'HelpdeskNombre')
BEGIN
    ALTER TABLE InvgateTickets ADD HelpdeskNombre NVARCHAR(200) NULL;
    PRINT '✅ Columna HelpdeskNombre agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'SLAResolucion')
BEGIN
    ALTER TABLE InvgateTickets ADD SLAResolucion NVARCHAR(50) NULL;
    PRINT '✅ Columna SLAResolucion agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'SLAPrimeraRespuesta')
BEGIN
    ALTER TABLE InvgateTickets ADD SLAPrimeraRespuesta NVARCHAR(50) NULL;
    PRINT '✅ Columna SLAPrimeraRespuesta agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'StatusID')
BEGIN
    ALTER TABLE InvgateTickets ADD StatusID INT NULL;
    PRINT '✅ Columna StatusID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'PriorityID')
BEGIN
    ALTER TABLE InvgateTickets ADD PriorityID INT NULL;
    PRINT '✅ Columna PriorityID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'CategoryID')
BEGIN
    ALTER TABLE InvgateTickets ADD CategoryID INT NULL;
    PRINT '✅ Columna CategoryID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'TypeID')
BEGIN
    ALTER TABLE InvgateTickets ADD TypeID INT NULL;
    PRINT '✅ Columna TypeID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'SourceID')
BEGIN
    ALTER TABLE InvgateTickets ADD SourceID INT NULL;
    PRINT '✅ Columna SourceID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'UserID')
BEGIN
    ALTER TABLE InvgateTickets ADD UserID INT NULL;
    PRINT '✅ Columna UserID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'CreatorID')
BEGIN
    ALTER TABLE InvgateTickets ADD CreatorID INT NULL;
    PRINT '✅ Columna CreatorID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'AssignedID')
BEGIN
    ALTER TABLE InvgateTickets ADD AssignedID INT NULL;
    PRINT '✅ Columna AssignedID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'AssignedGroupID')
BEGIN
    ALTER TABLE InvgateTickets ADD AssignedGroupID INT NULL;
    PRINT '✅ Columna AssignedGroupID agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'Calificacion')
BEGIN
    ALTER TABLE InvgateTickets ADD Calificacion FLOAT NULL;
    PRINT '✅ Columna Calificacion agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'FechaOcurrencia')
BEGIN
    ALTER TABLE InvgateTickets ADD FechaOcurrencia DATETIME NULL;
    PRINT '✅ Columna FechaOcurrencia agregada a InvgateTickets';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('InvgateTickets') AND name = 'FechaResolucion')
BEGIN
    ALTER TABLE InvgateTickets ADD FechaResolucion DATETIME NULL;
    PRINT '✅ Columna FechaResolucion agregada a InvgateTickets';
END
GO

-- ================================================================
-- Vista: vw_IncidentesConCampos
-- Incidentes con custom fields pivoteados
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_IncidentesConCampos')
    DROP VIEW vw_IncidentesConCampos;
GO

CREATE VIEW vw_IncidentesConCampos AS
SELECT 
    t.TicketID,
    t.NumeroTicket,
    t.Titulo,
    t.Estado,
    t.Prioridad,
    t.Categoria,
    t.HelpdeskNombre,
    t.FechaCreacion,
    t.FechaCierre,
    t.SLAResolucion,
    t.SLAPrimeraRespuesta,
    cf.FieldID,
    fd.FieldName,
    cf.FieldValue
FROM InvgateTickets t
LEFT JOIN InvgateTicketCustomFields cf ON t.TicketID = cf.TicketID
LEFT JOIN InvgateCustomFieldDefs fd ON cf.FieldID = fd.FieldID AND fd.ShowInDashboard = 1;
GO

PRINT '✅ Vista vw_IncidentesConCampos creada';
GO

PRINT '';
PRINT '========================================';
PRINT '✅ MIGRACIÓN V2 COMPLETADA';
PRINT '========================================';
GO
