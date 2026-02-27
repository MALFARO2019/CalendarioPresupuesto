const sql = require('mssql');
const fs = require('fs');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
    let pool;
    try {
        pool = await sql.connect(config);
        const res = await pool.request().query("EXEC sp_helptext 'SP_AJUSTAR_PRESUPUESTO'");
        const lines = res.recordset.map(r => r.Text).join('');
        fs.writeFileSync('_sp_ajustes.sql', lines);
        console.log("SP guardado en _sp_ajustes.sql");
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
