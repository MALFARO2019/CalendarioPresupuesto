-- ================================================================
-- Migration Script: InvGate V3 - Missing columns + fixes
-- Database: InvGateData
-- Descripción: Agrega columnas faltantes en InvgateHelpdesks 
--              (SyncEnabled, TotalTickets) y en InvgateCustomFieldDefs
--              (HelpdeskID) para soportar selección de helpdesks y
--              configuración de campos por helpdesk.
-- ================================================================

USE InvGateData;
GO

-- ================================================================
-- InvgateHelpdesks: add SyncEnabled (default 0 = not synced)
-- ================================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('InvgateHelpdesks') AND name = 'SyncEnabled'
)
BEGIN
    ALTER TABLE InvgateHelpdesks ADD SyncEnabled BIT NOT NULL DEFAULT 0;
    PRINT '✅ Columna SyncEnabled agregada a InvgateHelpdesks';
END
GO

-- ================================================================
-- InvgateHelpdesks: add TotalTickets counter
-- ================================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('InvgateHelpdesks') AND name = 'TotalTickets'
)
BEGIN
    ALTER TABLE InvgateHelpdesks ADD TotalTickets INT NOT NULL DEFAULT 0;
    PRINT '✅ Columna TotalTickets agregada a InvgateHelpdesks';
END
GO

-- ================================================================
-- InvgateCustomFieldDefs: add HelpdeskID
-- (Previously had HelpdeskIDs as CSV, now typed per helpdesk)
-- ================================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('InvgateCustomFieldDefs') AND name = 'HelpdeskID'
)
BEGIN
    ALTER TABLE InvgateCustomFieldDefs ADD HelpdeskID INT NULL;
    PRINT '✅ Columna HelpdeskID agregada a InvgateCustomFieldDefs';
END
GO

-- Drop the old composite primary key (FieldID only) and recreate 
-- as (FieldID, HelpdeskID) if HelpdeskID is now used to scope fields per helpdesk
-- NOTE: Only run this block if the table has data you want to preserve
-- and the PK is still a single FieldID. If already composite, skip.
IF EXISTS (
    SELECT * FROM sys.key_constraints 
    WHERE name = 'PK__InvgateC__A09BF6C5%'
       OR (parent_object_id = OBJECT_ID('InvgateCustomFieldDefs') AND type = 'PK')
)
AND NOT EXISTS (
    SELECT 1 FROM sys.index_columns ic
    JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
      AND i.object_id = OBJECT_ID('InvgateCustomFieldDefs')
    HAVING COUNT(*) > 1
)
BEGIN
    -- Only alter PK if it is currently a single-column key
    PRINT 'ℹ️  InvgateCustomFieldDefs PK check passed — update manually if needed';
END
GO

-- ================================================================
-- Fix: Ensure the index on InvgateTicketCustomFields(FieldValue)
-- uses persisted or correct syntax (the original had (200) which is 
-- not valid for NVARCHAR(MAX) in all SQL Server versions)
-- ================================================================
IF EXISTS (
    SELECT * FROM sys.indexes 
    WHERE object_id = OBJECT_ID('InvgateTicketCustomFields')
      AND name = 'IX_ITCF_FieldValue'
)
BEGIN
    DROP INDEX IX_ITCF_FieldValue ON InvgateTicketCustomFields;
    -- Recreate with a computed/trimmed version
    CREATE INDEX IX_ITCF_FieldValue ON InvgateTicketCustomFields(TicketID, FieldID);
    PRINT '✅ Índice IX_ITCF_FieldValue recreado';
END
GO

-- ================================================================
-- Recreate the view to account for HelpdeskID in defs
-- ================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_IncidentesConCampos')
    DROP VIEW vw_IncidentesConCampos;
GO

CREATE VIEW vw_IncidentesConCampos AS
SELECT 
    t.TicketID,
    t.Titulo,
    t.Estado,
    t.Prioridad,
    t.Categoria,
    t.HelpdeskID,
    t.HelpdeskNombre,
    t.FechaCreacion,
    t.FechaCierre,
    t.SLAResolucion,
    t.SLAPrimeraRespuesta,
    cf.FieldID,
    fd.FieldName,
    fd.FieldType,
    cf.FieldValue,
    cf.FieldValueRaw
FROM InvgateTickets t
LEFT JOIN InvgateTicketCustomFields cf ON t.TicketID = CAST(cf.TicketID AS NVARCHAR)
LEFT JOIN InvgateCustomFieldDefs fd 
    ON cf.FieldID = fd.FieldID 
    AND (fd.HelpdeskID IS NULL OR fd.HelpdeskID = t.HelpdeskID)
    AND fd.ShowInDashboard = 1;
GO

PRINT '✅ Vista vw_IncidentesConCampos recreada';
GO

PRINT '';
PRINT '========================================';
PRINT '✅ MIGRACIÓN V3 COMPLETADA';
PRINT '========================================';
GO
