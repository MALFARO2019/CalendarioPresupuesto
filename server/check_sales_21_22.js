const { poolPromise } = require('./db');

async function check() {
    const pool = await poolPromise;

    // Check if BI_VENTAS_ROSTIPOLLOS has data for Feb 21-22
    console.log('\n--- BI_VENTAS_ROSTIPOLLOS: Feb 20-22, 2026 ---');
    const r1 = await pool.request().query(`
        SELECT CAST(FECHA AS DATE) as Fecha, 
               COUNT(*) as Registros,
               SUM(ISNULL(TRY_CONVERT(DECIMAL(19,6),[VENTAS NETAS]),0)) as Ventas,
               SUM(ISNULL(TRY_CONVERT(INT,Transacciones),0)) as Trans
        FROM BI_VENTAS_ROSTIPOLLOS WITH (NOLOCK)
        WHERE ANO = 2026 AND MES = 2 AND DAY(FECHA) IN (19,20,21,22,23)
        GROUP BY CAST(FECHA AS DATE) 
        ORDER BY Fecha
    `);
    console.table(r1.recordset);

    // Check what GETDATE() returns on this server
    console.log('\n--- Server Date ---');
    const r2 = await pool.request().query(`SELECT GETDATE() as ServerNow, CAST(GETDATE() AS DATE) as ServerToday`);
    console.log('Server now:', r2.recordset[0].ServerNow);
    console.log('Server today:', r2.recordset[0].ServerToday);

    // Check max date in BI_VENTAS for Feb
    console.log('\n--- Max date in BI_VENTAS for Feb 2026 ---');
    const r3 = await pool.request().query(`
        SELECT MAX(CAST(FECHA AS DATE)) as MaxFecha
        FROM BI_VENTAS_ROSTIPOLLOS WITH (NOLOCK)
        WHERE ANO = 2026 AND MES = 2
    `);
    console.log('Max fecha:', r3.recordset[0].MaxFecha);

    process.exit(0);
}

check().catch(e => { console.error(e.message); process.exit(1); });
