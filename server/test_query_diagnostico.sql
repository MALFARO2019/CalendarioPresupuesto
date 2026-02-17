-- Query directo para diagnosticar el problema
-- Ejecutar en SSMS o Azure Data Studio

DECLARE @startDate DATE = '2026-01-01';
DECLARE @endDate DATE = '2026-02-15';
DECLARE @kpi VARCHAR(50) = 'Ventas';
DECLARE @canal VARCHAR(50) = 'Total';

-- PASO 1: Ver cuántos registros únicos de Local hay
SELECT COUNT(DISTINCT Local) as TotalLocales
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 AND Tipo = @kpi AND Canal = @canal
    AND SUBSTRING(CODALMACEN, 1, 1) != 'G';

-- PASO 2: Ver los primeros 5 locales con sus MontoReal totales
SELECT TOP 5
    Local,
    SUM(MontoReal) as TotalReal,
    SUM(Monto) as TotalMonto,
    COUNT(*) as NumRegistros
FROM RSM_ALCANCE_DIARIO
WHERE Fecha BETWEEN @startDate AND @endDate
    AND Año = 2026 AND Tipo = @kpi AND Canal = @canal
    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
GROUP BY Local
ORDER BY Local;

-- PASO 3: Ejecutar el query exacto que debería estar usando el backend
WITH RawDailyData AS (
    SELECT 
        Local,
        Fecha,
        SUM(MontoReal) as DayReal,
        SUM(Monto) as DayMonto,
        SUM(MontoAnterior) as DayAnterior
    FROM RSM_ALCANCE_DIARIO
    WHERE Fecha BETWEEN @startDate AND @endDate
        AND Año = 2026 AND Tipo = @kpi AND Canal = @canal
        AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
    GROUP BY Local, Fecha
),
PeriodData AS (
    SELECT 
        Local,
        SUM(DayMonto) as PresupuestoAcum,
        SUM(DayReal) as RealAcum,
        SUM(DayAnterior) as AnteriorAcum
    FROM RawDailyData
    WHERE DayReal > 0
    GROUP BY Local
)
SELECT TOP 10
    Local,
    PresupuestoAcum,
    RealAcum,
    AnteriorAcum
FROM PeriodData
ORDER BY Local;

-- PASO 4: Verificar si TODOS tienen el mismo valor
SELECT 
    CASE WHEN COUNT(DISTINCT RealAcum) = 1 THEN 'ERROR: Todos iguales' ELSE 'OK: Valores únicos' END as Diagnostico,
    COUNT(DISTINCT RealAcum) as ValoresUnicosReal,
    COUNT(*) as TotalRestaurantes
FROM (
    SELECT 
        Local,
        SUM(DayReal) as RealAcum
    FROM (
        SELECT 
            Local,
            Fecha,
            SUM(MontoReal) as DayReal
        FROM RSM_ALCANCE_DIARIO
        WHERE Fecha BETWEEN @startDate AND @endDate
            AND Año = 2026 AND Tipo = @kpi AND Canal = @canal
            AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
        GROUP BY Local, Fecha
    ) RD
    WHERE DayReal > 0
    GROUP BY Local
) PD;
