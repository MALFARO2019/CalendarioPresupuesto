-- Migration: User Profiles System
-- Description: Add profiles table and profile assignment to users
-- Date: 2026-02-17

-- ============================================
-- 1. Create APP_PERFILES table
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_PERFILES' AND xtype='U')
BEGIN
    CREATE TABLE APP_PERFILES (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Nombre NVARCHAR(100) NOT NULL UNIQUE,
        Descripcion NVARCHAR(500) NULL,
        
        -- Permisos de vistas especiales
        AccesoTendencia BIT NOT NULL DEFAULT 0,
        AccesoTactica BIT NOT NULL DEFAULT 0,
        AccesoEventos BIT NOT NULL DEFAULT 0,
        
        -- Permisos de módulos KPI
        AccesoPresupuesto BIT NOT NULL DEFAULT 1,
        AccesoTiempos BIT NOT NULL DEFAULT 0,
        AccesoEvaluaciones BIT NOT NULL DEFAULT 0,
        AccesoInventarios BIT NOT NULL DEFAULT 0,
        
        -- Permisos administrativos
        EsAdmin BIT NOT NULL DEFAULT 0,
        PermitirEnvioClave BIT NOT NULL DEFAULT 1,
        
        -- Metadata
        FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
        FechaModificacion DATETIME NULL,
        UsuarioCreador NVARCHAR(255) NULL
    );
    
    PRINT '✓ Tabla APP_PERFILES creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla APP_PERFILES ya existe';
END
GO

-- ============================================
-- 2. Add PerfilId column to APP_USUARIOS
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'PerfilId')
BEGIN
    ALTER TABLE APP_USUARIOS ADD PerfilId INT NULL;
    
    ALTER TABLE APP_USUARIOS ADD CONSTRAINT FK_Usuario_Perfil 
        FOREIGN KEY (PerfilId) REFERENCES APP_PERFILES(Id) ON DELETE SET NULL;
    
    PRINT '✓ Columna PerfilId agregada a APP_USUARIOS';
END
ELSE
BEGIN
    PRINT '⚠ Columna PerfilId ya existe en APP_USUARIOS';
END
GO

-- ============================================
-- 3. Create default profiles
-- ============================================
IF NOT EXISTS (SELECT * FROM APP_PERFILES WHERE Nombre = 'Administrador')
BEGIN
    INSERT INTO APP_PERFILES (
        Nombre, 
        Descripcion, 
        AccesoTendencia, 
        AccesoTactica, 
        AccesoEventos, 
        AccesoPresupuesto, 
        AccesoTiempos, 
        AccesoEvaluaciones, 
        AccesoInventarios, 
        EsAdmin, 
        PermitirEnvioClave,
        UsuarioCreador
    )
    VALUES 
        (
            'Administrador', 
            'Acceso completo a todos los módulos y configuración del sistema', 
            1, 1, 1, 1, 1, 1, 1, 1, 1,
            'Sistema'
        ),
        (
            'Gerente Regional', 
            'Acceso a presupuesto, tendencia y análisis táctico para gestión de múltiples locales', 
            1, 1, 0, 1, 0, 0, 0, 0, 1,
            'Sistema'
        ),
        (
            'Supervisor', 
            'Acceso a presupuesto y gestión de eventos', 
            0, 0, 1, 1, 0, 0, 0, 0, 1,
            'Sistema'
        ),
        (
            'Consulta', 
            'Solo lectura de módulo de presupuesto, sin envío de clave por correo', 
            0, 0, 0, 1, 0, 0, 0, 0, 0,
            'Sistema'
        );
    
    PRINT '✓ Perfiles predeterminados creados';
END
ELSE
BEGIN
    PRINT '⚠ Los perfiles predeterminados ya existen';
END
GO

-- ============================================
-- 4. Create index for better performance
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Usuarios_PerfilId' AND object_id = OBJECT_ID('APP_USUARIOS'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Usuarios_PerfilId ON APP_USUARIOS(PerfilId);
    PRINT '✓ Índice IX_Usuarios_PerfilId creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_Usuarios_PerfilId ya existe';
END
GO

PRINT '========================================';
PRINT 'Migración completada exitosamente';
PRINT '========================================';
