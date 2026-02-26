/**
 * Recalcular PRODUCCIÓN directo — RSM_ALCANCE_DIARIO (NombrePresupuesto='Producción')
 */
const sql = require('mssql');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 700000 // 700s
};

async function main() {
    console.log('🔄 Recalculando PRODUCCIÓN (RSM_ALCANCE_DIARIO)...\n');
    const pool = await sql.connect(config);

    const request = pool.request();
    request.timeout = 700000;
    request.input('NombrePresupuesto', sql.NVarChar(100), 'Producción');
    request.input('TablaDestino', sql.NVarChar(100), 'RSM_ALCANCE_DIARIO');
    request.input('Usuario', sql.NVarChar(200), 'FIX_AGO15');
    request.input('CrearVersion', sql.Bit, 1);

    const start = Date.now();
    try {
        const result = await request.execute('SP_CALCULAR_PRESUPUESTO');
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`✅ Completado en ${sec}s`);
        console.log('Versión:', result.recordset?.[0]);

        // Verificar agosto 14, 15, 21 en RSM_ALCANCE_DIARIO (Todos / Ventas / corporativo)
        const ver = await pool.request().query(`
            SELECT Dia, DAY(Fecha) as DiaN, SUM(Monto) as Presupuesto,
                   SUM(ISNULL(MontoAnteriorAjustado,0)) as AntAjust
            FROM RSM_ALCANCE_DIARIO
            WHERE NombrePresupuesto = 'Producción' AND Mes = 8
              AND Canal = 'Todos' AND Tipo = 'Ventas'
              AND LEFT(CodAlmacen,1) <> 'G'
              AND DAY(Fecha) IN (8,14,15,21,22)
            GROUP BY Dia, DAY(Fecha) ORDER BY DAY(Fecha)
        `);
        console.log('\n--- Agosto 2026: días clave (suma todos restaurantes) ---');
        console.table(ver.recordset);
    } catch (e) {
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        console.error(`❌ Error después de ${sec}s: ${e.message}`);
    } finally {
        await pool.close();
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
