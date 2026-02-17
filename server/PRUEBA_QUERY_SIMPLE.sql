-- QUERY DE PRUEBA SIMPLIFICADO - Ejecutar en SQL Server Management Studio
-- Este query DEBE retornar valores DIFERENTES para cada Local

DECLARE @startDate DATE = '2026-01-01';
DECLARE @endDate DATE = '2026-02-15';

-- PASO 1: Query más simple posible - solo contar registros por Local
SELECT 
    Local,
    COUNT(*) as NumRegistros
FROM RSM_ALCANCE_DIARIO
WHERE Fecha BETWEEN @startDate AND @endDate
    AND Año = 2026
    AND Tipo = 'Ventas'
    AND Canal = 'Todos'
    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
GROUP BY Local
ORDER BY Local;

-- PASO 2: El query que DEBERÍA estar usando el backend
SELECT 
    r.Local,
    -- Annual budget (sum of ALL days in year for this Local)
    (SELECT SUM(Monto) 
     FROM RSM_ALCANCE_DIARIO 
     WHERE Local = r.Local 
       AND Año = 2026
       AND Tipo = 'Ventas'
       AND Canal = 'Todos'
       AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
    ) as PresupuestoAnual,
    -- Period budget (sum of days WITH sales only)
    SUM(CASE WHEN r.MontoReal > 0 THEN r.Monto ELSE 0 END) as PresupuestoAcum,
    -- Period real (sum of actual sales)
    SUM(r.MontoReal) as RealAcum,
    -- Period anterior (sum of previous year for days WITH sales)
    SUM(CASE WHEN r.MontoReal > 0 THEN r.MontoAnterior ELSE 0 END) as AnteriorAcum
FROM RSM_ALCANCE_DIARIO r
WHERE r.Fecha BETWEEN @startDate AND @endDate
    AND r.Año = 2026
    AND r.Tipo = 'Ventas'
    AND r.Canal = 'Todos'
    AND SUBSTRING(r.CODALMACEN, 1, 1) != 'G'
GROUP BY r.Local
ORDER BY r.Local;

-- PASO 3: Verificar si todos tienen el mismo RealAcum (esto NO debería pasar)
SELECT 
    COUNT(DISTINCT RealAcum) as ValoresUnicosReal,
    COUNT(*) as TotalLocales,
    CASE 
        WHEN COUNT(DISTINCT RealAcum) = 1 THEN '❌ ERROR: Todos tienen el mismo valor'
        ELSE '✅ OK: Valores únicos por local'
    END as Diagnostico
FROM (
    SELECT 
        r.Local,
        SUM(r.MontoReal) as RealAcum
    FROM RSM_ALCANCE_DIARIO r
    WHERE r.Fecha BETWEEN @startDate AND @endDate
        AND r.Año = 2026
        AND r.Tipo = 'Ventas'
        AND r.Canal = 'Todos'
        AND SUBSTRING(r.CODALMACEN, 1, 1) != 'G'
    GROUP BY r.Local
) SubQuery;
