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

        console.log('\n=== All Event Types ===');
        const eventTypes = await pool.request().query(`
            SELECT * FROM DIM_EVENTOS
        `);
        console.table(eventTypes.recordset);

        console.log('\n=== Event Mappings related to March 2026 (Global) ===');
        const mappings = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA = '2026-03-14' OR f.FECHA_EFECTIVA = '2026-03-14'
               OR f.FECHA = '2026-03-07' OR f.FECHA_EFECTIVA = '2026-03-07'
        `);
        console.table(mappings.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
