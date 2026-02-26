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
        const res = await pool.request().query(`
            SELECT cab.IDGRUPO, cab.DESCRIPCION, cab.CODVISIBLE 
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB cab 
            JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN lin ON lin.IDGRUPO = cab.IDGRUPO 
            WHERE lin.CODALMACEN COLLATE DATABASE_DEFAULT = 'S22'
              AND cab.CODVISIBLE = 20
        `);
        console.table(res.recordset);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
