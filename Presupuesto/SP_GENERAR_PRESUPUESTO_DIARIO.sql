
/* =====================================================================================
   SP_GENERAR_PRESUPUESTO_DIARIO
   - Corrige Tipo -> siempre "Ventas" (nunca "Venta")
   - Calcula MontoReal y ParticipacionReal (desde BI_VENTAS_ROSTIPOLLOS @AnoPresupuesto)
   - Agrega:
       Monto_Acumulado, MontoAnterior_Acumulado, MontoAnteriorAjustado_Acumulado
       Monto_Dif, MontoAnterior_Dif, MontoAnteriorAjustado_Dif
     (acumulados “a la fecha de ejecución”: por fila aporta 0 si Fecha > @FechaCorte)
   - Integra DIM_EVENTOS_FECHAS con Canal y GrupoAlmacen:
       * NULL => aplica a todos
       * primero reglas amplias, luego específicas (se resuelve por prioridad)
   - Integra @MapCodAlmacen con base por canal:
       Formatos soportados por token (separador ; o ,):
         1) CodNuevo=CodBase
         2) CodNuevo=CodBase:Canal
         3) CodNuevo:CodBase            (default para canales no especificados)
         4) (opcional) @rango: ...@YYYY-MM-DD..YYYY-MM-DD
   - Incluye tablas temporales de comprobación al final (siempre en PREVIEW)
===================================================================================== */

CREATE PROCEDURE [dbo].[SP_GENERAR_PRESUPUESTO_DIARIO]
(
    @AnoPresupuesto int = 2026,
    @AnoBase int = 2025,
    @Mes int = NULL,                    -- 1..12 o NULL (NULL = todo el año)
    @AplicarInsert bit = 0,             -- 0 = preview, 1 = inserta

    @TablaConsolidado sysname = NULL,   -- NULL => dbo.Consolidado_<AnoPresupuesto>
    @TablaDestino sysname = NULL,       -- NULL => dbo.RSM_ALCANCE_DIARIO
    @ToleranciaVenta decimal(19,6) = 0.50,
    @ToleranciaTransacciones int = 0,
    @ForzarInsert bit = 0,
    @IgnorarTolerancias bit = 0,
    @MapCodAlmacen nvarchar(max) = NULL,
    @UsarNoLock bit = 1,
    @ExigirTransaccionesEnterasEnConsolidado bit = 0,

    @FechaCorte date = NULL             -- NULL => CAST(GETDATE() AS date)
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET DATEFIRST 1; -- lunes=1

    BEGIN TRY
        DECLARE @NoLockHint nvarchar(20) = CASE WHEN @UsarNoLock=1 THEN N' WITH (NOLOCK)' ELSE N'' END;

        IF @FechaCorte IS NULL
            SET @FechaCorte = CONVERT(date, GETDATE());

        /* si están corriendo un año distinto al año calendario actual, clamp al año del presupuesto */
        IF @FechaCorte < DATEFROMPARTS(@AnoPresupuesto,1,1) SET @FechaCorte = DATEFROMPARTS(@AnoPresupuesto,1,1);
        IF @FechaCorte > DATEFROMPARTS(@AnoPresupuesto,12,31) SET @FechaCorte = DATEFROMPARTS(@AnoPresupuesto,12,31);

        DECLARE @FallaValidacion bit = 0;

        /* ============================================================
           0) Resolver tabla consolidado y destino (y preparar DDL destino)
           ============================================================ */
        DECLARE @ConsolidadoInput sysname = NULLIF(LTRIM(RTRIM(@TablaConsolidado)), N'');
        IF @ConsolidadoInput IS NULL
            SET @ConsolidadoInput = N'dbo.Consolidado_' + CONVERT(nvarchar(4), @AnoPresupuesto);

        IF PARSENAME(@ConsolidadoInput, 3) IS NOT NULL OR PARSENAME(@ConsolidadoInput, 4) IS NOT NULL
        BEGIN
            RAISERROR('El parámetro @TablaConsolidado debe ser Tabla o Schema.Tabla.', 16, 1);
            RETURN;
        END;

        DECLARE @ConsolidadoSchema sysname = ISNULL(PARSENAME(@ConsolidadoInput, 2), N'dbo');
        DECLARE @ConsolidadoName   sysname = PARSENAME(@ConsolidadoInput, 1);
        DECLARE @ConsolidadoUnquoted nvarchar(300) = @ConsolidadoSchema + N'.' + @ConsolidadoName;
        DECLARE @ConsolidadoQuoted   nvarchar(400) = QUOTENAME(@ConsolidadoSchema) + N'.' + QUOTENAME(@ConsolidadoName);

        IF OBJECT_ID(@ConsolidadoUnquoted) IS NULL
        BEGIN
            RAISERROR('No existe la tabla de consolidado: %s.', 16, 1, @ConsolidadoUnquoted);
            RETURN;
        END;

        DECLARE @DestinoInput sysname = NULLIF(LTRIM(RTRIM(@TablaDestino)), N'');
        IF @DestinoInput IS NULL
            SET @DestinoInput = N'dbo.RSM_ALCANCE_DIARIO';

        IF PARSENAME(@DestinoInput, 3) IS NOT NULL OR PARSENAME(@DestinoInput, 4) IS NOT NULL
        BEGIN
            RAISERROR('El parámetro @TablaDestino debe ser Tabla o Schema.Tabla.', 16, 1);
            RETURN;
        END;

        DECLARE @DestinoSchema sysname = ISNULL(PARSENAME(@DestinoInput, 2), N'dbo');
        DECLARE @DestinoName   sysname = PARSENAME(@DestinoInput, 1);
        DECLARE @DestinoUnquoted nvarchar(300) = @DestinoSchema + N'.' + @DestinoName;
        DECLARE @DestinoQuoted   nvarchar(400) = QUOTENAME(@DestinoSchema) + N'.' + QUOTENAME(@DestinoName);

        /* Crear schema si no existe */
        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = @DestinoSchema)
        BEGIN
            DECLARE @sqlCreateSchema nvarchar(max) = N'CREATE SCHEMA ' + QUOTENAME(@DestinoSchema) + N';';
            EXEC(@sqlCreateSchema);
        END;

        /* Crear tabla destino si no existe */
        IF OBJECT_ID(@DestinoUnquoted) IS NULL
        BEGIN
            DECLARE @sqlCreateTable nvarchar(max) = N'
CREATE TABLE ' + @DestinoQuoted + N'(
    [Fecha] datetime NULL,
    [idLocal] int NULL,
    [Local] nvarchar(200) NULL,
    [Serie] int NULL,
    [idDia] int NULL,
    [Dia] int NULL,
    [Mes] int NULL,
    [Monto] float NULL,
    [CodAlmacen] nvarchar(10) NULL,
    [Participacion] float NULL,
    [Canal] nvarchar(50) NULL,
    [Año] int NULL,
    [Tipo] nvarchar(30) NULL,

    [FechaAnterior] datetime NULL,
    [MontoAnterior] float NULL,
    [ParticipacionAnterior] float NULL,
    [FechaAnteriorAjustada] datetime NULL,
    [MontoAnteriorAjustado] float NULL,
    [ParticipacionAnteriorAjustado] float NULL,

    [MontoReal] float NULL,
    [ParticipacionReal] float NULL,

    [Monto_Acumulado] float NULL,
    [MontoAnterior_Acumulado] float NULL,
    [MontoAnteriorAjustado_Acumulado] float NULL,

    [Monto_Dif] float NULL,
    [MontoAnterior_Dif] float NULL,
    [MontoAnteriorAjustado_Dif] float NULL,

    [Llave_Presupuesto] nvarchar(400) NULL,
    [Llave_AñoAnterior] nvarchar(400) NULL,
    [Llave_AnoAnterior_Ajustado] nvarchar(400) NULL
);';
            EXEC(@sqlCreateTable);
        END;

        /* Asegurar columnas (incluye nuevas) */
        DECLARE @ddl nvarchar(max);

        DECLARE @Cols TABLE(ColName sysname, ColDef nvarchar(200));
        INSERT INTO @Cols(ColName,ColDef) VALUES
        (N'Fecha',N'[Fecha] datetime NULL'),
        (N'idLocal',N'[idLocal] int NULL'),
        (N'Local',N'[Local] nvarchar(200) NULL'),
        (N'Serie',N'[Serie] int NULL'),
        (N'idDia',N'[idDia] int NULL'),
        (N'Dia',N'[Dia] int NULL'),
        (N'Mes',N'[Mes] int NULL'),
        (N'Monto',N'[Monto] float NULL'),
        (N'CodAlmacen',N'[CodAlmacen] nvarchar(10) NULL'),
        (N'Participacion',N'[Participacion] float NULL'),
        (N'Canal',N'[Canal] nvarchar(50) NULL'),
        (N'Año',N'[Año] int NULL'),
        (N'Tipo',N'[Tipo] nvarchar(30) NULL'),

        (N'FechaAnterior',N'[FechaAnterior] datetime NULL'),
        (N'MontoAnterior',N'[MontoAnterior] float NULL'),
        (N'ParticipacionAnterior',N'[ParticipacionAnterior] float NULL'),
        (N'FechaAnteriorAjustada',N'[FechaAnteriorAjustada] datetime NULL'),
        (N'MontoAnteriorAjustado',N'[MontoAnteriorAjustado] float NULL'),
        (N'ParticipacionAnteriorAjustado',N'[ParticipacionAnteriorAjustado] float NULL'),

        (N'MontoReal',N'[MontoReal] float NULL'),
        (N'ParticipacionReal',N'[ParticipacionReal] float NULL'),

        (N'Monto_Acumulado',N'[Monto_Acumulado] float NULL'),
        (N'MontoAnterior_Acumulado',N'[MontoAnterior_Acumulado] float NULL'),
        (N'MontoAnteriorAjustado_Acumulado',N'[MontoAnteriorAjustado_Acumulado] float NULL'),

        (N'Monto_Dif',N'[Monto_Dif] float NULL'),
        (N'MontoAnterior_Dif',N'[MontoAnterior_Dif] float NULL'),
        (N'MontoAnteriorAjustado_Dif',N'[MontoAnteriorAjustado_Dif] float NULL'),

        (N'Llave_Presupuesto',N'[Llave_Presupuesto] nvarchar(400) NULL'),
        (N'Llave_AñoAnterior',N'[Llave_AñoAnterior] nvarchar(400) NULL'),
        (N'Llave_AnoAnterior_Ajustado',N'[Llave_AnoAnterior_Ajustado] nvarchar(400) NULL');

        DECLARE @c sysname, @def nvarchar(200);
        DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT ColName, ColDef FROM @Cols;
        OPEN cur;
        FETCH NEXT FROM cur INTO @c,@def;
        WHILE @@FETCH_STATUS=0
        BEGIN
            IF COL_LENGTH(@DestinoUnquoted, @c) IS NULL
            BEGIN
                SET @ddl = N'ALTER TABLE ' + @DestinoQuoted + N' ADD ' + @def + N';';
                EXEC(@ddl);
            END
            FETCH NEXT FROM cur INTO @c,@def;
        END
        CLOSE cur;
        DEALLOCATE cur;

        /* Índice base */
        IF NOT EXISTS
        (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID(@DestinoUnquoted)
              AND name = N'IX_RSM_ALCANCE_DIARIO_AnoMesCodCanalTipoFecha'
        )
        BEGIN
            DECLARE @sqlIndex nvarchar(max) =
                N'CREATE INDEX IX_RSM_ALCANCE_DIARIO_AnoMesCodCanalTipoFecha
                  ON ' + @DestinoQuoted + N'([Año],[Mes],[CodAlmacen],[Canal],[Tipo],[Fecha]);';
            EXEC(@sqlIndex);
        END;

        /* Limpieza preventiva: normaliza "Venta" -> "Ventas" en destino (solo scope) */
        DECLARE @sqlFixTipo nvarchar(max) = N'
UPDATE d
   SET d.[Tipo] = N''Ventas''
