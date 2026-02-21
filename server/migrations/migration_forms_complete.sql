-- Complete Forms Database Setup with Configuration
-- This script creates the database and inserts Azure AD credentials

USE master;
GO

-- Execute migration if database doesn't exist
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'KPIsRosti_WForms')
BEGIN
    CREATE DATABASE KPIsRosti_WForms;
    PRINT '✅ Created KPIsRosti_WForms database';
END
GO

USE KPIsRosti_WForms;
GO

-- Create FormResponses table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormResponses')
BEGIN
    CREATE TABLE FormResponses (
        ResponseID NVARCHAR(100) PRIMARY KEY,
        FormID NVARCHAR(100),
        FormTitle NVARCHAR(500),
        RespondentEmail NVARCHAR(200),
        RespondentName NVARCHAR(200),
        SubmittedAt DATETIME,
        LastModifiedAt DATETIME,
        Answers NVARCHAR(MAX), 
        RawDataJSON NVARCHAR(MAX), 
        UltimaSync DATETIME DEFAULT GETDATE(),
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );

    CREATE INDEX IX_FormResponses_FormID ON FormResponses(FormID);
    CREATE INDEX IX_FormResponses_SubmittedAt ON FormResponses(SubmittedAt);
    CREATE INDEX IX_FormResponses_Email ON FormResponses(RespondentEmail);
    PRINT '✅ Created FormResponses table';
END
GO

-- Create FormsSyncLog table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormsSyncLog')
BEGIN
    CREATE TABLE FormsSyncLog (
        SyncID INT IDENTITY(1,1) PRIMARY KEY,
        FechaSync DATETIME DEFAULT GETDATE(),
        TipoSync NVARCHAR(50), 
        RegistrosProcesados INT DEFAULT 0,
        RegistrosNuevos INT DEFAULT 0,
        RegistrosActualizados INT DEFAULT 0,
        Estado NVARCHAR(50), 
        MensajeError NVARCHAR(MAX) NULL,
        TiempoEjecucionMs INT NULL,
        IniciadoPor NVARCHAR(100) DEFAULT 'SYSTEM', 
        DatosAdicionales NVARCHAR(MAX) NULL 
    );

    CREATE INDEX IX_FormsSyncLog_Fecha ON FormsSyncLog(FechaSync DESC);
    PRINT '✅ Created FormsSyncLog table';
END
GO

-- Create FormsConfig table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FormsConfig')
BEGIN
    CREATE TABLE FormsConfig (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX),
        Descripcion NVARCHAR(500),
        UpdatedAt DATETIME DEFAULT GETDATE(),
        UpdatedBy NVARCHAR(100)
    );
    PRINT '✅ Created FormsConfig table';
END
GO

-- Insert Azure AD Configuration
DELETE FROM FormsConfig WHERE ConfigKey IN ('TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SYNC_ENABLED', 'SYNC_INTERVAL_HOURS', 'FORM_IDS');

INSERT INTO FormsConfig (ConfigKey, ConfigValue, Descripcion, UpdatedBy)
VALUES 
    ('TENANT_ID', '70dff046e-e545-44c7-ae8c-21c53272ee6e', 'Azure AD Tenant ID', 'SYSTEM'),
    ('CLIENT_ID', '44490c35-76d8-451c-a10f-05c526df8e38', 'Azure AD Application (Client) ID', 'SYSTEM'),
    ('CLIENT_SECRET', 'CONFIGURE_VIA_WEB_UI', 'Azure AD Client Secret (configure via admin panel)', 'SYSTEM'),
    ('SYNC_ENABLED', 'false', 'Enable automatic sync (true/false)', 'SYSTEM'),
    ('SYNC_INTERVAL_HOURS', '6', 'Sync interval in hours (1, 6, 12, 24)', 'SYSTEM'),
    ('FORM_IDS', '[]', 'JSON array of form IDs to sync', 'SYSTEM');

PRINT '✅ Inserted Azure AD configuration';
GO

-- Create view for recent responses
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_RecentResponses')
BEGIN
    EXEC('
    CREATE VIEW vw_RecentResponses AS
    SELECT TOP 100
        ResponseID,
        FormID,
        FormTitle,
        RespondentEmail,
        RespondentName,
        SubmittedAt,
        LastModifiedAt,
        UltimaSync
    FROM FormResponses
    ORDER BY SubmittedAt DESC
    ');
    PRINT '✅ Created vw_RecentResponses view';
END
GO

-- Create view for responses by form
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_ResponsesByForm')
BEGIN
    EXEC('
    CREATE VIEW vw_ResponsesByForm AS
    SELECT 
        FormID,
        FormTitle,
        COUNT(*) as TotalResponses,
        MIN(SubmittedAt) as FirstResponse,
        MAX(SubmittedAt) as LatestResponse,
        MAX(UltimaSync) as LastSync
    FROM FormResponses
    GROUP BY FormID, FormTitle
    ');
    PRINT '✅ Created vw_ResponsesByForm view';
END
GO

-- Create stored procedure for paginated responses
IF NOT EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetResponsesByForm')
BEGIN
    EXEC('
    CREATE PROCEDURE sp_GetResponsesByForm
        @FormID NVARCHAR(100) = NULL,
        @PageNumber INT = 1,
        @PageSize INT = 50
    AS
    BEGIN
        SET NOCOUNT ON;
        
        DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
        
        SELECT 
            ResponseID,
            FormID,
            FormTitle,
            RespondentEmail,
            RespondentName,
            SubmittedAt,
            LastModifiedAt,
            Answers,
            RawDataJSON
        FROM FormResponses
        WHERE (@FormID IS NULL OR FormID = @FormID)
        ORDER BY SubmittedAt DESC
        OFFSET @Offset ROWS
        FETCH NEXT @PageSize ROWS ONLY;
        
        -- Return total count
        SELECT COUNT(*) as TotalRecords
        FROM FormResponses
        WHERE (@FormID IS NULL OR FormID = @FormID);
    END
    ');
    PRINT '✅ Created sp_GetResponsesByForm stored procedure';
END
GO

PRINT '';
PRINT '========================================';
PRINT '✅ KPIsRosti_WForms database setup complete!';
PRINT '========================================';
PRINT '';
PRINT 'Configuration inserted:';
PRINT '  - Tenant ID: 70dff046e-e545-44c7-ae8c-21c53272ee6e';
PRINT '  - Client ID: 44490c35-76d8-451c-a10f-05c526df8e38';
PRINT '  - Sync: Currently disabled (enable via web interface)';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Restart the Node.js server';
PRINT '  2. Navigate to Forms Configuration page';
PRINT '  3. Configure Form IDs to sync';
PRINT '  4. Enable automatic synchronization';
PRINT '';
GO
