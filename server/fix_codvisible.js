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
        await pool.request().query("UPDATE ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB SET CODVISIBLE = 20 WHERE IDGRUPO = 22");
        console.log('Group 22 set to CODVISIBLE = 20');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
