const { poolPromise, sql } = require('./db');

async function recalcular() {
    console.log('\n🔄 Ejecutando SP_CALCULAR_PRESUPUESTO para Producción...\n');
    const pool = await poolPromise;

    // Get the active config 
    const configResult = await pool.request().query(`
        SELECT NombrePresupuesto, TablaDestino, AnoModelo 
        FROM MODELO_PRESUPUESTO_CONFIG 
        WHERE Activo = 1 ORDER BY Id
    `);
    console.log('Config activa:', configResult.recordset[0]);

    const config = configResult.recordset[0];

    const request = pool.request();
    request.timeout = 600000; // 10 minutes
    request.input('NombrePresupuesto', sql.NVarChar(100), config.NombrePresupuesto);
    request.input('TablaDestino', sql.NVarChar(100), config.TablaDestino);
    request.input('Usuario', sql.NVarChar(200), 'CLI_Manual');
    request.input('CrearVersion', sql.Bit, 1);

    console.log('⏳ Ejecutando... (puede tomar 3-5 minutos)');
    const startTime = Date.now();

    const result = await request.execute('SP_CALCULAR_PRESUPUESTO');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Completado en ${elapsed}s`);
    console.log('Resultado:', result.recordset?.[0]);

    // Verify Feb 21-22 now have data
    console.log('\n--- Verificando Feb 21-22 después del recálculo ---');
    const verify = await pool.request().query(`
        SELECT Dia, 
               SUM(CASE WHEN MontoReal > 0 THEN 1 ELSE 0 END) as ConDatos,
               SUM(MontoReal) as TotalReal
        FROM ${config.TablaDestino}
        WHERE NombrePresupuesto = '${config.NombrePresupuesto}'
          AND Mes = 2 AND Canal = 'Todos' AND Tipo = 'Ventas'
          AND [Local] = 'Corporativo'
          AND Dia IN ('19','20','21','22','23')
        GROUP BY Dia ORDER BY Dia
    `);
    console.table(verify.recordset);

    process.exit(0);
}

recalcular().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
