-- ==========================================
-- Migration: SharePoint Eventos Rosti Cache Table
-- Purpose: Cache events from SharePoint "Eventos Rosti" list
--          for fast rendering in the monthly calendar view.
-- Database: RP_BI_RESUMENES (main app database)
-- ==========================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SP_EVENTOS_ROSTI')
BEGIN
    CREATE TABLE SP_EVENTOS_ROSTI (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        SharePointItemId NVARCHAR(100) NOT NULL,    -- ID del item en SharePoint
        Titulo NVARCHAR(500) NOT NULL,               -- Título del evento
        FechaInicio DATETIME NOT NULL,               -- Fecha de inicio
        FechaFin DATETIME NULL,                      -- Fecha de finalización
        Ubicacion NVARCHAR(500) NULL,                -- Ubicación/local
        Categoria NVARCHAR(200) NULL,                -- Categoría del evento
        TodoElDia BIT DEFAULT 0,                     -- Es evento de todo el día
        Descripcion NVARCHAR(MAX) NULL,              -- Descripción/body
        UltimaSyncFecha DATETIME DEFAULT GETDATE(),  -- Fecha de última sync
        CONSTRAINT UQ_SP_EVENTOS_ItemId UNIQUE(SharePointItemId)
    );
    
    -- Index for fast lookups by date range
    CREATE INDEX IX_SP_EVENTOS_FechaInicio ON SP_EVENTOS_ROSTI(FechaInicio);
    CREATE INDEX IX_SP_EVENTOS_FechaFin ON SP_EVENTOS_ROSTI(FechaFin);
    
    PRINT 'Table SP_EVENTOS_ROSTI created successfully';
END
ELSE
BEGIN
    PRINT 'Table SP_EVENTOS_ROSTI already exists';
END
GO
