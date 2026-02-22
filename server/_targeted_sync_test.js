/**
 * Targeted test: fetch 1 page, create table, insert batch
 * Isolates exact failure point
 */
require('dotenv').config();

async function main() {
    try {
        console.log('=== Targeted Sync Test ===\n');

        // 1. Get DB pool
        const { getInvgatePool, sql } = require('./invgateDb');
        const pool = await getInvgatePool();
        console.log('1. ✅ DB connected');

        // 2. Fetch just 1 page from API
        console.log('2. Fetching 1 page from API...');
        const invgateService = require('./services/invgateService');
        const result = await invgateService.getIncidentsByView(25, 1);
        console.log(`   Got ${result.tickets.length} tickets, ${result.columns.length} columns`);
        console.log('   Columns:', result.columns);

        if (result.tickets.length === 0) {
            console.log('   ❌ No tickets returned!');
            process.exit(1);
        }

        // Show first ticket
        const sample = result.tickets[0];
        console.log('   Sample keys:', Object.keys(sample));
        console.log('   Sample values:', JSON.stringify(sample).substring(0, 300));

        // 3. Create table
        const tableName = 'InvgateView_25';
        console.log(`\n3. Creating table [${tableName}]...`);

        // Detect all columns
        const columnSet = new Set();
        for (const ticket of result.tickets) {
            for (const key of Object.keys(ticket)) {
                columnSet.add(key);
            }
        }
        const columns = Array.from(columnSet);
        const safeColumns = columns.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 128));
        console.log(`   ${columns.length} columns detected`);

        // Drop and recreate for testing
        await pool.request().query(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE [${tableName}]`);

        const colDefs = safeColumns.map(c => `[${c}] NVARCHAR(MAX) NULL`).join(',\n                            ');
        const createSQL = `
            CREATE TABLE [${tableName}] (
                [_RowId] INT IDENTITY(1,1) PRIMARY KEY,
                [_SyncedAt] DATETIME DEFAULT GETDATE(),
                [_CODALMACEN] NVARCHAR(50) NULL,
                [_PERSONAL_ID] INT NULL,
                [_PERSONAL_NOMBRE] NVARCHAR(200) NULL,
                ${colDefs}
            )
        `;
        console.log('   SQL length:', createSQL.length);

        try {
            await pool.request().query(createSQL);
            console.log('   ✅ Table created!');
        } catch (createErr) {
            console.error('   ❌ CREATE TABLE failed:', createErr.message);
            process.exit(1);
        }

        // 4. Batch insert first 10 tickets
        console.log(`\n4. Inserting ${Math.min(10, result.tickets.length)} tickets...`);
        const batch = result.tickets.slice(0, 10);
        const req = pool.request();
        const allValueRows = [];
        let paramIdx = 0;

        for (const ticket of batch) {
            const rowParams = [];
            for (let i = 0; i < columns.length; i++) {
                const rawValue = ticket[columns[i]];
                const valueStr = rawValue === null || rawValue === undefined ? null
                    : typeof rawValue === 'object' ? JSON.stringify(rawValue)
                        : String(rawValue);
                const paramName = `p${paramIdx++}`;
                rowParams.push(`@${paramName}`);
                req.input(paramName, sql.NVarChar(sql.MAX), valueStr);
            }
            allValueRows.push(`(${rowParams.join(', ')})`);
        }

        const colNames = safeColumns.map(c => `[${c}]`).join(', ');
        const insertSQL = `INSERT INTO [${tableName}] (${colNames}) VALUES ${allValueRows.join(',\n')}`;
        console.log(`   Parameters: ${paramIdx}, Values rows: ${allValueRows.length}`);
        console.log(`   SQL length: ${insertSQL.length}`);

        try {
            await req.query(insertSQL);
            console.log('   ✅ Batch insert succeeded!');
        } catch (insertErr) {
            console.error('   ❌ BATCH INSERT failed:', insertErr.message);
            console.error('   Stack:', insertErr.stack?.split('\n').slice(0, 3).join('\n'));

            // Try single insert as fallback
            console.log('\n5. Trying single row insert...');
            try {
                const singleReq = pool.request();
                const singleParams = [];
                let si = 0;
                for (let i = 0; i < columns.length; i++) {
                    const rawValue = batch[0][columns[i]];
                    const valueStr = rawValue === null || rawValue === undefined ? null
                        : typeof rawValue === 'object' ? JSON.stringify(rawValue)
                            : String(rawValue);
                    const pn = `s${si++}`;
                    singleParams.push(`@${pn}`);
                    singleReq.input(pn, sql.NVarChar(sql.MAX), valueStr);
                }
                await singleReq.query(`INSERT INTO [${tableName}] (${colNames}) VALUES (${singleParams.join(', ')})`);
                console.log('   ✅ Single insert succeeded!');
            } catch (singleErr) {
                console.error('   ❌ Single INSERT also failed:', singleErr.message);
            }
        }

        // 5. Verify
        console.log('\n6. Verifying...');
        const count = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${tableName}]`);
        console.log(`   Row count: ${count.recordset[0].cnt}`);

        const cols = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`);
        console.log(`   Column count: ${cols.recordset.length}`);

    } catch (err) {
        console.error('FATAL:', err.message);
        console.error('Stack:', err.stack);
    }
    process.exit(0);
}

main();
