-- ==========================================
-- Migration Script: Add Module Permissions
-- ==========================================
-- This script adds permission fields for each module to the APP_USUARIOS table
-- Modules: Presupuesto, Tiempos, Evaluaciones, Inventarios

USE RP_BI_RESUMENES;
GO

-- Add AccesoPresupuesto column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoPresupuesto')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS]
    ADD [AccesoPresupuesto] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuesto added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoPresupuesto already exists';
END
GO

-- Add AccesoTiempos column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoTiempos')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS]
    ADD [AccesoTiempos] BIT NOT NULL DEFAULT 0;
    PRINT 'Column AccesoTiempos added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoTiempos already exists';
END
GO

-- Add AccesoEvaluaciones column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoEvaluaciones')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS]
    ADD [AccesoEvaluaciones] BIT NOT NULL DEFAULT 0;
    PRINT 'Column AccesoEvaluaciones added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoEvaluaciones already exists';
END
GO

-- Add AccesoInventarios column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoInventarios')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS]
    ADD [AccesoInventarios] BIT NOT NULL DEFAULT 0;
    PRINT 'Column AccesoInventarios added successfully';
END
ELSE
BEGIN
    PRINT 'Column AccesoInventarios already exists';
END
GO

-- Update existing active users to have Presupuesto access by default (backward compatibility)
UPDATE [dbo].[APP_USUARIOS]
SET [AccesoPresupuesto] = 1
WHERE [Activo] = 1;
PRINT 'Updated existing users to have Presupuesto access';
GO

-- Update superadmin to have all module permissions
UPDATE [dbo].[APP_USUARIOS]
SET [AccesoPresupuesto] = 1,
    [AccesoTiempos] = 1,
    [AccesoEvaluaciones] = 1,
    [AccesoInventarios] = 1
WHERE [Email] = 'soporte@rostipolloscr.com';
PRINT 'Updated superadmin with all module permissions';
GO

PRINT '✅ Migration completed successfully';
GO
