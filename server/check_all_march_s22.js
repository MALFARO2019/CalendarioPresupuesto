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
        const res = await pool.request().query("SELECT CAST(Fecha AS DATE) as Fecha, Monto as Ppto, MontoAnteriorAjustado as AntAj FROM RSM_ALCANCE_DIARIO r JOIN MODELO_PRESUPUESTO_CONFIG c ON c.NombrePresupuesto = r.NombrePresupuesto WHERE c.Activo = 1 AND r.CodAlmacen = 'S22' AND r.Mes = 3 AND r.Canal = 'Todos' AND r.Tipo = 'Ventas' ORDER BY Fecha");
        console.table(res.recordset);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
