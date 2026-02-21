-- ==========================================
-- Migration 002: CREATE Modelo Presupuesto Tables
-- ==========================================
-- Creates 5 new tables for the budget model module:
--   1. MODELO_PRESUPUESTO_CONFIG
--   2. MODELO_PRESUPUESTO_VERSIONES
--   3. MODELO_PRESUPUESTO_AJUSTES
--   4. MODELO_PRESUPUESTO_BITACORA
--   5. DIM_MAPEO_PRESUPUESTO_LOCALES
-- Target: RP_BI_RESUMENES on 10.29.1.14
-- Date: 2026-02-20
-- ==========================================

USE RP_BI_RESUMENES;
GO

-- ==========================================
-- Table 1: MODELO_PRESUPUESTO_CONFIG
-- Stores configuration for each budget model
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_CONFIG]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[MODELO_PRESUPUESTO_CONFIG] (
        [Id]                  INT IDENTITY(1,1) PRIMARY KEY,
        [NombrePresupuesto]   NVARCHAR(100)  NOT NULL,
        [AnoModelo]           INT            NOT NULL,
        [TablaDestino]        NVARCHAR(100)  NOT NULL DEFAULT 'RSM_ALCANCE_DIARIO',
        [HoraCalculo]         NVARCHAR(5)    NOT NULL DEFAULT '06:00',
        [UltimoCalculo]       DATETIME       NULL,
        [UltimoUsuario]       NVARCHAR(200)  NULL,
        [Activo]              BIT            NOT NULL DEFAULT 1,
        [FechaCreacion]       DATETIME       NOT NULL DEFAULT GETDATE(),
        [FechaModificacion]   DATETIME       NOT NULL DEFAULT GETDATE(),

        CONSTRAINT [UQ_CONFIG_Nombre] UNIQUE ([NombrePresupuesto])
    );
    PRINT 'Table MODELO_PRESUPUESTO_CONFIG created';

    -- Insert default config
    INSERT INTO [dbo].[MODELO_PRESUPUESTO_CONFIG]
        ([NombrePresupuesto], [AnoModelo], [TablaDestino], [HoraCalculo])
    VALUES
        ('Presupuesto 2026', 2026, 'RSM_ALCANCE_DIARIO', '06:00');
    PRINT 'Default config inserted: Presupuesto 2026';
END
GO

-- ==========================================
-- Table 2: MODELO_PRESUPUESTO_VERSIONES
-- Tracks snapshot versions of the budget data
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_VERSIONES]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[MODELO_PRESUPUESTO_VERSIONES] (
        [Id]                  INT IDENTITY(1,1) PRIMARY KEY,
        [NombrePresupuesto]   NVARCHAR(100)  NOT NULL,
        [NumeroVersion]       INT            NOT NULL,
        [NombreTabla]         NVARCHAR(200)  NOT NULL,
        [FechaCreacion]       DATETIME       NOT NULL DEFAULT GETDATE(),
        [Usuario]             NVARCHAR(200)  NOT NULL,
        [Origen]              NVARCHAR(50)   NOT NULL DEFAULT 'Manual',  -- Job / Manual / Restore
        [TotalRegistros]      INT            NULL,
        [Notas]               NVARCHAR(500)  NULL,

        CONSTRAINT [UQ_VERSION_Nombre_Num] UNIQUE ([NombrePresupuesto], [NumeroVersion])
    );
    PRINT 'Table MODELO_PRESUPUESTO_VERSIONES created';
END
GO

