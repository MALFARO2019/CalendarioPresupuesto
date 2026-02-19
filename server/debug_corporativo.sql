-- Query to find Corporativo and verify CODALMACEN pattern
-- This will help debug why Corporativo doesn't appear in the groups

-- Check if Corporativo exists and what CODALMACEN it has
SELECT DISTINCT 
    Local,
    CODALMACEN,
    LEFT(CODALMACEN, 1) AS FirstChar,
    CASE 
        WHEN LEFT(CODALMACEN, 1) = 'G' THEN 'GROUP'
        ELSE 'INDIVIDUAL'
    END AS Type
FROM RSM_ALCANCE_DIARIO 
WHERE Año = 2026
    AND Local LIKE '%Corporativo%'
ORDER BY CODALMACEN;

-- Also check all groups (starting with 'G')
SELECT DISTINCT 
    Local,
    CODALMACEN
FROM RSM_ALCANCE_DIARIO 
WHERE Año = 2026
    AND LEFT(CODALMACEN, 1) = 'G'
ORDER BY Local;

-- And check all distinct locals with their CODALMACEN patterns
SELECT DISTINCT 
    Local,
    COUNT(DISTINCT CODALMACEN) as NumCodigos,
    MIN(CODALMACEN) as PrimerCodigo,
    MAX(CODALMACEN) as UltimoCodigo
FROM RSM_ALCANCE_DIARIO 
WHERE Año = 2026
GROUP BY Local
ORDER BY Local;
