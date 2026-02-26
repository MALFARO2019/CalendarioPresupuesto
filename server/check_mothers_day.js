const sql = require('mssql');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000
};

async function main() {
    let pool;
    try {
        pool = await sql.connect(config);

        console.log('\n=== Dates for "Día de la madre" (ID 10) ===');
        const ddm = await pool.request().query(`
            SELECT * FROM DIM_EVENTOS_FECHAS WHERE IDEVENTO = 10
        `);
        console.table(ddm.recordset.map(r => ({
            ID: r.ID,
            Fecha: r.FECHA?.toISOString().split('T')[0],
            FechaEf: r.FECHA_EFECTIVA?.toISOString().split('T')[0],
            Canal: r.Canal
        })));

        console.log('\n=== All records for March 14, 2025 or 2026 in DIM_EVENTOS_FECHAS ===');
        const m14 = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA IN ('2026-03-14', '2025-03-14')
               OR f.FECHA_EFECTIVA IN ('2026-03-14', '2025-03-14')
        `);
        console.table(m14.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
