-- ==========================================
-- Migration 003: Modelo Presupuesto Permissions
-- ==========================================
-- Adds 11 permission columns to APP_USUARIOS and APP_PERFILES:
--   Access:  accesoModeloPresupuesto
--   Views:   verConfigModelo, verConsolidadoMensual, verAjustePresupuesto,
--            verVersiones, verBitacora, verReferencias
--   Actions: editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones
-- Target: RP_BI_RESUMENES on 10.29.1.14
-- Date: 2026-02-20
-- ==========================================

USE RP_BI_RESUMENES;
GO

-- ==========================================
-- 1. APP_USUARIOS — Access
-- ==========================================
PRINT 'Adding Modelo Presupuesto permissions to APP_USUARIOS...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'accesoModeloPresupuesto')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [accesoModeloPresupuesto] BIT NOT NULL DEFAULT 0;
    PRINT '  + accesoModeloPresupuesto';
END
GO

-- Views
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verConfigModelo')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verConfigModelo] BIT NOT NULL DEFAULT 0;
    PRINT '  + verConfigModelo';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verConsolidadoMensual')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verConsolidadoMensual] BIT NOT NULL DEFAULT 0;
    PRINT '  + verConsolidadoMensual';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verAjustePresupuesto')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verAjustePresupuesto] BIT NOT NULL DEFAULT 0;
    PRINT '  + verAjustePresupuesto';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verVersiones')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verVersiones] BIT NOT NULL DEFAULT 0;
    PRINT '  + verVersiones';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verBitacora')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verBitacora] BIT NOT NULL DEFAULT 0;
    PRINT '  + verBitacora';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'verReferencias')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [verReferencias] BIT NOT NULL DEFAULT 0;
    PRINT '  + verReferencias';
END
GO

-- Actions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'editarConsolidado')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [editarConsolidado] BIT NOT NULL DEFAULT 0;
    PRINT '  + editarConsolidado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'ejecutarRecalculo')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [ejecutarRecalculo] BIT NOT NULL DEFAULT 0;
    PRINT '  + ejecutarRecalculo';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'ajustarCurva')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [ajustarCurva] BIT NOT NULL DEFAULT 0;
    PRINT '  + ajustarCurva';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'restaurarVersiones')
BEGIN
    ALTER TABLE [dbo].[APP_USUARIOS] ADD [restaurarVersiones] BIT NOT NULL DEFAULT 0;
    PRINT '  + restaurarVersiones';
END
GO

-- ==========================================
-- 2. APP_PERFILES — Same 11 columns
-- ==========================================
PRINT 'Adding Modelo Presupuesto permissions to APP_PERFILES...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'accesoModeloPresupuesto')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [accesoModeloPresupuesto] BIT NOT NULL DEFAULT 0;
    PRINT '  + accesoModeloPresupuesto';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verConfigModelo')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verConfigModelo] BIT NOT NULL DEFAULT 0;
    PRINT '  + verConfigModelo';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verConsolidadoMensual')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verConsolidadoMensual] BIT NOT NULL DEFAULT 0;
    PRINT '  + verConsolidadoMensual';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verAjustePresupuesto')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verAjustePresupuesto] BIT NOT NULL DEFAULT 0;
    PRINT '  + verAjustePresupuesto';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verVersiones')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verVersiones] BIT NOT NULL DEFAULT 0;
    PRINT '  + verVersiones';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verBitacora')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verBitacora] BIT NOT NULL DEFAULT 0;
    PRINT '  + verBitacora';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'verReferencias')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [verReferencias] BIT NOT NULL DEFAULT 0;
    PRINT '  + verReferencias';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'editarConsolidado')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [editarConsolidado] BIT NOT NULL DEFAULT 0;
    PRINT '  + editarConsolidado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'ejecutarRecalculo')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [ejecutarRecalculo] BIT NOT NULL DEFAULT 0;
    PRINT '  + ejecutarRecalculo';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'ajustarCurva')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [ajustarCurva] BIT NOT NULL DEFAULT 0;
    PRINT '  + ajustarCurva';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'restaurarVersiones')
BEGIN
    ALTER TABLE [dbo].[APP_PERFILES] ADD [restaurarVersiones] BIT NOT NULL DEFAULT 0;
    PRINT '  + restaurarVersiones';
END
GO

-- ==========================================
-- 3. Grant all permissions to superadmin
-- ==========================================
UPDATE [dbo].[APP_USUARIOS]
SET 
    [accesoModeloPresupuesto] = 1,
    [verConfigModelo] = 1,
    [verConsolidadoMensual] = 1,
    [verAjustePresupuesto] = 1,
    [verVersiones] = 1,
    [verBitacora] = 1,
    [verReferencias] = 1,
    [editarConsolidado] = 1,
    [ejecutarRecalculo] = 1,
    [ajustarCurva] = 1,
    [restaurarVersiones] = 1
WHERE [Email] = 'soporte@rostipolloscr.com';
PRINT 'Superadmin granted all Modelo Presupuesto permissions';
GO

-- ==========================================
-- 4. Create Superadmin profile if it exists
-- ==========================================
IF EXISTS (SELECT * FROM [dbo].[APP_PERFILES] WHERE [Nombre] = 'Superadmin')
BEGIN
    UPDATE [dbo].[APP_PERFILES]
    SET 
        [accesoModeloPresupuesto] = 1,
        [verConfigModelo] = 1,
        [verConsolidadoMensual] = 1,
        [verAjustePresupuesto] = 1,
        [verVersiones] = 1,
        [verBitacora] = 1,
        [verReferencias] = 1,
        [editarConsolidado] = 1,
        [ejecutarRecalculo] = 1,
        [ajustarCurva] = 1,
        [restaurarVersiones] = 1
    WHERE [Nombre] = 'Superadmin';
    PRINT 'Superadmin profile granted all Modelo Presupuesto permissions';
END
GO

PRINT '✅ Migration 003 completed successfully — 11 permission columns added to APP_USUARIOS and APP_PERFILES';
GO
