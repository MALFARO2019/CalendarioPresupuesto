const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== DIAGNOSTICO DE BASE DE DATOS ===');

    // 1. Check total rows and sums across entire table for 'Producción'
    const totals = await pool.request().query(`
        SELECT NombrePresupuesto,
               COUNT(*) as TotalFilas,
               ROUND(SUM(Monto), 0) as PresupuestoTotal,
               ROUND(SUM(ISNULL(MontoAnterior,0)), 0) as AnteriorTotal,
               ROUND(SUM(ISNULL(MontoReal,0)), 0) as RealTotal
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
        GROUP BY NombrePresupuesto
    `);
    console.log('\n--- TOTALES GLOBALES ---');
    console.table(totals.recordset);

    // 2. Check for duplicate dates on the same local and channel
    const dups = await pool.request().query(`
        SELECT TOP 10 Fecha, CodAlmacen, Canal, Tipo, COUNT(*) as Veces, SUM(Monto) as Monto
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
        GROUP BY Fecha, CodAlmacen, Canal, Tipo
        HAVING COUNT(*) > 1
        ORDER BY Veces DESC
    `);
    console.log('\n--- DUPLICADOS MÚLTIPLES ---');
    console.table(dups.recordset);

    // 3. Check Groups summary
    const groups = await pool.request().query(`
        SELECT [Local], CodAlmacen, COUNT(*) as Filas, ROUND(SUM(Monto),0) as PresTotal
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
          AND LEFT(CodAlmacen, 1) = 'G'
          AND Canal = 'Todos'
          AND Tipo = 'Ventas'
        GROUP BY [Local], CodAlmacen
        ORDER BY [Local]
    `);
    console.log('\n--- RESUMEN GRUPOS ---');
    console.table(groups.recordset);

    // 4. Check Non-groups summary
    const no_groups = await pool.request().query(`
        SELECT [Local], COUNT(*) as Filas, ROUND(SUM(Monto),0) as PresTotal
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
          AND LEFT(CodAlmacen, 1) <> 'G'
          AND Canal = 'Todos'
          AND Tipo = 'Ventas'
        GROUP BY [Local]
        ORDER BY PresTotal DESC
    `);
    console.log('\n--- TOTAL POR LUGAR NO GRUPO ---');
    console.table(no_groups.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