FROM ' + @DestinoQuoted + N' d
WHERE d.[Tipo] = N''Venta''
  AND d.[Año] = @AnoPresupuesto
  AND (@Mes IS NULL OR d.[Mes] = @Mes);';
        EXEC sys.sp_executesql @sqlFixTipo, N'@AnoPresupuesto int, @Mes int', @AnoPresupuesto=@AnoPresupuesto, @Mes=@Mes;

        /* ============================================================
           0.2) Cargar reglas de mapeo codalmacen (con opción por canal)
           ============================================================ */
        IF OBJECT_ID('tempdb..#CodMapRules') IS NOT NULL DROP TABLE #CodMapRules;
        CREATE TABLE #CodMapRules
        (
            CodNuevo nvarchar(10) NOT NULL,
            CodBase  nvarchar(10) NOT NULL,
            Canal    nvarchar(200) NULL,      -- NULL => default (todos los canales)
            FechaInicio date NULL,
            FechaFin date NULL
        );

        /* defaults */
        INSERT INTO #CodMapRules(CodNuevo,CodBase,Canal,FechaInicio,FechaFin)
        VALUES (N'S84',N'S32',NULL,NULL,NULL),
               (N'S85',N'S04',NULL,NULL,NULL),
               (N'V26',N'V01',NULL,NULL,NULL);

        /* parse @MapCodAlmacen */
        IF NULLIF(LTRIM(RTRIM(@MapCodAlmacen)),N'') IS NOT NULL
        BEGIN
            DECLARE @Norm nvarchar(max) =
                REPLACE(REPLACE(REPLACE(@MapCodAlmacen, CHAR(13), N''), CHAR(10), N''), N',', N';');

            DECLARE @xml xml =
                TRY_CAST(N'<x><i>' + REPLACE(REPLACE(@Norm, N'&', N'&amp;'), N';', N'</i><i>') + N'</i></x>' AS xml);

            ;WITH Tokens AS
            (
                SELECT LTRIM(RTRIM(T.N.value('.', 'nvarchar(4000)'))) AS token
                FROM @xml.nodes('/x/i') AS T(N)
                WHERE NULLIF(LTRIM(RTRIM(T.N.value('.', 'nvarchar(4000)'))), N'') IS NOT NULL
            ),
            SplitAt AS
            (
                SELECT
                    token,
                    beforeAt = CASE WHEN CHARINDEX(N'@', token) > 0 THEN LEFT(token, CHARINDEX(N'@',token)-1) ELSE token END,
                    afterAt  = CASE WHEN CHARINDEX(N'@', token) > 0 THEN SUBSTRING(token, CHARINDEX(N'@',token)+1, 4000) ELSE NULL END
                FROM Tokens
            ),
            Main AS
            (
                SELECT
                    token,
                    afterAt,
                    HasEq = CASE WHEN CHARINDEX(N'=', beforeAt) > 0 THEN 1 ELSE 0 END,
                    HasColon = CASE WHEN CHARINDEX(N':', beforeAt) > 0 THEN 1 ELSE 0 END,
                    beforeAt
                FROM SplitAt
            ),
            KV AS
            (
                SELECT
                    CodNuevo =
                        LEFT(beforeAt,
                             CASE
                                WHEN HasEq=1 THEN CHARINDEX(N'=', beforeAt)-1
                                ELSE CHARINDEX(N':', beforeAt)-1
                             END),
                    RightPart =
                        CASE
                            WHEN HasEq=1 THEN SUBSTRING(beforeAt, CHARINDEX(N'=', beforeAt)+1, 4000)
                            ELSE SUBSTRING(beforeAt, CHARINDEX(N':', beforeAt)+1, 4000)
                        END,
                    afterAt,
                    HasEq,
                    HasColon
                FROM Main
                WHERE (HasEq=1 AND CHARINDEX(N'=', beforeAt) > 1)
                   OR (HasEq=0 AND HasColon=1 AND CHARINDEX(N':', beforeAt) > 1)
            ),
            BaseCanal AS
            (
                SELECT
                    CodNuevo = LEFT(LTRIM(RTRIM(CodNuevo)),10),
                    CodBase =
                        LEFT(LTRIM(RTRIM(
                            CASE WHEN CHARINDEX(N':', RightPart) > 0 THEN LEFT(RightPart, CHARINDEX(N':',RightPart)-1)
                                 ELSE RightPart
                            END)),10),
                    CanalRaw =
                        CASE WHEN CHARINDEX(N':', RightPart) > 0 THEN LTRIM(RTRIM(SUBSTRING(RightPart, CHARINDEX(N':',RightPart)+1, 4000)))
                             ELSE NULL END,
                    afterAt
                FROM KV
            ),
            CanalNorm AS
            (
                SELECT
                    CodNuevo,
                    CodBase,
                    Canal =
                        CASE
                            WHEN CanalRaw IS NULL OR CanalRaw = N'' THEN NULL
                            WHEN UPPER(CanalRaw) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
                            WHEN UPPER(CanalRaw) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
                            WHEN UPPER(CanalRaw) IN (N'EXPRESS') THEN N'Express'
                            WHEN UPPER(CanalRaw) IN (N'LLEVAR') THEN N'Llevar'
                            WHEN UPPER(CanalRaw) IN (N'SALON',N'SALÓN') THEN N'Salón'
                            WHEN UPPER(CanalRaw) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
                            ELSE CanalRaw
                        END,
                    FechaInicio =
                        CASE
                            WHEN afterAt IS NULL THEN NULL
                            WHEN CHARINDEX(N'..', afterAt) > 0 THEN TRY_CONVERT(date, LEFT(afterAt, CHARINDEX(N'..', afterAt)-1))
                            ELSE TRY_CONVERT(date, afterAt)
                        END,
                    FechaFin =
                        CASE
                            WHEN afterAt IS NULL THEN NULL
                            WHEN CHARINDEX(N'..', afterAt) > 0 THEN TRY_CONVERT(date, SUBSTRING(afterAt, CHARINDEX(N'..', afterAt)+2, 50))
                            ELSE NULL
                        END
                FROM BaseCanal
                WHERE CodNuevo IS NOT NULL AND CodBase IS NOT NULL AND CodNuevo <> N'' AND CodBase <> N''
            )
            INSERT INTO #CodMapRules(CodNuevo,CodBase,Canal,FechaInicio,FechaFin)
            SELECT CodNuevo,CodBase,Canal,FechaInicio,FechaFin
            FROM CanalNorm;
        END;

        /* ============================================================
           1) Cargar consolidado mensual -> #PresuMensual (Ventas/Transacciones)
           ============================================================ */
        IF OBJECT_ID('tempdb..#PresuMensual') IS NOT NULL DROP TABLE #PresuMensual;
        CREATE TABLE #PresuMensual
        (
            Ano int NOT NULL,
            Mes int NOT NULL,
            Tipo nvarchar(100) NOT NULL,         -- Ventas / Transacciones
            Restaurante nvarchar(255) NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            PresupuestoMes decimal(19,6) NOT NULL
        );

        DECLARE @sqlCons nvarchar(max) = N'
;WITH C AS
(
    SELECT
        Ano = @AnoPresupuesto,
        Mes = TRY_CONVERT(int, [MES]),
        TipoStd =
            CASE
                WHEN UPPER(LTRIM(RTRIM([TIPO]))) IN (N''VENTA'', N''VENTAS'') THEN N''Ventas''
                WHEN UPPER(LTRIM(RTRIM([TIPO]))) IN (N''TRANSACCIONES'', N''TRANSACCION'', N''TRANSACCIONES '') THEN N''Transacciones''
                ELSE NULL
            END,
        Restaurante = LTRIM(RTRIM([RESTAURANTE])) COLLATE DATABASE_DEFAULT,
        CodAlmacen  = LEFT(LTRIM(RTRIM([CODALMACEN])) COLLATE DATABASE_DEFAULT, 10),
        SALON     = TRY_CONVERT(decimal(19,6), [SALON]),
        LLEVAR    = TRY_CONVERT(decimal(19,6), [LLEVAR]),
        AUTO      = TRY_CONVERT(decimal(19,6), [AUTO]),
        EXPRESS   = TRY_CONVERT(decimal(19,6), [EXPRESS]),
        ECOMMERCE = TRY_CONVERT(decimal(19,6), [ECOMMERCE]),
        UBEREATS  = TRY_CONVERT(decimal(19,6), [UBEREATS])
    FROM ' + @ConsolidadoQuoted + @NoLockHint + N'
    WHERE (TRY_CONVERT(int, NULLIF([MES],0)) BETWEEN 1 AND 12)
      AND (@Mes IS NULL OR TRY_CONVERT(int, [MES]) = @Mes)
)
INSERT INTO #PresuMensual (Ano, Mes, Tipo, Restaurante, CodAlmacen, Canal, PresupuestoMes)
SELECT
    c.Ano, c.Mes,
    c.TipoStd,
    MAX(c.Restaurante),
    c.CodAlmacen,
    v.Canal,
    SUM(ISNULL(v.Monto, CAST(0 AS decimal(19,6))))
