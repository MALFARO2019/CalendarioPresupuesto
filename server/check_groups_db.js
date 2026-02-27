const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    // Check if Corporate or other groups exist in Produccion
    const groups = await pool.request().query(`
        SELECT [Local], COUNT(*) as Rows
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
          AND ([Local] = 'Corporativo' OR [Local] = 'Total Compañia' OR CodAlmacen LIKE 'G%')
        GROUP BY [Local]
    `);
    console.log('=== Groups in Produccion ===');
    console.table(groups.recordset);

    // Check for Presupuesto 2026
    const groups2 = await pool.request().query(`
        SELECT [Local], COUNT(*) as Rows
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Presupuesto 2026'
          AND ([Local] = 'Corporativo' OR [Local] = 'Total Compañia' OR CodAlmacen LIKE 'G%')
        GROUP BY [Local]
    `);
    console.log('\n=== Groups in Presupuesto 2026 ===');
    console.table(groups2.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
