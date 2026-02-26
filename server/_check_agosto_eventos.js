/**
 * Check and insert August 2025/2026 events in DIM_EVENTOS_FECHAS
 * Fix: budget weights for 14/08/2026 and 21/08/2026 must align with Año Anterior Ajustado
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
    const pool = await sql.connect(config);

    // 1. Ver todos los eventos actuales
    console.log('\n=== DIM_EVENTOS ===');
    const ev = await pool.request().query(
        'SELECT IDEVENTO, EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO, ISNULL(ORDEN,9999) AS ORDEN FROM DIM_EVENTOS ORDER BY ISNULL(ORDEN,9999), IDEVENTO'
    );
    ev.recordset.forEach(r => console.log(JSON.stringify(r)));

    // 2. Ver fechas de agosto ya registradas
    console.log('\n=== DIM_EVENTOS_FECHAS (agosto 2025 y 2026) ===');
    const fe = await pool.request().query(`
        SELECT ef.IDEVENTO, e.EVENTO,
               CONVERT(VARCHAR(10),ef.FECHA,23) as FECHA,
               CONVERT(VARCHAR(10),ef.FECHA_EFECTIVA,23) as FECHA_EFECTIVA,
               ef.Canal, ef.GrupoAlmacen
        FROM DIM_EVENTOS_FECHAS ef
        JOIN DIM_EVENTOS e ON e.IDEVENTO = ef.IDEVENTO
        WHERE (YEAR(ef.FECHA_EFECTIVA) IN (2025,2026) AND MONTH(ef.FECHA_EFECTIVA) = 8)
           OR (ef.FECHA IS NOT NULL AND YEAR(ef.FECHA) IN (2025,2026) AND MONTH(ef.FECHA) = 8)
        ORDER BY ef.IDEVENTO, ef.FECHA_EFECTIVA, ef.FECHA
    `);
    if (fe.recordset.length === 0) console.log('  (ningún evento de agosto)');
    fe.recordset.forEach(r => console.log(JSON.stringify(r)));

    // 3. Verificar ventas reales de esas fechas clave para tener contexto
    console.log('\n=== Ventas agosto 2025: días clave (todos los restaurantes, canal Todos) ===');
    const vtas = await pool.request().query(`
        SELECT CAST(FECHA AS DATE) as Fecha,
               DATENAME(WEEKDAY, FECHA) as DiaSemana,
               COUNT(DISTINCT CODALMACEN) as Locales,
               SUM(ISNULL(TRY_CONVERT(DECIMAL(19,2),[VENTAS NETAS]),0)) as TotalVentas
        FROM BI_VENTAS_ROSTIPOLLOS WITH (NOLOCK)
        WHERE ANO = 2025 AND MES = 8 AND DAY(FECHA) IN (8,14,15,21,22)
        GROUP BY CAST(FECHA AS DATE), DATENAME(WEEKDAY, FECHA)
        ORDER BY CAST(FECHA AS DATE)
    `);
    vtas.recordset.forEach(r => console.log(
        `  ${r.Fecha.toISOString().split('T')[0]} (${r.DiaSemana}) | Locales:${r.Locales} | Ventas:${Math.round(r.TotalVentas).toLocaleString()}`
    ));

    await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
