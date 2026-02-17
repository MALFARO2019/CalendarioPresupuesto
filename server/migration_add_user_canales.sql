-- Migration: Add User Canal Filtering
-- This script creates the APP_USUARIO_CANAL table and migrates existing users

-- Step 1: Create APP_USUARIO_CANAL table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIO_CANAL' AND xtype='U')
BEGIN
    CREATE TABLE APP_USUARIO_CANAL (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId INT NOT NULL,
        Canal NVARCHAR(50) NOT NULL,
        CONSTRAINT FK_UsuarioCanal_Usuario FOREIGN KEY (UsuarioId) 
            REFERENCES APP_USUARIOS(Id) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_UsuarioCanal_UsuarioId ON APP_USUARIO_CANAL(UsuarioId);
    
    PRINT '✅ Tabla APP_USUARIO_CANAL creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla APP_USUARIO_CANAL ya existe';
END
GO

-- Step 2: Assign all canales to existing users
-- This ensures backward compatibility - all existing users maintain full access
DECLARE @AllCanales TABLE (Canal NVARCHAR(50));
INSERT INTO @AllCanales VALUES 
    ('Salón'),
    ('Llevar'),
    ('Express'),
    ('AutoPollo'),
    ('UberEats'),
    ('ECommerce'),
    ('WhatsApp');

-- Insert all canales for each existing user that doesn't have canales assigned yet
INSERT INTO APP_USUARIO_CANAL (UsuarioId, Canal)
SELECT u.Id, c.Canal
FROM APP_USUARIOS u
CROSS JOIN @AllCanales c
WHERE NOT EXISTS (
    SELECT 1 FROM APP_USUARIO_CANAL uc 
    WHERE uc.UsuarioId = u.Id AND uc.Canal = c.Canal
);

DECLARE @RowCount INT = @@ROWCOUNT;
PRINT '✅ ' + CAST(@RowCount AS VARCHAR) + ' registros de canal asignados a usuarios existentes';
GO

PRINT '✅ Migración completada exitosamente';
