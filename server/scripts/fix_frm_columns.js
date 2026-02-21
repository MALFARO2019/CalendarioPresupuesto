require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sql = require('mssql');
const formsService = require('../services/formsService');
const { upsertFormRow } = require('../services/formsDynamicTable');

const cfg = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: 'KPIsRosti_WForms', options: { encrypt: true, trustServerCertificate: true } };

async function run() {
    const pool = await sql.connect(cfg);

    // Get all Frm_ tables
    const tables = await pool.request().query("SELECT name FROM sys.tables WHERE name LIKE 'Frm_%' ORDER BY name");
    console.log('=== Frm_ tables found ===');
    for (const t of tables.recordset) {
        const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM [${t.name}]`);
        console.log(` • ${t.name} — ${cnt.recordset[0].n} rows`);
    }

    // For each Frm_ table, alter all NVARCHAR(255) and NVARCHAR(500) columns to NVARCHAR(MAX)
    console.log('\n=== Fixing column types ===');
    for (const t of tables.recordset) {
        const cols = await pool.request().input('tbl', sql.NVarChar, t.name).query(`
            SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tbl
              AND DATA_TYPE = 'nvarchar'
              AND CHARACTER_MAXIMUM_LENGTH IS NOT NULL
              AND CHARACTER_MAXIMUM_LENGTH != -1
              AND COLUMN_NAME NOT IN ('ResponseID', 'RespondentEmail', 'RespondentName')
        `);
        for (const col of cols.recordset) {
            try {
                await pool.request().query(`ALTER TABLE [${t.name}] ALTER COLUMN [${col.COLUMN_NAME}] NVARCHAR(MAX) NULL`);
                console.log(`  ✅ ${t.name}.${col.COLUMN_NAME}: NVARCHAR(${col.CHARACTER_MAXIMUM_LENGTH}) → NVARCHAR(MAX)`);
            } catch (e) {
                console.warn(`  ⚠️ Could not alter ${col.COLUMN_NAME}: ${e.message.substring(0, 80)}`);
            }
        }
    }

    // Now re-sync the sources that had 0 rows (Frm_5, Frm_6)
    const sources = await pool.request().query("SELECT * FROM FormsSources WHERE Activo = 1 AND DriveId IS NOT NULL AND SourceID IN (5, 6) ORDER BY SourceID");
    for (const source of sources.recordset) {
        const tableName = source.TableName || `Frm_${source.SourceID}_${source.Alias.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50)}`;
        console.log(`\n🔄 Re-syncing ${source.Alias} → ${tableName}`);
        try {
            const responses = await formsService.getFormResponsesBySource(source);
            console.log(`  📊 ${responses.length} responses`);
            let ok = 0, fail = 0;
            for (const response of responses) {
                const answers = response._rawRow || response.answers || {};
                const email = response.responder?.email || answers['Correo electrónico'] || null;
                const name = response.responder?.displayName || answers['Nombre'] || null;
                const submitted = response.submittedDateTime ? new Date(response.submittedDateTime) : null;
                try { await upsertFormRow(tableName, response.id, email, name, submitted, answers); ok++; }
                catch (e) { fail++; if (fail <= 2) console.warn(`    ⚠️ ${e.message.substring(0, 100)}`); }
            }
            console.log(`  ✅ ${ok} OK, ${fail} failed`);
        } catch (e) { console.error(`  ❌ ${e.message.substring(0, 150)}`); }
    }

    // Final state
    console.log('\n=== Final state ===');
    for (const t of tables.recordset) {
        const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM [${t.name}]`);
        console.log(` • ${t.name} — ${cnt.recordset[0].n} rows`);
    }
    await pool.close();
}

run().then(() => { console.log('\n✅ Done'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
