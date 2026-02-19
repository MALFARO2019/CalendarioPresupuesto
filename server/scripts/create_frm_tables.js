require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sql = require('mssql');
const { ensureFormTable, upsertFormRow } = require('../services/formsDynamicTable');
const formsService = require('../services/formsService');

const cfg = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: 'WindowsFormsData', options: { encrypt: true, trustServerCertificate: true } };

async function run() {
    const pool = await sql.connect(cfg);

    // 1. Ensure TableName column exists
    const col = await pool.request().query("SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FormsSources') AND name = 'TableName'");
    if (col.recordset.length === 0) {
        await pool.request().query('ALTER TABLE FormsSources ADD TableName NVARCHAR(128) NULL');
        console.log('✅ Added TableName column');
    } else {
        console.log('ℹ️  TableName column already exists');
    }

    // 2. Get all active sources with DriveId
    const sources = await pool.request().query('SELECT * FROM FormsSources WHERE Activo = 1 AND DriveId IS NOT NULL ORDER BY SourceID');
    console.log(`\n📋 Found ${sources.recordset.length} active sources with DriveId`);

    for (const source of sources.recordset) {
        console.log(`\n🔄 Processing: ${source.Alias} (ID: ${source.SourceID})`);
        try {
            // Get responses from Excel
            const responses = await formsService.getFormResponsesBySource(source);
            console.log(`  📊 ${responses.length} responses found`);

            if (responses.length === 0) {
                console.log('  ⚠️ No responses, skipping table creation');
                continue;
            }

            // Detect columns
            const allKeys = new Set();
            responses.forEach(r => Object.keys(r._rawRow || r.answers || {}).forEach(k => allKeys.add(k)));
            const columns = Array.from(allKeys).map(key => ({
                name: key,
                sampleValues: responses.slice(0, 20).map(r => (r._rawRow || r.answers || {})[key]).filter(v => v !== null && v !== undefined && v !== '')
            }));
            console.log(`  🔍 Detected ${columns.length} columns: ${columns.slice(0, 5).map(c => c.name).join(', ')}...`);

            // Create/update Frm_ table
            const tableName = await ensureFormTable(source.SourceID, source.Alias, columns);
            console.log(`  ✅ Table ready: ${tableName}`);

            // Update TableName in FormsSources
            await pool.request().input('id', sql.Int, source.SourceID).input('tbl', sql.NVarChar, tableName)
                .query('UPDATE FormsSources SET TableName = @tbl WHERE SourceID = @id');

            // Upsert rows
            let inserted = 0;
            for (const response of responses) {
                const answers = response._rawRow || response.answers || {};
                const email = response.responder?.email || answers['Correo electrónico'] || null;
                const name = response.responder?.displayName || answers['Nombre'] || null;
                const submitted = response.submittedDateTime ? new Date(response.submittedDateTime) : null;
                try {
                    await upsertFormRow(tableName, response.id, email, name, submitted, answers);
                    inserted++;
                } catch (e) { console.warn(`    ⚠️ Row error: ${e.message.substring(0, 80)}`); }
            }
            console.log(`  ✅ Upserted ${inserted}/${responses.length} rows`);

        } catch (e) {
            console.error(`  ❌ Error: ${e.message.substring(0, 150)}`);
        }
    }

    // 3. Show final state
    const tables = await pool.request().query("SELECT name FROM sys.tables WHERE name LIKE 'Frm_%' ORDER BY name");
    console.log('\n=== Frm_ tables created ===');
    tables.recordset.forEach(t => console.log(' •', t.name));

    await pool.close();
}

run().then(() => { console.log('\n✅ Done'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
