const { poolPromise, sql } = require('./db');

async function recalcularProduccion() {
    console.log('\n🔄 Ejecutando SP_CALCULAR_PRESUPUESTO para PRODUCCIÓN...\n');
    const pool = await poolPromise;

    // Get the production config specifically
    const configResult = await pool.request().query(`
        SELECT Id, NombrePresupuesto, TablaDestino, AnoModelo 
        FROM MODELO_PRESUPUESTO_CONFIG 
        WHERE TablaDestino = 'RSM_ALCANCE_DIARIO'
    `);

    const cfg = configResult.recordset[0];
    console.log('Config:', cfg);

    const request = pool.request();
    request.timeout = 600000; // 10 min
    request.input('NombrePresupuesto', sql.NVarChar(100), cfg.NombrePresupuesto);
    request.input('TablaDestino', sql.NVarChar(100), cfg.TablaDestino);
    request.input('Usuario', sql.NVarChar(200), 'CLI_Manual');
    request.input('CrearVersion', sql.Bit, 1);

    console.log('⏳ Ejecutando... (puede tomar 3-5 minutos)');
    const startTime = Date.now();

    try {
        const result = await request.execute('SP_CALCULAR_PRESUPUESTO');
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Completado en ${elapsed}s`);
        console.log('Resultado:', result.recordset?.[0]);
    } catch (e) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n❌ Error después de ${elapsed}s:`, e.message);
        // Still try to verify current state
    }

    // Verify
    console.log('\n--- Verificando Feb 19-23 ---');
    const verify = await pool.request().query(`
        SELECT Dia, 
               SUM(CASE WHEN MontoReal > 0 THEN 1 ELSE 0 END) as ConDatos,
               SUM(Monto) as Presupuesto,
               SUM(MontoReal) as Real
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = '${cfg.NombrePresupuesto}'
          AND Mes = 2 AND Canal = 'Todos' AND Tipo = 'Ventas'
          AND [Local] = 'Corporativo'
          AND Dia IN ('19','20','21','22','23')
        GROUP BY Dia ORDER BY Dia
    `);
    console.table(verify.recordset);

    process.exit(0);
}

recalcularProduccion().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
