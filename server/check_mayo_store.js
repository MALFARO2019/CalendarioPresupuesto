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

        console.log('\n=== Stores starting with M or having MAYO ===');
        const stores = await pool.request().query(`
            SELECT DISTINCT CodAlmacen, [Local] 
            FROM RSM_ALCANCE_DIARIO 
            WHERE [Local] LIKE '%MAYO%' OR [Local] LIKE 'M%'
        `);
        console.table(stores.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
