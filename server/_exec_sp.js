const sql = require('mssql');
const fs = require('fs');

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
        const script = fs.readFileSync('_sp_ajustes.sql', 'utf8');
        await pool.request().batch(script);
        console.log("SP ALTERADO con EXITO!!!");
    } catch (err) {
        console.error('Error alterando SP:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