FROM C c
CROSS APPLY (VALUES
    (N''Salón'',     c.SALON),
    (N''Llevar'',    c.LLEVAR),
    (N''AutoPollo'', c.AUTO),
    (N''Express'',   c.EXPRESS),
    (N''ECommerce'', c.ECOMMERCE),
    (N''UberEats'',  c.UBEREATS)
) v(Canal, Monto)
WHERE c.TipoStd IN (N''Ventas'', N''Transacciones'')
GROUP BY c.Ano, c.Mes, c.TipoStd, c.CodAlmacen, v.Canal;';
        EXEC sys.sp_executesql
            @sqlCons,
            N'@AnoPresupuesto int, @Mes int',
            @AnoPresupuesto=@AnoPresupuesto,
            @Mes=@Mes;

        IF NOT EXISTS (SELECT 1 FROM #PresuMensual)
        BEGIN
            RAISERROR('No hay registros de consolidado (Ventas/Transacciones) para el scope solicitado.', 16, 1);
            RETURN;
        END;

        IF @ExigirTransaccionesEnterasEnConsolidado = 1
        BEGIN
            IF EXISTS
            (
                SELECT 1
                FROM #PresuMensual
                WHERE Tipo=N'Transacciones'
                  AND ABS(PresupuestoMes - ROUND(PresupuestoMes,0)) > 0.0000001
            )
            BEGIN
                RAISERROR('Consolidado tiene Transacciones con decimales. Corrija o desactive @ExigirTransaccionesEnterasEnConsolidado.', 16, 1);
                RETURN;
            END;
        END;

        /* ============================================================
           2) Scope codalmacenes/canales
           ============================================================ */
        IF OBJECT_ID('tempdb..#Cods') IS NOT NULL DROP TABLE #Cods;
        CREATE TABLE #Cods (CodAlmacen nvarchar(10) NOT NULL PRIMARY KEY);
        INSERT INTO #Cods(CodAlmacen) SELECT DISTINCT CodAlmacen FROM #PresuMensual;

        IF OBJECT_ID('tempdb..#Canales') IS NOT NULL DROP TABLE #Canales;
        CREATE TABLE #Canales(Canal nvarchar(200) NOT NULL PRIMARY KEY);
        INSERT INTO #Canales(Canal)
        VALUES (N'AutoPollo'),(N'ECommerce'),(N'Express'),(N'Llevar'),(N'Salón'),(N'UberEats');

        /* ============================================================
           2.1) GrupoAlmacen members (para DIM_EVENTOS_FECHAS.GrupoAlmacen)
           ============================================================ */
        IF OBJECT_ID('tempdb..#GrupoMiembros') IS NOT NULL DROP TABLE #GrupoMiembros;
        CREATE TABLE #GrupoMiembros
        (
            IDGRUPO int NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            PRIMARY KEY (IDGRUPO, CodAlmacen)
        );

        BEGIN TRY
            DECLARE @sqlGM nvarchar(max) = N'
INSERT INTO #GrupoMiembros(IDGRUPO,CodAlmacen)
SELECT
    cab.IDGRUPO,
    LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab' + @NoLockHint + N'
JOIN ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN lin' + @NoLockHint + N'
  ON lin.IDGRUPO = cab.IDGRUPO
WHERE cab.CODVISIBLE = 20;';
            EXEC(@sqlGM);
        END TRY
        BEGIN CATCH
            DECLARE @sqlGM2 nvarchar(max) = N'
INSERT INTO #GrupoMiembros(IDGRUPO,CodAlmacen)
SELECT
    cab.IDGRUPO,
    LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
FROM dbo.GRUPOSALMACENCAB cab' + @NoLockHint + N'
JOIN dbo.GRUPOSALMACENLIN lin' + @NoLockHint + N'
  ON lin.IDGRUPO = cab.IDGRUPO
WHERE cab.CODVISIBLE = 20;';
            EXEC(@sqlGM2);
        END CATCH;

        DELETE gm
        FROM #GrupoMiembros gm
        WHERE NOT EXISTS (SELECT 1 FROM #Cods c WHERE c.CodAlmacen = gm.CodAlmacen);

        /* ============================================================
           3) Calendarios base/target + mapeo por ocurrencia (lunes con lunes)
           ============================================================ */
        DECLARE @IniBase date = DATEFROMPARTS(@AnoBase, 1, 1);
        DECLARE @FinBase date = DATEFROMPARTS(@AnoBase, 12, 31);
        DECLARE @IniTgt  date = DATEFROMPARTS(@AnoPresupuesto, 1, 1);
        DECLARE @FinTgt  date = DATEFROMPARTS(@AnoPresupuesto, 12, 31);

        IF OBJECT_ID('tempdb..#CalBase') IS NOT NULL DROP TABLE #CalBase;
        IF OBJECT_ID('tempdb..#CalTgt')  IS NOT NULL DROP TABLE #CalTgt;

        CREATE TABLE #CalBase(Fecha date NOT NULL PRIMARY KEY, Mes int NOT NULL, IdDia int NOT NULL, Occur int NOT NULL);
        CREATE TABLE #CalTgt (Fecha date NOT NULL PRIMARY KEY, Mes int NOT NULL, IdDia int NOT NULL, Occur int NOT NULL);

        ;WITH N AS (SELECT TOP (400) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.all_objects)
        INSERT INTO #CalBase(Fecha, Mes, IdDia, Occur)
        SELECT d.Fecha, MONTH(d.Fecha), DATEPART(WEEKDAY,d.Fecha),
               ROW_NUMBER() OVER (PARTITION BY MONTH(d.Fecha), DATEPART(WEEKDAY,d.Fecha) ORDER BY d.Fecha)
        FROM (SELECT DATEADD(DAY,n.n,@IniBase) Fecha
              FROM N n
              WHERE DATEADD(DAY,n.n,@IniBase) <= @FinBase
                AND (@Mes IS NULL OR MONTH(DATEADD(DAY,n.n,@IniBase))=@Mes)) d;

        ;WITH N AS (SELECT TOP (400) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.all_objects)
        INSERT INTO #CalTgt(Fecha, Mes, IdDia, Occur)
        SELECT d.Fecha, MONTH(d.Fecha), DATEPART(WEEKDAY,d.Fecha),
               ROW_NUMBER() OVER (PARTITION BY MONTH(d.Fecha), DATEPART(WEEKDAY,d.Fecha) ORDER BY d.Fecha)
        FROM (SELECT DATEADD(DAY,n.n,@IniTgt) Fecha
              FROM N n
              WHERE DATEADD(DAY,n.n,@IniTgt) <= @FinTgt
                AND (@Mes IS NULL OR MONTH(DATEADD(DAY,n.n,@IniTgt))=@Mes)) d;

        IF OBJECT_ID('tempdb..#MapBase') IS NOT NULL DROP TABLE #MapBase;
        CREATE TABLE #MapBase(FechaTarget date NOT NULL PRIMARY KEY, FechaBase date NOT NULL);

        INSERT INTO #MapBase(FechaTarget, FechaBase)
        SELECT t.Fecha, COALESCE(bExact.Fecha, bLast.Fecha)
        FROM #CalTgt t
        LEFT JOIN #CalBase bExact
            ON bExact.Mes=t.Mes AND bExact.IdDia=t.IdDia AND bExact.Occur=t.Occur
        OUTER APPLY
        (
            SELECT TOP(1) b2.Fecha
            FROM #CalBase b2
            WHERE b2.Mes=t.Mes AND b2.IdDia=t.IdDia
            ORDER BY b2.Occur DESC
        ) bLast;

        /* ============================================================
           4) Eventos (excluye 24/25/26) con Canal y GrupoAlmacen
              - se expande a (CodAlmacen, Canal, FechaTarget)
              - prioridad: general(0) < grupo(1) < canal(2) < canal+grupo(3)
           ============================================================ */
        IF OBJECT_ID('tempdb..#EventOverride') IS NOT NULL DROP TABLE #EventOverride;
        CREATE TABLE #EventOverride
        (
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            FechaTarget date NOT NULL,
            FechaBase date NOT NULL,
            EsEvento bit NOT NULL,
            PRIMARY KEY (CodAlmacen, Canal, FechaTarget)
        );

        ;WITH ETarget AS
        (
            SELECT
                IDEVENTO = fT.IDEVENTO,
                FechaTarget = fT.FECHA_EFECTIVA,
                CanalRule =
                    CASE
                        WHEN fT.Canal IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal))) = N'' THEN NULL
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'EXPRESS') THEN N'Express'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'LLEVAR') THEN N'Llevar'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'SALON',N'SALÓN') THEN N'Salón'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
                        ELSE LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal)))
                    END,
                GrupoAlmacen = fT.GrupoAlmacen,
                Prio = (CASE WHEN fT.GrupoAlmacen IS NULL THEN 0 ELSE 1 END)
                     + (CASE WHEN fT.Canal IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(200), fT.Canal))) = N'' THEN 0 ELSE 2 END)
            FROM dbo.DIM_EVENTOS_FECHAS fT
            WHERE fT.FECHA_EFECTIVA IS NOT NULL
              AND YEAR(fT.FECHA_EFECTIVA)=@AnoPresupuesto
              AND (@Mes IS NULL OR MONTH(fT.FECHA_EFECTIVA)=@Mes)
              AND fT.IDEVENTO NOT IN (24,25,26)
        ),
        EBase AS
        (
            SELECT
                eT.*,
                FechaBase =
                (
                    SELECT TOP(1) fB.FECHA_EFECTIVA
                    FROM dbo.DIM_EVENTOS_FECHAS fB
                    WHERE fB.IDEVENTO = eT.IDEVENTO
                      AND fB.FECHA_EFECTIVA IS NOT NULL
                      AND YEAR(fB.FECHA_EFECTIVA)=@AnoBase
                    ORDER BY
                        /* preferir base general */
                        CASE WHEN (fB.Canal IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(200), fB.Canal)))=N'') THEN 0 ELSE 1 END,
                        CASE WHEN fB.GrupoAlmacen IS NULL THEN 0 ELSE 1 END
                )
            FROM ETarget eT
        ),
        ExpandCod AS
        (
            SELECT
                e.IDEVENTO, e.FechaTarget, e.FechaBase, e.CanalRule, e.GrupoAlmacen, e.Prio,
                CodAlmacen =
                    CASE
                        WHEN e.GrupoAlmacen IS NULL THEN c.CodAlmacen
                        ELSE gm.CodAlmacen
                    END
            FROM EBase e
            CROSS JOIN (SELECT CodAlmacen FROM #Cods) c
            LEFT JOIN #GrupoMiembros gm
              ON gm.IDGRUPO = e.GrupoAlmacen
            WHERE e.FechaBase IS NOT NULL
              AND (e.GrupoAlmacen IS NULL OR gm.CodAlmacen IS NOT NULL)
        ),
        ExpandCanal AS
        (
            SELECT
                CodAlmacen,
                Canal = CASE WHEN CanalRule IS NULL THEN k.Canal ELSE CanalRule END,
                FechaTarget,
                FechaBase,
                Prio
            FROM ExpandCod e
            CROSS JOIN (SELECT Canal FROM #Canales) k
            WHERE (e.CanalRule IS NULL OR e.CanalRule = k.Canal)
        ),
        Pick AS
        (
            SELECT *,
                   rn = ROW_NUMBER() OVER (PARTITION BY CodAlmacen, Canal, FechaTarget ORDER BY Prio DESC)
            FROM ExpandCanal
        )
        INSERT INTO #EventOverride(CodAlmacen,Canal,FechaTarget,FechaBase,EsEvento)
        SELECT CodAlmacen,Canal,FechaTarget,FechaBase,CAST(1 AS bit)
        FROM Pick
        WHERE rn=1;

        /* ============================================================
           4.1) MapDates final (por CodAlmacen+Canal)
           ============================================================ */
        IF OBJECT_ID('tempdb..#MapDates') IS NOT NULL DROP TABLE #MapDates;
        CREATE TABLE #MapDates
        (
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            FechaTarget date NOT NULL,
            FechaFuente date NOT NULL,
            MesTarget int NOT NULL,
            IdDia int NOT NULL,
            DiaMes int NOT NULL,
            EsEvento bit NOT NULL,
            PRIMARY KEY (CodAlmacen, Canal, FechaTarget)
        );

        INSERT INTO #MapDates(CodAlmacen,Canal,FechaTarget,FechaFuente,MesTarget,IdDia,DiaMes,EsEvento)
        SELECT
            c.CodAlmacen,
            k.Canal,
            t.Fecha,
            COALESCE(ev.FechaBase, mb.FechaBase),
            t.Mes,
            t.IdDia,
            DAY(t.Fecha),
            CASE WHEN ev.FechaBase IS NOT NULL THEN 1 ELSE 0 END
        FROM #Cods c
        CROSS JOIN #Canales k
        JOIN #CalTgt t ON 1=1
        JOIN #MapBase mb ON mb.FechaTarget=t.Fecha
        LEFT JOIN #EventOverride ev
          ON ev.CodAlmacen=c.CodAlmacen AND ev.Canal=k.Canal AND ev.FechaTarget=t.Fecha;

        /* ============================================================
           5) Ventas reales @AnoBase por fecha/cod/canal (para pesos)
           ============================================================ */
        IF OBJECT_ID('tempdb..#DailyBase') IS NOT NULL DROP TABLE #DailyBase;
        CREATE TABLE #DailyBase
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Venta decimal(19,6) NOT NULL,
            Transacciones int NOT NULL,
            PRIMARY KEY (Fecha, CodAlmacen, Canal)
        );

        DECLARE @sqlVentasBase nvarchar(max) = N'
INSERT INTO #DailyBase(Fecha, CodAlmacen, Canal, Venta, Transacciones)
SELECT
    CAST(v.FECHA AS date),
    LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END COLLATE DATABASE_DEFAULT,
    SUM(ISNULL(TRY_CONVERT(decimal(19,6), v.[VENTAS NETAS]), CAST(0 AS decimal(19,6)))),
    SUM(ISNULL(TRY_CONVERT(int, v.[Transacciones]), 0))
FROM dbo.BI_VENTAS_ROSTIPOLLOS v' + @NoLockHint + N'
WHERE v.ANO=@AnoBase
  AND (@Mes IS NULL OR v.MES=@Mes)
GROUP BY
    CAST(v.FECHA AS date),
    LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END
HAVING
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END IS NOT NULL;';
        EXEC sys.sp_executesql
            @sqlVentasBase,
            N'@AnoBase int, @Mes int',
            @AnoBase=@AnoBase,
            @Mes=@Mes;

        /* ============================================================
           6) Pesos base mensuales por día (año base)
           ============================================================ */
        IF OBJECT_ID('tempdb..#BaseWeights') IS NOT NULL DROP TABLE #BaseWeights;
        CREATE TABLE #BaseWeights
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Mes int NOT NULL,
            PesoVenta decimal(18,12) NOT NULL,
            PesoTrans decimal(18,12) NOT NULL,
            PRIMARY KEY (Fecha, CodAlmacen, Canal)
        );

        ;WITH X AS
        (
            SELECT
                cb.Fecha, cb.Mes, c.CodAlmacen, k.Canal,
                VentaDia = ISNULL(db.Venta, CAST(0 AS decimal(19,6))),
                TransDia = ISNULL(db.Transacciones, 0),
                DaysInMonth = DAY(EOMONTH(cb.Fecha))
            FROM #CalBase cb
            CROSS JOIN #Cods c
            CROSS JOIN #Canales k
            LEFT JOIN #DailyBase db
              ON db.Fecha=cb.Fecha AND db.CodAlmacen=c.CodAlmacen AND db.Canal=k.Canal
        ),
        W AS
        (
            SELECT *,
                VentaMes = SUM(VentaDia) OVER (PARTITION BY CodAlmacen, Canal, Mes),
                TransMes = SUM(TransDia) OVER (PARTITION BY CodAlmacen, Canal, Mes)
            FROM X
        )
        INSERT INTO #BaseWeights(Fecha, CodAlmacen, Canal, Mes, PesoVenta, PesoTrans)
        SELECT
            Fecha, CodAlmacen, Canal, Mes,
            CASE WHEN VentaMes=0
                 THEN (CAST(1 AS decimal(19,6))/NULLIF(CAST(DaysInMonth AS decimal(19,6)),0))
                 ELSE (VentaDia/VentaMes) END,
            CASE WHEN TransMes=0
                 THEN (CAST(1 AS decimal(19,6))/NULLIF(CAST(DaysInMonth AS decimal(19,6)),0))
                 ELSE (CAST(TransDia AS decimal(19,6))/NULLIF(CAST(TransMes AS decimal(19,6)),0)) END
        FROM W;

        /* ============================================================
           7) Pesos target iniciales con fallback a referencia (por canal)
           ============================================================ */
        IF OBJECT_ID('tempdb..#PesoInit') IS NOT NULL DROP TABLE #PesoInit;
        CREATE TABLE #PesoInit
        (
            CodAlmacen nvarchar(10) NOT NULL,
            FechaTarget date NOT NULL,
            MesTarget int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL, -- Ventas / Transacciones
            PesoPropio decimal(18,12) NULL,
            CodReferencia nvarchar(10) NULL,
            PesoReferencia decimal(18,12) NULL,
            PesoUsado decimal(18,12) NOT NULL,
            EsEvento bit NOT NULL,
            PRIMARY KEY (CodAlmacen, FechaTarget, Canal, Tipo)
        );

        /* helper: elegir CodBase por canal (si hay específico usa ese, si no usa default) */
        /* Ventas */
        INSERT INTO #PesoInit
        SELECT
            md.CodAlmacen,
            md.FechaTarget,
            md.MesTarget,
            md.Canal,
            N'Ventas',
            bwO.PesoVenta,
            ref.CodBase,
            bwR.PesoVenta,
            COALESCE(NULLIF(bwO.PesoVenta,0), bwR.PesoVenta,
                     (CAST(1 AS decimal(19,6))/NULLIF(CAST(DAY(EOMONTH(md.FechaTarget)) AS decimal(19,6)),0))),
            md.EsEvento
        FROM #MapDates md
        LEFT JOIN #BaseWeights bwO
          ON bwO.Fecha=md.FechaFuente AND bwO.CodAlmacen=md.CodAlmacen AND bwO.Canal=md.Canal
        OUTER APPLY
        (
            SELECT TOP(1) r.CodBase
            FROM #CodMapRules r
            WHERE r.CodNuevo = md.CodAlmacen
              AND (r.FechaInicio IS NULL OR md.FechaTarget >= r.FechaInicio)
              AND (r.FechaFin    IS NULL OR md.FechaTarget <= r.FechaFin)
              AND (r.Canal IS NULL OR r.Canal = md.Canal)
            ORDER BY
                CASE WHEN r.Canal = md.Canal THEN 1 ELSE 0 END DESC,
                CASE WHEN r.FechaInicio IS NULL AND r.FechaFin IS NULL THEN 0 ELSE 1 END DESC
        ) ref
        LEFT JOIN #BaseWeights bwR
          ON bwR.Fecha=md.FechaFuente AND bwR.CodAlmacen=ref.CodBase AND bwR.Canal=md.Canal;

        /* Transacciones */
        INSERT INTO #PesoInit
        SELECT
            md.CodAlmacen,
            md.FechaTarget,
            md.MesTarget,
            md.Canal,
            N'Transacciones',
            bwO.PesoTrans,
            ref.CodBase,
            bwR.PesoTrans,
            COALESCE(NULLIF(bwO.PesoTrans,0), bwR.PesoTrans,
                     (CAST(1 AS decimal(19,6))/NULLIF(CAST(DAY(EOMONTH(md.FechaTarget)) AS decimal(19,6)),0))),
            md.EsEvento
        FROM #MapDates md
        LEFT JOIN #BaseWeights bwO
          ON bwO.Fecha=md.FechaFuente AND bwO.CodAlmacen=md.CodAlmacen AND bwO.Canal=md.Canal
        OUTER APPLY
        (
            SELECT TOP(1) r.CodBase
            FROM #CodMapRules r
            WHERE r.CodNuevo = md.CodAlmacen
              AND (r.FechaInicio IS NULL OR md.FechaTarget >= r.FechaInicio)
              AND (r.FechaFin    IS NULL OR md.FechaTarget <= r.FechaFin)
              AND (r.Canal IS NULL OR r.Canal = md.Canal)
            ORDER BY
                CASE WHEN r.Canal = md.Canal THEN 1 ELSE 0 END DESC,
                CASE WHEN r.FechaInicio IS NULL AND r.FechaFin IS NULL THEN 0 ELSE 1 END DESC
        ) ref
        LEFT JOIN #BaseWeights bwR
          ON bwR.Fecha=md.FechaFuente AND bwR.CodAlmacen=ref.CodBase AND bwR.Canal=md.Canal;

        IF OBJECT_ID('tempdb..#FaltantesParticipacion') IS NOT NULL DROP TABLE #FaltantesParticipacion;
        SELECT
            p.CodAlmacen, p.FechaTarget, md.FechaFuente, p.Canal, p.Tipo,
            p.PesoPropio, p.CodReferencia, p.PesoReferencia, p.PesoUsado
        INTO #FaltantesParticipacion
        FROM #PesoInit p
        JOIN (SELECT DISTINCT CodAlmacen,Canal,FechaTarget,FechaFuente FROM #MapDates) md
          ON md.CodAlmacen=p.CodAlmacen AND md.Canal=p.Canal AND md.FechaTarget=p.FechaTarget
        WHERE p.CodReferencia IS NOT NULL
          AND p.PesoReferencia IS NOT NULL
          AND (p.PesoPropio IS NULL OR p.PesoPropio = 0);

        /* ============================================================
           8) Renormalización mensual (mantiene fijos días EsEvento=1)
           ============================================================ */
        IF OBJECT_ID('tempdb..#PesoFinal') IS NOT NULL DROP TABLE #PesoFinal;
        CREATE TABLE #PesoFinal
        (
            CodAlmacen nvarchar(10) NOT NULL,
            FechaTarget date NOT NULL,
            MesTarget int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            PesoFinal decimal(18,12) NOT NULL,
            EsEvento bit NOT NULL,
            PRIMARY KEY (CodAlmacen, FechaTarget, Canal, Tipo)
        );

        ;WITH S AS
        (
            SELECT
                p.*,
                SumEvento = SUM(CASE WHEN p.EsEvento=1 THEN p.PesoUsado ELSE 0 END)
                            OVER (PARTITION BY p.CodAlmacen,p.MesTarget,p.Canal,p.Tipo),
                SumNoEvento = SUM(CASE WHEN p.EsEvento=0 THEN p.PesoUsado ELSE 0 END)
                              OVER (PARTITION BY p.CodAlmacen,p.MesTarget,p.Canal,p.Tipo),
                DaysInMonth = DAY(EOMONTH(DATEFROMPARTS(@AnoPresupuesto,p.MesTarget,1)))
            FROM #PesoInit p
        )
        INSERT INTO #PesoFinal
        SELECT
            CodAlmacen, FechaTarget, MesTarget, Canal, Tipo,
            CASE
                WHEN SumNoEvento>0 AND SumEvento<1.0
                    THEN CASE WHEN EsEvento=1 THEN PesoUsado
                              ELSE PesoUsado*((1.0-SumEvento)/SumNoEvento) END
                ELSE
                    (CAST(1 AS decimal(19,6))/NULLIF(CAST(DaysInMonth AS decimal(19,6)),0))
            END,
            EsEvento
        FROM S;

        /* ============================================================
           9) Generación preliminar diaria (Ventas/Transacciones)
           ============================================================ */
        IF OBJECT_ID('tempdb..#TmpVT') IS NOT NULL DROP TABLE #TmpVT;
        CREATE TABLE #TmpVT
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Mes int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            Monto decimal(19,6) NOT NULL,
            Participacion decimal(18,12) NULL,
            PRIMARY KEY (Fecha, CodAlmacen, Canal, Tipo)
        );

        /* Ventas */
        INSERT INTO #TmpVT(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
        SELECT
            pf.FechaTarget,
            pm.CodAlmacen,
            pm.Mes,
            pm.Canal,
            pm.Tipo,
            pm.PresupuestoMes * pf.PesoFinal,
            pf.PesoFinal
        FROM #PresuMensual pm
        JOIN #PesoFinal pf
          ON pf.CodAlmacen=pm.CodAlmacen AND pf.MesTarget=pm.Mes AND pf.Canal=pm.Canal AND pf.Tipo=pm.Tipo
        WHERE pm.Tipo=N'Ventas';

        ;WITH M AS
        (
            SELECT
                v.CodAlmacen,v.Mes,v.Canal,
                PresuMes = pm.PresupuestoMes,
                SumMes   = SUM(v.Monto) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal),
                MaxFecha = FIRST_VALUE(v.Fecha) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal ORDER BY v.Monto DESC, v.Fecha DESC),
                v.Fecha
            FROM #TmpVT v
            JOIN #PresuMensual pm
              ON pm.Tipo=N'Ventas' AND pm.CodAlmacen=v.CodAlmacen AND pm.Mes=v.Mes AND pm.Canal=v.Canal
            WHERE v.Tipo=N'Ventas'
        )
        UPDATE v
           SET v.Monto = v.Monto + (m.PresuMes - m.SumMes)
        FROM #TmpVT v
        JOIN M m
          ON m.CodAlmacen=v.CodAlmacen AND m.Mes=v.Mes AND m.Canal=v.Canal AND m.Fecha=v.Fecha
        WHERE v.Tipo=N'Ventas' AND m.Fecha=m.MaxFecha;

        ;WITH S AS
        (
            SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto)
            FROM #TmpVT
            WHERE Tipo=N'Ventas'
            GROUP BY CodAlmacen,Mes,Canal
        )
        UPDATE v
           SET v.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE v.Monto/s.SumMes END
        FROM #TmpVT v
        JOIN S s
          ON s.CodAlmacen=v.CodAlmacen AND s.Mes=v.Mes AND s.Canal=v.Canal
        WHERE v.Tipo=N'Ventas';

        /* Transacciones (enteras) */
        ;WITH T AS
        (
            SELECT
                pf.FechaTarget AS Fecha,
                pm.CodAlmacen, pm.Mes, pm.Canal,
                TargetMesInt = CONVERT(int, ROUND(pm.PresupuestoMes,0)),
                Peso = pf.PesoFinal
            FROM #PresuMensual pm
            JOIN #PesoFinal pf
              ON pf.CodAlmacen=pm.CodAlmacen AND pf.MesTarget=pm.Mes AND pf.Canal=pm.Canal AND pf.Tipo=pm.Tipo
            WHERE pm.Tipo=N'Transacciones'
        ),
        R AS
        (
            SELECT *,
                BaseInt = CONVERT(int, FLOOR(CAST(TargetMesInt AS decimal(19,6)) * CAST(Peso AS decimal(19,6)))),
                Frac    = (CAST(TargetMesInt AS decimal(19,6)) * CAST(Peso AS decimal(19,6)))
                          - FLOOR(CAST(TargetMesInt AS decimal(19,6)) * CAST(Peso AS decimal(19,6)))
            FROM T
        ),
        S AS
        (
            SELECT
                r.*,
                SumBase = SUM(r.BaseInt) OVER (PARTITION BY r.CodAlmacen,r.Mes,r.Canal),
                Rnk = ROW_NUMBER() OVER (PARTITION BY r.CodAlmacen,r.Mes,r.Canal ORDER BY r.Frac DESC, r.Fecha)
            FROM R r
        )
        INSERT INTO #TmpVT(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
        SELECT
            s.Fecha, s.CodAlmacen, s.Mes, s.Canal, N'Transacciones',
            CAST(s.BaseInt + CASE WHEN s.Rnk <= (s.TargetMesInt - s.SumBase) THEN 1 ELSE 0 END AS decimal(19,6)),
            s.Peso
        FROM S s;

        ;WITH S AS
        (
            SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto)
            FROM #TmpVT
            WHERE Tipo=N'Transacciones'
            GROUP BY CodAlmacen,Mes,Canal
        )
        UPDATE t
           SET t.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE t.Monto/s.SumMes END
        FROM #TmpVT t
        JOIN S s
          ON s.CodAlmacen=t.CodAlmacen AND s.Mes=t.Mes AND s.Canal=t.Canal
        WHERE t.Tipo=N'Transacciones';

        /* ============================================================
           10) Ajustes 24/25/26 (por Canal y GrupoAlmacen) - opcional
           ============================================================ */
        /* (si no hay filas 24/25/26 en DIM_EVENTOS_FECHAS, no hace nada) */

        IF OBJECT_ID('tempdb..#EvAjustesExp') IS NOT NULL DROP TABLE #EvAjustesExp;
        CREATE TABLE #EvAjustesExp
        (
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            IDEVENTO int NOT NULL,
            FechaX date NOT NULL,
            FechaE date NOT NULL,
            Prio int NOT NULL,
            PRIMARY KEY (CodAlmacen, Canal, IDEVENTO, FechaX)
        );

        ;WITH Rules AS
        (
            SELECT
                IDEVENTO = f.IDEVENTO,
                FechaX = CAST(f.FECHA AS date),
                FechaE = CAST(f.FECHA_EFECTIVA AS date),
                CanalRule =
                    CASE
                        WHEN f.Canal IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))=N'' THEN NULL
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'AUTO',N'AUTOPOLLO',N'AUTO POLLO') THEN N'AutoPollo'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'ECOMMERCE',N'E-COMMERCE',N'E COMMERCE') THEN N'ECommerce'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'EXPRESS') THEN N'Express'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'LLEVAR') THEN N'Llevar'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'SALON',N'SALÓN') THEN N'Salón'
                        WHEN UPPER(LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))) IN (N'UBEREATS',N'UBER EATS') THEN N'UberEats'
                        ELSE LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))
                    END,
                GrupoAlmacen = f.GrupoAlmacen,
                Prio = (CASE WHEN f.GrupoAlmacen IS NULL THEN 0 ELSE 1 END)
                     + (CASE WHEN f.Canal IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(200), f.Canal)))=N'' THEN 0 ELSE 2 END)
            FROM dbo.DIM_EVENTOS_FECHAS f
            WHERE f.IDEVENTO IN (24,25,26)
              AND f.FECHA IS NOT NULL AND f.FECHA_EFECTIVA IS NOT NULL
              AND YEAR(f.FECHA)=@AnoPresupuesto
              AND (@Mes IS NULL OR MONTH(f.FECHA)=@Mes)
        ),
        ExpandCod AS
        (
            SELECT
                r.IDEVENTO,r.FechaX,r.FechaE,r.CanalRule,r.GrupoAlmacen,r.Prio,
                CodAlmacen = CASE WHEN r.GrupoAlmacen IS NULL THEN c.CodAlmacen ELSE gm.CodAlmacen END
            FROM Rules r
            CROSS JOIN (SELECT CodAlmacen FROM #Cods) c
            LEFT JOIN #GrupoMiembros gm ON gm.IDGRUPO=r.GrupoAlmacen
            WHERE (r.GrupoAlmacen IS NULL OR gm.CodAlmacen IS NOT NULL)
        ),
        ExpandCanal AS
        (
            SELECT
                CodAlmacen,
                Canal = CASE WHEN CanalRule IS NULL THEN k.Canal ELSE CanalRule END,
                IDEVENTO,FechaX,FechaE,Prio
            FROM ExpandCod
            CROSS JOIN (SELECT Canal FROM #Canales) k
            WHERE (CanalRule IS NULL OR CanalRule=k.Canal)
        ),
        Pick AS
        (
            SELECT *,
                   rn = ROW_NUMBER() OVER (PARTITION BY CodAlmacen,Canal,IDEVENTO,FechaX ORDER BY Prio DESC)
            FROM ExpandCanal
        )
        INSERT INTO #EvAjustesExp(CodAlmacen,Canal,IDEVENTO,FechaX,FechaE,Prio)
        SELECT CodAlmacen,Canal,IDEVENTO,FechaX,FechaE,Prio
        FROM Pick
        WHERE rn=1;

        /* aplicar solo si hay */
        IF EXISTS (SELECT 1 FROM #EvAjustesExp)
        BEGIN
            /* Cache Ventas */
            IF OBJECT_ID('tempdb..#VX') IS NOT NULL DROP TABLE #VX;
            SELECT Fecha, CodAlmacen, Canal, Mes, Monto
            INTO #VX
            FROM #TmpVT
            WHERE Tipo=N'Ventas';

            /* targets por IDEVENTO */
            IF OBJECT_ID('tempdb..#EvTargets') IS NOT NULL DROP TABLE #EvTargets;
            CREATE TABLE #EvTargets
            (
                CodAlmacen nvarchar(10) NOT NULL,
                Canal nvarchar(200) NOT NULL,
                IDEVENTO int NOT NULL,
                FechaX date NOT NULL,
                FechaAdj date NOT NULL,
                PRIMARY KEY (CodAlmacen,Canal,IDEVENTO,FechaX,FechaAdj)
            );

            /* 24: semana natural L-D excluye FechaX */
            INSERT INTO #EvTargets(CodAlmacen,Canal,IDEVENTO,FechaX,FechaAdj)
            SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
            FROM #EvAjustesExp a
            JOIN #CalTgt c
              ON c.Fecha BETWEEN DATEADD(DAY, 1 - DATEPART(WEEKDAY, a.FechaX), a.FechaX)
                            AND DATEADD(DAY, 7 - DATEPART(WEEKDAY, a.FechaX), a.FechaX)
             AND YEAR(c.Fecha)=YEAR(a.FechaX)
             AND MONTH(c.Fecha)=MONTH(a.FechaX)
            WHERE a.IDEVENTO=24 AND c.Fecha <> a.FechaX;

            /* 25: mismo día-semana del mes excluye FechaX */
            INSERT INTO #EvTargets(CodAlmacen,Canal,IDEVENTO,FechaX,FechaAdj)
            SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
            FROM #EvAjustesExp a
            JOIN #CalTgt c
              ON YEAR(c.Fecha)=YEAR(a.FechaX)
             AND MONTH(c.Fecha)=MONTH(a.FechaX)
             AND c.IdDia = DATEPART(WEEKDAY, a.FechaX)
            WHERE a.IDEVENTO=25 AND c.Fecha <> a.FechaX;

            /* 26: todos los días del mes excluye FechaX */
            INSERT INTO #EvTargets(CodAlmacen,Canal,IDEVENTO,FechaX,FechaAdj)
            SELECT a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,c.Fecha
            FROM #EvAjustesExp a
            JOIN #CalTgt c
              ON YEAR(c.Fecha)=YEAR(a.FechaX)
             AND MONTH(c.Fecha)=MONTH(a.FechaX)
            WHERE a.IDEVENTO=26 AND c.Fecha <> a.FechaX;

            IF OBJECT_ID('tempdb..#DistRows') IS NOT NULL DROP TABLE #DistRows;
            CREATE TABLE #DistRows
            (
                CodAlmacen nvarchar(10) NOT NULL,
                Canal nvarchar(200) NOT NULL,
                Fecha date NOT NULL,
                DeltaMonto decimal(19,6) NOT NULL
            );

            ;WITH Deltas AS
            (
                SELECT
                    a.CodAlmacen,a.Canal,a.IDEVENTO,a.FechaX,a.FechaE,
                    Mes = MONTH(a.FechaX),
                    VentaX = ISNULL(vx.Monto,0),
                    VentaE = ISNULL(ve.Monto,0),
                    Delta  = ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)
                FROM #EvAjustesExp a
                LEFT JOIN #VX vx ON vx.CodAlmacen=a.CodAlmacen AND vx.Canal=a.Canal AND vx.Fecha=a.FechaX
                LEFT JOIN #VX ve ON ve.CodAlmacen=a.CodAlmacen AND ve.Canal=a.Canal AND ve.Fecha=a.FechaE
                WHERE YEAR(a.FechaE)=YEAR(a.FechaX) AND MONTH(a.FechaE)=MONTH(a.FechaX)
            ),
            T AS
            (
                SELECT
                    d.CodAlmacen,d.Canal,d.IDEVENTO,d.FechaX,d.Delta,
                    et.FechaAdj,
                    VentaAdj = v.Monto
                FROM Deltas d
                JOIN #EvTargets et
                  ON et.CodAlmacen=d.CodAlmacen AND et.Canal=d.Canal AND et.IDEVENTO=d.IDEVENTO AND et.FechaX=d.FechaX
                JOIN #TmpVT v
                  ON v.Tipo=N'Ventas' AND v.CodAlmacen=d.CodAlmacen AND v.Canal=d.Canal AND v.Fecha=et.FechaAdj
                WHERE d.Delta <> 0
            ),
            A AS
            (
                SELECT *,
                       SumVentaAdj = SUM(VentaAdj) OVER (PARTITION BY CodAlmacen,Canal,IDEVENTO,FechaX),
                       Cnt = COUNT(*) OVER (PARTITION BY CodAlmacen,Canal,IDEVENTO,FechaX)
                FROM T
            )
            INSERT INTO #DistRows(CodAlmacen,Canal,Fecha,DeltaMonto)
            SELECT CodAlmacen,Canal,FechaAdj,
                   -1 * (CASE
                            WHEN SumVentaAdj>0 THEN Delta*(VentaAdj/SumVentaAdj)
                            WHEN Cnt>0 THEN Delta*(1.0/Cnt)
                            ELSE 0
                        END)
            FROM A;

            /* Reemplazo en FechaX (VentaX pasa a VentaE) => Delta en FechaX */
            INSERT INTO #DistRows(CodAlmacen,Canal,Fecha,DeltaMonto)
            SELECT d.CodAlmacen,d.Canal,d.FechaX,d.Delta
            FROM
            (
                SELECT
                    a.CodAlmacen,a.Canal,a.FechaX,
                    Delta = ISNULL(ve.Monto,0) - ISNULL(vx.Monto,0)
                FROM #EvAjustesExp a
                LEFT JOIN #VX vx ON vx.CodAlmacen=a.CodAlmacen AND vx.Canal=a.Canal AND vx.Fecha=a.FechaX
                LEFT JOIN #VX ve ON ve.CodAlmacen=a.CodAlmacen AND ve.Canal=a.Canal AND ve.Fecha=a.FechaE
                WHERE YEAR(a.FechaE)=YEAR(a.FechaX) AND MONTH(a.FechaE)=MONTH(a.FechaX)
            ) d
            WHERE d.Delta <> 0;

            ;WITH S AS
            (
                SELECT CodAlmacen,Canal,Fecha, DeltaMonto=SUM(DeltaMonto)
                FROM #DistRows
                GROUP BY CodAlmacen,Canal,Fecha
            )
            UPDATE v
               SET v.Monto = v.Monto + s.DeltaMonto
            FROM #TmpVT v
            JOIN S s
              ON s.CodAlmacen=v.CodAlmacen AND s.Canal=v.Canal AND s.Fecha=v.Fecha
            WHERE v.Tipo=N'Ventas';

            /* reajuste final por mes/canal para cuadrar con presupuesto mensual Ventas */
            ;WITH M AS
            (
                SELECT
                    v.CodAlmacen,v.Mes,v.Canal,
                    PresuMes = pm.PresupuestoMes,
                    SumMes   = SUM(v.Monto) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal),
                    MaxFecha = FIRST_VALUE(v.Fecha) OVER (PARTITION BY v.CodAlmacen,v.Mes,v.Canal ORDER BY v.Monto DESC, v.Fecha DESC),
                    v.Fecha
                FROM #TmpVT v
                JOIN #PresuMensual pm
                  ON pm.Tipo=N'Ventas' AND pm.CodAlmacen=v.CodAlmacen AND pm.Mes=v.Mes AND pm.Canal=v.Canal
                WHERE v.Tipo=N'Ventas'
            )
            UPDATE v
               SET v.Monto = v.Monto + (m.PresuMes - m.SumMes)
            FROM #TmpVT v
            JOIN M m
              ON m.CodAlmacen=v.CodAlmacen AND m.Mes=v.Mes AND m.Canal=v.Canal AND m.Fecha=v.Fecha
            WHERE v.Tipo=N'Ventas' AND m.Fecha=m.MaxFecha;

            ;WITH S AS
            (
                SELECT CodAlmacen,Mes,Canal, SumMes=SUM(Monto)
                FROM #TmpVT
                WHERE Tipo=N'Ventas'
                GROUP BY CodAlmacen,Mes,Canal
            )
            UPDATE v
               SET v.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE v.Monto/s.SumMes END
            FROM #TmpVT v
            JOIN S s
              ON s.CodAlmacen=v.CodAlmacen AND s.Mes=v.Mes AND s.Canal=v.Canal
            WHERE v.Tipo=N'Ventas';
        END;

        /* ============================================================
           11) Construir #Res (Ventas/Transacciones/TQP) + canal Todos
           ============================================================ */
        IF OBJECT_ID('tempdb..#Res') IS NOT NULL DROP TABLE #Res;
        CREATE TABLE #Res
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Mes int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            Monto decimal(19,6) NOT NULL,
            Participacion decimal(18,12) NULL
        );

        INSERT INTO #Res
        SELECT Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion
        FROM #TmpVT;

        /* TQP por día/canal */
        INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
        SELECT
            v.Fecha,v.CodAlmacen,v.Mes,v.Canal,
            N'TQP',
            CASE WHEN t.Monto=0 THEN CAST(0 AS decimal(19,6)) ELSE CAST(v.Monto/t.Monto AS decimal(19,6)) END,
            NULL
        FROM #TmpVT v
        JOIN #TmpVT t
          ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Mes=v.Mes AND t.Canal=v.Canal AND t.Tipo=N'Transacciones'
        WHERE v.Tipo=N'Ventas';

        /* Todos: suma */
        INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
        SELECT Fecha,CodAlmacen,Mes,N'Todos',Tipo,SUM(Monto),NULL
        FROM #Res
        WHERE Canal <> N'Todos'
          AND Tipo IN (N'Ventas',N'Transacciones')
        GROUP BY Fecha,CodAlmacen,Mes,Tipo;

        ;WITH S AS
        (
            SELECT CodAlmacen,Mes,Canal,Tipo, SumMes=SUM(Monto)
            FROM #Res
            WHERE Canal=N'Todos' AND Tipo IN (N'Ventas',N'Transacciones')
            GROUP BY CodAlmacen,Mes,Canal,Tipo
        )
        UPDATE r
           SET r.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE r.Monto/s.SumMes END
        FROM #Res r
        JOIN S s
          ON s.CodAlmacen=r.CodAlmacen AND s.Mes=r.Mes AND s.Canal=r.Canal AND s.Tipo=r.Tipo
        WHERE r.Canal=N'Todos' AND r.Tipo IN (N'Ventas',N'Transacciones');

        /* TQP Todos */
        INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
        SELECT
            v.Fecha,v.CodAlmacen,v.Mes,N'Todos',N'TQP',
            CASE WHEN t.Monto=0 THEN CAST(0 AS decimal(19,6)) ELSE CAST(v.Monto/t.Monto AS decimal(19,6)) END,
            NULL
        FROM #Res v
        JOIN #Res t
          ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Mes=v.Mes AND t.Canal=N'Todos' AND t.Tipo=N'Transacciones'
        WHERE v.Canal=N'Todos' AND v.Tipo=N'Ventas';

        CREATE CLUSTERED INDEX IX_Res ON #Res(Fecha, CodAlmacen, Canal, Tipo);

        /* ============================================================
           12) Locales / idLocal base
           ============================================================ */
        IF OBJECT_ID('tempdb..#LocalMap') IS NOT NULL DROP TABLE #LocalMap;
        ;WITH L AS
        (
            SELECT CodAlmacen, LocalName = MAX(Restaurante)
            FROM #PresuMensual
            GROUP BY CodAlmacen
        ),
        R AS
        (
            SELECT CodAlmacen = LEFT(LTRIM(RTRIM(CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
                   LocalName = MAX(LTRIM(RTRIM(RESTAURANTE)))
            FROM dbo.BI_VENTAS_ROSTIPOLLOS
            WHERE ANO=@AnoBase AND (@Mes IS NULL OR MES=@Mes)
            GROUP BY LEFT(LTRIM(RTRIM(CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
        ),
        U AS
        (
            SELECT c.CodAlmacen,
                   LocalName = COALESCE(l.LocalName, r.LocalName, c.CodAlmacen)
            FROM #Cods c
            LEFT JOIN L l ON l.CodAlmacen=c.CodAlmacen
            LEFT JOIN R r ON r.CodAlmacen=c.CodAlmacen
        )
        SELECT
            CodAlmacen,
            idLocal = DENSE_RANK() OVER (ORDER BY CodAlmacen),
            LocalName
        INTO #LocalMap
        FROM U;

        /* ============================================================
           13) Agrupaciones CODVISIBLE=20 (salida Gxx)
           ============================================================ */
        IF OBJECT_ID('tempdb..#Grupos') IS NOT NULL DROP TABLE #Grupos;
        CREATE TABLE #Grupos
        (
            IDGRUPO int NOT NULL,
            GrupoCod nvarchar(10) NOT NULL,
            Descripcion nvarchar(200) NULL,
            CodAlmacenMiembro nvarchar(10) NOT NULL
        );

        DECLARE @sqlGrp nvarchar(max);

        BEGIN TRY
            SET @sqlGrp = N'
INSERT INTO #Grupos(IDGRUPO,GrupoCod,Descripcion,CodAlmacenMiembro)
SELECT
    cab.IDGRUPO,
    GrupoCod = N''G'' + RIGHT(N''00'' + CONVERT(nvarchar(10), cab.IDGRUPO % 100), 2),
    cab.DESCRIPCION,
    LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab' + @NoLockHint + N'
JOIN ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN lin' + @NoLockHint + N'
  ON lin.IDGRUPO=cab.IDGRUPO
WHERE cab.CODVISIBLE = 20;';
            EXEC (@sqlGrp);
        END TRY
        BEGIN CATCH
            SET @sqlGrp = N'
INSERT INTO #Grupos(IDGRUPO,GrupoCod,Descripcion,CodAlmacenMiembro)
SELECT
    cab.IDGRUPO,
    GrupoCod = N''G'' + RIGHT(N''00'' + CONVERT(nvarchar(10), cab.IDGRUPO % 100), 2),
    cab.DESCRIPCION,
    LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
FROM dbo.GRUPOSALMACENCAB cab' + @NoLockHint + N'
JOIN dbo.GRUPOSALMACENLIN lin' + @NoLockHint + N'
  ON lin.IDGRUPO=cab.IDGRUPO
WHERE cab.CODVISIBLE = 20;';
            EXEC (@sqlGrp);
        END CATCH;

        DELETE g
        FROM #Grupos g
        WHERE NOT EXISTS (SELECT 1 FROM #Cods c WHERE c.CodAlmacen=g.CodAlmacenMiembro);

        IF EXISTS (SELECT 1 FROM #Grupos)
        BEGIN
            /* sumar Ventas/Transacciones */
            INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
            SELECT
                r.Fecha,
                g.GrupoCod,
                r.Mes,
                r.Canal,
                r.Tipo,
                SUM(r.Monto),
                NULL
            FROM #Res r
            JOIN #Grupos g
              ON g.CodAlmacenMiembro=r.CodAlmacen
            WHERE r.Tipo IN (N'Ventas',N'Transacciones')
            GROUP BY r.Fecha,g.GrupoCod,r.Mes,r.Canal,r.Tipo;

            ;WITH S AS
            (
                SELECT CodAlmacen,Mes,Canal,Tipo, SumMes=SUM(Monto)
                FROM #Res
                WHERE CodAlmacen LIKE N'G__' AND Tipo IN (N'Ventas',N'Transacciones')
                GROUP BY CodAlmacen,Mes,Canal,Tipo
            )
            UPDATE r
               SET r.Participacion = CASE WHEN s.SumMes=0 THEN NULL ELSE r.Monto/s.SumMes END
            FROM #Res r
            JOIN S s
              ON s.CodAlmacen=r.CodAlmacen AND s.Mes=r.Mes AND s.Canal=r.Canal AND s.Tipo=r.Tipo
            WHERE r.CodAlmacen LIKE N'G__' AND r.Tipo IN (N'Ventas',N'Transacciones');

            /* TQP grupo */
            INSERT INTO #Res(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto,Participacion)
            SELECT
                v.Fecha,v.CodAlmacen,v.Mes,v.Canal,N'TQP',
                CASE WHEN t.Monto=0 THEN CAST(0 AS decimal(19,6)) ELSE CAST(v.Monto/t.Monto AS decimal(19,6)) END,
                NULL
            FROM #Res v
            JOIN #Res t
              ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Mes=v.Mes AND t.Canal=v.Canal AND t.Tipo=N'Transacciones'
            WHERE v.CodAlmacen LIKE N'G__' AND v.Tipo=N'Ventas';
        END;

        /* ============================================================
           14) Validación consolidado vs resultado (solo 6 canales)
           ============================================================ */
        IF OBJECT_ID('tempdb..#Validacion') IS NOT NULL DROP TABLE #Validacion;
        SELECT
            pm.Ano, pm.Mes, pm.Tipo, pm.CodAlmacen, pm.Canal,
            Consolidado = pm.PresupuestoMes,
            Resultado   = SUM(r.Monto),
            Diferencia  = SUM(r.Monto) - pm.PresupuestoMes
        INTO #Validacion
        FROM #PresuMensual pm
        LEFT JOIN #Res r
          ON r.CodAlmacen=pm.CodAlmacen AND r.Mes=pm.Mes AND r.Canal=pm.Canal AND r.Tipo=pm.Tipo
        GROUP BY pm.Ano, pm.Mes, pm.Tipo, pm.CodAlmacen, pm.Canal, pm.PresupuestoMes;

        SET @FallaValidacion = 0;
        IF @IgnorarTolerancias = 0
        BEGIN
            IF EXISTS
            (
                SELECT 1
                FROM #Validacion
                WHERE (Tipo=N'Ventas' AND ABS(Diferencia) > @ToleranciaVenta)
                   OR (Tipo=N'Transacciones' AND ABS(Diferencia) > @ToleranciaTransacciones)
            )
                SET @FallaValidacion = 1;
        END;

        /* ============================================================
           15) AñoAnterior / AñoAnteriorAjustado
           ============================================================ */
        IF OBJECT_ID('tempdb..#FechaMap') IS NOT NULL DROP TABLE #FechaMap;
        SELECT
            FechaTarget = t.Fecha,
            FechaAnterior =
                CASE
                    WHEN DAY(t.Fecha) <= DAY(EOMONTH(DATEFROMPARTS(@AnoBase, MONTH(t.Fecha), 1)))
                    THEN DATEFROMPARTS(@AnoBase, MONTH(t.Fecha), DAY(t.Fecha))
                    ELSE NULL
                END,
            FechaAnteriorAjustada = mb.FechaBase
        INTO #FechaMap
        FROM #CalTgt t
        JOIN #MapBase mb ON mb.FechaTarget=t.Fecha;

        CREATE UNIQUE CLUSTERED INDEX IX_FechaMap ON #FechaMap(FechaTarget);

        /* base normalizado (Ventas/Transacciones) + Todos + Grupos */
        IF OBJECT_ID('tempdb..#DailyBaseN') IS NOT NULL DROP TABLE #DailyBaseN;
        CREATE TABLE #DailyBaseN
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Mes int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            Monto decimal(19,6) NOT NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal,Tipo)
        );

        INSERT INTO #DailyBaseN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),Canal,N'Ventas',Venta
        FROM #DailyBase;

        INSERT INTO #DailyBaseN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),Canal,N'Transacciones',CAST(Transacciones AS decimal(19,6))
        FROM #DailyBase;

        INSERT INTO #DailyBaseN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),N'Todos',Tipo,SUM(Monto)
        FROM #DailyBaseN
        WHERE Canal <> N'Todos'
        GROUP BY Fecha,CodAlmacen,Tipo;

        IF EXISTS (SELECT 1 FROM #Grupos)
        BEGIN
            INSERT INTO #DailyBaseN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
            SELECT d.Fecha, g.GrupoCod, d.Mes, d.Canal, d.Tipo, SUM(d.Monto)
            FROM #DailyBaseN d
            JOIN #Grupos g ON g.CodAlmacenMiembro=d.CodAlmacen
            GROUP BY d.Fecha, g.GrupoCod, d.Mes, d.Canal, d.Tipo;
        END;

        IF OBJECT_ID('tempdb..#MonthBaseTotalsN') IS NOT NULL DROP TABLE #MonthBaseTotalsN;
        SELECT CodAlmacen, Mes, Canal, Tipo, MontoMes=SUM(Monto)
        INTO #MonthBaseTotalsN
        FROM #DailyBaseN
        GROUP BY CodAlmacen, Mes, Canal, Tipo;

        CREATE UNIQUE CLUSTERED INDEX IX_MonthBaseTotalsN ON #MonthBaseTotalsN(CodAlmacen,Mes,Canal,Tipo);

        /* enriquecer con AñoAnterior y Ajustado */
        IF OBJECT_ID('tempdb..#EnhVT') IS NOT NULL DROP TABLE #EnhVT;
        CREATE TABLE #EnhVT
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            FechaAnterior date NULL,
            MontoAnterior decimal(19,6) NULL,
            ParticipacionAnterior decimal(18,12) NULL,
            FechaAnteriorAjustada date NULL,
            MontoAnteriorAjustado decimal(19,6) NULL,
            ParticipacionAnteriorAjustado decimal(18,12) NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal,Tipo)
        );

        INSERT INTO #EnhVT
        SELECT
            r.Fecha,
            r.CodAlmacen,
            r.Canal,
            r.Tipo,
            fm.FechaAnterior,
            MontoAnterior = db.Monto,
            ParticipacionAnterior =
                CASE WHEN mb.MontoMes IS NULL OR mb.MontoMes=0 OR db.Monto IS NULL THEN NULL
                     ELSE CAST(db.Monto/mb.MontoMes AS decimal(18,12)) END,
            fm.FechaAnteriorAjustada,
            MontoAnteriorAjustado =
                CASE WHEN mb.MontoMes IS NULL THEN NULL
                     WHEN r.Participacion IS NULL THEN NULL
                     ELSE CAST(mb.MontoMes * r.Participacion AS decimal(19,6)) END,
            ParticipacionAnteriorAjustado = r.Participacion
        FROM #Res r
        JOIN #FechaMap fm ON fm.FechaTarget=r.Fecha
        LEFT JOIN #DailyBaseN db
          ON db.Fecha=fm.FechaAnterior AND db.CodAlmacen=r.CodAlmacen AND db.Canal=r.Canal AND db.Tipo=r.Tipo
        LEFT JOIN #MonthBaseTotalsN mb
          ON mb.CodAlmacen=r.CodAlmacen AND mb.Mes=r.Mes AND mb.Canal=r.Canal AND mb.Tipo=r.Tipo
        WHERE r.Tipo IN (N'Ventas',N'Transacciones');

        IF OBJECT_ID('tempdb..#EnhTQP') IS NOT NULL DROP TABLE #EnhTQP;
        CREATE TABLE #EnhTQP
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            FechaAnterior date NULL,
            MontoAnterior decimal(19,6) NULL,
            FechaAnteriorAjustada date NULL,
            MontoAnteriorAjustado decimal(19,6) NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal,Tipo)
        );

        INSERT INTO #EnhTQP
        SELECT
            v.Fecha, v.CodAlmacen, v.Canal, N'TQP',
            v.FechaAnterior,
            MontoAnterior = CASE WHEN t.MontoAnterior IS NULL OR t.MontoAnterior=0 OR v.MontoAnterior IS NULL THEN NULL
                                 ELSE CAST(v.MontoAnterior / t.MontoAnterior AS decimal(19,6)) END,
            v.FechaAnteriorAjustada,
            MontoAnteriorAjustado = CASE WHEN t.MontoAnteriorAjustado IS NULL OR t.MontoAnteriorAjustado=0 OR v.MontoAnteriorAjustado IS NULL THEN NULL
                                         ELSE CAST(v.MontoAnteriorAjustado / t.MontoAnteriorAjustado AS decimal(19,6)) END
        FROM #EnhVT v
        JOIN #EnhVT t
          ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Canal=v.Canal
         AND t.Tipo=N'Transacciones'
        WHERE v.Tipo=N'Ventas';

        /* ============================================================
           15.9) REAL @AnoPresupuesto (MontoReal / ParticipacionReal)
           ============================================================ */
        IF OBJECT_ID('tempdb..#DailyReal') IS NOT NULL DROP TABLE #DailyReal;
        CREATE TABLE #DailyReal
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Venta decimal(19,6) NOT NULL,
            Transacciones int NOT NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal)
        );

        DECLARE @sqlReal nvarchar(max) = N'
INSERT INTO #DailyReal(Fecha,CodAlmacen,Canal,Venta,Transacciones)
SELECT
    CAST(v.FECHA AS date),
    LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END COLLATE DATABASE_DEFAULT,
    SUM(ISNULL(TRY_CONVERT(decimal(19,6), v.[VENTAS NETAS]), CAST(0 AS decimal(19,6)))),
    SUM(ISNULL(TRY_CONVERT(int, v.[Transacciones]), 0))
FROM dbo.BI_VENTAS_ROSTIPOLLOS v' + @NoLockHint + N'
WHERE v.ANO=@AnoPresupuesto
  AND (@Mes IS NULL OR v.MES=@Mes)
GROUP BY
    CAST(v.FECHA AS date),
    LEFT(LTRIM(RTRIM(v.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10),
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END
HAVING
    CASE
        WHEN v.CANAL IS NULL THEN NULL
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''AUTO'',N''AUTOPOLLO'',N''AUTO POLLO'') THEN N''AutoPollo''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''ECOMMERCE'',N''E-COMMERCE'',N''E COMMERCE'') THEN N''ECommerce''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''EXPRESS'') THEN N''Express''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''LLEVAR'') THEN N''Llevar''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''SALON'',N''SALÓN'') THEN N''Salón''
        WHEN UPPER(LTRIM(RTRIM(v.CANAL))) IN (N''UBEREATS'',N''UBER EATS'') THEN N''UberEats''
        ELSE NULL
    END IS NOT NULL;';
        EXEC sys.sp_executesql
            @sqlReal,
            N'@AnoPresupuesto int, @Mes int',
            @AnoPresupuesto=@AnoPresupuesto,
            @Mes=@Mes;

        /* normalizar real a dataset (Ventas/Transacciones + Todos + Grupos) */
        IF OBJECT_ID('tempdb..#DailyRealN') IS NOT NULL DROP TABLE #DailyRealN;
        CREATE TABLE #DailyRealN
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Mes int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            Monto decimal(19,6) NOT NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal,Tipo)
        );

        INSERT INTO #DailyRealN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),Canal,N'Ventas',Venta
        FROM #DailyReal;

        INSERT INTO #DailyRealN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),Canal,N'Transacciones',CAST(Transacciones AS decimal(19,6))
        FROM #DailyReal;

        INSERT INTO #DailyRealN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
        SELECT Fecha,CodAlmacen,MONTH(Fecha),N'Todos',Tipo,SUM(Monto)
        FROM #DailyRealN
        WHERE Canal <> N'Todos'
        GROUP BY Fecha,CodAlmacen,Tipo;

        IF EXISTS (SELECT 1 FROM #Grupos)
        BEGIN
            INSERT INTO #DailyRealN(Fecha,CodAlmacen,Mes,Canal,Tipo,Monto)
            SELECT d.Fecha, g.GrupoCod, d.Mes, d.Canal, d.Tipo, SUM(d.Monto)
            FROM #DailyRealN d
            JOIN #Grupos g ON g.CodAlmacenMiembro=d.CodAlmacen
            GROUP BY d.Fecha, g.GrupoCod, d.Mes, d.Canal, d.Tipo;
        END;

        IF OBJECT_ID('tempdb..#MonthRealTotalsN') IS NOT NULL DROP TABLE #MonthRealTotalsN;
        SELECT CodAlmacen, Mes, Canal, Tipo, MontoMes=SUM(Monto)
        INTO #MonthRealTotalsN
        FROM #DailyRealN
        GROUP BY CodAlmacen, Mes, Canal, Tipo;

        CREATE UNIQUE CLUSTERED INDEX IX_MonthRealTotalsN ON #MonthRealTotalsN(CodAlmacen,Mes,Canal,Tipo);

        IF OBJECT_ID('tempdb..#RealRes') IS NOT NULL DROP TABLE #RealRes;
        CREATE TABLE #RealRes
        (
            Fecha date NOT NULL,
            CodAlmacen nvarchar(10) NOT NULL,
            Mes int NOT NULL,
            Canal nvarchar(200) NOT NULL,
            Tipo nvarchar(100) NOT NULL,
            MontoReal decimal(19,6) NOT NULL,
            ParticipacionReal decimal(18,12) NULL,
            PRIMARY KEY (Fecha,CodAlmacen,Canal,Tipo)
        );

        /* Ventas/Transacciones */
        INSERT INTO #RealRes(Fecha,CodAlmacen,Mes,Canal,Tipo,MontoReal,ParticipacionReal)
        SELECT
            r.Fecha, r.CodAlmacen, r.Mes, r.Canal, r.Tipo,
            MontoReal = ISNULL(dr.Monto,0),
            ParticipacionReal =
                CASE
                    WHEN r.Tipo NOT IN (N'Ventas',N'Transacciones') THEN NULL
                    WHEN mt.MontoMes IS NULL OR mt.MontoMes=0 THEN NULL
                    ELSE CAST(ISNULL(dr.Monto,0)/mt.MontoMes AS decimal(18,12))
                END
        FROM #Res r
        LEFT JOIN #DailyRealN dr
          ON dr.Fecha=r.Fecha AND dr.CodAlmacen=r.CodAlmacen AND dr.Canal=r.Canal AND dr.Tipo=r.Tipo
        LEFT JOIN #MonthRealTotalsN mt
          ON mt.CodAlmacen=r.CodAlmacen AND mt.Mes=r.Mes AND mt.Canal=r.Canal AND mt.Tipo=r.Tipo
        WHERE r.Tipo IN (N'Ventas',N'Transacciones');

        /* TQP real */
        INSERT INTO #RealRes(Fecha,CodAlmacen,Mes,Canal,Tipo,MontoReal,ParticipacionReal)
        SELECT
            v.Fecha,v.CodAlmacen,v.Mes,v.Canal,N'TQP',
            MontoReal = CASE WHEN t.MontoReal=0 THEN CAST(0 AS decimal(19,6)) ELSE CAST(v.MontoReal/t.MontoReal AS decimal(19,6)) END,
            NULL
        FROM #RealRes v
        JOIN #RealRes t
          ON t.Fecha=v.Fecha AND t.CodAlmacen=v.CodAlmacen AND t.Mes=v.Mes AND t.Canal=v.Canal AND t.Tipo=N'Transacciones'
        WHERE v.Tipo=N'Ventas';

        /* ============================================================
           16) Dataset final (sin [Llave], con 3 llaves nuevas)
              + acumulados y diferencias (a @FechaCorte)
              Nota: para que SUM en pivots sea correcto, los *_Acumulado
                    aportan 0 cuando Fecha > @FechaCorte (NO es running total).
           ============================================================ */
        IF OBJECT_ID('tempdb..#LocalMap2') IS NOT NULL DROP TABLE #LocalMap2;
        SELECT CodAlmacen, idLocal, LocalName
        INTO #LocalMap2
        FROM #LocalMap;

        IF EXISTS (SELECT 1 FROM #Grupos)
        BEGIN
            INSERT INTO #LocalMap2(CodAlmacen,idLocal,LocalName)
            SELECT DISTINCT
                g.GrupoCod,
                idLocal = -g.IDGRUPO,
                LocalName = g.Descripcion
            FROM #Grupos g
            WHERE NOT EXISTS (SELECT 1 FROM #LocalMap2 m WHERE m.CodAlmacen=g.GrupoCod);
        END;

        IF OBJECT_ID('tempdb..#ToInsert') IS NOT NULL DROP TABLE #ToInsert;

        SELECT
            [Fecha] = CAST(r.Fecha AS datetime),
            [idLocal] = m.idLocal,
            [Local] = m.LocalName,
            [Serie] =
                CASE
                    WHEN r.CodAlmacen LIKE N'[A-Z]%' AND TRY_CONVERT(int, SUBSTRING(r.CodAlmacen,2,10)) IS NOT NULL
                        THEN TRY_CONVERT(int, SUBSTRING(r.CodAlmacen,2,10))
                    ELSE NULL
                END,
            [idDia] = DATEPART(WEEKDAY, r.Fecha),
            [Dia] = DAY(r.Fecha),
            [Mes] = r.Mes,
            [Monto] = CAST(r.Monto AS float),
            [CodAlmacen] = r.CodAlmacen,
            [Participacion] = CAST(r.Participacion AS float),
            [Canal] = r.Canal,
            [Año] = @AnoPresupuesto,
            [Tipo] = CASE WHEN r.Tipo = N'Venta' THEN N'Ventas' ELSE r.Tipo END,

            [Llave_Presupuesto] =
                r.CodAlmacen + N'_' + CONVERT(nvarchar(10), @AnoPresupuesto) + N'_' +
                CONVERT(nvarchar(10), r.Mes) + N'_' + CONVERT(nvarchar(10), DAY(r.Fecha)) + N'_' +
                r.Canal + N'_' + (CASE WHEN r.Tipo=N'Venta' THEN N'Ventas' ELSE r.Tipo END) + N'_' + N'Presupuesto',

            [Llave_AñoAnterior] =
                CASE
                    WHEN COALESCE(ev.FechaAnterior, et.FechaAnterior) IS NULL THEN NULL
                    ELSE
                        r.CodAlmacen + N'_' + CONVERT(nvarchar(10), @AnoBase) + N'_' +
                        CONVERT(nvarchar(10), MONTH(COALESCE(ev.FechaAnterior, et.FechaAnterior))) + N'_' +
                        CONVERT(nvarchar(10), DAY(COALESCE(ev.FechaAnterior, et.FechaAnterior))) + N'_' +
                        r.Canal + N'_' + (CASE WHEN r.Tipo=N'Venta' THEN N'Ventas' ELSE r.Tipo END) + N'_' + N'AñoAnterior'
                END,

            [Llave_AnoAnterior_Ajustado] =
                CASE
                    WHEN COALESCE(ev.FechaAnteriorAjustada, et.FechaAnteriorAjustada) IS NULL THEN NULL
                    ELSE
                        r.CodAlmacen + N'_' + CONVERT(nvarchar(10), @AnoBase) + N'_' +
                        CONVERT(nvarchar(10), MONTH(COALESCE(ev.FechaAnteriorAjustada, et.FechaAnteriorAjustada))) + N'_' +
                        CONVERT(nvarchar(10), DAY(COALESCE(ev.FechaAnteriorAjustada, et.FechaAnteriorAjustada))) + N'_' +
                        r.Canal + N'_' + (CASE WHEN r.Tipo=N'Venta' THEN N'Ventas' ELSE r.Tipo END) + N'_' + N'AñoAnteriorAjustado'
                END,

            FechaAnterior = CAST(COALESCE(ev.FechaAnterior, et.FechaAnterior) AS datetime),
            MontoAnterior = CAST(COALESCE(ev.MontoAnterior, et.MontoAnterior) AS float),
            ParticipacionAnterior = CAST(COALESCE(ev.ParticipacionAnterior, NULL) AS float),

            FechaAnteriorAjustada = CAST(COALESCE(ev.FechaAnteriorAjustada, et.FechaAnteriorAjustada) AS datetime),
            MontoAnteriorAjustado = CAST(COALESCE(ev.MontoAnteriorAjustado, et.MontoAnteriorAjustado) AS float),
            ParticipacionAnteriorAjustado = CAST(COALESCE(ev.ParticipacionAnteriorAjustado, NULL) AS float),

            MontoReal = CAST(ISNULL(rr.MontoReal,0) AS float),
            ParticipacionReal = CAST(ISNULL(rr.ParticipacionReal,0) AS float),

            /* ===== acumulados al corte (aportes por fila; SUM da el acumulado real) ===== */
            Monto_Acumulado =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN r.Monto ELSE 0 END AS float),

            MontoAnterior_Acumulado =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN ISNULL(COALESCE(ev.MontoAnterior, et.MontoAnterior),0) ELSE 0 END AS float),

            MontoAnteriorAjustado_Acumulado =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN ISNULL(COALESCE(ev.MontoAnteriorAjustado, et.MontoAnteriorAjustado),0) ELSE 0 END AS float),

            /* ===== diferencias al corte (aportes por fila; SUM da la diferencia acumulada) ===== */
            Monto_Dif =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN (ISNULL(rr.MontoReal,0) - r.Monto) ELSE 0 END AS float),

            MontoAnterior_Dif =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN (ISNULL(rr.MontoReal,0) - ISNULL(COALESCE(ev.MontoAnterior, et.MontoAnterior),0)) ELSE 0 END AS float),

            MontoAnteriorAjustado_Dif =
                CAST(CASE WHEN r.Fecha <= @FechaCorte THEN (ISNULL(rr.MontoReal,0) - ISNULL(COALESCE(ev.MontoAnteriorAjustado, et.MontoAnteriorAjustado),0)) ELSE 0 END AS float)

        INTO #ToInsert
        FROM #Res r
        LEFT JOIN #LocalMap2 m
          ON m.CodAlmacen=r.CodAlmacen
        LEFT JOIN #EnhVT ev
          ON ev.Fecha=r.Fecha AND ev.CodAlmacen=r.CodAlmacen AND ev.Canal=r.Canal AND ev.Tipo=r.Tipo
        LEFT JOIN #EnhTQP et
          ON et.Fecha=r.Fecha AND et.CodAlmacen=r.CodAlmacen AND et.Canal=r.Canal AND et.Tipo=r.Tipo
        LEFT JOIN #RealRes rr
          ON rr.Fecha=r.Fecha AND rr.CodAlmacen=r.CodAlmacen AND rr.Canal=r.Canal AND rr.Tipo=r.Tipo;

        IF EXISTS
        (
            SELECT 1
            FROM #ToInsert
            GROUP BY [Fecha],[CodAlmacen],[Canal],[Tipo]
            HAVING COUNT(*) > 1
        )
        BEGIN
            RAISERROR('Dataset generado contiene duplicados por Fecha/CodAlmacen/Canal/Tipo. No se continúa.', 16, 1);
            RETURN;
        END;

        CREATE CLUSTERED INDEX IX_ToInsert ON #ToInsert([Fecha],[CodAlmacen],[Canal],[Tipo]);

        /* ============================================================
           16.1) TABLAS DE COMPROBACIÓN (acumulados y real)
           ============================================================ */
        IF OBJECT_ID('tempdb..#Chk_Acumulados') IS NOT NULL DROP TABLE #Chk_Acumulados;
        SELECT
            CodAlmacen,
            Canal,
            Tipo,
            Presu_ToDate = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN ISNULL([Monto],0) ELSE 0 END),
            Real_ToDate  = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN ISNULL([MontoReal],0) ELSE 0 END),
            Dif_ToDate   = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN (ISNULL([MontoReal],0)-ISNULL([Monto],0)) ELSE 0 END),

            AnoAnt_ToDate = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN ISNULL([MontoAnterior],0) ELSE 0 END),
            Dif_vs_AnoAnt_ToDate = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN (ISNULL([MontoReal],0)-ISNULL([MontoAnterior],0)) ELSE 0 END),

            AnoAntAj_ToDate = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN ISNULL([MontoAnteriorAjustado],0) ELSE 0 END),
            Dif_vs_AnoAntAj_ToDate = SUM(CASE WHEN CAST([Fecha] AS date) <= @FechaCorte THEN (ISNULL([MontoReal],0)-ISNULL([MontoAnteriorAjustado],0)) ELSE 0 END)
        INTO #Chk_Acumulados
        FROM #ToInsert
        WHERE Tipo IN (N'Ventas',N'Transacciones')
        GROUP BY CodAlmacen,Canal,Tipo;

        /* ============================================================
           17) PREVIEW
           ============================================================ */
        SELECT
            [Fecha],[idLocal],[Local],[Serie],[idDia],[Dia],[Mes],
            [Monto],[CodAlmacen],[Participacion],[Canal],[Año],[Tipo],
            [MontoReal],[ParticipacionReal],
            [Monto_Acumulado],[MontoAnterior_Acumulado],[MontoAnteriorAjustado_Acumulado],
            [Monto_Dif],[MontoAnterior_Dif],[MontoAnteriorAjustado_Dif],
            [Llave_Presupuesto],[Llave_AñoAnterior],[Llave_AnoAnterior_Ajustado],
            FechaAnterior,MontoAnterior,ParticipacionAnterior,
            FechaAnteriorAjustada,MontoAnteriorAjustado,ParticipacionAnteriorAjustado
        FROM #ToInsert
        ORDER BY [Fecha],[CodAlmacen],[Canal],[Tipo];

        SELECT *
        FROM #Validacion
        ORDER BY Mes, Tipo, CodAlmacen, Canal;

        SELECT
            CodAlmacen,
            Canal,
            Tipo,
            Veces = COUNT(*),
            Referencia = MAX(CodReferencia)
        FROM #FaltantesParticipacion
        GROUP BY CodAlmacen, Canal, Tipo
        ORDER BY CodAlmacen, Canal, Tipo;

        SELECT *
        FROM #Chk_Acumulados
        ORDER BY CodAlmacen,Canal,Tipo;

        /* ============================================================
           18) Insert/Replace en destino si @AplicarInsert=1
           ============================================================ */
        IF @AplicarInsert = 1
        BEGIN
            IF @IgnorarTolerancias = 0 AND @FallaValidacion = 1 AND @ForzarInsert = 0
            BEGIN
                RAISERROR('Validación falló: Consolidado vs Resultado no cuadra. No se insertó nada. Use @ForzarInsert=1 o @IgnorarTolerancias=1.', 16, 1);
                RETURN;
            END;

            BEGIN TRAN;

            DECLARE @delSql nvarchar(max) = N'
