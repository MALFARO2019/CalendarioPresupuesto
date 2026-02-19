-- Verificar cuántos días de febrero tienen datos en RSM_ALCANCE_DIARIO
-- para Corporativo, Canal Todos, Tipo Ventas

SELECT 
    Mes,
    Dia,
    COUNT(*) as NumRegistros,
    SUM(CASE WHEN MontoReal > 0 THEN 1 ELSE 0 END) as DiasConDatosReales,
    SUM(Monto) as TotalMonto,
    SUM(MontoReal) as TotalMontoReal
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes = 2  -- Febrero
    AND Canal = 'Todos'
    AND Tipo = 'Ventas'
    AND Local = 'Corporativo'
GROUP BY Mes, Dia
ORDER BY Dia;

-- Contar total de días con presupuesto vs días con datos reales
SELECT 
    COUNT(DISTINCT Dia) as TotalDiasConPresupuesto,
    COUNT(DISTINCT CASE WHEN MontoReal > 0 THEN Dia END) as TotalDiasConDatosReales,
    SUM(Monto) as PresupuestoTotal,
    SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoAcumulado
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes = 2  -- Febrero
    AND Canal = 'Todos'
    AND Tipo = 'Ventas'
    AND Local = 'Corporativo';
