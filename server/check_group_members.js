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
            SELECT cab.DESCRIPCION as Grupo, lin.CODALMACEN, rLocal.Local
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB cab
            JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN lin ON lin.IDGRUPO = cab.IDGRUPO
            LEFT JOIN (
                SELECT DISTINCT CodAlmacen, Local 
                FROM RSM_ALCANCE_DIARIO
            ) rLocal ON rLocal.CodAlmacen COLLATE DATABASE_DEFAULT = lin.CODALMACEN COLLATE DATABASE_DEFAULT
            WHERE cab.IDGRUPO = 22
        `);
        console.table(res.recordset);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
