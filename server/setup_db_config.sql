-- =============================================
-- Database Configuration Table for Flexible Connection System
-- =============================================

-- Check if table exists, create if not
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'APP_DB_CONFIG')
BEGIN
    CREATE TABLE APP_DB_CONFIG (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Modo NVARCHAR(20) NOT NULL CHECK (Modo IN ('direct', 'hybrid')),
        
        -- Direct SQL Configuration
        DirectServer NVARCHAR(255),
        DirectDatabase NVARCHAR(255),
        DirectUser NVARCHAR(255),
        DirectPassword NVARCHAR(500), -- Encrypted
        
        -- Azure Hybrid Configuration - READ Pool (Azure SQL)
        ReadServer NVARCHAR(255),
        ReadDatabase NVARCHAR(255),
        ReadUser NVARCHAR(255),
        ReadPassword NVARCHAR(500), -- Encrypted
        
        -- Azure Hybrid Configuration - WRITE Pool (On-premise)
        WriteServer NVARCHAR(255),
        WriteDatabase NVARCHAR(255),
        WriteUser NVARCHAR(255),
        WritePassword NVARCHAR(500), -- Encrypted
        
        FechaModificacion DATETIME DEFAULT GETDATE(),
        UsuarioModificacion NVARCHAR(255)
    );

    PRINT 'Tabla APP_DB_CONFIG creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla APP_DB_CONFIG ya existe';
END
GO

-- Insert default configuration (Direct mode with current settings)
-- Only insert if table is empty
IF NOT EXISTS (SELECT * FROM APP_DB_CONFIG)
BEGIN
    INSERT INTO APP_DB_CONFIG (
        Modo,
        DirectServer,
        DirectDatabase,
        DirectUser,
        DirectPassword,
        UsuarioModificacion
    )
    VALUES (
        'direct',
        '10.29.1.14',
        'RP_BI_RESUMENES',
        'sa',
        'masterkey', -- TODO: Encrypt this in production
        'system'
    );

    PRINT 'Configuración inicial insertada (modo: direct)';
END
GO
