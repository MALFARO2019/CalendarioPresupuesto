require('dotenv').config();
const sql = require('mssql');

const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'WindowsFormsData',
    options: { encrypt: true, trustServerCertificate: true }
};

async function run() {
    const pool = await sql.connect(cfg);

    // Add TableName column to FormsSources if not exists
    const col = await pool.request().query(`
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('FormsSources') AND name = 'TableName'
    `);
    if (col.recordset.length === 0) {
        await pool.request().query(`
            ALTER TABLE FormsSources ADD TableName NVARCHAR(128) NULL
        `);
        console.log('✅ Added TableName column to FormsSources');
    } else {
        console.log('ℹ️  TableName column already exists');
    }

    // Show current state
    const r = await pool.request().query('SELECT SourceID, Alias, Activo, TableName FROM FormsSources ORDER BY SourceID');
    console.log('\n=== FormsSources ===');
    r.recordset.forEach(x => console.log(`ID:${x.SourceID} Alias:${x.Alias} Table:${x.TableName || '(none)'} Activo:${x.Activo}`));

    await pool.close();
}

run().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
