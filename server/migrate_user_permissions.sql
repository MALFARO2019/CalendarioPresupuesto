-- ==========================================
-- Migration Script: Add User Permissions
-- ==========================================
-- This script adds permission fields to the USUARIOS table
-- and creates the superadmin user

USE RP_BI_RESUMENES;
GO

-- Add AccesoTendencia column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') AND name = 'AccesoTendencia')
BEGIN
    ALTER TABLE [dbo].[USUARIOS]
    ADD [AccesoTendencia] BIT NOT NULL DEFAULT 0;
    PRINT 'Column AccesoTendencia added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoTendencia already exists';
END
GO

-- Add AccesoEventos column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') AND name = 'AccesoEventos')
BEGIN
    ALTER TABLE [dbo].[USUARIOS]
    ADD [AccesoEventos] BIT NOT NULL DEFAULT 0;
    PRINT 'Column AccesoEventos added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoEventos already exists';
END
GO

-- Add EsAdmin column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') AND name = 'EsAdmin')
BEGIN
    ALTER TABLE [dbo].[USUARIOS]
    ADD [EsAdmin] BIT NOT NULL DEFAULT 0;
    PRINT 'Column EsAdmin added successfully';
END
ELSE
BEGIN
    PRINT 'Column EsAdmin already exists';
END
GO

-- Add EsProtegido column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') AND name = 'EsProtegido')
BEGIN
    ALTER TABLE [dbo].[USUARIOS]
    ADD [EsProtegido] BIT NOT NULL DEFAULT 0;
    PRINT 'Column EsProtegido added successfully';
END
ELSE
BEGIN
    PRINT 'Column EsProtegido already exists';
END
GO

-- Create or update superadmin user
IF NOT EXISTS (SELECT * FROM USUARIOS WHERE Email = 'soporte@rostipolloscr.com')
BEGIN
    INSERT INTO USUARIOS (Email, Nombre, Clave, Almacenes, Activo, AccesoTendencia, AccesoEventos, EsAdmin, EsProtegido)
    VALUES ('soporte@rostipolloscr.com', 'Soporte Técnico', 'R0st1p017', NULL, 1, 1, 1, 1, 1);
    PRINT 'Superadmin user created successfully';
END
ELSE
BEGIN
    UPDATE USUARIOS
    SET Nombre = 'Soporte Técnico',
        Clave = 'R0st1p017',
        Activo = 1,
        AccesoTendencia = 1,
        AccesoEventos = 1,
        EsAdmin = 1,
        EsProtegido = 1
    WHERE Email = 'soporte@rostipolloscr.com';
    PRINT 'Superadmin user updated successfully';
END
GO

PRINT '✅ Migration completed successfully';
GO
