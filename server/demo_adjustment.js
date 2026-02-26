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

        // 1. Insert Adjustment Event for March 7 & 14, 2026 (S22 via Group 22)
        // IDEVENTO 26 = Ajuste AG3
        // We use March 3 and March 10 (Tuesdays) as reference to reduce the Saturday peaks.
        console.log('Inserting adjustment events AG3 with reference dates for 2026-03-07 and 2026-03-14...');
        await pool.request().query(`
            DELETE FROM DIM_EVENTOS_FECHAS WHERE FECHA IN ('2026-03-07', '2026-03-14') AND IDEVENTO = 26 AND GrupoAlmacen = 22;
            
            INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen, USUARIO_MODIFICACION, FECHA_MODIFICACION)
            VALUES 
            (26, '2026-03-07', '2026-03-03', NULL, 22, 'Antigravity_Adjustment', GETDATE()),
            (26, '2026-03-14', '2026-03-10', NULL, 22, 'Antigravity_Adjustment', GETDATE());
        `);

        // 2. Run recalculation
        console.log('Running recalculation...');
        const configResult = await pool.request().query(`
            SELECT NombrePresupuesto, TablaDestino FROM MODELO_PRESUPUESTO_CONFIG WHERE Activo = 1
        `);
        const conf = configResult.recordset[0];

        const request = pool.request();
        request.timeout = 600000;
        request.input('NombrePresupuesto', sql.NVarChar(100), conf.NombrePresupuesto);
        request.input('TablaDestino', sql.NVarChar(100), conf.TablaDestino);
        request.input('Usuario', sql.NVarChar(200), 'Antigravity_Demo');
        request.input('CrearVersion', sql.Bit, 0); // No version for demo to be faster

        await request.execute('SP_CALCULAR_PRESUPUESTO');
        console.log('Recalculation finished.');

        // 3. Verify specifically March 14 for S22
        console.log('\n=== Verification for Avenida Escazu (S22) March 14 ===');
        const verify = await pool.request().query(`
            SELECT Fecha, Monto, MontoAnteriorAjustado
            FROM RSM_ALCANCE_DIARIO
            WHERE CodAlmacen = 'S22' AND Fecha = '2026-03-14' AND Canal = 'Todos' AND Tipo = 'Ventas'
        `);
        console.table(verify.recordset);

        console.log('\nNote: If Monto is now significantly different from the previously recorded peak (approx 1.9M), the adjustment worked.');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
