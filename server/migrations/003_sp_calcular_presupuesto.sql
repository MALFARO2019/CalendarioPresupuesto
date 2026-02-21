-- ==========================================
-- SP_CALCULAR_PRESUPUESTO  (v2 – corregido)
-- Main budget calculation stored procedure
-- ==========================================
-- Distributes monthly budget to daily using normalized
-- participation weights from the previous year.
-- Maps historical dates, applies adjustments,
-- populates actual sales, and generates aggregations.
-- ==========================================
-- FIXES in v2:
--   1. Participation is now normalized PER MODEL-YEAR MONTH
--      (guarantees SUM = 1.0 and daily budget sums to monthly total)
--   2. Days without prior-year data get uniform distribution instead of 0
--   3. Transaction rounding uses fractional MONTO (not participation)
--   4. Accumulated differences fixed (Real_Acum - Presup_Acum)
--   5. Adjustments section cleaned (no variable re-declaration)
--   6. TQP for "Todos" anterior uses raw sums before dividing
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
    @CodAlmacen         NVARCHAR(10)  = NULL,   -- Optional: partial recalc by store
    @Mes                INT           = NULL,    -- Optional: partial recalc by month
    @CrearVersion       BIT           = 1        -- Create snapshot before recalc
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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

    -- ============================================
    -- 1. CREATE VERSION SNAPSHOT (before any changes)
    -- ============================================
    IF @CrearVersion = 1 AND @CodAlmacen IS NULL AND @Mes IS NULL
    BEGIN
        DECLARE @OrigenCalc NVARCHAR(50) = CASE WHEN @Usuario = 'JOB' THEN 'Job' ELSE 'Manual' END;
        EXEC SP_VERSION_PRESUPUESTO
            @NombrePresupuesto = @NombrePresupuesto,
            @TablaDestino      = @TablaDestino,
            @Usuario           = @Usuario,
            @Origen            = @OrigenCalc,
            @Modo              = 'CREAR',
            @Notas             = 'Pre-calculation snapshot';
    END

    BEGIN TRANSACTION;

    -- ============================================
    -- 2. GENERATE CALENDAR for the model year
    -- ============================================
    IF OBJECT_ID('tempdb..#Calendario') IS NOT NULL DROP TABLE #Calendario;

    CREATE TABLE #Calendario (
        Fecha           DATE NOT NULL,
        Dia             INT NOT NULL,        -- Day of month
        Mes             INT NOT NULL,
        Ano             INT NOT NULL,
        IdDia           INT NOT NULL,        -- Day of week (1=Monday)
        NombreDia       NVARCHAR(255) NULL,
        FechaAnterior   DATE NULL,           -- Natural date previous year
        FechaAnteriorAjustada DATE NULL      -- Weekday-adjusted date previous year
    );

    -- Fill calendar with all days of the model year
    ;WITH CTE_Dates AS (
        SELECT CAST(CAST(@AnoModelo AS VARCHAR(4)) + '-01-01' AS DATE) AS dt
        UNION ALL
        SELECT DATEADD(DAY, 1, dt) FROM CTE_Dates WHERE dt < CAST(CAST(@AnoModelo AS VARCHAR(4)) + '-12-31' AS DATE)
    )
    INSERT INTO #Calendario (Fecha, Dia, Mes, Ano, IdDia, NombreDia, FechaAnterior, FechaAnteriorAjustada)
    SELECT
        dt,
        DAY(dt),
        MONTH(dt),
        YEAR(dt),
        (DATEPART(WEEKDAY, dt) + @@DATEFIRST + 5) % 7 + 1,  -- 1=Monday...7=Sunday
        DATENAME(WEEKDAY, dt),
        -- Natural previous year date: same month/day
        CASE
            WHEN MONTH(dt) = 2 AND DAY(dt) = 29
            THEN CAST(CAST(@AnoAnterior AS VARCHAR(4)) + '-02-28' AS DATE)
            ELSE DATEADD(YEAR, -1, dt)
        END,
        NULL  -- Will be calculated below
    FROM CTE_Dates
    OPTION (MAXRECURSION 366);

    -- ============================================
    -- 3. MAP ADJUSTED DATES (weekday-matched)
    -- ============================================
    -- For each date in the model year, find the equivalent day in the previous year
    -- matching the same weekday. Start from the natural date and find the nearest
    -- matching weekday.
    UPDATE c
    SET FechaAnteriorAjustada = (
        SELECT TOP 1 prev.dt
        FROM (
            SELECT DATEADD(DAY, o.offset_val, c.FechaAnterior) AS dt
            FROM (VALUES (-3),(-2),(-1),(0),(1),(2),(3)) AS o(offset_val)
        ) prev
        WHERE (DATEPART(WEEKDAY, prev.dt) + @@DATEFIRST + 5) % 7 + 1 = c.IdDia
          AND YEAR(prev.dt) = @AnoAnterior
        ORDER BY ABS(DATEDIFF(DAY, c.FechaAnterior, prev.dt))
    )
    FROM #Calendario c;

    -- ============================================
    -- 4. APPLY EVENT OVERRIDES
    -- ============================================
    -- Events with USARENPRESUPUESTO='S' override the adjusted date mapping
    UPDATE c
    SET FechaAnteriorAjustada = ef.FECHA_EFECTIVA,
        FechaAnterior = ef.FECHA_EFECTIVA
    FROM #Calendario c
    INNER JOIN DIM_EVENTOS_FECHAS ef ON ef.FECHA = c.Fecha
    INNER JOIN DIM_EVENTOS e ON e.IDEVENTO = ef.IDEVENTO
    WHERE e.USARENPRESUPUESTO = 'S'
      AND (ef.Canal IS NULL OR LTRIM(RTRIM(ef.Canal)) = '');

    -- ============================================
    -- 5. GET STORES AND CHANNELS
    -- ============================================
    IF OBJECT_ID('tempdb..#Almacenes') IS NOT NULL DROP TABLE #Almacenes;

    -- Get distinct stores from BI_VENTAS with their data
    SELECT DISTINCT
        v.CODALMACEN AS CodAlmacen,
        MAX(v.RESTAURANTE) AS NombreLocal,
        LEFT(v.CODALMACEN, 1) AS Serie,
        ROW_NUMBER() OVER (ORDER BY v.CODALMACEN) + 1000 AS IdLocal
    INTO #Almacenes
    FROM BI_VENTAS_ROSTIPOLLOS v
    WHERE v.ANO IN (@AnoModelo, @AnoAnterior)
      AND v.CODALMACEN IS NOT NULL
      AND (@CodAlmacen IS NULL OR v.CODALMACEN = @CodAlmacen)
    GROUP BY v.CODALMACEN;

    -- Also include stores from Consolidado that may not be in BI_VENTAS yet
    INSERT INTO #Almacenes (CodAlmacen, NombreLocal, Serie, IdLocal)
    SELECT DISTINCT
        cm.CodAlmacen,
        MAX(cm.RESTAURANTE) AS NombreLocal,
        LEFT(cm.CodAlmacen, 1) AS Serie,
        ROW_NUMBER() OVER (ORDER BY cm.CodAlmacen) + 5000
    FROM KpisRosti_Consolidado_Mensual cm
    WHERE cm.Ano = @AnoModelo
      AND cm.CodAlmacen NOT IN (SELECT CodAlmacen FROM #Almacenes)
      AND (@CodAlmacen IS NULL OR cm.CodAlmacen = @CodAlmacen)
    GROUP BY cm.CodAlmacen;

    -- Define channels
    IF OBJECT_ID('tempdb..#Canales') IS NOT NULL DROP TABLE #Canales;
    CREATE TABLE #Canales (Canal NVARCHAR(200));
    INSERT INTO #Canales VALUES ('AutoPollo'),('ECommerce'),('Express'),('Llevar'),('Salón'),('UberEats');

    -- ============================================
    -- 6. GET RAW PREVIOUS-YEAR SALES by day/store/channel
    -- ============================================
    IF OBJECT_ID('tempdb..#VentasAnterior') IS NOT NULL DROP TABLE #VentasAnterior;

    SELECT
        v.CODALMACEN AS CodAlmacen,
        v.CANAL AS Canal,
        CAST(v.FECHA AS DATE) AS Fecha,
        MONTH(v.FECHA) AS Mes,
        SUM(v.[VENTAS NETAS]) AS Ventas,
        SUM(v.Transacciones) AS Transacciones
    INTO #VentasAnterior
    FROM BI_VENTAS_ROSTIPOLLOS v
    WHERE v.ANO = @AnoAnterior
      AND v.CODALMACEN IS NOT NULL
      AND v.CANAL IN (SELECT Canal FROM #Canales)
      AND (@CodAlmacen IS NULL OR v.CODALMACEN = @CodAlmacen)
    GROUP BY v.CODALMACEN, v.CANAL, CAST(v.FECHA AS DATE), MONTH(v.FECHA);

    -- ============================================
    -- 7. HANDLE NEW STORES (reference mapping)
    --    Clone raw sales data for stores without history
    -- ============================================
    INSERT INTO #VentasAnterior (CodAlmacen, Canal, Fecha, Mes, Ventas, Transacciones)
    SELECT
        m.CodAlmacenNuevo,
        va.Canal,
        va.Fecha,
        va.Mes,
        va.Ventas,
        va.Transacciones
    FROM DIM_MAPEO_PRESUPUESTO_LOCALES m
    INNER JOIN #VentasAnterior va ON va.CodAlmacen = m.CodAlmacenReferencia
    WHERE m.NombrePresupuesto = @NombrePresupuesto
      AND m.Activo = 1
      AND NOT EXISTS (SELECT 1 FROM #VentasAnterior va2
                      WHERE va2.CodAlmacen = m.CodAlmacenNuevo AND va2.Canal = va.Canal AND va2.Mes = va.Mes)
      AND (m.Canal IS NULL OR m.Canal = va.Canal);

    -- ============================================
    -- 8. BUILD NORMALIZED PARTICIPATION TABLE
    --    Key: each model-year day gets a weight from the
    --    adjusted previous-year date, but normalized so that
    --    all days within the SAME MODEL-YEAR MONTH sum to 1.0
    -- ============================================
    IF OBJECT_ID('tempdb..#DiaRaw') IS NOT NULL DROP TABLE #DiaRaw;

    -- For each calendar day, get the raw sales from its adjusted equivalent date
    SELECT
        cal.Fecha,
        cal.Mes AS MesModelo,       -- Month in the MODEL year (for normalization)
        a.CodAlmacen,
        ch.Canal,
        ISNULL(va.Ventas, 0)         AS RawVentas,
        ISNULL(va.Transacciones, 0)  AS RawTransacciones
    INTO #DiaRaw
    FROM #Calendario cal
    CROSS JOIN #Almacenes a
    CROSS JOIN #Canales ch
    LEFT JOIN #VentasAnterior va
        ON va.Fecha = cal.FechaAnteriorAjustada
        AND va.CodAlmacen = a.CodAlmacen
        AND va.Canal = ch.Canal
    WHERE (@Mes IS NULL OR cal.Mes = @Mes)
      AND (@CodAlmacen IS NULL OR a.CodAlmacen = @CodAlmacen);

    -- Calculate the monthly sum of raw values (for normalization denominator)
    IF OBJECT_ID('tempdb..#MesSumRaw') IS NOT NULL DROP TABLE #MesSumRaw;

    SELECT
        MesModelo, CodAlmacen, Canal,
        SUM(RawVentas)        AS SumRawVentas,
        SUM(RawTransacciones) AS SumRawTransacciones,
        COUNT(*)              AS DiasEnMes
    INTO #MesSumRaw
    FROM #DiaRaw
    GROUP BY MesModelo, CodAlmacen, Canal;

    -- Build normalized participation:
    --   If the month has sales data: weight = raw_day / sum_month  (sums to 1.0)
    --   If the month has NO sales data: uniform = 1 / days_in_month (sums to 1.0)
    IF OBJECT_ID('tempdb..#Participacion') IS NOT NULL DROP TABLE #Participacion;

    SELECT
        d.Fecha,
        d.MesModelo,
        d.CodAlmacen,
        d.Canal,
        -- Normalized participation for Ventas
        CASE
            WHEN ms.SumRawVentas > 0 THEN d.RawVentas / ms.SumRawVentas
            ELSE 1.0 / ms.DiasEnMes
        END AS ParticipacionVentas,
        -- Normalized participation for Transacciones
        CASE
            WHEN ms.SumRawTransacciones > 0 THEN CAST(d.RawTransacciones AS FLOAT) / ms.SumRawTransacciones
            ELSE 1.0 / ms.DiasEnMes
        END AS ParticipacionTransacciones
    INTO #Participacion
    FROM #DiaRaw d
    INNER JOIN #MesSumRaw ms
        ON ms.MesModelo = d.MesModelo
        AND ms.CodAlmacen = d.CodAlmacen
        AND ms.Canal = d.Canal;

    -- ============================================
    -- 9. DELETE EXISTING DATA (for the scope being recalculated)
    -- ============================================
    SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre';
    IF @CodAlmacen IS NOT NULL SET @SQL = @SQL + N' AND CodAlmacen = @cod';
    IF @Mes IS NOT NULL SET @SQL = @SQL + N' AND Mes = @mes';
    -- Delete individual stores, groups, and Todos (all will be regenerated)
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes;

    -- ============================================
    -- 10. DISTRIBUTE MONTHLY BUDGET TO DAILY
    -- ============================================
    IF OBJECT_ID('tempdb..#Resultado') IS NOT NULL DROP TABLE #Resultado;

    CREATE TABLE #Resultado (
        Fecha               DATE,
        idLocal             INT,
        [Local]             NVARCHAR(255),
        Serie               VARCHAR(2),
        idDia               INT,
        Dia                 NVARCHAR(255),
        Mes                 INT,
        Monto               FLOAT,          -- Budget
        CodAlmacen          NVARCHAR(10),
        Participacion       FLOAT,
        Canal               NVARCHAR(200),
        Ano                 INT,
        Tipo                NVARCHAR(100),
        FechaAnterior       DATETIME,
        MontoAnterior       FLOAT,
        ParticipacionAnterior FLOAT,
        FechaAnteriorAjustada DATETIME,
        MontoAnteriorAjustado FLOAT,
        ParticipacionAnteriorAjustado FLOAT,
        MontoReal           FLOAT,
        ParticipacionReal   FLOAT,
        NombrePresupuesto   NVARCHAR(100)
    );

    -- Process each type: Ventas and Transacciones
    DECLARE @TipoProc NVARCHAR(100);
    DECLARE tipo_cursor CURSOR FOR SELECT 'Ventas' UNION ALL SELECT 'Transacciones';
    OPEN tipo_cursor;
    FETCH NEXT FROM tipo_cursor INTO @TipoProc;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Get consolidado monthly totals (unpivot channels)
        IF OBJECT_ID('tempdb..#ConsolidadoMes') IS NOT NULL DROP TABLE #ConsolidadoMes;

        SELECT
            cm.CodAlmacen,
            cm.Mes,
            ch.Canal,
            CASE ch.Canal
                WHEN 'Salón' THEN cm.SALON
                WHEN 'Llevar' THEN cm.LLEVAR
                WHEN 'AutoPollo' THEN cm.AUTO
                WHEN 'Express' THEN cm.EXPRESS
                WHEN 'ECommerce' THEN cm.ECOMMERCE
                WHEN 'UberEats' THEN cm.UBEREATS
            END AS PresupuestoMensual
        INTO #ConsolidadoMes
        FROM KpisRosti_Consolidado_Mensual cm
        CROSS JOIN #Canales ch
        WHERE cm.Ano = @AnoModelo
          AND cm.Tipo = @TipoProc
          AND (@CodAlmacen IS NULL OR cm.CodAlmacen = @CodAlmacen)
          AND (@Mes IS NULL OR cm.Mes = @Mes);

        -- Join normalized participation with calendar and consolidado
        INSERT INTO #Resultado (
            Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
            CodAlmacen, Participacion, Canal, Ano, Tipo,
            FechaAnterior, MontoAnterior, ParticipacionAnterior,
            FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
            MontoReal, ParticipacionReal, NombrePresupuesto
        )
        SELECT
            cal.Fecha,
            a.IdLocal,
            a.NombreLocal,
            a.Serie,
            cal.IdDia,
            cal.NombreDia,
            cal.Mes,
            -- Distribute: monthly total * NORMALIZED daily participation
            CASE
                WHEN @TipoProc = 'Transacciones'
                THEN ROUND(
                    ISNULL(cm.PresupuestoMensual, 0) *
                    ISNULL(CASE @TipoProc
                        WHEN 'Transacciones' THEN p.ParticipacionTransacciones
                        ELSE p.ParticipacionVentas
                    END, 0)
                , 0)
                ELSE
                    ISNULL(cm.PresupuestoMensual, 0) *
                    ISNULL(p.ParticipacionVentas, 0)
            END,
            a.CodAlmacen,
            CASE
                WHEN @TipoProc = 'Transacciones' THEN ISNULL(p.ParticipacionTransacciones, 0)
                ELSE ISNULL(p.ParticipacionVentas, 0)
            END,
            cm.Canal,
            @AnoModelo,
            @TipoProc,
            cal.FechaAnterior,
            NULL, -- MontoAnterior: filled later
            NULL, -- ParticipacionAnterior
            cal.FechaAnteriorAjustada,
            NULL, -- MontoAnteriorAjustado: filled later
            NULL, -- ParticipacionAnteriorAjustado
            NULL, -- MontoReal: filled later
            NULL, -- ParticipacionReal
            @NombrePresupuesto
        FROM #Calendario cal
        INNER JOIN #ConsolidadoMes cm ON cm.Mes = cal.Mes
        INNER JOIN #Almacenes a ON a.CodAlmacen = cm.CodAlmacen
        LEFT JOIN #Participacion p
            ON p.Fecha = cal.Fecha
            AND p.CodAlmacen = a.CodAlmacen
            AND p.Canal = cm.Canal
        WHERE (@Mes IS NULL OR cal.Mes = @Mes);

        -- ============================================
        -- 10b. ADJUST ROUNDING for Transactions (integers, largest remainder)
        -- ============================================
        IF @TipoProc = 'Transacciones'
        BEGIN
            -- Calculate the rounding residual per store/channel/month
            IF OBJECT_ID('tempdb..#Residuos') IS NOT NULL DROP TABLE #Residuos;

            ;WITH Sums AS (
                SELECT CodAlmacen, Canal, Mes,
                       SUM(Monto) AS SumaDistribuida
                FROM #Resultado
                WHERE Tipo = 'Transacciones'
                GROUP BY CodAlmacen, Canal, Mes
            )
            SELECT
                s.CodAlmacen, s.Canal, s.Mes,
                ISNULL(cm.PresupuestoMensual, 0) - s.SumaDistribuida AS Residuo
            INTO #Residuos
            FROM Sums s
            INNER JOIN #ConsolidadoMes cm ON cm.CodAlmacen = s.CodAlmacen AND cm.Canal = s.Canal AND cm.Mes = s.Mes
            WHERE ABS(ISNULL(cm.PresupuestoMensual, 0) - s.SumaDistribuida) >= 1;

            -- Distribute residual using largest remainder method
            -- Use fractional part of the actual MONTO (before rounding), not of participation
            ;WITH MontoDecimal AS (
                SELECT
                    r.Fecha, r.CodAlmacen, r.Canal, r.Mes,
                    -- The "true" decimal monto before rounding
                    ISNULL(cm.PresupuestoMensual, 0) * r.Participacion AS MontoExacto
                FROM #Resultado r
                INNER JOIN #ConsolidadoMes cm ON cm.CodAlmacen = r.CodAlmacen AND cm.Canal = r.Canal AND cm.Mes = r.Mes
                WHERE r.Tipo = 'Transacciones'
            ),
            Ranked AS (
                SELECT md.Fecha, md.CodAlmacen, md.Canal, md.Mes,
                       md.MontoExacto - FLOOR(md.MontoExacto) AS Frac,
                       ROW_NUMBER() OVER (
                           PARTITION BY md.CodAlmacen, md.Canal, md.Mes
                           ORDER BY (md.MontoExacto - FLOOR(md.MontoExacto)) DESC, md.Fecha
                       ) AS RN,
                       res.Residuo
                FROM MontoDecimal md
                INNER JOIN #Residuos res ON res.CodAlmacen = md.CodAlmacen AND res.Canal = md.Canal AND res.Mes = md.Mes
            )
            UPDATE #Resultado
            SET Monto = Monto + SIGN(rk.Residuo)
            FROM #Resultado
            INNER JOIN Ranked rk ON rk.Fecha = #Resultado.Fecha AND rk.CodAlmacen = #Resultado.CodAlmacen AND rk.Canal = #Resultado.Canal
            WHERE #Resultado.Tipo = 'Transacciones'
              AND rk.RN <= ABS(rk.Residuo);
        END

        FETCH NEXT FROM tipo_cursor INTO @TipoProc;
    END
    CLOSE tipo_cursor;
    DEALLOCATE tipo_cursor;

    -- ============================================
    -- 11. GENERATE TQP (Ventas / Transacciones)
    -- ============================================
    INSERT INTO #Resultado (
        Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
        CodAlmacen, Participacion, Canal, Ano, Tipo,
        FechaAnterior, MontoAnterior, ParticipacionAnterior,
        FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
        MontoReal, ParticipacionReal, NombrePresupuesto
    )
    SELECT
        v.Fecha, v.idLocal, v.[Local], v.Serie, v.idDia, v.Dia, v.Mes,
        CASE WHEN t.Monto > 0 THEN v.Monto / t.Monto ELSE 0 END,
        v.CodAlmacen, 0, v.Canal, v.Ano, 'TQP',
        v.FechaAnterior, NULL, NULL,
        v.FechaAnteriorAjustada, NULL, NULL,
        NULL, NULL, v.NombrePresupuesto
    FROM #Resultado v
    INNER JOIN #Resultado t ON t.Fecha = v.Fecha AND t.CodAlmacen = v.CodAlmacen AND t.Canal = v.Canal AND t.Tipo = 'Transacciones'
    WHERE v.Tipo = 'Ventas';

    -- ============================================
    -- 12. POPULATE ACTUAL SALES DATA (previous year + current year)
    -- ============================================
    -- Previous year natural: MontoAnterior
    UPDATE r
    SET MontoAnterior = CASE r.Tipo
            WHEN 'Ventas' THEN va.Ventas
            WHEN 'Transacciones' THEN va.Transacciones
            WHEN 'TQP' THEN CASE WHEN va.Transacciones > 0 THEN va.Ventas / va.Transacciones ELSE 0 END
        END
    FROM #Resultado r
    INNER JOIN #VentasAnterior va ON va.Fecha = r.FechaAnterior AND va.CodAlmacen = r.CodAlmacen AND va.Canal = r.Canal;

    -- Previous year adjusted: MontoAnteriorAjustado
    UPDATE r
    SET MontoAnteriorAjustado = CASE r.Tipo
            WHEN 'Ventas' THEN va.Ventas
            WHEN 'Transacciones' THEN va.Transacciones
            WHEN 'TQP' THEN CASE WHEN va.Transacciones > 0 THEN va.Ventas / va.Transacciones ELSE 0 END
        END
    FROM #Resultado r
    INNER JOIN #VentasAnterior va ON va.Fecha = r.FechaAnteriorAjustada AND va.CodAlmacen = r.CodAlmacen AND va.Canal = r.Canal;

    -- Current year actual: MontoReal (only for completed days < today)
    IF OBJECT_ID('tempdb..#VentasActual') IS NOT NULL DROP TABLE #VentasActual;

    SELECT
        v.CODALMACEN AS CodAlmacen,
        v.CANAL AS Canal,
        CAST(v.FECHA AS DATE) AS Fecha,
        SUM(v.[VENTAS NETAS]) AS Ventas,
        SUM(v.Transacciones) AS Transacciones
    INTO #VentasActual
    FROM BI_VENTAS_ROSTIPOLLOS v
    WHERE v.ANO = @AnoModelo
      AND CAST(v.FECHA AS DATE) < @Hoy
      AND v.CODALMACEN IS NOT NULL
      AND v.CANAL IN (SELECT Canal FROM #Canales)
      AND (@CodAlmacen IS NULL OR v.CODALMACEN = @CodAlmacen)
    GROUP BY v.CODALMACEN, v.CANAL, CAST(v.FECHA AS DATE);

    UPDATE r
    SET MontoReal = CASE r.Tipo
            WHEN 'Ventas' THEN va.Ventas
            WHEN 'Transacciones' THEN va.Transacciones
            WHEN 'TQP' THEN CASE WHEN va.Transacciones > 0 THEN va.Ventas / va.Transacciones ELSE 0 END
        END
    FROM #Resultado r
    INNER JOIN #VentasActual va ON va.Fecha = r.Fecha AND va.CodAlmacen = r.CodAlmacen AND va.Canal = r.Canal;

    -- ============================================
    -- 13. CALCULATE PARTICIPATIONS for previous year data
    -- ============================================
    ;WITH MonthlyTotals AS (
        SELECT CodAlmacen, Canal, Mes, Tipo,
               SUM(ISNULL(MontoAnterior, 0)) AS TotalAnterior,
               SUM(ISNULL(MontoAnteriorAjustado, 0)) AS TotalAnteriorAjustado,
               SUM(ISNULL(MontoReal, 0)) AS TotalReal
        FROM #Resultado
        GROUP BY CodAlmacen, Canal, Mes, Tipo
    )
    UPDATE r
    SET ParticipacionAnterior = CASE WHEN mt.TotalAnterior > 0 THEN ISNULL(r.MontoAnterior, 0) / mt.TotalAnterior ELSE 0 END,
        ParticipacionAnteriorAjustado = CASE WHEN mt.TotalAnteriorAjustado > 0 THEN ISNULL(r.MontoAnteriorAjustado, 0) / mt.TotalAnteriorAjustado ELSE 0 END,
        ParticipacionReal = CASE WHEN mt.TotalReal > 0 THEN ISNULL(r.MontoReal, 0) / mt.TotalReal ELSE 0 END
    FROM #Resultado r
    INNER JOIN MonthlyTotals mt ON mt.CodAlmacen = r.CodAlmacen AND mt.Canal = r.Canal AND mt.Mes = r.Mes AND mt.Tipo = r.Tipo;

    -- ============================================
    -- 14. INSERT INTO DESTINATION TABLE (individual stores)
    -- ============================================
    SET @SQL = N'
    INSERT INTO [' + @TablaDestino + '] (
        Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, Monto,
        CodAlmacen, Participacion, Canal, Año, Tipo,
        FechaAnterior, MontoAnterior, ParticipacionAnterior,
        FechaAnteriorAjustada, MontoAnteriorAjustado, ParticipacionAnteriorAjustado,
        MontoReal, ParticipacionReal,
        Monto_Acumulado, MontoAnterior_Acumulado, MontoAnteriorAjustado_Acumulado,
        Monto_Dif, MontoAnterior_Dif, MontoAnteriorAjustado_Dif,
        NombrePresupuesto
    )
    SELECT
        r.Fecha, r.idLocal, r.[Local], r.Serie, r.idDia, r.Dia, r.Mes, r.Monto,
        r.CodAlmacen, r.Participacion, r.Canal, r.Ano, r.Tipo,
        r.FechaAnterior, r.MontoAnterior, r.ParticipacionAnterior,
        r.FechaAnteriorAjustada, r.MontoAnteriorAjustado, r.ParticipacionAnteriorAjustado,
        r.MontoReal, r.ParticipacionReal,
        NULL, NULL, NULL, NULL, NULL, NULL,
        r.NombrePresupuesto
    FROM #Resultado r;';
    EXEC sp_executesql @SQL;

    -- ============================================
    -- 15. GENERATE "Todos" CHANNEL (sum of all base channels)
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
        Fecha, MIN(idLocal), MIN([Local]), MIN(Serie), MIN(idDia), MIN(Dia), Mes,
        SUM(Monto),
        CodAlmacen, 0, ''Todos'', MIN(Año), Tipo,
        MIN(FechaAnterior), SUM(ISNULL(MontoAnterior, 0)), 0,
        MIN(FechaAnteriorAjustada), SUM(ISNULL(MontoAnteriorAjustado, 0)), 0,
        SUM(ISNULL(MontoReal, 0)), 0,
        NombrePresupuesto
    FROM [' + @TablaDestino + ']
    WHERE NombrePresupuesto = @nombre
      AND Canal != ''Todos''
      AND LEFT(CodAlmacen, 1) != ''G''
      AND Tipo IN (''Ventas'', ''Transacciones'')
    GROUP BY Fecha, CodAlmacen, Tipo, Mes, NombrePresupuesto;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @NombrePresupuesto;

    -- Generate TQP for "Todos"
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
        v.Fecha, v.idLocal, v.[Local], v.Serie, v.idDia, v.Dia, v.Mes,
        CASE WHEN t.Monto > 0 THEN v.Monto / t.Monto ELSE 0 END,
        v.CodAlmacen, 0, ''Todos'', v.Año, ''TQP'',
        v.FechaAnterior,
        CASE WHEN t.MontoAnterior > 0 THEN v.MontoAnterior / t.MontoAnterior ELSE 0 END, 0,
        v.FechaAnteriorAjustada,
        CASE WHEN t.MontoAnteriorAjustado > 0 THEN v.MontoAnteriorAjustado / t.MontoAnteriorAjustado ELSE 0 END, 0,
        CASE WHEN t.MontoReal > 0 THEN v.MontoReal / t.MontoReal ELSE 0 END, 0,
        v.NombrePresupuesto
    FROM [' + @TablaDestino + '] v
    INNER JOIN [' + @TablaDestino + '] t ON t.Fecha = v.Fecha AND t.CodAlmacen = v.CodAlmacen AND t.Canal = ''Todos'' AND t.Tipo = ''Transacciones'' AND t.NombrePresupuesto = v.NombrePresupuesto
    WHERE v.Canal = ''Todos'' AND v.Tipo = ''Ventas'' AND v.NombrePresupuesto = @nombre;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @NombrePresupuesto;

    -- ============================================
    -- 16. GENERATE STORE GROUPS (CODVISIBLE=20)
    -- ============================================
    IF OBJECT_ID('tempdb..#Grupos') IS NOT NULL DROP TABLE #Grupos;

    -- Only generate groups if the group tables exist
    IF OBJECT_ID('GRUPO_ALMACEN') IS NOT NULL AND OBJECT_ID('GRUPO_ALMACEN_LIN') IS NOT NULL
    BEGIN
        SELECT
            g.IDGRUPO,
            'G' + RIGHT('0' + CAST(g.IDGRUPO - 3000 + 1 AS VARCHAR(2)), 2) AS CodAlmacenGrupo,
            g.DESCRIPCION AS NombreGrupo,
            gl.CODALMACEN AS CodAlmacenMiembro,
            ROW_NUMBER() OVER (ORDER BY g.IDGRUPO) + 9000 AS IdLocalGrupo
        INTO #Grupos
        FROM GRUPO_ALMACEN g
        INNER JOIN GRUPO_ALMACEN_LIN gl ON gl.IDGRUPO = g.IDGRUPO
        WHERE g.CODVISIBLE = 20;

        -- Insert group aggregations (Ventas + Transacciones)
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
            r.Fecha, MIN(g.IdLocalGrupo), MIN(g.NombreGrupo), ''G'', MIN(r.idDia), MIN(r.Dia), r.Mes,
            SUM(r.Monto),
            g.CodAlmacenGrupo, 0, r.Canal, MIN(r.Año), r.Tipo,
            MIN(r.FechaAnterior), SUM(ISNULL(r.MontoAnterior, 0)), 0,
            MIN(r.FechaAnteriorAjustada), SUM(ISNULL(r.MontoAnteriorAjustado, 0)), 0,
            SUM(ISNULL(r.MontoReal, 0)), 0,
            r.NombrePresupuesto
        FROM [' + @TablaDestino + '] r
        INNER JOIN #Grupos g ON g.CodAlmacenMiembro = r.CodAlmacen
        WHERE r.NombrePresupuesto = @nombre
          AND LEFT(r.CodAlmacen, 1) != ''G''
          AND r.Tipo IN (''Ventas'', ''Transacciones'')
        GROUP BY r.Fecha, g.CodAlmacenGrupo, r.Canal, r.Tipo, r.Mes, r.NombrePresupuesto;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @NombrePresupuesto;

        -- Generate TQP for groups
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
            v.Fecha, v.idLocal, v.[Local], v.Serie, v.idDia, v.Dia, v.Mes,
            CASE WHEN t.Monto > 0 THEN v.Monto / t.Monto ELSE 0 END,
            v.CodAlmacen, 0, v.Canal, v.Año, ''TQP'',
            v.FechaAnterior,
            CASE WHEN t.MontoAnterior > 0 THEN v.MontoAnterior / t.MontoAnterior ELSE 0 END, 0,
            v.FechaAnteriorAjustada,
            CASE WHEN t.MontoAnteriorAjustado > 0 THEN v.MontoAnteriorAjustado / t.MontoAnteriorAjustado ELSE 0 END, 0,
            CASE WHEN t.MontoReal > 0 THEN v.MontoReal / t.MontoReal ELSE 0 END, 0,
            v.NombrePresupuesto
        FROM [' + @TablaDestino + '] v
        INNER JOIN [' + @TablaDestino + '] t ON t.Fecha = v.Fecha AND t.CodAlmacen = v.CodAlmacen AND t.Canal = v.Canal AND t.Tipo = ''Transacciones'' AND t.NombrePresupuesto = v.NombrePresupuesto
        WHERE LEFT(v.CodAlmacen, 1) = ''G'' AND v.Tipo = ''Ventas'' AND v.NombrePresupuesto = @nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @NombrePresupuesto;
    END -- IF GRUPO_ALMACEN exists

    -- ============================================
    -- 17. CALCULATE ACCUMULATED VALUES AND DIFFERENCES
    -- ============================================
    -- Accumulates: running sums per month
    -- Differences: accumulated real vs accumulated budget/anterior
    SET @SQL = N'
    ;WITH Acumulados AS (
        SELECT
            Fecha, CodAlmacen, Canal, Tipo, Mes,
            SUM(Monto) OVER (PARTITION BY CodAlmacen, Canal, Tipo, Mes, NombrePresupuesto ORDER BY Fecha) AS MontoAcum,
            SUM(ISNULL(MontoAnterior, 0)) OVER (PARTITION BY CodAlmacen, Canal, Tipo, Mes, NombrePresupuesto ORDER BY Fecha) AS MontoAntAcum,
            SUM(ISNULL(MontoAnteriorAjustado, 0)) OVER (PARTITION BY CodAlmacen, Canal, Tipo, Mes, NombrePresupuesto ORDER BY Fecha) AS MontoAntAjAcum,
            SUM(ISNULL(MontoReal, 0)) OVER (PARTITION BY CodAlmacen, Canal, Tipo, Mes, NombrePresupuesto ORDER BY Fecha) AS MontoRealAcum
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto = @nombre
    )
    UPDATE t
    SET Monto_Acumulado = a.MontoAcum,
        MontoAnterior_Acumulado = a.MontoAntAcum,
        MontoAnteriorAjustado_Acumulado = a.MontoAntAjAcum,
        -- Differences: Real acumulado vs each accumulated budget/anterior
        Monto_Dif = a.MontoRealAcum - a.MontoAcum,
        MontoAnterior_Dif = a.MontoRealAcum - a.MontoAntAcum,
        MontoAnteriorAjustado_Dif = a.MontoRealAcum - a.MontoAntAjAcum
    FROM [' + @TablaDestino + '] t
    INNER JOIN Acumulados a ON a.Fecha = t.Fecha AND a.CodAlmacen = t.CodAlmacen AND a.Canal = t.Canal AND a.Tipo = t.Tipo AND a.Mes = t.Mes
    WHERE t.NombrePresupuesto = @nombre;';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @NombrePresupuesto;

    -- ============================================
    -- 18. APPLY ADJUSTMENTS from MODELO_PRESUPUESTO_AJUSTES
    -- ============================================
    DECLARE @AjusteId INT, @AjCod NVARCHAR(10), @AjMes INT, @AjCanal NVARCHAR(200);
    DECLARE @AjTipo NVARCHAR(100), @AjMetodo NVARCHAR(50), @AjValor DECIMAL(18,4), @AjDistrib NVARCHAR(50);
    DECLARE @TotalPresu FLOAT;
    DECLARE @Factor FLOAT;
    DECLARE @NewTotal FLOAT;
    DECLARE @NormFactor FLOAT;

    DECLARE ajuste_cursor CURSOR FOR
        SELECT Id, CodAlmacen, Mes, Canal, Tipo, MetodoAjuste, ValorAjuste, MetodoDistribucion
        FROM MODELO_PRESUPUESTO_AJUSTES
        WHERE NombrePresupuesto = @NombrePresupuesto AND Activo = 1
          AND (@CodAlmacen IS NULL OR CodAlmacen = @CodAlmacen)
          AND (@Mes IS NULL OR Mes = @Mes)
        ORDER BY FechaAplicacion;

    OPEN ajuste_cursor;
    FETCH NEXT FROM ajuste_cursor INTO @AjusteId, @AjCod, @AjMes, @AjCanal, @AjTipo, @AjMetodo, @AjValor, @AjDistrib;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Reset variables for each iteration
        SET @TotalPresu = NULL;
        SET @Factor = 1;
        SET @NewTotal = NULL;
        SET @NormFactor = 1;

        SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = @canal AND Tipo = @tipo';
        EXEC sp_executesql @SQL,
            N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
            @nombre = @NombrePresupuesto, @cod = @AjCod, @mes = @AjMes, @canal = @AjCanal, @tipo = @AjTipo, @tot = @TotalPresu OUTPUT;

        IF @TotalPresu IS NOT NULL AND @TotalPresu != 0
        BEGIN
            IF @AjMetodo = 'Porcentaje' SET @Factor = 1 + (@AjValor / 100.0);
            ELSE IF @AjMetodo = 'Factor' SET @Factor = @AjValor;
            ELSE IF @AjMetodo = 'MontoAbsoluto' SET @Factor = (@TotalPresu + @AjValor) / @TotalPresu;

            -- Apply factor
            SET @SQL = N'
            UPDATE [' + @TablaDestino + ']
            SET Monto = Monto * @factor
            WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = @canal AND Tipo = @tipo';
            EXEC sp_executesql @SQL,
                N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @factor FLOAT',
                @nombre = @NombrePresupuesto, @cod = @AjCod, @mes = @AjMes, @canal = @AjCanal, @tipo = @AjTipo, @factor = @Factor;

            -- Re-normalize to ensure monthly total matches after factor (for sum-zero)
            SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = @canal AND Tipo = @tipo';
            EXEC sp_executesql @SQL,
                N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
                @nombre = @NombrePresupuesto, @cod = @AjCod, @mes = @AjMes, @canal = @AjCanal, @tipo = @AjTipo, @tot = @NewTotal OUTPUT;

            IF @NewTotal IS NOT NULL AND @NewTotal > 0 AND ABS(@NewTotal - @TotalPresu) > 0.01
            BEGIN
                SET @NormFactor = @TotalPresu / @NewTotal;
                SET @SQL = N'
                UPDATE [' + @TablaDestino + ']
                SET Monto = Monto * @nfactor
                WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = @canal AND Tipo = @tipo';
                EXEC sp_executesql @SQL,
                    N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @nfactor FLOAT',
                    @nombre = @NombrePresupuesto, @cod = @AjCod, @mes = @AjMes, @canal = @AjCanal, @tipo = @AjTipo, @nfactor = @NormFactor;
            END
        END

        FETCH NEXT FROM ajuste_cursor INTO @AjusteId, @AjCod, @AjMes, @AjCanal, @AjTipo, @AjMetodo, @AjValor, @AjDistrib;
    END
    CLOSE ajuste_cursor;
    DEALLOCATE ajuste_cursor;

    -- ============================================
    -- 19. LOG EXECUTION IN BITACORA
    -- ============================================
    DECLARE @TotalRows INT;
    SET @SQL = N'SELECT @cnt = COUNT(*) FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre';
    EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100), @cnt INT OUTPUT', @nombre = @NombrePresupuesto, @cnt = @TotalRows OUTPUT;

    INSERT INTO MODELO_PRESUPUESTO_BITACORA
        (NombrePresupuesto, Usuario, Accion, Origen, CodAlmacen, Mes, Motivo, Detalle)
    VALUES
        (@NombrePresupuesto, @Usuario, 'Recalculo', CASE WHEN @Usuario = 'JOB' THEN 'Job' ELSE 'Manual' END,
         @CodAlmacen, @Mes,
         CASE WHEN @Usuario = 'JOB' THEN 'Ejecución automática diaria' ELSE 'Recálculo manual' END,
         '{"registros":' + CAST(@TotalRows AS NVARCHAR(20)) + ',"tabla":"' + @TablaDestino + '"}');

    -- ============================================
    -- 20. UPDATE CONFIG with last execution info
    -- ============================================
    UPDATE MODELO_PRESUPUESTO_CONFIG
    SET UltimoCalculo = GETDATE(),
        UltimoUsuario = @Usuario,
        FechaModificacion = GETDATE()
    WHERE NombrePresupuesto = @NombrePresupuesto;

    COMMIT TRANSACTION;

    -- Return summary
    SELECT @TotalRows AS TotalRegistros,
           @NombrePresupuesto AS NombrePresupuesto,
           @TablaDestino AS TablaDestino;

    -- Cleanup temp tables
    IF OBJECT_ID('tempdb..#Calendario') IS NOT NULL DROP TABLE #Calendario;
    IF OBJECT_ID('tempdb..#Almacenes') IS NOT NULL DROP TABLE #Almacenes;
    IF OBJECT_ID('tempdb..#Canales') IS NOT NULL DROP TABLE #Canales;
    IF OBJECT_ID('tempdb..#VentasAnterior') IS NOT NULL DROP TABLE #VentasAnterior;
    IF OBJECT_ID('tempdb..#DiaRaw') IS NOT NULL DROP TABLE #DiaRaw;
    IF OBJECT_ID('tempdb..#MesSumRaw') IS NOT NULL DROP TABLE #MesSumRaw;
    IF OBJECT_ID('tempdb..#Participacion') IS NOT NULL DROP TABLE #Participacion;
    IF OBJECT_ID('tempdb..#Resultado') IS NOT NULL DROP TABLE #Resultado;
    IF OBJECT_ID('tempdb..#VentasActual') IS NOT NULL DROP TABLE #VentasActual;
    IF OBJECT_ID('tempdb..#Grupos') IS NOT NULL DROP TABLE #Grupos;
    IF OBJECT_ID('tempdb..#Residuos') IS NOT NULL DROP TABLE #Residuos;
    IF OBJECT_ID('tempdb..#ConsolidadoMes') IS NOT NULL DROP TABLE #ConsolidadoMes;
END
GO

PRINT '✅ SP_CALCULAR_PRESUPUESTO v2 created successfully';
GO
