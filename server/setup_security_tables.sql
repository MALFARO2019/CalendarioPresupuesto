-- =============================================
-- Security Tables for Calendario Presupuestal
-- Database: RP_BI_RESUMENES
-- =============================================

-- Users table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIOS' AND xtype='U')
BEGIN
    CREATE TABLE APP_USUARIOS (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Email NVARCHAR(255) NOT NULL UNIQUE,
        Nombre NVARCHAR(255) NULL,
        Activo BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
        FechaModificacion DATETIME NULL
    );
    PRINT 'Table APP_USUARIOS created.';
END
GO

-- User-Store access permissions
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIO_ALMACEN' AND xtype='U')
BEGIN
    CREATE TABLE APP_USUARIO_ALMACEN (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId INT NOT NULL,
        Local NVARCHAR(255) NOT NULL,
        CONSTRAINT FK_UsuarioAlmacen_Usuario FOREIGN KEY (UsuarioId) 
            REFERENCES APP_USUARIOS(Id) ON DELETE CASCADE
    );
    PRINT 'Table APP_USUARIO_ALMACEN created.';
END
GO

-- Create unique index to prevent duplicate permissions
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_UsuarioAlmacen_Unique')
BEGIN
    CREATE UNIQUE INDEX IX_UsuarioAlmacen_Unique 
        ON APP_USUARIO_ALMACEN(UsuarioId, Local);
    PRINT 'Unique index created.';
END
GO

-- Insert a default admin user (optional)
IF NOT EXISTS (SELECT * FROM APP_USUARIOS WHERE Email = 'admin@rostipollos.com')
BEGIN
    INSERT INTO APP_USUARIOS (Email, Nombre, Activo)
    VALUES ('admin@rostipollos.com', 'Administrador', 1);
    
    -- Give admin access to all stores
    DECLARE @adminId INT = SCOPE_IDENTITY();
    
    INSERT INTO APP_USUARIO_ALMACEN (UsuarioId, Local)
    SELECT @adminId, Local 
    FROM (SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE AÑO = 2026) AS stores;
    
    PRINT 'Default admin user created with access to all stores.';
END
GO

PRINT 'Security tables setup complete.';
