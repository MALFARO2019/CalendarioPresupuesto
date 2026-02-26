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

        console.log('\n=== Verification for Avenida Escazu (S22) March 2026 ===');
        const res = await pool.request().query(`
            SELECT Fecha, Monto, MontoAnteriorAjustado, Tipo
            FROM RSM_ALCANCE_DIARIO
            WHERE CodAlmacen = 'S22' AND Año = 2026 AND Mes = 3
              AND Canal = 'Todos' AND Tipo = 'Ventas'
              AND (Dia = 7 OR Dia = 14)
            ORDER BY Fecha
        `);
        console.table(res.recordset.map(r => ({
            Fecha: r.Fecha.toISOString().split('T')[0],
            Ppto: r.Monto.toFixed(0),
            AntAj: r.MontoAnteriorAjustado.toFixed(0)
        })));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
