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

        // 1. Check adjustments for Avenida Escazu (S22)
        console.log('\n=== Adjustments for Avenida Escazu (S22) ===');
        const ajustes = await pool.request().query(`
            SELECT * FROM MODELO_PRESUPUESTO_AJUSTES 
            WHERE CodAlmacen = 'S22' AND Mes = 3
        `);
        console.table(ajustes.recordset);

        // 2. Check for ANY event that maps TO or FROM March 7/14 2026
        console.log('\n=== Reverse Mapping Search ===');
        const revMap = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA IN ('2026-03-07', '2026-03-14')
               OR f.FECHA_EFECTIVA IN ('2026-03-07', '2026-03-14')
        `);
        console.table(revMap.recordset);

        // 3. Search for events in MAY that might be mistakenly mapped
        console.log('\n=== Events in MAY mapping ===');
        const mayMap = await pool.request().query(`
            SELECT f.*, e.EVENTO 
            FROM DIM_EVENTOS_FECHAS f
            JOIN DIM_EVENTOS e ON e.IDEVENTO = f.IDEVENTO
            WHERE f.FECHA_EFECTIVA BETWEEN '2025-05-01' AND '2025-05-31'
              AND YEAR(f.FECHA) = 2026
        `);
        console.table(mayMap.recordset.map(r => ({
            Evento: r.EVENTO,
            Fecha: r.FECHA?.toISOString().split('T')[0],
            FechaEf: r.FECHA_EFECTIVA?.toISOString().split('T')[0]
        })));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
