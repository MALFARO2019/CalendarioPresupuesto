const { poolPromise } = require('./db');
(async () => {
    const pool = await poolPromise;

    // Check DIM_NOMBRES_ALMACEN
    const r1 = await pool.request().query(`
        SELECT TOP 20 * FROM DIM_NOMBRES_ALMACEN ORDER BY CodAlmacen
    `);
    console.log('=== DIM_NOMBRES_ALMACEN COLUMNS:', Object.keys(r1.recordset[0] || {}));
    r1.recordset.forEach(x => console.log(`${x.CodAlmacen} => ${x.NombreAlmacen || x.Nombre || x.Descripcion || JSON.stringify(x)}`));

    // Also check RSM_ALCANCE_DIARIO columns
    const r2 = await pool.request().query(`
        SELECT TOP 3 * FROM RSM_ALCANCE_DIARIO WHERE Año = 2026
    `);
    console.log('\n=== RSM_ALCANCE COLUMNS:', Object.keys(r2.recordset[0] || {}));

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
