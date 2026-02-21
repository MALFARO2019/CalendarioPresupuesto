require('dotenv').config();
const sql = require('mssql');

const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_WForms',
    options: { encrypt: true, trustServerCertificate: true }
};

async function run() {
    const pool = await sql.connect(cfg);

    // 1. Add hash column (persisted computed column for indexing long URLs)
    try {
        await pool.request().query(`
            ALTER TABLE FormsSources 
            ADD ExcelUrlHash AS CONVERT(NVARCHAR(64), HASHBYTES('SHA2_256', ExcelUrl), 2) PERSISTED
        `);
        console.log('✅ Added ExcelUrlHash computed column');
    } catch (e) {
        if (e.message.includes('already')) {
            console.log('ℹ️  ExcelUrlHash column already exists');
        } else {
            console.warn('⚠️  Hash column:', e.message.substring(0, 100));
        }
    }

    // 2. Add unique index on the hash
    try {
        await pool.request().query(`
            CREATE UNIQUE INDEX UQ_FormsSources_ExcelUrl ON FormsSources(ExcelUrlHash)
        `);
        console.log('✅ Created UNIQUE index on ExcelUrlHash');
    } catch (e) {
        if (e.message.includes('already') || e.message.includes('duplicate key')) {
            console.log('ℹ️  UNIQUE index already exists');
        } else {
            console.warn('⚠️  Index error:', e.message.substring(0, 100));
        }
    }

    // 3. Show current state
    const r = await pool.request().query('SELECT SourceID, Alias, Activo FROM FormsSources ORDER BY SourceID');
    console.log('\n=== FormsSources ===');
    console.table(r.recordset);

    await pool.close();
}

run().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
