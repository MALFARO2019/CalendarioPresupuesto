-- Verificar valores de Monto y Monto_Acumulado para Febrero 2026
-- Query 1: Ver primeros días de febrero para Ventas, Canal Todos, Alajuela

SELECT TOP 5
    Fecha,
    Mes,
    Dia,
    Tipo,
    Canal,
    Local,
    Monto,
    Monto_Acumulado,
    MontoReal
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes = 2
    AND Canal = 'Todos'
    AND Local = 'Alajuela'
    AND Tipo = 'Ventas'
ORDER BY Dia ASC;

-- Query 2: Sumar totales para todo febrero
SELECT 
    Mes,
    SUM(Monto) AS Total_Monto_Mes,
    MAX(Monto_Acumulado) AS Max_Acumulado_Febrero,
    SUM(MontoReal) AS Total_Real
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes = 2
    AND Canal = 'Todos'
    AND Local = 'Alajuela'
    AND Tipo = 'Ventas'
GROUP BY Mes;

-- Query 3: Ver también enero para comparar
SELECT 
    Mes,
    SUM(Monto) AS Total_Monto_Mes,
    MAX(Monto_Acumulado) AS Max_Acumulado,
    SUM(MontoReal) AS Total_Real
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes IN (1, 2)
    AND Canal = 'Todos'
    AND Local = 'Alajuela'
    AND Tipo = 'Ventas'
GROUP BY Mes
ORDER BY Mes;

-- Query 4: Ver cómo va acumulando día a día en febrero
SELECT TOP 10
    Dia,
    Monto,
    Monto_Acumulado,
    MontoReal
FROM RSM_ALCANCE_DIARIO
WHERE Año = 2026 
    AND Mes = 2
    AND Canal = 'Todos'
    AND Local = 'Alajuela'
    AND Tipo = 'Ventas'
ORDER BY Dia ASC;
