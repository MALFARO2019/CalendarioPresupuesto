/**
 * Extract SP_GENERAR_PRESUPUESTO_DIARIO definition and DIM_EVENTOS data
 * from SQL Server for analysis
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    requestTimeout: 30000
};

async function main() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log('✅ Connected to SQL Server');

        // 1. Extract SP_GENERAR_PRESUPUESTO_DIARIO definition
        console.log('\n--- Extracting SP_GENERAR_PRESUPUESTO_DIARIO ---');
        const spResult = await pool.request().query(`
            SELECT OBJECT_DEFINITION(OBJECT_ID('SP_GENERAR_PRESUPUESTO_DIARIO')) AS SPDefinition
        `);

        if (spResult.recordset[0]?.SPDefinition) {
            const spDef = spResult.recordset[0].SPDefinition;
            fs.writeFileSync(path.join(__dirname, '..', 'Presupuesto', 'SP_GENERAR_PRESUPUESTO_DIARIO.sql'), spDef, 'utf8');
            console.log(`SP extracted: ${spDef.length} characters`);
            console.log('Saved to Presupuesto/SP_GENERAR_PRESUPUESTO_DIARIO.sql');
        } else {
            console.log('⚠️ SP_GENERAR_PRESUPUESTO_DIARIO not found');
        }

        // 2. List all SPs related to presupuesto
        console.log('\n--- All SPs related to presupuesto ---');
        const spsResult = await pool.request().query(`
            SELECT name, create_date, modify_date
            FROM sys.procedures 
            WHERE name LIKE '%PRESUPUESTO%' OR name LIKE '%ALCANCE%' OR name LIKE '%GENERAR%'
            ORDER BY name
        `);
        console.log('SPs found:', spsResult.recordset.length);
        spsResult.recordset.forEach(sp => {
            console.log(`  - ${sp.name} (created: ${sp.create_date}, modified: ${sp.modify_date})`);
        });

        // 3. Extract DIM_EVENTOS data
        console.log('\n--- DIM_EVENTOS ---');
        const eventosResult = await pool.request().query(`
            SELECT * FROM DIM_EVENTOS ORDER BY IDEVENTO
        `);
        console.log('Events:', eventosResult.recordset.length);
        eventosResult.recordset.forEach(e => {
            console.log(`  ID:${e.IDEVENTO} | ${e.EVENTO} | Feriado:${e.ESFERIADO} | UsarEnPresup:${e.USARENPRESUPUESTO} | Interno:${e.ESINTERNO}`);
        });

        // 4. Extract DIM_EVENTOS_FECHAS for Feb 2026
        console.log('\n--- DIM_EVENTOS_FECHAS (Feb 2026 ± 1 month) ---');
        const fechasResult = await pool.request().query(`
            SELECT ef.*, e.EVENTO
            FROM DIM_EVENTOS_FECHAS ef
            INNER JOIN DIM_EVENTOS e ON e.IDEVENTO = ef.IDEVENTO
            WHERE ef.FECHA >= '2026-01-01' AND ef.FECHA <= '2026-03-31'
            ORDER BY ef.FECHA
        `);
        console.log('Event dates found:', fechasResult.recordset.length);
        fechasResult.recordset.forEach(f => {
            console.log(`  Fecha:${f.FECHA?.toISOString().split('T')[0]} | Efectiva:${f.FECHA_EFECTIVA?.toISOString().split('T')[0]} | Evento:${f.EVENTO} | Canal:${(f.Canal || '').trim()} | Grupo:${f.GrupoAlmacen || 'null'}`);
        });

        // 5. Check for duplicate adjusted dates in RSM_ALCANCE_DIARIO for Feb 2026
        console.log('\n--- Checking duplicate FechaAnteriorAjustada in Feb 2026 ---');
        const dupsResult = await pool.request().query(`
            SELECT FechaAnteriorAjustada, CodAlmacen, Canal, Tipo, COUNT(*) as cnt
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND Mes = 2 AND Canal = 'Todos' AND Tipo = 'Ventas'
            GROUP BY FechaAnteriorAjustada, CodAlmacen, Canal, Tipo
            HAVING COUNT(*) > 1
            ORDER BY CodAlmacen, FechaAnteriorAjustada
        `);
        console.log('Duplicate adjusted dates:', dupsResult.recordset.length);
        dupsResult.recordset.forEach(d => {
            console.log(`  AjDate:${d.FechaAnteriorAjustada?.toISOString().split('T')[0]} | Local:${d.CodAlmacen} | Count:${d.cnt}`);
        });

        // 6. Show data around day 21 for V. Pozos (or first store with spikes)
        console.log('\n--- Data around day 21 Feb 2026 for sample store ---');
        const spikeResult = await pool.request().query(`
            SELECT TOP 40 
                Fecha, 
                CAST(Fecha AS DATE) as FechaDate,
                [Local], CodAlmacen, Canal, Tipo,
                Monto, MontoReal, MontoAnterior, MontoAnteriorAjustado,
                CAST(FechaAnterior AS DATE) as FechaAnt,
                CAST(FechaAnteriorAjustada AS DATE) as FechaAntAj
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND Mes = 2 AND Canal = 'Todos' AND Tipo = 'Ventas'
              AND CodAlmacen IN (SELECT TOP 1 CodAlmacen FROM RSM_ALCANCE_DIARIO 
                                  WHERE Año = 2026 AND Mes = 2 AND [Local] LIKE '%Pozos%' AND Canal = 'Todos' AND Tipo = 'Ventas')
            ORDER BY Fecha
        `);
        console.log(`Records for ${spikeResult.recordset[0]?.Local || 'N/A'}:`);
        spikeResult.recordset.forEach(r => {
            const spike = r.Monto > 0 && r.MontoAnteriorAjustado > 0 && (r.MontoAnteriorAjustado / r.Monto > 2 || r.MontoAnteriorAjustado / r.Monto < 0.5) ? ' ⚠️ SPIKE' : '';
            console.log(`  ${r.FechaDate.toISOString().split('T')[0]} | Presup:${Math.round(r.Monto)} | Real:${Math.round(r.MontoReal || 0)} | AntNat:${Math.round(r.MontoAnterior || 0)} | AntAj:${Math.round(r.MontoAnteriorAjustado || 0)} | FechaAnt:${r.FechaAnt?.toISOString().split('T')[0]} | FechaAntAj:${r.FechaAntAj?.toISOString().split('T')[0]}${spike}`);
        });

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
