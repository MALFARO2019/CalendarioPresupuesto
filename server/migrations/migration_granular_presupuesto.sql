-- ==========================================
-- Migration Script: Granular Presupuesto Permissions
-- ==========================================
-- This script adds granular permission fields for Presupuesto module to APP_USUARIOS and APP_PERFILES
-- New Permissions:
-- 1. AccesoPresupuestoMensual (Mensual View)
-- 2. AccesoPresupuestoAnual (Anual View)
-- 3. AccesoPresupuestoRangos (Rangos View)

USE RP_BI_RESUMENES;
GO

-- 1. Update APP_USUARIOS table
PRINT 'Updating APP_USUARIOS table...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoPresupuestoMensual')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [AccesoPresupuestoMensual] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoMensual added to APP_USUARIOS';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoPresupuestoAnual')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [AccesoPresupuestoAnual] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoAnual added to APP_USUARIOS';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'AccesoPresupuestoRangos')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [AccesoPresupuestoRangos] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoRangos added to APP_USUARIOS';
END
GO

-- 2. Update APP_PERFILES table
PRINT 'Updating APP_PERFILES table...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'AccesoPresupuestoMensual')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [AccesoPresupuestoMensual] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoMensual added to APP_PERFILES';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'AccesoPresupuestoAnual')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [AccesoPresupuestoAnual] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoAnual added to APP_PERFILES';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'AccesoPresupuestoRangos')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [AccesoPresupuestoRangos] BIT NOT NULL DEFAULT 1;
    PRINT 'Column AccesoPresupuestoRangos added to APP_PERFILES';
END
GO

-- 3. Update existing Superadmin to have all permissions (just in case)
UPDATE [dbo].[APP_USUARIOS]
SET 
    [AccesoPresupuestoMensual] = 1,
    [AccesoPresupuestoAnual] = 1,
    [AccesoPresupuestoRangos] = 1
WHERE [Email] = 'soporte@rostipolloscr.com';
PRINT 'Superadmin permissions updated';
GO

PRINT '✅ Migration completed successfully';
GO
