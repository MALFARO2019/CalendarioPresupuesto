/**
 * Diagnostic: Test InvGate view sync for view 25
 * Run: node _diag_invgate_sync.js
 */
require('dotenv').config();

async function main() {
    try {
        console.log('=== InvGate Sync Diagnostic ===');

        // 1. Test DB connection
        const { getInvgatePool, sql } = require('./invgateDb');
        console.log('\n1. Testing InvGate DB connection...');
        const pool = await getInvgatePool();
        console.log('   ✅ DB connected');

        // 2. Check InvgateViews table
        console.log('\n2. Checking InvgateViews table...');
        const views = await pool.request().query('SELECT * FROM InvgateViews');
        console.log('   Views:', JSON.stringify(views.recordset, null, 2));

        // 3. Check if InvgateView_25 table exists
        console.log('\n3. Checking InvgateView_25 table...');
        const tableCheck = await pool.request()
            .query("SELECT OBJECT_ID('InvgateView_25', 'U') AS tid");
        console.log('   Table exists?', !!tableCheck.recordset[0]?.tid);

        // 4. List all tables in database
        console.log('\n4. All tables in KPIsRosti_InvGate:');
        const tables = await pool.request()
            .query("SELECT name FROM sys.tables ORDER BY name");
        tables.recordset.forEach(t => console.log('   -', t.name));

        // 5. Test API connection
        console.log('\n5. Testing InvGate API...');
        const invgateService = require('./services/invgateService');
        try {
            const result = await invgateService.getIncidentsByView(25, 1);
            console.log('   ✅ API response:', {
                ticketCount: result.tickets.length,
                columns: result.columns?.slice(0, 5),
                totalCount: result.totalCount
            });
            if (result.tickets.length > 0) {
                console.log('   First ticket keys:', Object.keys(result.tickets[0]));
            }
        } catch (apiErr) {
            console.log('   ❌ API error:', apiErr.message);
        }

        // 6. Try manual sync
        console.log('\n6. Running syncSingleView(25)...');
        const invgateSyncService = require('./services/invgateSyncService');
        await invgateSyncService.ensureTables();
        const syncResult = await invgateSyncService.syncSingleView(25);
        console.log('   Sync result:', JSON.stringify(syncResult, null, 2));

        // 7. Re-check table
        console.log('\n7. Re-checking InvgateView_25 after sync...');
        const tableCheck2 = await pool.request()
            .query("SELECT OBJECT_ID('InvgateView_25', 'U') AS tid");
        console.log('   Table exists now?', !!tableCheck2.recordset[0]?.tid);

        if (tableCheck2.recordset[0]?.tid) {
            const count = await pool.request().query('SELECT COUNT(*) AS cnt FROM InvgateView_25');
            console.log('   Row count:', count.recordset[0].cnt);
        }

        process.exit(0);
    } catch (err) {
        console.error('FATAL:', err);
        process.exit(1);
    }
}

main();
