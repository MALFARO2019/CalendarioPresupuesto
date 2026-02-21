require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sql = require('mssql');
const { ensureFormTable, upsertFormRow } = require('../services/formsDynamicTable');
const formsService = require('../services/formsService');

const cfg = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: 'KPIsRosti_WForms', options: { encrypt: true, trustServerCertificate: true } };

// Drop and recreate tables that had truncation errors (Frm_5, Frm_6, Frm_7)
const SOURCE_IDS_TO_RECREATE = [5, 6, 7]; // Frm_4 was OK

async function run() {
    const pool = await sql.connect(cfg);

    // Drop problematic tables
    for (const id of SOURCE_IDS_TO_RECREATE) {
        const tbls = await pool.request().query(`SELECT name FROM sys.tables WHERE name LIKE 'Frm_${id}_%'`);
        for (const t of tbls.recordset) {
            await pool.request().query(`DROP TABLE [${t.name}]`);
            console.log(`🗑️ Dropped ${t.name}`);
        }
        // Clear TableName in FormsSources
        await pool.request().input('id', sql.Int, id).query('UPDATE FormsSources SET TableName = NULL WHERE SourceID = @id');
    }

    // Get sources to recreate
    const sources = await pool.request().query(`SELECT * FROM FormsSources WHERE Activo = 1 AND DriveId IS NOT NULL AND SourceID IN (${SOURCE_IDS_TO_RECREATE.join(',')}) ORDER BY SourceID`);
    console.log(`\n📋 Recreating ${sources.recordset.length} tables`);

    for (const source of sources.recordset) {
        console.log(`\n🔄 Processing: ${source.Alias} (ID: ${source.SourceID})`);
        try {
            const responses = await formsService.getFormResponsesBySource(source);
            console.log(`  📊 ${responses.length} responses`);
            if (responses.length === 0) { console.log('  ⚠️ No responses'); continue; }

            const allKeys = new Set();
            responses.forEach(r => Object.keys(r._rawRow || r.answers || {}).forEach(k => allKeys.add(k)));
            const columns = Array.from(allKeys).map(key => ({
                name: key,
                sampleValues: responses.slice(0, 20).map(r => (r._rawRow || r.answers || {})[key]).filter(v => v !== null && v !== undefined && v !== '')
            }));

            const tableName = await ensureFormTable(source.SourceID, source.Alias, columns);
            console.log(`  ✅ Table: ${tableName}`);
            await pool.request().input('id', sql.Int, source.SourceID).input('tbl', sql.NVarChar, tableName)
                .query('UPDATE FormsSources SET TableName = @tbl WHERE SourceID = @id');

            let ok = 0, fail = 0;
            for (const response of responses) {
                const answers = response._rawRow || response.answers || {};
                const email = response.responder?.email || answers['Correo electrónico'] || null;
                const name = response.responder?.displayName || answers['Nombre'] || null;
                const submitted = response.submittedDateTime ? new Date(response.submittedDateTime) : null;
                try { await upsertFormRow(tableName, response.id, email, name, submitted, answers); ok++; }
                catch (e) { fail++; if (fail <= 3) console.warn(`    ⚠️ ${e.message.substring(0, 100)}`); }
            }
            console.log(`  ✅ ${ok} OK, ${fail} failed`);
        } catch (e) { console.error(`  ❌ ${e.message.substring(0, 150)}`); }
    }

    const tables = await pool.request().query("SELECT name FROM sys.tables WHERE name LIKE 'Frm_%' ORDER BY name");
    console.log('\n=== Final Frm_ tables ===');
    for (const t of tables.recordset) {
        const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM [${t.name}]`);
        console.log(` • ${t.name} — ${cnt.recordset[0].n} rows`);
    }
    await pool.close();
}

run().then(() => { console.log('\n✅ Done'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
