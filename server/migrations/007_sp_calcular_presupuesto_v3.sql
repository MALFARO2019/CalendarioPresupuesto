-- ==========================================
-- SP_CALCULAR_PRESUPUESTO  v3 – Rewrite
-- ==========================================
-- Incorporates proven logic from SP_GENERAR_PRESUPUESTO_DIARIO:
--   1. Occurrence-based weekday mapping (1st Monday→1st Monday)
--   2. Event handling with priority (Canal + GrupoAlmacen)
--   3. AG event redistribution (24/25/26) with safe proportional distribution
--   4. Consolidado validation
--   5. Llave columns for traceability
-- Keeps project integration: MODELO_PRESUPUESTO_CONFIG, versioning, adjustments
-- ==========================================

USE RP_BI_RESUMENES;
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SP_CALCULAR_PRESUPUESTO]') AND type = 'P')
    DROP PROCEDURE [dbo].[SP_CALCULAR_PRESUPUESTO];
GO

CREATE PROCEDURE [dbo].[SP_CALCULAR_PRESUPUESTO]
    @NombrePresupuesto  NVARCHAR(100) = NULL,
    @TablaDestino       NVARCHAR(100) = NULL,
    @Usuario            NVARCHAR(200) = 'JOB',
    @CodAlmacen         NVARCHAR(10)  = NULL,
    @Mes                INT           = NULL,
    @CrearVersion       BIT           = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET DATEFIRST 1; -- Monday=1

    -- ============================================
    -- 0. RESOLVE CONFIG
    -- ============================================
    IF @NombrePresupuesto IS NULL OR @TablaDestino IS NULL
    BEGIN
        SELECT TOP 1
            @NombrePresupuesto = ISNULL(@NombrePresupuesto, NombrePresupuesto),
            @TablaDestino      = ISNULL(@TablaDestino, TablaDestino)
        FROM MODELO_PRESUPUESTO_CONFIG
        WHERE Activo = 1
        ORDER BY Id;
    END

    IF @NombrePresupuesto IS NULL
    BEGIN
        RAISERROR('No active budget configuration found', 16, 1);
        RETURN;
    END

    DECLARE @AnoModelo INT;
    SELECT @AnoModelo = AnoModelo FROM MODELO_PRESUPUESTO_CONFIG WHERE NombrePresupuesto = @NombrePresupuesto;
    IF @AnoModelo IS NULL SET @AnoModelo = YEAR(GETDATE());

    DECLARE @AnoAnterior INT = @AnoModelo - 1;
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @Hoy DATE = CAST(GETDATE() AS DATE);
    IF @Hoy < DATEFROMPARTS(@AnoModelo,1,1) SET @Hoy = DATEFROMPARTS(@AnoModelo,1,1);
    IF @Hoy > DATEFROMPARTS(@AnoModelo,12,31) SET @Hoy = DATEFROMPARTS(@AnoModelo,12,31);

    DECLARE @NoLockHint NVARCHAR(20) = N' WITH (NOLOCK)';

    -- ============================================
    -- 1. CREATE VERSION SNAPSHOT
    -- ============================================
    IF @CrearVersion = 1 AND @CodAlmacen IS NULL AND @Mes IS NULL
    BEGIN
        BEGIN TRY
            DECLARE @OrigenCalc NVARCHAR(50) = CASE WHEN @Usuario = 'JOB' THEN 'Job' ELSE 'Manual' END;
            EXEC SP_VERSION_PRESUPUESTO
                @NombrePresupuesto = @NombrePresupuesto,
                @TablaDestino      = @TablaDestino,
                @Usuario           = @Usuario,
                @Origen            = @OrigenCalc,
                @Modo              = 'CREAR',
                @Notas             = 'Pre-calculation snapshot';
        END TRY
        BEGIN CATCH
            -- Continue even if versioning fails
            PRINT 'Warning: Version snapshot failed: ' + ERROR_MESSAGE();
        END CATCH
    END

    BEGIN TRY
    BEGIN TRANSACTION;

    -- ============================================
    -- 2. CHANNELS
    -- ============================================
    IF OBJECT_ID('tempdb..#Canales') IS NOT NULL DROP TABLE #Canales;
    CREATE TABLE #Canales(Canal NVARCHAR(200) NOT NULL PRIMARY KEY);
    INSERT INTO #Canales VALUES (N'AutoPollo'),(N'ECommerce'),(N'Express'),(N'Llevar'),(N'Salón'),(N'UberEats');

    -- ============================================
    -- 3. LOAD CONSOLIDADO MENSUAL
    -- ============================================
    IF OBJECT_ID('tempdb..#PresuMensual') IS NOT NULL DROP TABLE #PresuMensual;
    CREATE TABLE #PresuMensual(
        Mes INT NOT NULL, Tipo NVARCHAR(100) NOT NULL,
        Restaurante NVARCHAR(255) NULL, CodAlmacen NVARCHAR(10) NOT NULL,
        Canal NVARCHAR(200) NOT NULL, PresupuestoMes DECIMAL(19,6) NOT NULL
    );

    INSERT INTO #PresuMensual(Mes,Tipo,Restaurante,CodAlmacen,Canal,PresupuestoMes)
    SELECT cm.Mes,
        CASE WHEN UPPER(LTRIM(RTRIM(cm.Tipo))) IN (N'VENTA',N'VENTAS') THEN N'Ventas'
             WHEN UPPER(LTRIM(RTRIM(cm.Tipo))) IN (N'TRANSACCIONES',N'TRANSACCION') THEN N'Transacciones'
        END,
        MAX(cm.RESTAURANTE), cm.CodAlmacen, v.Canal,
        SUM(ISNULL(v.Monto, 0))
    FROM KpisRosti_Consolidado_Mensual cm
    CROSS APPLY (VALUES
        (N'Salón', cm.SALON),(N'Llevar', cm.LLEVAR),(N'AutoPollo', cm.AUTO),
        (N'Express', cm.EXPRESS),(N'ECommerce', cm.ECOMMERCE),(N'UberEats', cm.UBEREATS)
    ) v(Canal, Monto)
    WHERE cm.Ano = @AnoModelo
      AND UPPER(LTRIM(RTRIM(cm.Tipo))) IN (N'VENTA',N'VENTAS',N'TRANSACCIONES',N'TRANSACCION')
      AND (@Mes IS NULL OR cm.Mes = @Mes)
      AND (@CodAlmacen IS NULL OR cm.CodAlmacen = @CodAlmacen)
    GROUP BY cm.Mes, CASE WHEN UPPER(LTRIM(RTRIM(cm.Tipo))) IN (N'VENTA',N'VENTAS') THEN N'Ventas'
             WHEN UPPER(LTRIM(RTRIM(cm.Tipo))) IN (N'TRANSACCIONES',N'TRANSACCION') THEN N'Transacciones' END,
        cm.CodAlmacen, v.Canal;

    IF NOT EXISTS (SELECT 1 FROM #PresuMensual)
    BEGIN
        RAISERROR('No consolidado data found for the requested scope.', 16, 1);
        RETURN;
    END

    -- Scope stores
    IF OBJECT_ID('tempdb..#Cods') IS NOT NULL DROP TABLE #Cods;
    CREATE TABLE #Cods(CodAlmacen NVARCHAR(10) NOT NULL PRIMARY KEY);
    INSERT INTO #Cods SELECT DISTINCT CodAlmacen FROM #PresuMensual;

    -- ============================================
    -- 4. GRUPO ALMACEN MEMBERS (for events)
    -- ============================================
    IF OBJECT_ID('tempdb..#GrupoMiembros') IS NOT NULL DROP TABLE #GrupoMiembros;
    CREATE TABLE #GrupoMiembros(IDGRUPO INT NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL, PRIMARY KEY(IDGRUPO,CodAlmacen));

    BEGIN TRY
        INSERT INTO #GrupoMiembros(IDGRUPO,CodAlmacen)
        SELECT cab.IDGRUPO, LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
        FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
        JOIN ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN lin WITH (NOLOCK) ON lin.IDGRUPO = cab.IDGRUPO
        WHERE cab.CODVISIBLE = 20;
    END TRY
    BEGIN CATCH
        BEGIN TRY
            INSERT INTO #GrupoMiembros(IDGRUPO,CodAlmacen)
            SELECT cab.IDGRUPO, LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
            FROM dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
            JOIN dbo.GRUPOSALMACENLIN lin WITH (NOLOCK) ON lin.IDGRUPO = cab.IDGRUPO
            WHERE cab.CODVISIBLE = 20;
        END TRY
        BEGIN CATCH
            -- No group tables available, continue without groups
            PRINT 'Warning: Group tables not available';
        END CATCH
    END CATCH

    DELETE gm FROM #GrupoMiembros gm WHERE NOT EXISTS (SELECT 1 FROM #Cods c WHERE c.CodAlmacen = gm.CodAlmacen);

    -- ============================================
    -- 5. CALENDARS + OCCURRENCE-BASED MAPPING
    -- ============================================
    IF OBJECT_ID('tempdb..#CalBase') IS NOT NULL DROP TABLE #CalBase;
    IF OBJECT_ID('tempdb..#CalTgt') IS NOT NULL DROP TABLE #CalTgt;

    CREATE TABLE #CalBase(Fecha DATE NOT NULL PRIMARY KEY, Mes INT NOT NULL, IdDia INT NOT NULL, Occur INT NOT NULL);
    CREATE TABLE #CalTgt(Fecha DATE NOT NULL PRIMARY KEY, Mes INT NOT NULL, IdDia INT NOT NULL, Occur INT NOT NULL);

    ;WITH N AS (SELECT TOP(400) ROW_NUMBER() OVER (ORDER BY (SELECT NULL))-1 AS n FROM sys.all_objects)
    INSERT INTO #CalBase(Fecha,Mes,IdDia,Occur)
    SELECT d.F, MONTH(d.F), DATEPART(WEEKDAY,d.F),
           ROW_NUMBER() OVER (PARTITION BY MONTH(d.F),DATEPART(WEEKDAY,d.F) ORDER BY d.F)
    FROM (SELECT DATEADD(DAY,n.n,DATEFROMPARTS(@AnoAnterior,1,1)) F FROM N n
          WHERE DATEADD(DAY,n.n,DATEFROMPARTS(@AnoAnterior,1,1)) <= DATEFROMPARTS(@AnoAnterior,12,31)
            AND (@Mes IS NULL OR MONTH(DATEADD(DAY,n.n,DATEFROMPARTS(@AnoAnterior,1,1)))=@Mes)) d;

    ;WITH N AS (SELECT TOP(400) ROW_NUMBER() OVER (ORDER BY (SELECT NULL))-1 AS n FROM sys.all_objects)
    INSERT INTO #CalTgt(Fecha,Mes,IdDia,Occur)
    SELECT d.F, MONTH(d.F), DATEPART(WEEKDAY,d.F),
           ROW_NUMBER() OVER (PARTITION BY MONTH(d.F),DATEPART(WEEKDAY,d.F) ORDER BY d.F)
    FROM (SELECT DATEADD(DAY,n.n,DATEFROMPARTS(@AnoModelo,1,1)) F FROM N n
          WHERE DATEADD(DAY,n.n,DATEFROMPARTS(@AnoModelo,1,1)) <= DATEFROMPARTS(@AnoModelo,12,31)
            AND (@Mes IS NULL OR MONTH(DATEADD(DAY,n.n,DATEFROMPARTS(@AnoModelo,1,1)))=@Mes)) d;

    -- Map by occurrence: 1st Monday of Feb 2026 → 1st Monday of Feb 2025
    IF OBJECT_ID('tempdb..#MapBase') IS NOT NULL DROP TABLE #MapBase;
    CREATE TABLE #MapBase(FechaTarget DATE NOT NULL PRIMARY KEY, FechaBase DATE NOT NULL);

    INSERT INTO #MapBase(FechaTarget,FechaBase)
    SELECT t.Fecha, COALESCE(bExact.Fecha, bLast.Fecha)
    FROM #CalTgt t
    LEFT JOIN #CalBase bExact ON bExact.Mes=t.Mes AND bExact.IdDia=t.IdDia AND bExact.Occur=t.Occur
    OUTER APPLY (
        SELECT TOP(1) b2.Fecha FROM #CalBase b2
        WHERE b2.Mes=t.Mes AND b2.IdDia=t.IdDia ORDER BY b2.Occur DESC
    ) bLast;

    -- ============================================
    -- 6. EVENT OVERRIDES (excl. 24/25/26, with Canal+GrupoAlmacen priority)
    -- ============================================
    IF OBJECT_ID('tempdb..#EventOverride') IS NOT NULL DROP TABLE #EventOverride;
    CREATE TABLE #EventOverride(
        CodAlmacen NVARCHAR(10) NOT NULL, Canal NVARCHAR(200) NOT NULL,
        FechaTarget DATE NOT NULL, FechaBase DATE NOT NULL, EsEvento BIT NOT NULL,
        PRIMARY KEY(CodAlmacen,Canal,FechaTarget)
    );

    ;WITH ETarget AS (
        SELECT fT.IDEVENTO,
            FechaTarget = fT.FECHA_EFECTIVA,
            CanalRule = CASE
                WHEN fT.Canal IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))=N'' THEN NULL
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'ECOMMERCE',N'E-COMMERCE') THEN N'ECommerce'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'EXPRESS') THEN N'Express'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'LLEVAR') THEN N'Llevar'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'SALON',N'SALÓN') THEN N'Salón'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
                ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))
            END,
            GrupoAlmacen = fT.GrupoAlmacen,
            Prio = (CASE WHEN fT.GrupoAlmacen IS NULL THEN 0 ELSE 1 END)
                 + (CASE WHEN fT.Canal IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(200),fT.Canal)))=N'' THEN 0 ELSE 2 END)
        FROM dbo.DIM_EVENTOS_FECHAS fT
        WHERE fT.FECHA_EFECTIVA IS NOT NULL
          AND YEAR(fT.FECHA_EFECTIVA)=@AnoModelo
          AND (@Mes IS NULL OR MONTH(fT.FECHA_EFECTIVA)=@Mes)
          AND fT.IDEVENTO NOT IN (24,25,26)
    ),
    EBase AS (
        SELECT eT.*,
            FechaBase = (SELECT TOP(1) fB.FECHA_EFECTIVA FROM dbo.DIM_EVENTOS_FECHAS fB
                WHERE fB.IDEVENTO=eT.IDEVENTO AND fB.FECHA_EFECTIVA IS NOT NULL AND YEAR(fB.FECHA_EFECTIVA)=@AnoAnterior
                ORDER BY CASE WHEN (fB.Canal IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(200),fB.Canal)))=N'') THEN 0 ELSE 1 END,
                         CASE WHEN fB.GrupoAlmacen IS NULL THEN 0 ELSE 1 END)
        FROM ETarget eT
    ),
    ExpandCod AS (
        SELECT e.IDEVENTO,e.FechaTarget,e.FechaBase,e.CanalRule,e.GrupoAlmacen,e.Prio,
            CodAlmacen = CASE WHEN e.GrupoAlmacen IS NULL THEN c.CodAlmacen ELSE gm.CodAlmacen END
        FROM EBase e CROSS JOIN (SELECT CodAlmacen FROM #Cods) c
        LEFT JOIN #GrupoMiembros gm ON gm.IDGRUPO=e.GrupoAlmacen
        WHERE e.FechaBase IS NOT NULL AND (e.GrupoAlmacen IS NULL OR gm.CodAlmacen IS NOT NULL)
    ),
    ExpandCanal AS (
        SELECT CodAlmacen, Canal=CASE WHEN CanalRule IS NULL THEN k.Canal ELSE CanalRule END,
            FechaTarget, FechaBase, Prio
        FROM ExpandCod e CROSS JOIN (SELECT Canal FROM #Canales) k
        WHERE (e.CanalRule IS NULL OR e.CanalRule=k.Canal)
    ),
    Pick AS (
        SELECT *, rn=ROW_NUMBER() OVER (PARTITION BY CodAlmacen,Canal,FechaTarget ORDER BY Prio DESC)
        FROM ExpandCanal
    )
    INSERT INTO #EventOverride(CodAlmacen,Canal,FechaTarget,FechaBase,EsEvento)
    SELECT CodAlmacen,Canal,FechaTarget,FechaBase,CAST(1 AS BIT) FROM Pick WHERE rn=1;

    -- ============================================
    -- 7. FINAL DATE MAP (per CodAlmacen+Canal)
    -- ============================================
    IF OBJECT_ID('tempdb..#MapDates') IS NOT NULL DROP TABLE #MapDates;
    CREATE TABLE #MapDates(
        CodAlmacen NVARCHAR(10) NOT NULL, Canal NVARCHAR(200) NOT NULL,
        FechaTarget DATE NOT NULL, FechaFuente DATE NOT NULL,
        MesTarget INT NOT NULL, IdDia INT NOT NULL, DiaMes INT NOT NULL, EsEvento BIT NOT NULL,
        PRIMARY KEY(CodAlmacen,Canal,FechaTarget)
    );

    INSERT INTO #MapDates
    SELECT c.CodAlmacen, k.Canal, t.Fecha,
        COALESCE(ev.FechaBase, mb.FechaBase), t.Mes, t.IdDia, DAY(t.Fecha),
        CASE WHEN ev.FechaBase IS NOT NULL THEN 1 ELSE 0 END
    FROM #Cods c CROSS JOIN #Canales k
    JOIN #CalTgt t ON 1=1
    JOIN #MapBase mb ON mb.FechaTarget=t.Fecha
    LEFT JOIN #EventOverride ev ON ev.CodAlmacen=c.CodAlmacen AND ev.Canal=k.Canal AND ev.FechaTarget=t.Fecha;

    -- ============================================
    -- 8. BASE YEAR DAILY SALES (for weights)
    -- ============================================
    IF OBJECT_ID('tempdb..#DailyBase') IS NOT NULL DROP TABLE #DailyBase;
    CREATE TABLE #DailyBase(
        Fecha DATE NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL,
        Canal NVARCHAR(200) NOT NULL, Venta DECIMAL(19,6) NOT NULL, Transacciones INT NOT NULL,
        PRIMARY KEY(Fecha,CodAlmacen,Canal)
    );

    INSERT INTO #DailyBase(Fecha,CodAlmacen,Canal,Venta,Transacciones)
    SELECT CAST(v.FECHA AS DATE),
        LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
        CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END COLLATE DATABASE_DEFAULT,
        SUM(ISNULL(TRY_CONVERT(DECIMAL(19,6),v.[VENTAS NETAS]),0)),
        SUM(ISNULL(TRY_CONVERT(INT,v.[Transacciones]),0))
    FROM dbo.BI_VENTAS_ROSTIPOLLOS v WITH (NOLOCK)
    WHERE v.ANO=@AnoAnterior AND (@Mes IS NULL OR v.MES=@Mes)
      AND (@CodAlmacen IS NULL OR v.CODALMACEN=@CodAlmacen)
    GROUP BY CAST(v.FECHA AS DATE), LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
        CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END
    HAVING CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END IS NOT NULL;

    -- Handle reference-mapped stores (new stores without history)
    INSERT INTO #DailyBase(Fecha,CodAlmacen,Canal,Venta,Transacciones)
    SELECT db.Fecha, m.CodAlmacenNuevo, db.Canal, db.Venta, db.Transacciones
    FROM DIM_MAPEO_PRESUPUESTO_LOCALES m
    JOIN #DailyBase db ON db.CodAlmacen=m.CodAlmacenReferencia
    WHERE m.NombrePresupuesto=@NombrePresupuesto AND m.Activo=1
      AND NOT EXISTS (SELECT 1 FROM #DailyBase x WHERE x.CodAlmacen=m.CodAlmacenNuevo AND x.Canal=db.Canal AND x.Fecha=db.Fecha)
      AND (m.Canal IS NULL OR m.Canal=db.Canal);

    -- ============================================
    -- 9. BASE WEIGHTS (normalized per month)
    -- ============================================
    IF OBJECT_ID('tempdb..#BaseWeights') IS NOT NULL DROP TABLE #BaseWeights;
    CREATE TABLE #BaseWeights(
        Fecha DATE NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL, Canal NVARCHAR(200) NOT NULL,
        Mes INT NOT NULL, PesoVenta DECIMAL(18,12) NOT NULL, PesoTrans DECIMAL(18,12) NOT NULL,
        NonZeroDaysV INT NOT NULL DEFAULT 0, -- count of days with non-zero sales in month
        NonZeroDaysT INT NOT NULL DEFAULT 0, -- count of days with non-zero transactions
        TotalDaysInMonth INT NOT NULL DEFAULT 28,
        PRIMARY KEY(Fecha,CodAlmacen,Canal)
    );

    ;WITH X AS (
        SELECT cb.Fecha, cb.Mes, c.CodAlmacen, k.Canal,
            VentaDia = ISNULL(db.Venta, CAST(0 AS DECIMAL(19,6))),
            TransDia = ISNULL(db.Transacciones, 0),
            DaysInMonth = DAY(EOMONTH(cb.Fecha))
        FROM #CalBase cb CROSS JOIN #Cods c CROSS JOIN #Canales k
        LEFT JOIN #DailyBase db ON db.Fecha=cb.Fecha AND db.CodAlmacen=c.CodAlmacen AND db.Canal=k.Canal
    ),
    W AS (
        SELECT *, VentaMes = SUM(VentaDia) OVER (PARTITION BY CodAlmacen,Canal,Mes),
            TransMes = SUM(TransDia) OVER (PARTITION BY CodAlmacen,Canal,Mes),
            NonZeroDaysV = SUM(CASE WHEN VentaDia > 0 THEN 1 ELSE 0 END) OVER (PARTITION BY CodAlmacen,Canal,Mes),
            NonZeroDaysT = SUM(CASE WHEN TransDia > 0 THEN 1 ELSE 0 END) OVER (PARTITION BY CodAlmacen,Canal,Mes)
        FROM X
    )
    INSERT INTO #BaseWeights(Fecha,CodAlmacen,Canal,Mes,PesoVenta,PesoTrans,NonZeroDaysV,NonZeroDaysT,TotalDaysInMonth)
    SELECT Fecha, CodAlmacen, Canal, Mes,
        CASE WHEN VentaMes=0 THEN (1.0/NULLIF(CAST(DaysInMonth AS DECIMAL(19,6)),0)) ELSE (VentaDia/VentaMes) END,
        CASE WHEN TransMes=0 THEN (1.0/NULLIF(CAST(DaysInMonth AS DECIMAL(19,6)),0))
             ELSE (CAST(TransDia AS DECIMAL(19,6))/NULLIF(CAST(TransMes AS DECIMAL(19,6)),0)) END,
        NonZeroDaysV, NonZeroDaysT, DaysInMonth
    FROM W;

    -- ============================================
    -- 10. INITIAL WEIGHTS + REFERENCE FALLBACK
    -- ============================================
    IF OBJECT_ID('tempdb..#PesoInit') IS NOT NULL DROP TABLE #PesoInit;
    CREATE TABLE #PesoInit(
        CodAlmacen NVARCHAR(10) NOT NULL, FechaTarget DATE NOT NULL, MesTarget INT NOT NULL,
        Canal NVARCHAR(200) NOT NULL, Tipo NVARCHAR(100) NOT NULL,
        PesoUsado DECIMAL(18,12) NOT NULL, EsEvento BIT NOT NULL,
        TieneData BIT NOT NULL DEFAULT 0, -- 1=weight from actual historical data, 0=fallback/uniform
        PRIMARY KEY(CodAlmacen,FechaTarget,Canal,Tipo)
    );

    -- Ventas weights
    -- KEY FIX: When the store has ADEQUATE coverage (>25% of days have non-zero sales),
    -- use the weight as-is (including 0 for closed days).
    -- When coverage is SPARSE (<=25%), the pattern is unreliable — use uniform distribution.
    -- This prevents hyper-concentration when only a few days had sales in the base year.
    INSERT INTO #PesoInit(CodAlmacen,FechaTarget,MesTarget,Canal,Tipo,PesoUsado,EsEvento,TieneData)
    SELECT md.CodAlmacen, md.FechaTarget, md.MesTarget, md.Canal, N'Ventas',
        CASE
            -- Adequate coverage (>25% days have sales): trust the daily weight including 0s
            WHEN bwO.NonZeroDaysV > 0 AND CAST(bwO.NonZeroDaysV AS FLOAT)/bwO.TotalDaysInMonth > 0.25
                THEN bwO.PesoVenta
            -- Sparse coverage but has data: use uniform (old SPARSE GUARD behavior)
            WHEN bwO.NonZeroDaysV > 0
                THEN (1.0/NULLIF(CAST(bwO.TotalDaysInMonth AS DECIMAL(19,6)),0))
            -- No own data: try reference store
            WHEN bwR.PesoVenta IS NOT NULL THEN bwR.PesoVenta
            -- No reference: uniform fallback
            ELSE (1.0/NULLIF(CAST(DAY(EOMONTH(md.FechaTarget)) AS DECIMAL(19,6)),0))
        END,
        md.EsEvento,
        CASE WHEN bwO.NonZeroDaysV > 0 THEN 1
             WHEN bwR.PesoVenta IS NOT NULL THEN 1
             ELSE 0 END
    FROM #MapDates md
    LEFT JOIN #BaseWeights bwO ON bwO.Fecha=md.FechaFuente AND bwO.CodAlmacen=md.CodAlmacen AND bwO.Canal=md.Canal
    OUTER APPLY (
        SELECT TOP(1) r.CodAlmacenReferencia AS CodBase FROM DIM_MAPEO_PRESUPUESTO_LOCALES r
        WHERE r.CodAlmacenNuevo=md.CodAlmacen AND r.NombrePresupuesto=@NombrePresupuesto AND r.Activo=1
          AND (r.Canal IS NULL OR r.Canal=md.Canal)
        ORDER BY CASE WHEN r.Canal=md.Canal THEN 1 ELSE 0 END DESC
    ) ref
    LEFT JOIN #BaseWeights bwR ON bwR.Fecha=md.FechaFuente AND bwR.CodAlmacen=ref.CodBase AND bwR.Canal=md.Canal;

    -- Transacciones weights (same logic)
    INSERT INTO #PesoInit(CodAlmacen,FechaTarget,MesTarget,Canal,Tipo,PesoUsado,EsEvento,TieneData)
    SELECT md.CodAlmacen, md.FechaTarget, md.MesTarget, md.Canal, N'Transacciones',
        CASE
            WHEN bwO.NonZeroDaysT > 0 AND CAST(bwO.NonZeroDaysT AS FLOAT)/bwO.TotalDaysInMonth > 0.25
                THEN bwO.PesoTrans
            WHEN bwO.NonZeroDaysT > 0
                THEN (1.0/NULLIF(CAST(bwO.TotalDaysInMonth AS DECIMAL(19,6)),0))
            WHEN bwR.PesoTrans IS NOT NULL THEN bwR.PesoTrans
            ELSE (1.0/NULLIF(CAST(DAY(EOMONTH(md.FechaTarget)) AS DECIMAL(19,6)),0))
        END,
        md.EsEvento,
        CASE WHEN bwO.NonZeroDaysT > 0 THEN 1
             WHEN bwR.PesoTrans IS NOT NULL THEN 1
             ELSE 0 END
    FROM #MapDates md
    LEFT JOIN #BaseWeights bwO ON bwO.Fecha=md.FechaFuente AND bwO.CodAlmacen=md.CodAlmacen AND bwO.Canal=md.Canal
    OUTER APPLY (
        SELECT TOP(1) r.CodAlmacenReferencia AS CodBase FROM DIM_MAPEO_PRESUPUESTO_LOCALES r
        WHERE r.CodAlmacenNuevo=md.CodAlmacen AND r.NombrePresupuesto=@NombrePresupuesto AND r.Activo=1
          AND (r.Canal IS NULL OR r.Canal=md.Canal)
        ORDER BY CASE WHEN r.Canal=md.Canal THEN 1 ELSE 0 END DESC
    ) ref
    LEFT JOIN #BaseWeights bwR ON bwR.Fecha=md.FechaFuente AND bwR.CodAlmacen=ref.CodBase AND bwR.Canal=md.Canal;

    -- ============================================
    -- 11. RE-NORMALIZE WEIGHTS (keep event days fixed)
    -- ============================================
    IF OBJECT_ID('tempdb..#PesoFinal') IS NOT NULL DROP TABLE #PesoFinal;
    CREATE TABLE #PesoFinal(
        CodAlmacen NVARCHAR(10) NOT NULL, FechaTarget DATE NOT NULL, MesTarget INT NOT NULL,
        Canal NVARCHAR(200) NOT NULL, Tipo NVARCHAR(100) NOT NULL,
        PesoFinal DECIMAL(18,12) NOT NULL, EsEvento BIT NOT NULL,
        PRIMARY KEY(CodAlmacen,FechaTarget,Canal,Tipo)
    );

    -- Step A: renormalize keeping event days fixed
    ;WITH S AS (
        SELECT p.*,
            SumEvento = SUM(CASE WHEN p.EsEvento=1 THEN p.PesoUsado ELSE 0 END)
                OVER (PARTITION BY p.CodAlmacen,p.MesTarget,p.Canal,p.Tipo),
            SumNoEvento = SUM(CASE WHEN p.EsEvento=0 THEN p.PesoUsado ELSE 0 END)
                OVER (PARTITION BY p.CodAlmacen,p.MesTarget,p.Canal,p.Tipo),
            DaysInMonth = DAY(EOMONTH(DATEFROMPARTS(@AnoModelo,p.MesTarget,1))),
            -- Count days with ACTUAL historical data (not fallback weights)
            DaysWithData = SUM(CAST(p.TieneData AS INT))
                OVER (PARTITION BY p.CodAlmacen,p.MesTarget,p.Canal,p.Tipo)
        FROM #PesoInit p
    )
    INSERT INTO #PesoFinal
    SELECT CodAlmacen, FechaTarget, MesTarget, Canal, Tipo,
        CASE
            -- SPARSE DATA GUARD: only use uniform distribution when there is
            -- literally NO historical data for this store+channel+month.
            -- Previous threshold (<=3) was too aggressive and caused flat budgets
            -- for stores with limited but valid channel-level data.
            WHEN DaysWithData = 0
                THEN (1.0/NULLIF(CAST(DaysInMonth AS DECIMAL(19,6)),0))
            WHEN SumNoEvento>0 AND SumEvento<1.0
                THEN CASE WHEN EsEvento=1 THEN PesoUsado ELSE PesoUsado*((1.0-SumEvento)/SumNoEvento) END
            ELSE (1.0/NULLIF(CAST(DaysInMonth AS DECIMAL(19,6)),0))
        END, EsEvento
    FROM S;

    -- ============================================
    -- 12. GENERATE DAILY BUDGET (Ventas + Transacciones)
    -- ============================================
    IF OBJECT_ID('tempdb..#TmpVT') IS NOT NULL DROP TABLE #TmpVT;
    CREATE TABLE #TmpVT(
        Fecha DATE NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL, Mes INT NOT NULL,
        Canal NVARCHAR(200) NOT NULL, Tipo NVARCHAR(100) NOT NULL,
        Monto DECIMAL(19,6) NOT NULL, Participacion DECIMAL(18,12) NULL,
        PRIMARY KEY(Fecha,CodAlmacen,Canal,Tipo)
    );

    -- Ventas daily
    INSERT INTO #TmpVT(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
    SELECT pf.FechaTarget, pm.CodAlmacen, pm.Mes, pm.Canal, N'Ventas',
        pm.PresupuestoMes * pf.PesoFinal, pf.PesoFinal
    FROM #PresuMensual pm
    JOIN #PesoFinal pf ON pf.CodAlmacen=pm.CodAlmacen AND pf.MesTarget=pm.Mes AND pf.Canal=pm.Canal AND pf.Tipo=N'Ventas'
    WHERE pm.Tipo=N'Ventas';

    -- Fix rounding residual for Ventas (add to largest day)
    ;WITH M AS (
        SELECT v.CodAlmacen,v.Mes,v.Canal, PresuMes=pm.PresupuestoMes,
            SumMes = SUM(v.Monto) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal),
            MaxFecha = FIRST_VALUE(v.Fecha) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal ORDER BY v.Monto DESC, v.Fecha DESC),
            v.Fecha
        FROM #TmpVT v JOIN #PresuMensual pm ON pm.Tipo=N'Ventas' AND pm.CodAlmacen=v.CodAlmacen AND pm.Mes=v.Mes AND pm.Canal=v.Canal
        WHERE v.Tipo=N'Ventas'
    )
    UPDATE v SET v.Monto = v.Monto + (m.PresuMes - m.SumMes)
    FROM #TmpVT v JOIN M m ON m.CodAlmacen=v.CodAlmacen AND m.Mes=v.Mes AND m.Canal=v.Canal AND m.Fecha=v.Fecha
    WHERE v.Tipo=N'Ventas' AND m.Fecha=m.MaxFecha;

    -- Recalc Ventas participation
    ;WITH S AS (SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto) FROM #TmpVT WHERE Tipo=N'Ventas' GROUP BY CodAlmacen,Mes,Canal)
    UPDATE v SET v.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE v.Monto/s.SumMes END
    FROM #TmpVT v JOIN S s ON s.CodAlmacen=v.CodAlmacen AND s.Mes=v.Mes AND s.Canal=v.Canal WHERE v.Tipo=N'Ventas';

    -- Transacciones daily (integer distribution with largest-remainder)
    ;WITH T AS (
        SELECT pf.FechaTarget AS Fecha, pm.CodAlmacen, pm.Mes, pm.Canal,
            TargetMesInt = CONVERT(INT, ROUND(pm.PresupuestoMes,0)), Peso = pf.PesoFinal
        FROM #PresuMensual pm JOIN #PesoFinal pf
            ON pf.CodAlmacen=pm.CodAlmacen AND pf.MesTarget=pm.Mes AND pf.Canal=pm.Canal AND pf.Tipo=N'Transacciones'
        WHERE pm.Tipo=N'Transacciones'
    ),
    R AS (SELECT *, BaseInt = CONVERT(INT, FLOOR(CAST(TargetMesInt AS DECIMAL(19,6))*Peso)),
            Frac = (CAST(TargetMesInt AS DECIMAL(19,6))*Peso) - FLOOR(CAST(TargetMesInt AS DECIMAL(19,6))*Peso) FROM T),
    S AS (SELECT r.*, SumBase = SUM(r.BaseInt) OVER (PARTITION BY r.CodAlmacen,r.Mes,r.Canal),
            Rnk = ROW_NUMBER() OVER (PARTITION BY r.CodAlmacen,r.Mes,r.Canal ORDER BY r.Frac DESC, r.Fecha) FROM R r)
    INSERT INTO #TmpVT(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
    SELECT s.Fecha, s.CodAlmacen, s.Mes, s.Canal, N'Transacciones',
        CAST(s.BaseInt + CASE WHEN s.Rnk <= (s.TargetMesInt - s.SumBase) THEN 1 ELSE 0 END AS DECIMAL(19,6)), s.Peso
    FROM S s;

    ;WITH S AS (SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto) FROM #TmpVT WHERE Tipo=N'Transacciones' GROUP BY CodAlmacen,Mes,Canal)
    UPDATE t SET t.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE t.Monto/s.SumMes END
    FROM #TmpVT t JOIN S s ON s.CodAlmacen=t.CodAlmacen AND s.Mes=t.Mes AND s.Canal=t.Canal WHERE t.Tipo=N'Transacciones';

    -- ============================================
    -- 13. AG EVENT REDISTRIBUTION (24/25/26) - SAFE PROPORTIONAL
    -- Uses uniform distribution to avoid cascading amplification
    -- ============================================
    IF OBJECT_ID('tempdb..#EvAjustesExp') IS NOT NULL DROP TABLE #EvAjustesExp;
    CREATE TABLE #EvAjustesExp(
        CodAlmacen NVARCHAR(10) NOT NULL, Canal NVARCHAR(200) NOT NULL,
        IDEVENTO INT NOT NULL, FechaX DATE NOT NULL, FechaE DATE NOT NULL, Prio INT NOT NULL,
        PRIMARY KEY(CodAlmacen,Canal,IDEVENTO,FechaX)
    );

    ;WITH Rules AS (
        SELECT IDEVENTO=f.IDEVENTO, FechaX=CAST(f.FECHA AS DATE), FechaE=CAST(f.FECHA_EFECTIVA AS DATE),
            CanalRule = CASE
                WHEN f.Canal IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))=N'' THEN NULL
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'ECOMMERCE',N'E-COMMERCE') THEN N'ECommerce'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'EXPRESS') THEN N'Express'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'LLEVAR') THEN N'Llevar'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'SALON',N'SALÓN') THEN N'Salón'
                WHEN UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
                ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))
            END,
            GrupoAlmacen=f.GrupoAlmacen,
            Prio = (CASE WHEN f.GrupoAlmacen IS NULL THEN 0 ELSE 1 END)
                 + (CASE WHEN f.Canal IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(200),f.Canal)))=N'' THEN 0 ELSE 2 END)
        FROM dbo.DIM_EVENTOS_FECHAS f
        WHERE f.IDEVENTO IN (24,25,26) AND f.FECHA IS NOT NULL AND f.FECHA_EFECTIVA IS NOT NULL
          AND YEAR(f.FECHA)=@AnoModelo AND (@Mes IS NULL OR MONTH(f.FECHA)=@Mes)
    ),
    ExpandCod AS (
        SELECT r.IDEVENTO,r.FechaX,r.FechaE,r.CanalRule,r.GrupoAlmacen,r.Prio,
            CodAlmacen = CASE WHEN r.GrupoAlmacen IS NULL THEN c.CodAlmacen ELSE gm.CodAlmacen END
        FROM Rules r CROSS JOIN (SELECT CodAlmacen FROM #Cods) c
        LEFT JOIN #GrupoMiembros gm ON gm.IDGRUPO=r.GrupoAlmacen
        WHERE (r.GrupoAlmacen IS NULL OR gm.CodAlmacen IS NOT NULL)
    ),
    ExpandCanal AS (
        SELECT CodAlmacen, Canal=CASE WHEN CanalRule IS NULL THEN k.Canal ELSE CanalRule END,
            IDEVENTO,FechaX,FechaE,Prio
        FROM ExpandCod CROSS JOIN (SELECT Canal FROM #Canales) k WHERE (CanalRule IS NULL OR CanalRule=k.Canal)
    ),
    Pick AS (
        SELECT *, rn=ROW_NUMBER() OVER (PARTITION BY CodAlmacen,Canal,IDEVENTO,FechaX ORDER BY Prio DESC)
        FROM ExpandCanal
    )
    INSERT INTO #EvAjustesExp SELECT CodAlmacen,Canal,IDEVENTO,FechaX,FechaE,Prio FROM Pick WHERE rn=1;

    IF EXISTS (SELECT 1 FROM #EvAjustesExp)
    BEGIN
        -- Cache current Ventas
        IF OBJECT_ID('tempdb..#VX') IS NOT NULL DROP TABLE #VX;
        SELECT Fecha, CodAlmacen, Canal, Mes, Monto INTO #VX FROM #TmpVT WHERE Tipo=N'Ventas';

        -- Build target dates per IDEVENTO
        IF OBJECT_ID('tempdb..#EvTargets') IS NOT NULL DROP TABLE #EvTargets;
        CREATE TABLE #EvTargets(CodAlmacen NVARCHAR(10), Canal NVARCHAR(200), IDEVENTO INT,
            FechaX DATE, FechaAdj DATE, PRIMARY KEY(CodAlmacen,Canal,IDEVENTO,FechaX,FechaAdj));

        -- 24: same week (Mon-Sun) excl FechaX
        INSERT INTO #EvTargets SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
        FROM #EvAjustesExp a JOIN #CalTgt c
            ON c.Fecha BETWEEN DATEADD(DAY,1-DATEPART(WEEKDAY,a.FechaX),a.FechaX)
                        AND DATEADD(DAY,7-DATEPART(WEEKDAY,a.FechaX),a.FechaX)
            AND YEAR(c.Fecha)=YEAR(a.FechaX) AND MONTH(c.Fecha)=MONTH(a.FechaX)
        WHERE a.IDEVENTO=24 AND c.Fecha<>a.FechaX;

        -- 25: same weekday in month excl FechaX
        INSERT INTO #EvTargets SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
        FROM #EvAjustesExp a JOIN #CalTgt c
            ON YEAR(c.Fecha)=YEAR(a.FechaX) AND MONTH(c.Fecha)=MONTH(a.FechaX) AND c.IdDia=DATEPART(WEEKDAY,a.FechaX)
        WHERE a.IDEVENTO=25 AND c.Fecha<>a.FechaX;

        -- 26: all days in month INCLUDING FechaX (proportional distribution)
        INSERT INTO #EvTargets SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
        FROM #EvAjustesExp a JOIN #CalTgt c
            ON YEAR(c.Fecha)=YEAR(a.FechaX) AND MONTH(c.Fecha)=MONTH(a.FechaX)
        WHERE a.IDEVENTO=26;

        -- Calculate and distribute deltas
        IF OBJECT_ID('tempdb..#DistRows') IS NOT NULL DROP TABLE #DistRows;
        CREATE TABLE #DistRows(CodAlmacen NVARCHAR(10), Canal NVARCHAR(200), Fecha DATE, DeltaMonto DECIMAL(19,6));

        -- Events 24,25: UNIFORM distribution to target days (excluding FechaX)
        ;WITH Deltas AS (
            SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,a.FechaE,
                VentaX = ISNULL(vx.Monto,0), VentaE = ISNULL(ve.Monto,0),
                Delta = ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)
            FROM #EvAjustesExp a
            LEFT JOIN #VX vx ON vx.CodAlmacen=a.CodAlmacen AND vx.Canal=a.Canal AND vx.Fecha=a.FechaX
            LEFT JOIN #VX ve ON ve.CodAlmacen=a.CodAlmacen AND ve.Canal=a.Canal AND ve.Fecha=a.FechaE
            WHERE MONTH(a.FechaE)=MONTH(a.FechaX) AND a.IDEVENTO IN (24,25)
        ),
        T AS (
            SELECT d.CodAlmacen,d.Canal,d.IDEVENTO,d.FechaX,d.Delta,et.FechaAdj,
                Cnt = COUNT(*) OVER (PARTITION BY d.CodAlmacen,d.Canal,d.IDEVENTO,d.FechaX)
            FROM Deltas d
            JOIN #EvTargets et ON et.CodAlmacen=d.CodAlmacen AND et.Canal=d.Canal AND et.IDEVENTO=d.IDEVENTO AND et.FechaX=d.FechaX
            WHERE d.Delta <> 0
        )
        INSERT INTO #DistRows(CodAlmacen,Canal,Fecha,DeltaMonto)
        SELECT CodAlmacen,Canal,FechaAdj,
            -1.0 * (CASE WHEN Cnt>0 THEN Delta*(1.0/Cnt) ELSE 0 END)
        FROM T;

        -- Event 26 (AG3): UNIFORM distribution across ALL days in month
        -- The delta is split equally among all days of the month (not proportional)
        ;WITH Deltas26 AS (
            SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,a.FechaE,
                Delta = ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)
            FROM #EvAjustesExp a
            LEFT JOIN #VX vx ON vx.CodAlmacen=a.CodAlmacen AND vx.Canal=a.Canal AND vx.Fecha=a.FechaX
            LEFT JOIN #VX ve ON ve.CodAlmacen=a.CodAlmacen AND ve.Canal=a.Canal AND ve.Fecha=a.FechaE
            WHERE MONTH(a.FechaE)=MONTH(a.FechaX) AND a.IDEVENTO=26 AND (ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)) <> 0
        ),
        DayCount AS (
            SELECT et.CodAlmacen,et.Canal,et.IDEVENTO,et.FechaX,et.FechaAdj,
                DayCnt = COUNT(*) OVER (PARTITION BY et.CodAlmacen,et.Canal,et.IDEVENTO,et.FechaX)
            FROM #EvTargets et
            JOIN Deltas26 d ON d.CodAlmacen=et.CodAlmacen AND d.Canal=et.Canal AND d.IDEVENTO=et.IDEVENTO AND d.FechaX=et.FechaX
        )
        INSERT INTO #DistRows(CodAlmacen,Canal,Fecha,DeltaMonto)
        SELECT dc.CodAlmacen, dc.Canal, dc.FechaAdj,
            d.Delta * (1.0 / dc.DayCnt)  -- uniform: equal share to every day
        FROM DayCount dc
        JOIN Deltas26 d ON d.CodAlmacen=dc.CodAlmacen AND d.Canal=dc.Canal AND d.IDEVENTO=dc.IDEVENTO AND d.FechaX=dc.FechaX;

        -- Add delta to source day (FechaX) — only for events 24,25 which exclude FechaX from targets
        INSERT INTO #DistRows(CodAlmacen,Canal,Fecha,DeltaMonto)
        SELECT d.CodAlmacen,d.Canal,d.FechaX,d.Delta
        FROM (SELECT a.CodAlmacen,a.Canal,a.FechaX,
                Delta = ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)
            FROM #EvAjustesExp a
            LEFT JOIN #VX vx ON vx.CodAlmacen=a.CodAlmacen AND vx.Canal=a.Canal AND vx.Fecha=a.FechaX
            LEFT JOIN #VX ve ON ve.CodAlmacen=a.CodAlmacen AND ve.Canal=a.Canal AND ve.Fecha=a.FechaE
            WHERE MONTH(a.FechaE)=MONTH(a.FechaX) AND a.IDEVENTO IN (24,25)) d
        WHERE d.Delta <> 0;

        -- Apply accumulated deltas
        ;WITH S AS (SELECT CodAlmacen,Canal,Fecha, DeltaMonto=SUM(DeltaMonto) FROM #DistRows GROUP BY CodAlmacen,Canal,Fecha)
        UPDATE v SET v.Monto = v.Monto + s.DeltaMonto
        FROM #TmpVT v JOIN S s ON s.CodAlmacen=v.CodAlmacen AND s.Canal=v.Canal AND s.Fecha=v.Fecha
        WHERE v.Tipo=N'Ventas';

        -- Rebalance to match monthly consolidado (proportional distribution)
        ;WITH M AS (
            SELECT v.CodAlmacen,v.Mes,v.Canal,v.Fecha,v.Monto,
                PresuMes = pm.PresupuestoMes,
                SumMes = SUM(v.Monto) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal),
                AbsMes = SUM(ABS(v.Monto)) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal),
                DayCnt = COUNT(*) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal)
            FROM #TmpVT v JOIN #PresuMensual pm ON pm.Tipo=N'Ventas' AND pm.CodAlmacen=v.CodAlmacen AND pm.Mes=v.Mes AND pm.Canal=v.Canal
            WHERE v.Tipo=N'Ventas'
        )
        UPDATE v SET v.Monto = v.Monto + (m.PresuMes - m.SumMes) *
            CASE WHEN m.AbsMes > 0 THEN ABS(m.Monto) / m.AbsMes
                 ELSE 1.0 / m.DayCnt END
        FROM #TmpVT v JOIN M m ON m.CodAlmacen=v.CodAlmacen AND m.Mes=v.Mes AND m.Canal=v.Canal AND m.Fecha=v.Fecha
        WHERE v.Tipo=N'Ventas' AND m.SumMes <> m.PresuMes;

        ;WITH S AS (SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto) FROM #TmpVT WHERE Tipo=N'Ventas' GROUP BY CodAlmacen,Mes,Canal)
        UPDATE v SET v.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE v.Monto/s.SumMes END
        FROM #TmpVT v JOIN S s ON s.CodAlmacen=v.CodAlmacen AND s.Mes=v.Mes AND s.Canal=v.Canal WHERE v.Tipo=N'Ventas';
    END;

    -- ============================================
    -- 14. BUILD RESULT (Ventas/Transacciones/TQP + Todos)
    -- ============================================
    IF OBJECT_ID('tempdb..#Res') IS NOT NULL DROP TABLE #Res;
    CREATE TABLE #Res(
        Fecha DATE NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL, Mes INT NOT NULL,
        Canal NVARCHAR(200) NOT NULL, Tipo NVARCHAR(100) NOT NULL,
        Monto DECIMAL(19,6) NOT NULL, Participacion DECIMAL(18,12) NULL
    );

    INSERT INTO #Res SELECT Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion FROM #TmpVT;

    -- TQP per channel
    INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
    SELECT v.Fecha,v.CodAlmacen,v.Mes,v.Canal,N'TQP',
        CASE WHEN t.Monto=0 THEN 0 ELSE CAST(v.Monto/t.Monto AS DECIMAL(19,6)) END, NULL
    FROM #Res v JOIN #Res t ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Canal=v.Canal AND t.Tipo=N'Transacciones'
    WHERE v.Tipo=N'Ventas';

    -- Todos channel (sum)
    INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
    SELECT Fecha,CodAlmacen,Mes,N'Todos',Tipo,SUM(Monto),NULL
    FROM #Res WHERE Canal<>N'Todos' AND Tipo IN (N'Ventas',N'Transacciones')
    GROUP BY Fecha,CodAlmacen,Mes,Tipo;

    ;WITH S AS (SELECT CodAlmacen,Mes,Canal,Tipo, SumMes=SUM(Monto) FROM #Res
        WHERE Canal=N'Todos' AND Tipo IN (N'Ventas',N'Transacciones') GROUP BY CodAlmacen,Mes,Canal,Tipo)
    UPDATE r SET r.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE r.Monto/s.SumMes END
    FROM #Res r JOIN S s ON s.CodAlmacen=r.CodAlmacen AND s.Mes=r.Mes AND s.Canal=r.Canal AND s.Tipo=r.Tipo
    WHERE r.Canal=N'Todos' AND r.Tipo IN (N'Ventas',N'Transacciones');

    -- TQP Todos
    INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
    SELECT v.Fecha,v.CodAlmacen,v.Mes,N'Todos',N'TQP',
        CASE WHEN t.Monto=0 THEN 0 ELSE CAST(v.Monto/t.Monto AS DECIMAL(19,6)) END, NULL
    FROM #Res v JOIN #Res t ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Canal=N'Todos' AND t.Tipo=N'Transacciones'
    WHERE v.Canal=N'Todos' AND v.Tipo=N'Ventas';

    CREATE CLUSTERED INDEX IX_Res ON #Res(Fecha,CodAlmacen,Canal,Tipo);

    -- ============================================
    -- 15. POPULATE PREVIOUS YEAR SALES (Natural + Adjusted)
    -- ============================================
    IF OBJECT_ID('tempdb..#PrevNat') IS NOT NULL DROP TABLE #PrevNat;
    IF OBJECT_ID('tempdb..#PrevAdj') IS NOT NULL DROP TABLE #PrevAdj;
    IF OBJECT_ID('tempdb..#Enrich') IS NOT NULL DROP TABLE #Enrich;

    -- Natural date mapping: same day one year ago
    -- Adjusted: same weekday as target, nearest to natural date (no month/year boundary restrictions)
    SELECT
        r.Fecha, r.CodAlmacen, r.Canal, r.Tipo, r.Mes,
        FechaAnterior = CASE WHEN MONTH(r.Fecha)=2 AND DAY(r.Fecha)=29
            THEN DATEFROMPARTS(@AnoAnterior,2,28) ELSE DATEADD(YEAR,-1,r.Fecha) END,
        -- Same weekday matching: find the same day-of-week nearest to (Fecha - 1 year)
        -- Offset = (target weekday - natural weekday + 7) % 7, then if > 3, subtract 7 to get nearest
        FechaAnteriorAjustada = DATEADD(DAY,
            CASE
                WHEN (DATEPART(WEEKDAY,r.Fecha) - DATEPART(WEEKDAY,
                    CASE WHEN MONTH(r.Fecha)=2 AND DAY(r.Fecha)=29
                        THEN DATEFROMPARTS(@AnoAnterior,2,28) ELSE DATEADD(YEAR,-1,r.Fecha) END
                ) + 7) % 7 > 3
                THEN (DATEPART(WEEKDAY,r.Fecha) - DATEPART(WEEKDAY,
                    CASE WHEN MONTH(r.Fecha)=2 AND DAY(r.Fecha)=29
                        THEN DATEFROMPARTS(@AnoAnterior,2,28) ELSE DATEADD(YEAR,-1,r.Fecha) END
                ) + 7) % 7 - 7
                ELSE (DATEPART(WEEKDAY,r.Fecha) - DATEPART(WEEKDAY,
                    CASE WHEN MONTH(r.Fecha)=2 AND DAY(r.Fecha)=29
                        THEN DATEFROMPARTS(@AnoAnterior,2,28) ELSE DATEADD(YEAR,-1,r.Fecha) END
                ) + 7) % 7
            END,
            CASE WHEN MONTH(r.Fecha)=2 AND DAY(r.Fecha)=29
                THEN DATEFROMPARTS(@AnoAnterior,2,28) ELSE DATEADD(YEAR,-1,r.Fecha) END)
    INTO #Enrich
    FROM #Res r
    WHERE r.Tipo IN (N'Ventas',N'Transacciones');

    -- Aggregate base year sales per date+store+channel for fast lookup
    IF OBJECT_ID('tempdb..#BaseLookup') IS NOT NULL DROP TABLE #BaseLookup;
    SELECT Fecha, CodAlmacen, Canal, Venta, Transacciones INTO #BaseLookup FROM #DailyBase;
    CREATE CLUSTERED INDEX IX_BL ON #BaseLookup(Fecha,CodAlmacen,Canal);

    -- Current year actual sales
    IF OBJECT_ID('tempdb..#ActualSales') IS NOT NULL DROP TABLE #ActualSales;
    SELECT
        CAST(v.FECHA AS DATE) AS Fecha,
        LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10) AS CodAlmacen,
        CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END COLLATE DATABASE_DEFAULT AS Canal,
        SUM(ISNULL(TRY_CONVERT(DECIMAL(19,6),v.[VENTAS NETAS]),0)) AS Ventas,
        SUM(ISNULL(TRY_CONVERT(INT,v.[Transacciones]),0)) AS Trans
    INTO #ActualSales
    FROM dbo.BI_VENTAS_ROSTIPOLLOS v WITH (NOLOCK)
    WHERE v.ANO=@AnoModelo AND CAST(v.FECHA AS DATE)<@Hoy
      AND (@CodAlmacen IS NULL OR v.CODALMACEN=@CodAlmacen)
    GROUP BY CAST(v.FECHA AS DATE), LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
        CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END
    HAVING CASE WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'EXPRESS') THEN N'Express'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'LLEVAR') THEN N'Llevar'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'SALON',N'SALÓN') THEN N'Salón'
             WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
             ELSE NULL END IS NOT NULL;
    CREATE CLUSTERED INDEX IX_AS ON #ActualSales(Fecha,CodAlmacen,Canal);

    -- ============================================
    -- 16. DELETE EXISTING DATA
    -- ============================================
    SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre';
    IF @CodAlmacen IS NOT NULL SET @SQL = @SQL + N' AND CodAlmacen = @cod';
    IF @Mes IS NOT NULL SET @SQL = @SQL + N' AND Mes = @mes';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes;

    -- ============================================
    -- 17. INSERT INDIVIDUAL STORES
    -- ============================================
    SET @SQL = N'
    INSERT INTO [' + @TablaDestino + '] (
        Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
        CodAlmacen, Participacion, Canal, Año, Tipo,
        FechaAnterior, MontoAnterior, ParticipacionAnterior,
        FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
        MontoReal, ParticipacionReal,
        NombrePresupuesto
    )
    SELECT
        r.Fecha,
        ISNULL(pm.IdLocal, ROW_NUMBER() OVER (ORDER BY r.CodAlmacen) + 1000),
        ISNULL(pm.Restaurante, r.CodAlmacen),
        CAST(TRY_CONVERT(INT, SUBSTRING(r.CodAlmacen, 2, 10)) AS NVARCHAR(10)),
        DATEPART(WEEKDAY, r.Fecha),
        CAST(DAY(r.Fecha) AS NVARCHAR(2)),
        r.Mes,
        r.Monto,
        r.CodAlmacen,
        r.Participacion,
        r.Canal,
        @ano,
        r.Tipo,
        -- Natural previous year
        en.FechaAnterior,
        CASE r.Tipo WHEN N''Ventas'' THEN bn.Venta WHEN N''Transacciones'' THEN bn.Transacciones
            WHEN N''TQP'' THEN CASE WHEN bn.Transacciones>0 THEN bn.Venta/bn.Transacciones ELSE 0 END END,
        NULL,
        -- Adjusted previous year
        en.FechaAnteriorAjustada,
        CASE r.Tipo WHEN N''Ventas'' THEN ba.Venta WHEN N''Transacciones'' THEN ba.Transacciones
            WHEN N''TQP'' THEN CASE WHEN ba.Transacciones>0 THEN ba.Venta/ba.Transacciones ELSE 0 END END,
        NULL,
        -- Actual sales
        CASE r.Tipo WHEN N''Ventas'' THEN ac.Ventas WHEN N''Transacciones'' THEN ac.Trans
            WHEN N''TQP'' THEN CASE WHEN ac.Trans>0 THEN ac.Ventas/ac.Trans ELSE 0 END END,
        NULL,
        @nombre
    FROM #Res r
    LEFT JOIN (SELECT CodAlmacen, MAX(Restaurante) AS Restaurante,
        ROW_NUMBER() OVER (ORDER BY CodAlmacen)+1000 AS IdLocal
        FROM #PresuMensual GROUP BY CodAlmacen) pm ON pm.CodAlmacen=r.CodAlmacen
    LEFT JOIN #Enrich en ON en.Fecha=r.Fecha AND en.CodAlmacen=r.CodAlmacen AND en.Canal=r.Canal AND en.Tipo=r.Tipo
    LEFT JOIN #BaseLookup bn ON bn.Fecha=en.FechaAnterior AND bn.CodAlmacen=r.CodAlmacen AND bn.Canal=r.Canal
    LEFT JOIN #BaseLookup ba ON ba.Fecha=en.FechaAnteriorAjustada AND ba.CodAlmacen=r.CodAlmacen AND ba.Canal=r.Canal
    LEFT JOIN #ActualSales ac ON ac.Fecha=r.Fecha AND ac.CodAlmacen=r.CodAlmacen AND ac.Canal=r.Canal;';
    EXEC sp_executesql @SQL, N'@ano INT, @nombre NVARCHAR(100)', @ano=@AnoModelo, @nombre=@NombrePresupuesto;

    -- Todos channel: update MontoAnterior/MontoAnteriorAjustado/MontoReal as sums
    SET @SQL = N'
    ;WITH TodosSums AS (
        SELECT Fecha, CodAlmacen, Tipo, Mes,
            SUM(ISNULL(MontoAnterior,0)) AS SumAnt,
            SUM(ISNULL(MontoAnteriorAjustado,0)) AS SumAntAj,
            SUM(ISNULL(MontoReal,0)) AS SumReal
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto=@nombre AND Canal<>N''Todos'' AND LEFT(CodAlmacen,1)<>''G''
          AND Tipo IN (N''Ventas'',N''Transacciones'')
        GROUP BY Fecha,CodAlmacen,Tipo,Mes
    )
    UPDATE t SET
        t.MontoAnterior = s.SumAnt,
        t.MontoAnteriorAjustado = s.SumAntAj,
        t.MontoReal = s.SumReal
    FROM [' + @TablaDestino + '] t
    JOIN TodosSums s ON s.Fecha=t.Fecha AND s.CodAlmacen=t.CodAlmacen AND s.Tipo=t.Tipo AND s.Mes=t.Mes
    WHERE t.NombrePresupuesto=@nombre AND t.Canal=N''Todos'' AND t.Tipo IN (N''Ventas'',N''Transacciones'');';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

    -- TQP Todos: recalc from sums
    SET @SQL = N'
    UPDATE t SET
        t.MontoAnterior = CASE WHEN tr.MontoAnterior>0 THEN v.MontoAnterior/tr.MontoAnterior ELSE 0 END,
        t.MontoAnteriorAjustado = CASE WHEN tr.MontoAnteriorAjustado>0 THEN v.MontoAnteriorAjustado/tr.MontoAnteriorAjustado ELSE 0 END,
        t.MontoReal = CASE WHEN tr.MontoReal>0 THEN v.MontoReal/tr.MontoReal ELSE 0 END
    FROM [' + @TablaDestino + '] t
    JOIN [' + @TablaDestino + '] v ON v.Fecha=t.Fecha AND v.CodAlmacen=t.CodAlmacen AND v.Canal=t.Canal AND v.Tipo=N''Ventas'' AND v.NombrePresupuesto=t.NombrePresupuesto
    JOIN [' + @TablaDestino + '] tr ON tr.Fecha=t.Fecha AND tr.CodAlmacen=t.CodAlmacen AND tr.Canal=t.Canal AND tr.Tipo=N''Transacciones'' AND tr.NombrePresupuesto=t.NombrePresupuesto
    WHERE t.NombrePresupuesto=@nombre AND t.Canal=N''Todos'' AND t.Tipo=N''TQP'';';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

    -- ============================================
    -- 18. PARTICIPATIONS (previous year + actual)
    -- ============================================
    SET @SQL = N'
    ;WITH MT AS (
        SELECT CodAlmacen,Canal,Mes,Tipo,
            SUM(ISNULL(MontoAnterior,0)) AS TotAnt,
            SUM(ISNULL(MontoAnteriorAjustado,0)) AS TotAntAj,
            SUM(ISNULL(MontoReal,0)) AS TotReal
        FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre GROUP BY CodAlmacen,Canal,Mes,Tipo
    )
    UPDATE t SET
        t.ParticipacionAnterior = CASE WHEN m.TotAnt>0 THEN ISNULL(t.MontoAnterior,0)/m.TotAnt ELSE 0 END,
        t.ParticipacionAnteriorAjustado = CASE WHEN m.TotAntAj>0 THEN ISNULL(t.MontoAnteriorAjustado,0)/m.TotAntAj ELSE 0 END,
        t.ParticipacionReal = CASE WHEN m.TotReal>0 THEN ISNULL(t.MontoReal,0)/m.TotReal ELSE 0 END
    FROM [' + @TablaDestino + '] t
    JOIN MT m ON m.CodAlmacen=t.CodAlmacen AND m.Canal=t.Canal AND m.Mes=t.Mes AND m.Tipo=t.Tipo
    WHERE t.NombrePresupuesto=@nombre;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

    -- ============================================
    -- 19. STORE GROUPS
    -- ============================================
    IF EXISTS (SELECT 1 FROM #GrupoMiembros)
    BEGIN
        -- Load group metadata (DESCRIPCION for names, derive CodAlmacen)
        IF OBJECT_ID('tempdb..#GrpInfo') IS NOT NULL DROP TABLE #GrpInfo;
        CREATE TABLE #GrpInfo(
            IDGRUPO INT NOT NULL PRIMARY KEY,
            CodGrupo NVARCHAR(10) NOT NULL,
            NombreGrupo NVARCHAR(200) NOT NULL,
            IdLocalGrupo INT NOT NULL,
            SerieNum VARCHAR(2) NOT NULL  -- numeric Serie: '0','1'...'17'
        );

        BEGIN TRY
            INSERT INTO #GrpInfo(IDGRUPO, CodGrupo, NombreGrupo, IdLocalGrupo, SerieNum)
            SELECT cab.IDGRUPO,
                N'G'+RIGHT(N'0'+CAST(cab.IDGRUPO-3000 AS NVARCHAR(2)),2),
                LTRIM(RTRIM(cab.DESCRIPCION)),
                cab.IDGRUPO,
                CAST(cab.IDGRUPO-3000 AS VARCHAR(2))
            FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
            WHERE cab.CODVISIBLE = 20;
        END TRY
        BEGIN CATCH
            BEGIN TRY
                INSERT INTO #GrpInfo(IDGRUPO, CodGrupo, NombreGrupo, IdLocalGrupo, SerieNum)
                SELECT cab.IDGRUPO,
                    N'G'+RIGHT(N'0'+CAST(cab.IDGRUPO-3000 AS NVARCHAR(2)),2),
                    LTRIM(RTRIM(cab.DESCRIPCION)),
                    cab.IDGRUPO,
                    CAST(cab.IDGRUPO-3000 AS VARCHAR(2))
                FROM dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
                WHERE cab.CODVISIBLE = 20;
            END TRY
            BEGIN CATCH
                PRINT 'Warning: Could not load group descriptions';
            END CATCH
        END CATCH

        -- Insert group aggregations (Ventas + Transacciones)
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            r.Fecha, g.IdLocalGrupo, g.NombreGrupo, g.SerieNum,
            MIN(r.idDia), MIN(r.Dia), r.Mes,
            SUM(r.Monto), g.CodGrupo, 0, r.Canal, MIN(r.Año), r.Tipo,
            MIN(r.FechaAnterior), SUM(ISNULL(r.MontoAnterior,0)), 0,
            MIN(r.FechaAnteriorAjustada), SUM(ISNULL(r.MontoAnteriorAjustado,0)), 0,
            SUM(ISNULL(r.MontoReal,0)), 0, r.NombrePresupuesto
        FROM [' + @TablaDestino + '] r
        JOIN #GrupoMiembros gm ON gm.CodAlmacen=r.CodAlmacen
        JOIN #GrpInfo g ON g.IDGRUPO=gm.IDGRUPO
        WHERE r.NombrePresupuesto=@nombre AND LEFT(r.CodAlmacen,1)<>N''G'' AND r.Tipo IN (N''Ventas'',N''Transacciones'')
        GROUP BY r.Fecha, g.CodGrupo, g.NombreGrupo, g.IdLocalGrupo, g.SerieNum, r.Canal, r.Tipo, r.Mes, r.NombrePresupuesto;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- Todos channel for groups
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            Fecha, MIN(idLocal), MIN([Local]), MIN(Serie), MIN(idDia), MIN(Dia), Mes,
            SUM(Monto), CodAlmacen, 0, N''Todos'', MIN(Año), Tipo,
            MIN(FechaAnterior), SUM(ISNULL(MontoAnterior,0)), 0,
            MIN(FechaAnteriorAjustada), SUM(ISNULL(MontoAnteriorAjustado,0)), 0,
            SUM(ISNULL(MontoReal,0)), 0, NombrePresupuesto
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto=@nombre AND LEFT(CodAlmacen,1)=N''G'' AND Canal<>N''Todos'' AND Tipo IN (N''Ventas'',N''Transacciones'')
        GROUP BY Fecha, CodAlmacen, Tipo, Mes, NombrePresupuesto;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- TQP for groups (all channels + Todos)
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT v.Fecha,v.idLocal,v.[Local],v.Serie,v.idDia,v.Dia,v.Mes,
            CASE WHEN tr.Monto>0 THEN v.Monto/tr.Monto ELSE 0 END,
            v.CodAlmacen,0,v.Canal,v.Año,N''TQP'',
            v.FechaAnterior,CASE WHEN tr.MontoAnterior>0 THEN v.MontoAnterior/tr.MontoAnterior ELSE 0 END,0,
            v.FechaAnteriorAjustada,CASE WHEN tr.MontoAnteriorAjustado>0 THEN v.MontoAnteriorAjustado/tr.MontoAnteriorAjustado ELSE 0 END,0,
            CASE WHEN tr.MontoReal>0 THEN v.MontoReal/tr.MontoReal ELSE 0 END,0,
            v.NombrePresupuesto
        FROM [' + @TablaDestino + '] v
        JOIN [' + @TablaDestino + '] tr ON tr.Fecha=v.Fecha AND tr.CodAlmacen=v.CodAlmacen AND tr.Canal=v.Canal
            AND tr.Tipo=N''Transacciones'' AND tr.NombrePresupuesto=v.NombrePresupuesto
        WHERE LEFT(v.CodAlmacen,1)=N''G'' AND v.Tipo=N''Ventas'' AND v.NombrePresupuesto=@nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- G30 super-group: duplicate each group's data under CodAlmacen=G30 with matching Local
        -- This creates the "Corporativo" overview where each group appears as a row under G30
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            Fecha, idLocal, [Local], N''G0'', idDia, Dia, Mes, Monto,
            N''G30'', Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto=@nombre AND LEFT(CodAlmacen,1)=N''G'' AND CodAlmacen<>N''G30''
          AND CodAlmacen IN (N''G00'',N''G01'',N''G02'',N''G03'',N''G04'',N''G05'',N''G06'',N''G07'',N''G08'',N''G09'');';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;
    END;


    -- ============================================
    -- 20. ACCUMULATED VALUES + DIFFERENCES
    -- ============================================
    SET @SQL = N'
    ;WITH Acumulados AS (
        SELECT Fecha,CodAlmacen,Canal,Tipo,Mes,
            SUM(Monto) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAcum,
            SUM(ISNULL(MontoAnterior,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAAcum,
            SUM(ISNULL(MontoAnteriorAjustado,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAAAcum,
            SUM(ISNULL(MontoReal,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MRAcum
        FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre
    )
    UPDATE t SET
        Monto_Acumulado=a.MAcum,
        MontoAnterior_Acumulado=a.MAAcum,
        MontoAnteriorAjustado_Acumulado=a.MAAAcum,
        Monto_Dif=a.MRAcum-a.MAcum,
        MontoAnterior_Dif=a.MRAcum-a.MAAcum,
        MontoAnteriorAjustado_Dif=a.MRAcum-a.MAAAcum
    FROM [' + @TablaDestino + '] t
    JOIN Acumulados a ON a.Fecha=t.Fecha AND a.CodAlmacen=t.CodAlmacen AND a.Canal=t.Canal AND a.Tipo=t.Tipo AND a.Mes=t.Mes
    WHERE t.NombrePresupuesto=@nombre;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

    -- Populate Llave columns for traceability
    SET @SQL = N'
    UPDATE t SET
        Llave_Presupuesto = t.CodAlmacen + N''_'' + CAST(t.Año AS NVARCHAR(4)) + N''_'' + CAST(t.Mes AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.Fecha) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_Presupuesto'',
        Llave_AñoAnterior = CASE WHEN t.FechaAnterior IS NOT NULL THEN t.CodAlmacen + N''_'' + CAST(YEAR(t.FechaAnterior) AS NVARCHAR(4)) + N''_'' + CAST(MONTH(t.FechaAnterior) AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.FechaAnterior) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_AñoAnterior'' ELSE NULL END,
        Llave_AnoAnterior_Ajustado = CASE WHEN t.FechaAnteriorAjustada IS NOT NULL THEN t.CodAlmacen + N''_'' + CAST(YEAR(t.FechaAnteriorAjustada) AS NVARCHAR(4)) + N''_'' + CAST(MONTH(t.FechaAnteriorAjustada) AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.FechaAnteriorAjustada) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_AñoAnteriorAjustado'' ELSE NULL END
    FROM [' + @TablaDestino + '] t
    WHERE t.NombrePresupuesto=@nombre;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

    -- ============================================
    -- 21. APPLY ADJUSTMENTS from MODELO_PRESUPUESTO_AJUSTES
    -- ============================================
    DECLARE @AjusteId INT, @AjCod NVARCHAR(10), @AjMes INT, @AjCanal NVARCHAR(200);
    DECLARE @AjTipo NVARCHAR(100), @AjMetodo NVARCHAR(50), @AjValor DECIMAL(18,4), @AjDistrib NVARCHAR(50);
    DECLARE @TotalPresu FLOAT, @Factor FLOAT, @NewTotal FLOAT, @NormFactor FLOAT;

    DECLARE ajuste_cursor CURSOR FOR
        SELECT Id, CodAlmacen, Mes, Canal, Tipo, MetodoAjuste, ValorAjuste, MetodoDistribucion
        FROM MODELO_PRESUPUESTO_AJUSTES
        WHERE NombrePresupuesto=@NombrePresupuesto AND Activo=1
          AND (@CodAlmacen IS NULL OR CodAlmacen=@CodAlmacen)
          AND (@Mes IS NULL OR Mes=@Mes)
        ORDER BY FechaAplicacion;

    OPEN ajuste_cursor;
    FETCH NEXT FROM ajuste_cursor INTO @AjusteId,@AjCod,@AjMes,@AjCanal,@AjTipo,@AjMetodo,@AjValor,@AjDistrib;

    WHILE @@FETCH_STATUS=0
    BEGIN
        SET @TotalPresu=NULL; SET @Factor=1; SET @NewTotal=NULL; SET @NormFactor=1;
        SET @SQL=N'SELECT @tot=SUM(Monto) FROM ['+@TablaDestino+'] WHERE NombrePresupuesto=@nombre AND CodAlmacen=@cod AND Mes=@mes AND Canal=@canal AND Tipo=@tipo';
        EXEC sp_executesql @SQL,N'@nombre NVARCHAR(100),@cod NVARCHAR(10),@mes INT,@canal NVARCHAR(200),@tipo NVARCHAR(100),@tot FLOAT OUTPUT',
            @nombre=@NombrePresupuesto,@cod=@AjCod,@mes=@AjMes,@canal=@AjCanal,@tipo=@AjTipo,@tot=@TotalPresu OUTPUT;

        IF @TotalPresu IS NOT NULL AND @TotalPresu<>0
        BEGIN
            IF @AjMetodo='Porcentaje' SET @Factor=1+(@AjValor/100.0);
            ELSE IF @AjMetodo='Factor' SET @Factor=@AjValor;
            ELSE IF @AjMetodo='MontoAbsoluto' SET @Factor=(@TotalPresu+@AjValor)/@TotalPresu;

            SET @SQL=N'UPDATE ['+@TablaDestino+'] SET Monto=Monto*@factor WHERE NombrePresupuesto=@nombre AND CodAlmacen=@cod AND Mes=@mes AND Canal=@canal AND Tipo=@tipo';
            EXEC sp_executesql @SQL,N'@nombre NVARCHAR(100),@cod NVARCHAR(10),@mes INT,@canal NVARCHAR(200),@tipo NVARCHAR(100),@factor FLOAT',
                @nombre=@NombrePresupuesto,@cod=@AjCod,@mes=@AjMes,@canal=@AjCanal,@tipo=@AjTipo,@factor=@Factor;
        END

        FETCH NEXT FROM ajuste_cursor INTO @AjusteId,@AjCod,@AjMes,@AjCanal,@AjTipo,@AjMetodo,@AjValor,@AjDistrib;
    END
    CLOSE ajuste_cursor;
    DEALLOCATE ajuste_cursor;

    -- ============================================
    -- 21b. POST-ADJUSTMENT RECALCULATION
    -- After applying adjustments, recalculate derived values:
    -- TQP, Todos channel, participations, accumulated values, keys
    -- ============================================
    IF EXISTS (SELECT 1 FROM MODELO_PRESUPUESTO_AJUSTES WHERE NombrePresupuesto=@NombrePresupuesto AND Activo=1
              AND (@CodAlmacen IS NULL OR CodAlmacen=@CodAlmacen) AND (@Mes IS NULL OR Mes=@Mes))
    BEGIN
        PRINT 'Post-adjustment recalculation starting...';

        -- 21b.1: Recalculate TQP for individual stores (non-group)
        SET @SQL = N'
        UPDATE t SET t.Monto = CASE WHEN trans.Monto > 0 THEN vent.Monto / trans.Monto ELSE 0 END
        FROM [' + @TablaDestino + '] t
        INNER JOIN [' + @TablaDestino + '] vent ON vent.Fecha=t.Fecha AND vent.CodAlmacen=t.CodAlmacen AND vent.Canal=t.Canal AND vent.Tipo=N''Ventas'' AND vent.NombrePresupuesto=t.NombrePresupuesto
        INNER JOIN [' + @TablaDestino + '] trans ON trans.Fecha=t.Fecha AND trans.CodAlmacen=t.CodAlmacen AND trans.Canal=t.Canal AND trans.Tipo=N''Transacciones'' AND trans.NombrePresupuesto=t.NombrePresupuesto
        WHERE t.NombrePresupuesto=@nombre AND t.Tipo=N''TQP'' AND LEFT(t.CodAlmacen,1)<>N''G'';';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- 21b.2: Regenerate Todos channel for individual stores
        -- Delete existing Todos for non-group stores
        SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre AND Canal=N''Todos'' AND LEFT(CodAlmacen,1)<>N''G'';';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- Recreate Todos for Ventas+Transacciones
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            Fecha, MIN(idLocal), MIN([Local]), MIN(Serie), MIN(idDia), MIN(Dia), Mes,
            SUM(Monto), CodAlmacen, 0, N''Todos'', MIN(Año), Tipo,
            MIN(FechaAnterior), SUM(ISNULL(MontoAnterior,0)), 0,
            MIN(FechaAnteriorAjustada), SUM(ISNULL(MontoAnteriorAjustado,0)), 0,
            SUM(ISNULL(MontoReal,0)), 0, NombrePresupuesto
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto=@nombre AND Canal<>N''Todos'' AND LEFT(CodAlmacen,1)<>N''G''
          AND Tipo IN (N''Ventas'', N''Transacciones'')
        GROUP BY Fecha, CodAlmacen, Tipo, Mes, NombrePresupuesto;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- Recreate Todos TQP
        SET @SQL = N'
        INSERT INTO [' + @TablaDestino + '] (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Año, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            v.Fecha, v.idLocal, v.[Local], v.Serie, v.idDia, v.Dia, v.Mes,
            CASE WHEN t.Monto > 0 THEN v.Monto / t.Monto ELSE 0 END,
            v.CodAlmacen, 0, N''Todos'', v.Año, N''TQP'',
            v.FechaAnterior, CASE WHEN t.MontoAnterior > 0 THEN v.MontoAnterior / t.MontoAnterior ELSE 0 END, 0,
            v.FechaAnteriorAjustada, CASE WHEN t.MontoAnteriorAjustado > 0 THEN v.MontoAnteriorAjustado / t.MontoAnteriorAjustado ELSE 0 END, 0,
            CASE WHEN t.MontoReal > 0 THEN v.MontoReal / t.MontoReal ELSE 0 END, 0, v.NombrePresupuesto
        FROM [' + @TablaDestino + '] v
        INNER JOIN [' + @TablaDestino + '] t ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Canal=N''Todos'' AND t.Tipo=N''Transacciones'' AND t.NombrePresupuesto=v.NombrePresupuesto
        WHERE v.Canal=N''Todos'' AND v.Tipo=N''Ventas'' AND v.NombrePresupuesto=@nombre AND LEFT(v.CodAlmacen,1)<>N''G'';';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- 21b.3: Regenerate Groups (if groups exist)
        IF EXISTS (SELECT 1 FROM #GrupoMiembros)
        BEGIN
            -- Delete all group rows and regenerate
            SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre AND LEFT(CodAlmacen,1)=N''G'';';
            EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

            -- Re-insert group aggregations (Ventas + Transacciones)
            SET @SQL = N'
            INSERT INTO [' + @TablaDestino + '] (
                Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
                CodAlmacen, Participacion, Canal, Año, Tipo,
                FechaAnterior, MontoAnterior, ParticipacionAnterior,
                FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
                MontoReal, ParticipacionReal, NombrePresupuesto
            )
            SELECT
                r.Fecha, g.IdLocalGrupo, g.NombreGrupo, g.SerieNum,
                MIN(r.idDia), MIN(r.Dia), r.Mes,
                SUM(r.Monto), g.CodGrupo, 0, r.Canal, MIN(r.Año), r.Tipo,
                MIN(r.FechaAnterior), SUM(ISNULL(r.MontoAnterior,0)), 0,
                MIN(r.FechaAnteriorAjustada), SUM(ISNULL(r.MontoAnteriorAjustado,0)), 0,
                SUM(ISNULL(r.MontoReal,0)), 0, r.NombrePresupuesto
            FROM [' + @TablaDestino + '] r
            JOIN #GrupoMiembros gm ON gm.CodAlmacen=r.CodAlmacen
            JOIN #GrpInfo g ON g.IDGRUPO=gm.IDGRUPO
            WHERE r.NombrePresupuesto=@nombre AND LEFT(r.CodAlmacen,1)<>N''G'' AND r.Tipo IN (N''Ventas'',N''Transacciones'')
            GROUP BY r.Fecha, g.CodGrupo, g.NombreGrupo, g.IdLocalGrupo, g.SerieNum, r.Canal, r.Tipo, r.Mes, r.NombrePresupuesto;';
            EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

            -- Todos channel for groups
            SET @SQL = N'
            INSERT INTO [' + @TablaDestino + '] (
                Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
                CodAlmacen, Participacion, Canal, Año, Tipo,
                FechaAnterior, MontoAnterior, ParticipacionAnterior,
                FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
                MontoReal, ParticipacionReal, NombrePresupuesto
            )
            SELECT
                Fecha, MIN(idLocal), MIN([Local]), MIN(Serie), MIN(idDia), MIN(Dia), Mes,
                SUM(Monto), CodAlmacen, 0, N''Todos'', MIN(Año), Tipo,
                MIN(FechaAnterior), SUM(ISNULL(MontoAnterior,0)), 0,
                MIN(FechaAnteriorAjustada), SUM(ISNULL(MontoAnteriorAjustado,0)), 0,
                SUM(ISNULL(MontoReal,0)), 0, NombrePresupuesto
            FROM [' + @TablaDestino + ']
            WHERE NombrePresupuesto=@nombre AND LEFT(CodAlmacen,1)=N''G'' AND Canal<>N''Todos'' AND Tipo IN (N''Ventas'',N''Transacciones'')
            GROUP BY Fecha, CodAlmacen, Tipo, Mes, NombrePresupuesto;';
            EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

            -- TQP for groups
            SET @SQL = N'
            INSERT INTO [' + @TablaDestino + '] (
                Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
                CodAlmacen, Participacion, Canal, Año, Tipo,
                FechaAnterior, MontoAnterior, ParticipacionAnterior,
                FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
                MontoReal, ParticipacionReal, NombrePresupuesto
            )
            SELECT v.Fecha,v.idLocal,v.[Local],v.Serie,v.idDia,v.Dia,v.Mes,
                CASE WHEN tr.Monto>0 THEN v.Monto/tr.Monto ELSE 0 END,
                v.CodAlmacen,0,v.Canal,v.Año,N''TQP'',
                v.FechaAnterior,CASE WHEN tr.MontoAnterior>0 THEN v.MontoAnterior/tr.MontoAnterior ELSE 0 END,0,
                v.FechaAnteriorAjustada,CASE WHEN tr.MontoAnteriorAjustado>0 THEN v.MontoAnteriorAjustado/tr.MontoAnteriorAjustado ELSE 0 END,0,
                CASE WHEN tr.MontoReal>0 THEN v.MontoReal/tr.MontoReal ELSE 0 END,0,
                v.NombrePresupuesto
            FROM [' + @TablaDestino + '] v
            JOIN [' + @TablaDestino + '] tr ON tr.Fecha=v.Fecha AND tr.CodAlmacen=v.CodAlmacen AND tr.Canal=v.Canal
                AND tr.Tipo=N''Transacciones'' AND tr.NombrePresupuesto=v.NombrePresupuesto
            WHERE LEFT(v.CodAlmacen,1)=N''G'' AND v.Tipo=N''Ventas'' AND v.NombrePresupuesto=@nombre;';
            EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

            -- G30 super-group
            SET @SQL = N'
            INSERT INTO [' + @TablaDestino + '] (
                Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
                CodAlmacen, Participacion, Canal, Año, Tipo,
                FechaAnterior, MontoAnterior, ParticipacionAnterior,
                FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
                MontoReal, ParticipacionReal, NombrePresupuesto
            )
            SELECT
                Fecha, idLocal, [Local], N''G0'', idDia, Dia, Mes, Monto,
                N''G30'', Participacion, Canal, Año, Tipo,
                FechaAnterior, MontoAnterior, ParticipacionAnterior,
                FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
                MontoReal, ParticipacionReal, NombrePresupuesto
            FROM [' + @TablaDestino + ']
            WHERE NombrePresupuesto=@nombre AND LEFT(CodAlmacen,1)=N''G'' AND CodAlmacen<>N''G30''
              AND CodAlmacen IN (N''G00'',N''G01'',N''G02'',N''G03'',N''G04'',N''G05'',N''G06'',N''G07'',N''G08'',N''G09'');';
            EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;
        END;

        -- 21b.4: Recalculate participations for ALL records
        SET @SQL = N'
        ;WITH MT AS (
            SELECT CodAlmacen,Canal,Mes,Tipo,
                SUM(Monto) AS TotMonto,
                SUM(ISNULL(MontoAnterior,0)) AS TotAnt,
                SUM(ISNULL(MontoAnteriorAjustado,0)) AS TotAntAj,
                SUM(ISNULL(MontoReal,0)) AS TotReal
            FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre GROUP BY CodAlmacen,Canal,Mes,Tipo
        )
        UPDATE t SET
            t.Participacion = CASE WHEN m.TotMonto>0 THEN t.Monto/m.TotMonto ELSE 0 END,
            t.ParticipacionAnterior = CASE WHEN m.TotAnt>0 THEN ISNULL(t.MontoAnterior,0)/m.TotAnt ELSE 0 END,
            t.ParticipacionAnteriorAjustado = CASE WHEN m.TotAntAj>0 THEN ISNULL(t.MontoAnteriorAjustado,0)/m.TotAntAj ELSE 0 END,
            t.ParticipacionReal = CASE WHEN m.TotReal>0 THEN ISNULL(t.MontoReal,0)/m.TotReal ELSE 0 END
        FROM [' + @TablaDestino + '] t
        JOIN MT m ON m.CodAlmacen=t.CodAlmacen AND m.Canal=t.Canal AND m.Mes=t.Mes AND m.Tipo=t.Tipo
        WHERE t.NombrePresupuesto=@nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- 21b.5: Recalculate accumulated values
        SET @SQL = N'
        ;WITH Acumulados AS (
            SELECT Fecha,CodAlmacen,Canal,Tipo,Mes,
                SUM(Monto) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAcum,
                SUM(ISNULL(MontoAnterior,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAAcum,
                SUM(ISNULL(MontoAnteriorAjustado,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MAAAcum,
                SUM(ISNULL(MontoReal,0)) OVER (PARTITION BY CodAlmacen,Canal,Tipo,Mes,NombrePresupuesto ORDER BY Fecha) AS MRAcum
            FROM [' + @TablaDestino + '] WHERE NombrePresupuesto=@nombre
        )
        UPDATE t SET
            Monto_Acumulado=a.MAcum,
            MontoAnterior_Acumulado=a.MAAcum,
            MontoAnteriorAjustado_Acumulado=a.MAAAcum,
            Monto_Dif=a.MRAcum-a.MAcum,
            MontoAnterior_Dif=a.MRAcum-a.MAAcum,
            MontoAnteriorAjustado_Dif=a.MRAcum-a.MAAAcum
        FROM [' + @TablaDestino + '] t
        JOIN Acumulados a ON a.Fecha=t.Fecha AND a.CodAlmacen=t.CodAlmacen AND a.Canal=t.Canal AND a.Tipo=t.Tipo AND a.Mes=t.Mes
        WHERE t.NombrePresupuesto=@nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        -- 21b.6: Recalculate traceability keys
        SET @SQL = N'
        UPDATE t SET
            Llave_Presupuesto = t.CodAlmacen + N''_'' + CAST(t.Año AS NVARCHAR(4)) + N''_'' + CAST(t.Mes AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.Fecha) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_Presupuesto'',
            Llave_AñoAnterior = CASE WHEN t.FechaAnterior IS NOT NULL THEN t.CodAlmacen + N''_'' + CAST(YEAR(t.FechaAnterior) AS NVARCHAR(4)) + N''_'' + CAST(MONTH(t.FechaAnterior) AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.FechaAnterior) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_AñoAnterior'' ELSE NULL END,
            Llave_AnoAnterior_Ajustado = CASE WHEN t.FechaAnteriorAjustada IS NOT NULL THEN t.CodAlmacen + N''_'' + CAST(YEAR(t.FechaAnteriorAjustada) AS NVARCHAR(4)) + N''_'' + CAST(MONTH(t.FechaAnteriorAjustada) AS NVARCHAR(2)) + N''_'' + CAST(DAY(t.FechaAnteriorAjustada) AS NVARCHAR(2)) + N''_'' + t.Canal + N''_'' + t.Tipo + N''_AñoAnteriorAjustado'' ELSE NULL END
        FROM [' + @TablaDestino + '] t
        WHERE t.NombrePresupuesto=@nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre=@NombrePresupuesto;

        PRINT 'Post-adjustment recalculation complete.';
    END;

    -- ============================================
    -- 22. LOG EXECUTION
    -- ============================================
    DECLARE @TotalRows INT;
    SET @SQL=N'SELECT @cnt=COUNT(*) FROM ['+@TablaDestino+'] WHERE NombrePresupuesto=@nombre';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100), @cnt INT OUTPUT', @nombre=@NombrePresupuesto, @cnt=@TotalRows OUTPUT;

    INSERT INTO MODELO_PRESUPUESTO_BITACORA
        (NombrePresupuesto,Usuario,Accion,Origen,CodAlmacen,Mes,Motivo,Detalle)
    VALUES(@NombrePresupuesto,@Usuario,'Recalculo',
        CASE WHEN @Usuario='JOB' THEN 'Job' ELSE 'Manual' END,
        @CodAlmacen,@Mes,
        CASE WHEN @Usuario='JOB' THEN 'Ejecución automática diaria' ELSE 'Recálculo manual' END,
        '{"registros":'+CAST(@TotalRows AS NVARCHAR(20))+',"tabla":"'+@TablaDestino+'","version":"v3"}');

    UPDATE MODELO_PRESUPUESTO_CONFIG SET UltimoCalculo=GETDATE(),UltimoUsuario=@Usuario,FechaModificacion=GETDATE()
    WHERE NombrePresupuesto=@NombrePresupuesto;

    COMMIT TRANSACTION;

    SELECT @TotalRows AS TotalRegistros, @NombrePresupuesto AS NombrePresupuesto, @TablaDestino AS TablaDestino;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
        DECLARE @ErrMsg NVARCHAR(4000)=ERROR_MESSAGE(), @ErrSev INT=ERROR_SEVERITY(), @ErrState INT=ERROR_STATE();
        RAISERROR(@ErrMsg,@ErrSev,@ErrState);
    END CATCH

    -- Cleanup
    IF OBJECT_ID('tempdb..#Canales') IS NOT NULL DROP TABLE #Canales;
    IF OBJECT_ID('tempdb..#PresuMensual') IS NOT NULL DROP TABLE #PresuMensual;
    IF OBJECT_ID('tempdb..#Cods') IS NOT NULL DROP TABLE #Cods;
    IF OBJECT_ID('tempdb..#GrupoMiembros') IS NOT NULL DROP TABLE #GrupoMiembros;
    IF OBJECT_ID('tempdb..#CalBase') IS NOT NULL DROP TABLE #CalBase;
    IF OBJECT_ID('tempdb..#CalTgt') IS NOT NULL DROP TABLE #CalTgt;
    IF OBJECT_ID('tempdb..#MapBase') IS NOT NULL DROP TABLE #MapBase;
    IF OBJECT_ID('tempdb..#EventOverride') IS NOT NULL DROP TABLE #EventOverride;
    IF OBJECT_ID('tempdb..#MapDates') IS NOT NULL DROP TABLE #MapDates;
    IF OBJECT_ID('tempdb..#DailyBase') IS NOT NULL DROP TABLE #DailyBase;
    IF OBJECT_ID('tempdb..#BaseWeights') IS NOT NULL DROP TABLE #BaseWeights;
    IF OBJECT_ID('tempdb..#PesoInit') IS NOT NULL DROP TABLE #PesoInit;
    IF OBJECT_ID('tempdb..#PesoFinal') IS NOT NULL DROP TABLE #PesoFinal;
    IF OBJECT_ID('tempdb..#TmpVT') IS NOT NULL DROP TABLE #TmpVT;
    IF OBJECT_ID('tempdb..#EvAjustesExp') IS NOT NULL DROP TABLE #EvAjustesExp;
    IF OBJECT_ID('tempdb..#Res') IS NOT NULL DROP TABLE #Res;
    IF OBJECT_ID('tempdb..#Enrich') IS NOT NULL DROP TABLE #Enrich;
    IF OBJECT_ID('tempdb..#BaseLookup') IS NOT NULL DROP TABLE #BaseLookup;
    IF OBJECT_ID('tempdb..#ActualSales') IS NOT NULL DROP TABLE #ActualSales;
END
GO

PRINT '✅ SP_CALCULAR_PRESUPUESTO v3 created successfully';
GO
