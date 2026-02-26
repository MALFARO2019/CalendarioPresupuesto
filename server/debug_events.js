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

        console.log('--- Checking DIM_EVENTOS_FECHAS for IDEVENTO 26 ---');
        const res = await pool.request().query("SELECT * FROM DIM_EVENTOS_FECHAS WHERE IDEVENTO = 26");
        console.table(res.recordset);

        console.log('\n--- Checking if S22 is mapped to Group 22 in #GrupoMiembros logic (manual check) ---');
        const res2 = await pool.request().query(`
            SELECT cab.IDGRUPO, cab.DESCRIPCION, lin.CODALMACEN
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB cab
            JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN lin ON lin.IDGRUPO = cab.IDGRUPO
            WHERE cab.IDGRUPO = 22 AND lin.CODALMACEN COLLATE DATABASE_DEFAULT = 'S22'
        `);
        console.table(res2.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
