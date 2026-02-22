const sql = require('mssql');
require('dotenv').config();

async function main() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 10000
    });

    console.log('=== Presupuesto Config ===');
    const r0 = await pool.request().query(
        `SELECT NombrePresupuesto, AnoModelo, TablaDestino, Activo FROM MODELO_PRESUPUESTO_CONFIG`
    );
    console.log(JSON.stringify(r0.recordset, null, 2));

    console.log('\n=== Consolidado Mensual S01 (top 5) ===');
    const r1 = await pool.request().query(
        `SELECT TOP 5 ANO, MES, TIPO, CODALMACEN, SALON, LLEVAR, AUTO, TOTAL 
         FROM KpisRosti_Consolidado_Mensual 
         WHERE CODALMACEN = 'S01' AND ANO = 2026
         ORDER BY MES`
    );
    console.log(JSON.stringify(r1.recordset, null, 2));

    console.log('\n=== Consolidado Mensual S01 TIPO values ===');
    const r1b = await pool.request().query(
        `SELECT DISTINCT TIPO FROM KpisRosti_Consolidado_Mensual WHERE CODALMACEN = 'S01' AND ANO = 2026`
    );
    console.log(JSON.stringify(r1b.recordset, null, 2));

    // Get the tablaDestino
    const tablaDestino = r0.recordset[0]?.TablaDestino || 'RSM_ALCANCE_DIARIO';
    const nombrePresupuesto = r0.recordset[0]?.NombrePresupuesto;

    console.log(`\n=== Daily data from ${tablaDestino} S01, Enero (sample) ===`);
    const r2 = await pool.request().query(
        `SELECT TOP 3 CodAlmacen, Mes, Canal, Tipo, SUM(Monto) as SumMonto
         FROM [${tablaDestino}]
         WHERE CodAlmacen = 'S01' AND Mes = 1 AND NombrePresupuesto = '${nombrePresupuesto}'
         GROUP BY CodAlmacen, Mes, Canal, Tipo
         ORDER BY Canal, Tipo`
    );
    console.log(JSON.stringify(r2.recordset, null, 2));

    console.log('\n=== TIPO values in daily table ===');
    const r3 = await pool.request().query(
        `SELECT DISTINCT Tipo FROM [${tablaDestino}] WHERE CodAlmacen = 'S01' AND NombrePresupuesto = '${nombrePresupuesto}'`
    );
    console.log(JSON.stringify(r3.recordset, null, 2));

    console.log('\n=== JOIN test: S01, Salon, Mes 1 ===');
    const r4 = await pool.request().query(
        `SELECT 
            d.CodAlmacen, d.Canal, d.Tipo, d.Mes,
            SUM(d.Monto) AS sumaDiaria,
            MAX(c.SALON) AS valorConsolidado
         FROM [${tablaDestino}] d
         LEFT JOIN KpisRosti_Consolidado_Mensual c
            ON d.CodAlmacen = c.CodAlmacen
            AND d.Tipo = c.Tipo
            AND d.Mes = c.Mes
            AND c.Ano = 2026
         WHERE d.NombrePresupuesto = '${nombrePresupuesto}'
           AND YEAR(d.Fecha) = 2026
           AND d.Canal = 'Salón'
           AND d.CodAlmacen = 'S01'
           AND d.Mes = 1
         GROUP BY d.CodAlmacen, d.Canal, d.Tipo, d.Mes`
    );
    console.log(JSON.stringify(r4.recordset, null, 2));

    await pool.close();
    process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
