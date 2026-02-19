-- Migration: Add FormsSources table for multi-form Excel-based sync
-- Run this on WindowsFormsData database

USE WindowsFormsData;
GO

-- Create FormsSources table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormsSources')
BEGIN
    CREATE TABLE FormsSources (
        SourceID     INT IDENTITY(1,1) PRIMARY KEY,
        Alias        NVARCHAR(200) NOT NULL,
        ExcelUrl     NVARCHAR(2000) NOT NULL,
        OwnerEmail   NVARCHAR(200) NOT NULL,
        DriveId      NVARCHAR(500) NULL,
        ItemId       NVARCHAR(500) NULL,
        SheetName    NVARCHAR(200) NULL DEFAULT 'Sheet1',
        Activo       BIT NOT NULL DEFAULT 1,
        UltimaSync   DATETIME NULL,
        TotalRespuestas INT NOT NULL DEFAULT 0,
        CreatedAt    DATETIME DEFAULT GETDATE(),
        UpdatedAt    DATETIME DEFAULT GETDATE(),
        CreatedBy    NVARCHAR(100) DEFAULT 'SYSTEM',
        UpdatedBy    NVARCHAR(100) DEFAULT 'SYSTEM'
    );
    CREATE INDEX IX_FormsSources_Activo ON FormsSources(Activo);
    PRINT '✅ Created FormsSources table';
END
GO

-- Add SourceID to FormResponses if not exists
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('FormResponses') AND name = 'SourceID'
)
BEGIN
    ALTER TABLE FormResponses ADD SourceID INT NULL;
    CREATE INDEX IX_FormResponses_SourceID ON FormResponses(SourceID);
    PRINT '✅ Added SourceID column to FormResponses';
END
GO

-- Expand FormID column if needed (may already be 500 from previous fix)
IF EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('FormResponses') AND name = 'FormID' AND max_length < 1000
)
BEGIN
    ALTER TABLE FormResponses ALTER COLUMN FormID NVARCHAR(500);
    PRINT '✅ Expanded FormID to NVARCHAR(500)';
END
GO

-- Migrate existing data: insert current form into FormsSources
-- (The form we already configured: Visita Operativa Operaciones)
IF NOT EXISTS (SELECT * FROM FormsSources WHERE OwnerEmail = 'dperez@rostipolloscr.com')
BEGIN
    DECLARE @DriveId NVARCHAR(500) = (SELECT ConfigValue FROM FormsConfig WHERE ConfigKey = 'EXCEL_DRIVE_ID');
    DECLARE @ItemId  NVARCHAR(500) = (SELECT ConfigValue FROM FormsConfig WHERE ConfigKey = 'EXCEL_ITEM_ID');
    DECLARE @Sheet   NVARCHAR(200) = (SELECT ConfigValue FROM FormsConfig WHERE ConfigKey = 'EXCEL_SHEET_NAME');
    DECLARE @Count   INT = (SELECT COUNT(*) FROM FormResponses);

    INSERT INTO FormsSources (Alias, ExcelUrl, OwnerEmail, DriveId, ItemId, SheetName, TotalRespuestas)
    VALUES (
        'Visita Operativa Operaciones (3)',
        'https://rostipolloscr-my.sharepoint.com/personal/dperez_rostipolloscr_com/_layouts/15/Doc.aspx?sourcedoc={0AE214D6-C824-46CC-943D-28C8590383F8}',
        'dperez@rostipolloscr.com',
        @DriveId,
        @ItemId,
        ISNULL(@Sheet, 'Sheet1'),
        @Count
    );

    -- Update existing FormResponses to link to this source
    UPDATE FormResponses SET SourceID = SCOPE_IDENTITY() WHERE SourceID IS NULL;
    
    PRINT '✅ Migrated existing form to FormsSources';
END
GO

PRINT '✅ Migration complete';
GO
