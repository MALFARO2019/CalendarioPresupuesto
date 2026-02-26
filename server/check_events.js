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

        console.log('\n=== Mappings for March 2026 ===');
        const march26 = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA BETWEEN '2026-03-01' AND '2026-03-31'
               OR f.FECHA_EFECTIVA BETWEEN '2026-03-01' AND '2026-03-31'
        `);
        console.table(march26.recordset.map(r => ({
            ID: r.ID,
            IDEv: r.IDEVENTO,
            Evento: r.EVENTO,
            Fecha: r.FECHA?.toISOString().split('T')[0],
            FechaEf: r.FECHA_EFECTIVA?.toISOString().split('T')[0],
            Canal: r.Canal,
            Grupo: r.GrupoAlmacen
        })));

        console.log('\n=== Mappings for March 2025 ===');
        const march25 = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA BETWEEN '2025-03-01' AND '2025-03-31'
               OR f.FECHA_EFECTIVA BETWEEN '2025-03-01' AND '2025-03-31'
        `);
        console.table(march25.recordset.map(r => ({
            ID: r.ID,
            IDEv: r.IDEVENTO,
            Evento: r.EVENTO,
            Fecha: r.FECHA?.toISOString().split('T')[0],
            FechaEf: r.FECHA_EFECTIVA?.toISOString().split('T')[0],
            Canal: r.Canal,
            Grupo: r.GrupoAlmacen
        })));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
