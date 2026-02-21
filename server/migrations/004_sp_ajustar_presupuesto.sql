-- ==========================================
-- SP_AJUSTAR_PRESUPUESTO
-- Applies budget adjustments maintaining sum-zero within the month
-- ==========================================
-- Receives adjustment parameters, applies to destination table,
-- redistributes difference to maintain monthly total integrity.
-- Logs changes in bitacora.
-- ==========================================

USE RP_BI_RESUMENES;
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SP_AJUSTAR_PRESUPUESTO]') AND type = 'P')
    DROP PROCEDURE [dbo].[SP_AJUSTAR_PRESUPUESTO];
GO

CREATE PROCEDURE [dbo].[SP_AJUSTAR_PRESUPUESTO]
    @NombrePresupuesto    NVARCHAR(100),
    @CodAlmacen           NVARCHAR(10),
    @Mes                  INT,
    @Canal                NVARCHAR(200),
    @Tipo                 NVARCHAR(100),      -- 'Ventas' or 'Transacciones'
    @MetodoAjuste         NVARCHAR(50),       -- 'Porcentaje' / 'MontoAbsoluto' / 'Factor'
    @ValorAjuste          DECIMAL(18,4),
    @MetodoDistribucion   NVARCHAR(50) = 'Mes',  -- 'Mes' / 'Semana' / 'TipoDia'
    @DiaSemana            INT = NULL,          -- For TipoDia distribution (1=Mon...7=Sun)
    @Usuario              NVARCHAR(200),
    @Motivo               NVARCHAR(500),
    @TablaDestino         NVARCHAR(100) = NULL,
    @SoloPreview          BIT = 0             -- 1 = preview only, don't save
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Resolve table
    IF @TablaDestino IS NULL
    BEGIN
        SELECT TOP 1 @TablaDestino = TablaDestino
        FROM MODELO_PRESUPUESTO_CONFIG
        WHERE NombrePresupuesto = @NombrePresupuesto AND Activo = 1;
    END

    IF @TablaDestino IS NULL
    BEGIN
        RAISERROR('No active budget configuration found', 16, 1);
        RETURN;
    END

    -- Validate: only Ventas or Transacciones can be adjusted (TQP is derived)
    IF @Tipo NOT IN ('Ventas', 'Transacciones')
    BEGIN
        RAISERROR('Solo se pueden ajustar Ventas o Transacciones. TQP es calculado.', 16, 1);
        RETURN;
    END

    DECLARE @SQL NVARCHAR(MAX);

    -- ============================================
    -- 1. Get current monthly total for this scope
    -- ============================================
    DECLARE @TotalMensualActual FLOAT;

    SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] 
                 WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes 
                 AND Canal = @canal AND Tipo = @tipo';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @tot = @TotalMensualActual OUTPUT;

    IF @TotalMensualActual IS NULL OR @TotalMensualActual = 0
    BEGIN
        RAISERROR('No budget data found for the specified scope', 16, 1);
        RETURN;
    END

    -- ============================================
    -- 2. Calculate adjustment factor
    -- ============================================
    DECLARE @Factor FLOAT = 1;

    IF @MetodoAjuste = 'Porcentaje'
        SET @Factor = 1 + (@ValorAjuste / 100.0);
    ELSE IF @MetodoAjuste = 'Factor'
        SET @Factor = @ValorAjuste;
    ELSE IF @MetodoAjuste = 'MontoAbsoluto'
        SET @Factor = (@TotalMensualActual + @ValorAjuste) / @TotalMensualActual;

    -- ============================================
    -- 3. PREVIEW MODE: show impact without saving
    -- ============================================
    IF @SoloPreview = 1
    BEGIN
        SET @SQL = N'
        SELECT
            Fecha,
            Dia,
            idDia,
            Monto AS MontoActual,
            CASE
                WHEN @distrib = ''Mes'' THEN Monto * @factor
                WHEN @distrib = ''Semana'' AND idDia = @diaSem THEN Monto * @factor
                WHEN @distrib = ''TipoDia'' AND idDia = @diaSem THEN Monto * @factor
                ELSE Monto
            END AS MontoNuevo,
            CASE
                WHEN @distrib = ''Mes'' THEN Monto * @factor - Monto
                WHEN @distrib = ''Semana'' AND idDia = @diaSem THEN Monto * @factor - Monto
                WHEN @distrib = ''TipoDia'' AND idDia = @diaSem THEN Monto * @factor - Monto
                ELSE 0
            END AS Diferencia,
            Canal, Tipo
        FROM [' + @TablaDestino + ']
        WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes
          AND Canal = @canal AND Tipo = @tipo
        ORDER BY Fecha';

        EXEC sp_executesql @SQL,
            N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @factor FLOAT, @distrib NVARCHAR(50), @diaSem INT',
            @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo,
            @factor = @Factor, @distrib = @MetodoDistribucion, @diaSem = @DiaSemana;

        RETURN;
    END

    -- ============================================
    -- 4. APPLY ADJUSTMENT
    -- ============================================
    BEGIN TRANSACTION;

    -- Store previous values for bitacora
    DECLARE @ValorAnteriorStr NVARCHAR(500);
    SET @ValorAnteriorStr = CAST(@TotalMensualActual AS NVARCHAR(50));

    -- Determine which days to adjust based on distribution method
    DECLARE @WhereClause NVARCHAR(500) = N'';

    IF @MetodoDistribucion = 'Semana' AND @DiaSemana IS NOT NULL
        SET @WhereClause = N' AND idDia = ' + CAST(@DiaSemana AS NVARCHAR(5));
    ELSE IF @MetodoDistribucion = 'TipoDia' AND @DiaSemana IS NOT NULL
        SET @WhereClause = N' AND idDia = ' + CAST(@DiaSemana AS NVARCHAR(5));

    -- Apply factor to selected days
    SET @SQL = N'
    UPDATE [' + @TablaDestino + ']
    SET Monto = Monto * @factor
    WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes
      AND Canal = @canal AND Tipo = @tipo' + @WhereClause;

    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @factor FLOAT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @factor = @Factor;

    -- ============================================
    -- 5. NORMALIZE: maintain sum-zero (monthly total unchanged)
    -- ============================================
    -- Get the new total after adjustment
    DECLARE @NuevoTotal FLOAT;
    SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] 
                 WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes 
                 AND Canal = @canal AND Tipo = @tipo';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @tot = @NuevoTotal OUTPUT;

    -- Redistribute the difference across NON-adjusted days to maintain monthly total
    IF @NuevoTotal IS NOT NULL AND @NuevoTotal != @TotalMensualActual AND @MetodoDistribucion != 'Mes'
    BEGIN
        DECLARE @Diferencia FLOAT = @NuevoTotal - @TotalMensualActual;
        DECLARE @TotalNoAjustados FLOAT;

        -- Get total of non-adjusted days
        SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] 
                     WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes 
                     AND Canal = @canal AND Tipo = @tipo AND NOT (' +
                     CASE WHEN @WhereClause != '' THEN 'idDia = ' + CAST(ISNULL(@DiaSemana, 0) AS NVARCHAR(5)) ELSE '1=0' END + ')';
        EXEC sp_executesql @SQL,
            N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
            @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @tot = @TotalNoAjustados OUTPUT;

        IF @TotalNoAjustados IS NOT NULL AND @TotalNoAjustados != 0
        BEGIN
            DECLARE @RedistFactor FLOAT = (@TotalNoAjustados - @Diferencia) / @TotalNoAjustados;

            SET @SQL = N'
            UPDATE [' + @TablaDestino + ']
            SET Monto = Monto * @rfactor
            WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes
              AND Canal = @canal AND Tipo = @tipo AND NOT (' +
              CASE WHEN @WhereClause != '' THEN 'idDia = ' + CAST(ISNULL(@DiaSemana, 0) AS NVARCHAR(5)) ELSE '1=0' END + ')';
            EXEC sp_executesql @SQL,
                N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @rfactor FLOAT',
                @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @rfactor = @RedistFactor;
        END
    END
    ELSE IF @MetodoDistribucion = 'Mes'
    BEGIN
        -- For full-month adjustment, all days are adjusted but we still normalize to original total
        IF @NuevoTotal != @TotalMensualActual AND @NuevoTotal > 0
        BEGIN
            DECLARE @NormFactor FLOAT = @TotalMensualActual / @NuevoTotal;
            SET @SQL = N'
            UPDATE [' + @TablaDestino + ']
            SET Monto = Monto * @nfactor
            WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes
              AND Canal = @canal AND Tipo = @tipo';
            EXEC sp_executesql @SQL,
                N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @nfactor FLOAT',
                @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @nfactor = @NormFactor;
        END
    END

    -- ============================================
    -- 6. For Transacciones: ensure integers
    -- ============================================
    IF @Tipo = 'Transacciones'
    BEGIN
        SET @SQL = N'UPDATE [' + @TablaDestino + '] SET Monto = ROUND(Monto, 0) 
                     WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = @canal AND Tipo = @tipo';
        EXEC sp_executesql @SQL,
            N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100)',
            @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo;
    END

    -- ============================================
    -- 7. Recalculate TQP for affected scope
    -- ============================================
    SET @SQL = N'
    UPDATE t
    SET Monto = CASE WHEN trans.Monto > 0 THEN vent.Monto / trans.Monto ELSE 0 END
    FROM [' + @TablaDestino + '] t
    INNER JOIN [' + @TablaDestino + '] vent ON vent.Fecha = t.Fecha AND vent.CodAlmacen = t.CodAlmacen AND vent.Canal = t.Canal AND vent.Tipo = ''Ventas'' AND vent.NombrePresupuesto = t.NombrePresupuesto
    INNER JOIN [' + @TablaDestino + '] trans ON trans.Fecha = t.Fecha AND trans.CodAlmacen = t.CodAlmacen AND trans.Canal = t.Canal AND trans.Tipo = ''Transacciones'' AND trans.NombrePresupuesto = t.NombrePresupuesto
    WHERE t.NombrePresupuesto = @nombre AND t.CodAlmacen = @cod AND t.Mes = @mes AND t.Canal = @canal AND t.Tipo = ''TQP''';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200)',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal;

    -- ============================================
    -- 8. Update "Todos" channel for affected store/month
    -- ============================================
    -- Delete and regenerate Todos for this store/month
    SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes AND Canal = ''Todos''';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes;

    -- Regenerate Todos for Ventas and Transacciones
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
        SUM(Monto), CodAlmacen, 0, ''Todos'', MIN(Año), Tipo,
        MIN(FechaAnterior), SUM(ISNULL(MontoAnterior,0)), 0,
        MIN(FechaAnteriorAjustada), SUM(ISNULL(MontoAnteriorAjustado,0)), 0,
        SUM(ISNULL(MontoReal,0)), 0, NombrePresupuesto
    FROM [' + @TablaDestino + ']
    WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes
      AND Canal != ''Todos'' AND Tipo IN (''Ventas'', ''Transacciones'')
    GROUP BY Fecha, CodAlmacen, Tipo, Mes, NombrePresupuesto';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes;

    -- Regenerate Todos TQP
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
        v.CodAlmacen, 0, ''Todos'', v.Año, ''TQP'',
        v.FechaAnterior, CASE WHEN t.MontoAnterior > 0 THEN v.MontoAnterior / t.MontoAnterior ELSE 0 END, 0,
        v.FechaAnteriorAjustada, CASE WHEN t.MontoAnteriorAjustado > 0 THEN v.MontoAnteriorAjustado / t.MontoAnteriorAjustado ELSE 0 END, 0,
        CASE WHEN t.MontoReal > 0 THEN v.MontoReal / t.MontoReal ELSE 0 END, 0, v.NombrePresupuesto
    FROM [' + @TablaDestino + '] v
    INNER JOIN [' + @TablaDestino + '] t ON t.Fecha = v.Fecha AND t.CodAlmacen = v.CodAlmacen AND t.Canal = ''Todos'' AND t.Tipo = ''Transacciones'' AND t.NombrePresupuesto = v.NombrePresupuesto
    WHERE v.Canal = ''Todos'' AND v.Tipo = ''Ventas'' AND v.NombrePresupuesto = @nombre AND v.CodAlmacen = @cod AND v.Mes = @mes';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes;

    -- ============================================
    -- 9. SAVE ADJUSTMENT RECORD
    -- ============================================
    INSERT INTO MODELO_PRESUPUESTO_AJUSTES
        (NombrePresupuesto, CodAlmacen, Mes, Canal, Tipo, MetodoAjuste, ValorAjuste, MetodoDistribucion, Usuario, Motivo)
    VALUES
        (@NombrePresupuesto, @CodAlmacen, @Mes, @Canal, @Tipo, @MetodoAjuste, @ValorAjuste, @MetodoDistribucion, @Usuario, @Motivo);

    -- ============================================
    -- 10. LOG IN BITACORA
    -- ============================================
    DECLARE @ValorNuevoTotal FLOAT;
    SET @SQL = N'SELECT @tot = SUM(Monto) FROM [' + @TablaDestino + '] 
                 WHERE NombrePresupuesto = @nombre AND CodAlmacen = @cod AND Mes = @mes 
                 AND Canal = @canal AND Tipo = @tipo';
    EXEC sp_executesql @SQL,
        N'@nombre NVARCHAR(100), @cod NVARCHAR(10), @mes INT, @canal NVARCHAR(200), @tipo NVARCHAR(100), @tot FLOAT OUTPUT',
        @nombre = @NombrePresupuesto, @cod = @CodAlmacen, @mes = @Mes, @canal = @Canal, @tipo = @Tipo, @tot = @ValorNuevoTotal OUTPUT;

    INSERT INTO MODELO_PRESUPUESTO_BITACORA
        (NombrePresupuesto, Usuario, Accion, CodAlmacen, Mes, Canal, Tipo,
         ValorAnterior, ValorNuevo, Motivo, Origen, Detalle)
    VALUES
        (@NombrePresupuesto, @Usuario, 'Ajuste', @CodAlmacen, @Mes, @Canal, @Tipo,
         @ValorAnteriorStr, CAST(ISNULL(@ValorNuevoTotal, 0) AS NVARCHAR(50)), @Motivo, 'Manual',
         '{"metodo":"' + @MetodoAjuste + '","valor":' + CAST(@ValorAjuste AS NVARCHAR(50)) + ',"distribucion":"' + @MetodoDistribucion + '"}');

    COMMIT TRANSACTION;

    -- Return result
    SELECT 'OK' AS Status,
           @TotalMensualActual AS TotalAnterior,
           @ValorNuevoTotal AS TotalNuevo;
END
GO

PRINT '✅ SP_AJUSTAR_PRESUPUESTO created successfully';
GO
