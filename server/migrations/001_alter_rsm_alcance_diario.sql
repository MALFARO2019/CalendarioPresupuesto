-- ==========================================
-- Migration 001: ALTER RSM_ALCANCE_DIARIO
-- ==========================================
-- Adds NombrePresupuesto column and removes legacy Llave_* columns
-- Target: RP_BI_RESUMENES on 10.29.1.14
-- Date: 2026-02-20
-- ==========================================

USE RP_BI_RESUMENES;
GO

-- ==========================================
-- 1. Add NombrePresupuesto to RSM_ALCANCE_DIARIO
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO]') AND name = 'NombrePresupuesto')
BEGIN
    ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO] ADD [NombrePresupuesto] NVARCHAR(100) NULL DEFAULT 'Presupuesto 2026';
    PRINT 'Column NombrePresupuesto added to RSM_ALCANCE_DIARIO';
END
GO

-- ==========================================
-- 2. Remove legacy Llave_* columns from RSM_ALCANCE_DIARIO
-- ==========================================
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO]') AND name = 'Llave_Presupuesto')
BEGIN
    ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO] DROP COLUMN [Llave_Presupuesto];
    PRINT 'Column Llave_Presupuesto dropped from RSM_ALCANCE_DIARIO';
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO]') AND name = 'Llave_AñoAnterior')
BEGIN
    ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO] DROP COLUMN [Llave_AñoAnterior];
    PRINT 'Column Llave_AñoAnterior dropped from RSM_ALCANCE_DIARIO';
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO]') AND name = 'Llave_AnoAnterior_Ajustado')
BEGIN
    ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO] DROP COLUMN [Llave_AnoAnterior_Ajustado];
    PRINT 'Column Llave_AnoAnterior_Ajustado dropped from RSM_ALCANCE_DIARIO';
END
GO

-- ==========================================
-- 3. Apply same changes to RSM_ALCANCE_DIARIO_TEST (dev table)
-- ==========================================
IF OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO_TEST]', N'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO_TEST]') AND name = 'NombrePresupuesto')
    BEGIN
        ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO_TEST] ADD [NombrePresupuesto] NVARCHAR(100) NULL DEFAULT 'Presupuesto 2026';
        PRINT 'Column NombrePresupuesto added to RSM_ALCANCE_DIARIO_TEST';
    END

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO_TEST]') AND name = 'Llave_Presupuesto')
    BEGIN
        ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO_TEST] DROP COLUMN [Llave_Presupuesto];
        PRINT 'Column Llave_Presupuesto dropped from RSM_ALCANCE_DIARIO_TEST';
    END

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO_TEST]') AND name = 'Llave_AñoAnterior')
    BEGIN
        ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO_TEST] DROP COLUMN [Llave_AñoAnterior];
        PRINT 'Column Llave_AñoAnterior dropped from RSM_ALCANCE_DIARIO_TEST';
    END

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RSM_ALCANCE_DIARIO_TEST]') AND name = 'Llave_AnoAnterior_Ajustado')
    BEGIN
        ALTER TABLE [dbo].[RSM_ALCANCE_DIARIO_TEST] DROP COLUMN [Llave_AnoAnterior_Ajustado];
        PRINT 'Column Llave_AnoAnterior_Ajustado dropped from RSM_ALCANCE_DIARIO_TEST';
    END
END
GO

-- ==========================================
-- 4. Update existing rows to set NombrePresupuesto
-- ==========================================
UPDATE [dbo].[RSM_ALCANCE_DIARIO]
SET NombrePresupuesto = 'Presupuesto 2026'
WHERE NombrePresupuesto IS NULL;
PRINT 'Existing rows updated with NombrePresupuesto = Presupuesto 2026';
GO

PRINT '✅ Migration 001 completed successfully';
GO
