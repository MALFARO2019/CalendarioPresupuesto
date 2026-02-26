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

        console.log('\n=== Sales for Avenida Escazu (S22) March 2025 ===');
        const sales25 = await pool.request().query(`
            SELECT CAST(FECHA AS DATE) as Fecha, DATENAME(WEEKDAY, FECHA) as DiaSemana,
                   SUM(CAST([VENTAS NETAS] AS DECIMAL(19,2))) as VentasNetas
            FROM BI_VENTAS_ROSTIPOLLOS
            WHERE CODALMACEN = 'S22' AND ANO = 2025 AND MES = 3
            GROUP BY CAST(FECHA AS DATE), DATENAME(WEEKDAY, FECHA)
            ORDER BY Fecha
        `);
        console.table(sales25.recordset.map(r => ({
            Fecha: r.Fecha.toISOString().split('T')[0],
            Dia: r.DiaSemana,
            Ventas: r.VentasNetas
        })));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
