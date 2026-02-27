const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== LIMPIEZA DE BASE DE DATOS ===');

    // Primero contamos cuantas filas hay
    const countQuery = `SELECT COUNT(*) as Filas FROM RSM_ALCANCE_DIARIO WHERE NombrePresupuesto = 'Presupuesto 2026'`;
    const countRes = await pool.request().query(countQuery);
    console.log(`Filas a borrar del modelo 'Presupuesto 2026': ${countRes.recordset[0].Filas}`);

    if (countRes.recordset[0].Filas > 0) {
        console.log('⏳ Ejecutando DELETE... (puede tardar un momento)');

        // Ejecutar borrado
        const request = pool.request();
        // Aumentar el timeout por si hay muchos registros
        request.timeout = 120000;

        const deleteQuery = `DELETE FROM RSM_ALCANCE_DIARIO WHERE NombrePresupuesto = 'Presupuesto 2026'`;
        const deleteRes = await request.query(deleteQuery);

        console.log(`✅ Borrado exitoso. Filas afectadas: ${deleteRes.rowsAffected[0]}`);
    } else {
        console.log('✅ No hay filas para borrar.');
    }

    console.log('\n=== VERIFICACIÓN DE TOTALES ACTUALIZADOS ===');
    const totals = await pool.request().query(`
        SELECT NombrePresupuesto,
               COUNT(*) as TotalFilas,
               ROUND(SUM(Monto), 0) as PresupuestoTotal
        FROM RSM_ALCANCE_DIARIO
        GROUP BY NombrePresupuesto
    `);
    console.table(totals.recordset);

    process.exit(0);
})().catch(e => { console.error('❌ Error general:', e.message); process.exit(1); });
