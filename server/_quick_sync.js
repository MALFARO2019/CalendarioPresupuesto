/**
 * Quick sync test — only sync view 25, show exact errors
 */
require('dotenv').config();

async function main() {
    const startTime = Date.now();
    try {
        const { getInvgatePool } = require('./invgateDb');
        const pool = await getInvgatePool();

        // Check table before
        const before = await pool.request().query("SELECT OBJECT_ID('InvgateView_25', 'U') AS tid");
        console.log('Table exists before:', !!before.recordset[0]?.tid);

        // Run sync
        console.log('\n=== Starting sync... ===\n');
        const invgateSyncService = require('./services/invgateSyncService');
        await invgateSyncService.ensureTables();

        const result = await invgateSyncService.syncSingleView(25);
        console.log('\n=== Sync result ===');
        console.log(JSON.stringify(result, null, 2));

        // Check table after
        const after = await pool.request().query("SELECT OBJECT_ID('InvgateView_25', 'U') AS tid");
        console.log('\nTable exists after:', !!after.recordset[0]?.tid);
        if (after.recordset[0]?.tid) {
            const count = await pool.request().query('SELECT COUNT(*) AS cnt FROM InvgateView_25');
            console.log('Row count:', count.recordset[0].cnt);
        }

        console.log(`\nTotal time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (err) {
        console.error('FATAL ERROR:', err.message);
        console.error('Stack:', err.stack);
    }
    process.exit(0);
}

main();