-- ==========================================
-- Table 3: MODELO_PRESUPUESTO_AJUSTES
-- Records manual adjustments applied to the budget
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_AJUSTES]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[MODELO_PRESUPUESTO_AJUSTES] (
        [Id]                    INT IDENTITY(1,1) PRIMARY KEY,
        [NombrePresupuesto]     NVARCHAR(100)  NOT NULL,
        [CodAlmacen]            NVARCHAR(10)   NOT NULL,
        [Mes]                   INT            NOT NULL,
        [Dia]                   INT            NULL,          -- NULL = applies to entire month
        [Canal]                 NVARCHAR(200)  NOT NULL,
        [Tipo]                  NVARCHAR(100)  NOT NULL,      -- 'Ventas' or 'Transacciones'
        [MetodoAjuste]          NVARCHAR(50)   NOT NULL,      -- 'Porcentaje' / 'MontoAbsoluto' / 'Factor'
        [ValorAjuste]           DECIMAL(18,4)  NOT NULL,
        [MetodoDistribucion]    NVARCHAR(50)   NOT NULL DEFAULT 'Mes',  -- 'Mes' / 'Semana' / 'TipoDia'
        [Motivo]                NVARCHAR(500)  NULL,
        [FechaAplicacion]       DATETIME       NOT NULL DEFAULT GETDATE(),
        [Usuario]               NVARCHAR(200)  NOT NULL,
        [Activo]                BIT            NOT NULL DEFAULT 1,

        INDEX [IX_AJUSTES_Presup_Almacen_Mes] NONCLUSTERED ([NombrePresupuesto], [CodAlmacen], [Mes])
    );
    PRINT 'Table MODELO_PRESUPUESTO_AJUSTES created';
END
GO

-- ==========================================
-- Table 4: MODELO_PRESUPUESTO_BITACORA
-- Audit log for all changes to the budget model
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_BITACORA]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[MODELO_PRESUPUESTO_BITACORA] (
        [Id]                  INT IDENTITY(1,1) PRIMARY KEY,
        [NombrePresupuesto]   NVARCHAR(100)  NOT NULL,
        [Usuario]             NVARCHAR(200)  NOT NULL,
        [FechaHora]           DATETIME       NOT NULL DEFAULT GETDATE(),
        [Accion]              NVARCHAR(100)  NOT NULL,       -- 'Ajuste' / 'Recalculo' / 'Restore' / 'EditConsolidado' / 'ConfigChange'
        [CodAlmacen]          NVARCHAR(10)   NULL,           -- NULL = global/all stores
        [Local]               NVARCHAR(255)  NULL,
        [Mes]                 INT            NULL,
        [Canal]               NVARCHAR(200)  NULL,
        [Tipo]                NVARCHAR(100)  NULL,
        [ValorAnterior]       NVARCHAR(500)  NULL,           -- NVARCHAR to store various value types
        [ValorNuevo]          NVARCHAR(500)  NULL,
        [Motivo]              NVARCHAR(500)  NULL,
        [Origen]              NVARCHAR(50)   NOT NULL DEFAULT 'Manual',  -- 'Manual' / 'Recalculo' / 'Restore' / 'Job'
        [Detalle]             NVARCHAR(MAX)  NULL,            -- JSON with extra context

        INDEX [IX_BITACORA_Presup_FechaHora] NONCLUSTERED ([NombrePresupuesto], [FechaHora] DESC),
        INDEX [IX_BITACORA_Usuario] NONCLUSTERED ([Usuario])
    );
    PRINT 'Table MODELO_PRESUPUESTO_BITACORA created';
END
GO

-- ==========================================
-- Table 5: DIM_MAPEO_PRESUPUESTO_LOCALES
-- Maps new stores (no historical data) to reference stores
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DIM_MAPEO_PRESUPUESTO_LOCALES]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[DIM_MAPEO_PRESUPUESTO_LOCALES] (
        [Id]                      INT IDENTITY(1,1) PRIMARY KEY,
        [CodAlmacenNuevo]         NVARCHAR(10)   NOT NULL,
        [NombreAlmacenNuevo]      NVARCHAR(255)  NULL,
        [CodAlmacenReferencia]    NVARCHAR(10)   NOT NULL,
        [NombreAlmacenReferencia] NVARCHAR(255)  NULL,
        [Canal]                   NVARCHAR(200)  NULL,        -- NULL = all channels
        [NombrePresupuesto]       NVARCHAR(100)  NOT NULL,
        [FechaCreacion]           DATETIME       NOT NULL DEFAULT GETDATE(),
        [Usuario]                 NVARCHAR(200)  NULL,
        [Activo]                  BIT            NOT NULL DEFAULT 1,

        CONSTRAINT [UQ_MAPEO_Nuevo_Ref_Canal] UNIQUE ([CodAlmacenNuevo], [CodAlmacenReferencia], [Canal], [NombrePresupuesto])
    );
    PRINT 'Table DIM_MAPEO_PRESUPUESTO_LOCALES created';
END
GO

PRINT '✅ Migration 002 completed successfully — 5 tables created';
GO
