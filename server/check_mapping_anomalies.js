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

        console.log('\n=== Anomalous Mappings (Target Month != Base Month) ===');
        const anomalies = await pool.request().query(`
            SELECT DISTINCT Mes as MesTarget, MONTH(FechaAnteriorAjustada) as MesBase, COUNT(*) as Count
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND CodAlmacen = 'S22'
            GROUP BY Mes, MONTH(FechaAnteriorAjustada)
            HAVING Mes != MONTH(FechaAnteriorAjustada)
        `);
        console.table(anomalies.recordset);

        if (anomalies.recordset.length > 0) {
            console.log('\n=== Detailed Anomalies for March 2026 ===');
            const details = await pool.request().query(`
                SELECT Fecha, FechaAnteriorAjustada
                FROM RSM_ALCANCE_DIARIO
                WHERE Año = 2026 AND CodAlmacen = 'S22' AND Mes = 3
                  AND MONTH(FechaAnteriorAjustada) != 3
            `);
            console.table(details.recordset);
        } else {
            console.log('No month-boundary skips found for S22 in 2026.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
