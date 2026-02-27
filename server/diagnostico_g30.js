const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== INVESTIGANDO G30 EN LA BASE DE DATOS ===');
    const result = await pool.request().query(`
        SELECT TOP 10 *
        FROM RSM_ALCANCE_DIARIO
        WHERE CodAlmacen IN ('G30', 'G00')
          AND [Local] = 'Corporativo'
          AND NombrePresupuesto = 'Producción'
    `);
    console.table(result.recordset);

    console.log('\n=== COUNT PARA G00 y G30 ===');
    const count = await pool.request().query(`
        SELECT CodAlmacen, COUNT(*) as Filas
        FROM RSM_ALCANCE_DIARIO
        WHERE CodAlmacen IN ('G30', 'G00')
          AND NombrePresupuesto = 'Producción'
        GROUP BY CodAlmacen
    `);
    console.table(count.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
