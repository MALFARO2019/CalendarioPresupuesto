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
        const res = await pool.request().query("SELECT CAST(FECHA AS DATE) as Fecha, SUM(ISNULL(CAST([VENTAS NETAS] AS DECIMAL(19,2)),0)) as Ventas FROM BI_VENTAS_ROSTIPOLLOS WHERE CODALMACEN = 'S22' AND FECHA BETWEEN '2025-03-01' AND '2025-03-31' GROUP BY CAST(FECHA AS DATE) ORDER BY Fecha");
        console.table(res.recordset);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