DELETE d
FROM ' + @DestinoQuoted + N' d
WHERE d.[Año] = @AnoPresupuesto
  AND (@Mes IS NULL OR d.[Mes] = @Mes)
  AND d.[Tipo] IN (N''Ventas'',N''Venta'',N''Transacciones'',N''Transaccion'',N''TQP'')
  AND d.[Canal] IN (N''AutoPollo'',N''ECommerce'',N''Express'',N''Llevar'',N''Salón'',N''UberEats'',N''Todos'')
  AND EXISTS (SELECT 1 FROM #ToInsert s WHERE s.CodAlmacen = d.CodAlmacen);';

            EXEC sys.sp_executesql
                @delSql,
                N'@AnoPresupuesto int, @Mes int',
                @AnoPresupuesto=@AnoPresupuesto,
                @Mes=@Mes;

            DECLARE @insSql nvarchar(max) = N'
INSERT INTO ' + @DestinoQuoted + N'
([Fecha],[idLocal],[Local],[Serie],[idDia],[Dia],[Mes],
 [Monto],[CodAlmacen],[Participacion],[Canal],[Año],[Tipo],
 [FechaAnterior],[MontoAnterior],[ParticipacionAnterior],
 [FechaAnteriorAjustada],[MontoAnteriorAjustado],[ParticipacionAnteriorAjustado],
 [MontoReal],[ParticipacionReal],
 [Monto_Acumulado],[MontoAnterior_Acumulado],[MontoAnteriorAjustado_Acumulado],
 [Monto_Dif],[MontoAnterior_Dif],[MontoAnteriorAjustado_Dif],
 [Llave_Presupuesto],[Llave_AñoAnterior],[Llave_AnoAnterior_Ajustado])
SELECT
 [Fecha],[idLocal],[Local],[Serie],[idDia],[Dia],[Mes],
 [Monto],[CodAlmacen],[Participacion],[Canal],[Año],[Tipo],
 [FechaAnterior],[MontoAnterior],[ParticipacionAnterior],
 [FechaAnteriorAjustada],[MontoAnteriorAjustado],[ParticipacionAnteriorAjustado],
 [MontoReal],[ParticipacionReal],
 [Monto_Acumulado],[MontoAnterior_Acumulado],[MontoAnteriorAjustado_Acumulado],
 [Monto_Dif],[MontoAnterior_Dif],[MontoAnteriorAjustado_Dif],
 [Llave_Presupuesto],[Llave_AñoAnterior],[Llave_AnoAnterior_Ajustado]
FROM #ToInsert;';
            EXEC(@insSql);

            COMMIT;
        END
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        DECLARE @Err nvarchar(4000) = ERROR_MESSAGE();
        DECLARE @ErrLine int = ERROR_LINE();
        RAISERROR('SP_GENERAR_PRESUPUESTO_DIARIO falló en línea %d: %s', 16, 1, @ErrLine, @Err);
        RETURN;
    END CATCH
END;
