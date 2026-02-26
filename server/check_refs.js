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

        console.log('\n=== Reference Mappings for Avenida Escazu (S22) ===');
        const refs = await pool.request().query(`
            SELECT * FROM DIM_MAPEO_PRESUPUESTO_LOCALES 
            WHERE CodAlmacenNuevo = 'S22' AND Activo = 1
        `);
        console.table(refs.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
