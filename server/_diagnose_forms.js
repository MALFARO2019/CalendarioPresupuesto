require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_WForms',
    options: { trustServerCertificate: true, connectTimeout: 15000, requestTimeout: 15000 }
};

(async () => {
    try {
        const pool = await sql.connect(config);

        // Check FormsSources records
        const sources = await pool.request().query(`SELECT * FROM FormsSources ORDER BY SourceID`);
        console.log('=== FormsSources ===');
        for (const s of sources.recordset) {
            console.log(`  ID=${s.SourceID} | Alias="${s.Alias}" | Activo=${s.Activo} | TableName=${s.TableName || 'NULL'} | DriveId=${s.DriveId ? 'SET' : 'NULL'} | ItemId=${s.ItemId ? 'SET' : 'NULL'} | ExcelUrl=${s.ExcelUrl?.substring(0, 60)}...`);
        }

        // Check if any Frm_* tables exist
        const frmTables = await pool.request().query(`SELECT name FROM sys.tables WHERE name LIKE 'Frm_%' ORDER BY name`);
        console.log('\n=== Frm_* tables ===');
        for (const t of frmTables.recordset) {
            console.log(`  ${t.name}`);
        }

        // Check latest sync logs
        const logs = await pool.request().query(`SELECT TOP 5 * FROM FormsSyncLog ORDER BY FechaSync DESC`);
        console.log('\n=== Recent Sync Logs ===');
        for (const l of logs.recordset) {
            console.log(`  ${l.FechaSync?.toISOString()} | ${l.TipoSync} | ${l.Estado} | Proc=${l.RegistrosProcesados} New=${l.RegistrosNuevos} Upd=${l.RegistrosActualizados} | Err=${l.MensajeError || 'none'}`);
        }

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
