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

        // 1. Get CodAlmacen for Avenida Escazu
        const storeResult = await pool.request().query(`
            SELECT DISTINCT CodAlmacen, [Local] 
            FROM RSM_ALCANCE_DIARIO 
            WHERE [Local] LIKE '%Escazu%'
        `);
        console.log('Stores found:', storeResult.recordset);
        const cod = storeResult.recordset.find(s => s.Local.includes('Avenida Escazu'))?.CodAlmacen || storeResult.recordset[0]?.CodAlmacen;

        if (!cod) {
            console.log('Avenida Escazu not found');
            return;
        }
        console.log(`Using CodAlmacen: ${cod}`);

        // 1. Check columns
        const cols = await pool.request().query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RSM_ALCANCE_DIARIO'
        `);
        console.log('Columns in RSM_ALCANCE_DIARIO:', cols.recordset.map(c => c.COLUMN_NAME));

        // 2. Check data for March 2026
        console.log('\n=== March 2026 Data ===');
        const marchData = await pool.request().query(`
            SELECT Fecha, Canal, Tipo, Monto, MontoReal, MontoAnterior, MontoAnteriorAjustado,
                   FechaAnterior, FechaAnteriorAjustada
            FROM RSM_ALCANCE_DIARIO
            WHERE CodAlmacen = '${cod}' AND Año = 2026 AND Mes = 3
              AND Canal = 'Todos' AND Tipo = 'Ventas'
            ORDER BY Fecha
        `);
        marchData.recordset.forEach(r => {
            const f = r.Fecha.toISOString().split('T')[0];
            const fa = r.FechaAnterior?.toISOString().split('T')[0] || 'N/A';
            const faa = r.FechaAnteriorAjustada?.toISOString().split('T')[0] || 'N/A';
            console.log(`${f} | Ppto: ${String(r.Monto.toFixed(0)).padStart(10)} | AntAj: ${String(r.MontoAnteriorAjustado.toFixed(0)).padStart(10)} | FaAj: ${faa}`);
        });

        // 3. Check events for March 2026 and March 2025
        console.log('\n=== Events March 2026 ===');
        const events26 = await pool.request().query(`
            SELECT * FROM DIM_EVENTOS_FECHAS 
            WHERE FECHA BETWEEN '2026-03-01' AND '2026-03-31'
               OR FECHA_EFECTIVA BETWEEN '2026-03-01' AND '2026-03-31'
        `);
        console.table(events26.recordset);

        console.log('\n=== Events March 2025 ===');
        const events25 = await pool.request().query(`
            SELECT * FROM DIM_EVENTOS_FECHAS 
            WHERE FECHA BETWEEN '2025-03-01' AND '2025-03-31'
               OR FECHA_EFECTIVA BETWEEN '2025-03-01' AND '2025-03-31'
        `);
        console.table(events25.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
