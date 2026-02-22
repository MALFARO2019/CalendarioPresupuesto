/**
 * Diagnose spike - focused queries (fixed SQL Server syntax)
 */
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

        // Get CodAlmacen for V. Pozos
        const codResult = await pool.request().query(`
            SELECT TOP 1 CodAlmacen FROM RSM_ALCANCE_DIARIO WHERE [Local] LIKE '%Pozos%' AND Año = 2026
        `);
        const cod = codResult.recordset[0].CodAlmacen;
        console.log(`CodAlmacen for V. Pozos: ${cod}`);

        // 1. ALL CHANNELS for Feb 21
        console.log('\n=== ALL CHANNELS for Feb 21 ===');
        const ch = await pool.request().query(`
            SELECT Canal, Tipo, 
                   CAST(Monto AS DECIMAL(19,2)) as Monto, 
                   CAST(MontoAnterior AS DECIMAL(19,2)) as MontoAnt,
                   CAST(MontoAnteriorAjustado AS DECIMAL(19,2)) as MontoAntAj,
                   CAST(FechaAnterior AS DATE) as FechaAnt,
                   CAST(FechaAnteriorAjustada AS DATE) as FechaAntAj,
                   Participacion
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND Mes = 2 AND CodAlmacen = '${cod}'
              AND CAST(Fecha AS DATE) = '2026-02-21'
            ORDER BY Canal, Tipo
        `);
        ch.recordset.forEach(r => {
            console.log(`  ${r.Canal?.padEnd(12)} ${r.Tipo?.padEnd(15)} Monto:${String(r.Monto).padStart(12)} AntNat:${String(r.MontoAnt || 0).padStart(12)} AntAj:${String(r.MontoAntAj || 0).padStart(12)} FechaAnt:${r.FechaAnt?.toISOString().split('T')[0]} FechaAntAj:${r.FechaAntAj?.toISOString().split('T')[0]} Part:${r.Participacion?.toFixed(8)}`);
        });

        // 2. Compare per-channel Monto for Feb 20 vs 21 (Ventas only)
        console.log('\n=== Per-Channel Ventas: Feb 20 vs 21 ===');
        const cmp = await pool.request().query(`
            SELECT DAY(Fecha) as Dia, Canal, 
                   CAST(Monto AS DECIMAL(19,2)) as Monto,
                   CAST(MontoAnteriorAjustado AS DECIMAL(19,2)) as MontoAntAj,
                   CAST(Participacion AS DECIMAL(18,8)) as Part
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND Mes = 2 AND CodAlmacen = '${cod}'
              AND CAST(Fecha AS DATE) IN ('2026-02-20', '2026-02-21')
              AND Tipo = 'Ventas'
            ORDER BY Canal, Fecha
        `);
        cmp.recordset.forEach(r => {
            console.log(`  Dia:${r.Dia} ${r.Canal?.padEnd(12)} Monto:${String(r.Monto).padStart(12)} AntAj:${String(r.MontoAntAj || 0).padStart(12)} Part:${r.Part}`);
        });

        // 3. Monthly sum by channel
        console.log('\n=== Monthly Sum (Feb) by Canal Ventas ===');
        const msum = await pool.request().query(`
            SELECT Canal, 
                   SUM(CAST(Monto AS DECIMAL(19,2))) as SumMes,
                   COUNT(*) as Days
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 AND Mes = 2 AND CodAlmacen = '${cod}' AND Tipo = 'Ventas'
            GROUP BY Canal
            ORDER BY Canal
        `);
        msum.recordset.forEach(r => {
            console.log(`  ${r.Canal?.padEnd(12)} SumMes:${String(r.SumMes).padStart(15)} Days:${r.Days}`);
        });

        // 4. Check Consolidado for the same store
        console.log('\n=== Consolidado_2026 for ${cod} Feb ===');
        const cons = await pool.request().query(`
            SELECT MES, TIPO, 
                   CAST(ISNULL(SALON,0) AS DECIMAL(19,2)) as SALON,
                   CAST(ISNULL(LLEVAR,0) AS DECIMAL(19,2)) as LLEVAR,
                   CAST(ISNULL(AUTO,0) AS DECIMAL(19,2)) as AUTO,
                   CAST(ISNULL(EXPRESS,0) AS DECIMAL(19,2)) as EXPRESS,
                   CAST(ISNULL(ECOMMERCE,0) AS DECIMAL(19,2)) as ECOMMERCE,
                   CAST(ISNULL(UBEREATS,0) AS DECIMAL(19,2)) as UBEREATS,
                   CAST(ISNULL(SALON,0)+ISNULL(LLEVAR,0)+ISNULL(AUTO,0)+ISNULL(EXPRESS,0)+ISNULL(ECOMMERCE,0)+ISNULL(UBEREATS,0) AS DECIMAL(19,2)) as TOTAL
            FROM Consolidado_2026
            WHERE CODALMACEN = '${cod}' AND MES = 2
        `);
        cons.recordset.forEach(r => {
            console.log(`  Tipo:${r.TIPO?.trim()?.padEnd(16)} Total:${String(r.TOTAL).padStart(15)} | Salon:${r.SALON} Llevar:${r.LLEVAR} Auto:${r.AUTO} Express:${r.EXPRESS} ECom:${r.ECOMMERCE} Uber:${r.UBEREATS}`);
        });

        // 5. BI_VENTAS for 2025-02-14 and 2025-02-15 for this store, to see impact of event mapping
        console.log('\n=== BI_VENTAS_ROSTIPOLLOS for Feb 13-15 2025 (the event dates) ===');
        const bv = await pool.request().query(`
            SELECT CAST(FECHA AS DATE) as Fecha, DATENAME(WEEKDAY, FECHA) as Dia,
                   SUM(CAST([VENTAS NETAS] AS DECIMAL(19,2))) as VentasNetas,
                   SUM(Transacciones) as Trans
            FROM BI_VENTAS_ROSTIPOLLOS
            WHERE ANO = 2025 AND CODALMACEN = '${cod}'
              AND CAST(FECHA AS DATE) BETWEEN '2025-02-06' AND '2025-02-16'
            GROUP BY CAST(FECHA AS DATE), DATENAME(WEEKDAY, FECHA)
            ORDER BY CAST(FECHA AS DATE)
        `);
        bv.recordset.forEach(r => {
            console.log(`  ${r.Fecha.toISOString().split('T')[0]} (${r.Dia?.padEnd(10)}) VentasNetas:${String(r.VentasNetas).padStart(12)} Trans:${r.Trans}`);
        });

        // 6. Check how many stores show the spike
        console.log('\n=== Stores with spike on Feb 21 (Monto > 2*avg daily) ===');
        const spike = await pool.request().query(`
            ;WITH AvgDay AS (
                SELECT CodAlmacen, [Local],
                       AVG(Monto) as AvgMonto,
                       MAX(CASE WHEN DAY(Fecha) = 21 THEN Monto END) as Monto21
                FROM RSM_ALCANCE_DIARIO
                WHERE Año = 2026 AND Mes = 2 AND Canal = 'Todos' AND Tipo = 'Ventas'
                  AND LEFT(CodAlmacen, 1) != 'G'
                GROUP BY CodAlmacen, [Local]
            )
            SELECT CodAlmacen, [Local],
                   CAST(AvgMonto AS DECIMAL(19,0)) as AvgDaily,
                   CAST(Monto21 AS DECIMAL(19,0)) as MontoDia21,
                   CAST(Monto21/NULLIF(AvgMonto,0) AS DECIMAL(8,2)) as Ratio
            FROM AvgDay
            WHERE Monto21 > AvgMonto * 2
            ORDER BY Ratio DESC
        `);
        console.log(`${spike.recordset.length} stores with spikes:`);
        spike.recordset.forEach(r => {
            console.log(`  ${r.CodAlmacen} ${r.Local?.padEnd(30)} Avg:${String(r.AvgDaily).padStart(10)} Dia21:${String(r.MontoDia21).padStart(10)} Ratio:${r.Ratio}x`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
