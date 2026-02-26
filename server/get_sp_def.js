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
        const res = await pool.request().query("SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('SP_CALCULAR_PRESUPUESTO')");
        console.log(res.recordset[0].definition);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
