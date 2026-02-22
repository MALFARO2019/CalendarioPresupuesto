/**
 * Test: run syncSingleView with FULL detail logging + shorter dataset
 * This will tell us exactly where the crash happens
 */
require('dotenv').config();

// Patch: monkey-patch getAllIncidentsByView to limit pages for testing
const invgateService = require('./services/invgateService');
const originalGetAll = invgateService.getAllIncidentsByView.bind(invgateService);
invgateService.getAllIncidentsByView = async function (viewId) {
    console.log('[PATCH] Limited fetch: max 2 pages');
    const allTickets = [];
    for (let page = 1; page <= 2; page++) {
        console.log(`  📄 View ${viewId}: fetching page ${page}...`);
        const result = await this.getIncidentsByView(viewId, page);
        allTickets.push(...result.tickets);
        if (result.tickets.length === 0) break;
        await new Promise(r => setTimeout(r, 300));
    }
    console.log(`  ✅ Patched fetch: ${allTickets.length} tickets`);
    return allTickets;
};

async function main() {
    try {
        console.log('=== Full Service Sync Test (2 pages only) ===\n');

        // Drop table first so we test creation
        const { getInvgatePool } = require('./invgateDb');
        const pool = await getInvgatePool();
        await pool.request().query("IF OBJECT_ID('InvgateView_25', 'U') IS NOT NULL DROP TABLE [InvgateView_25]");
        console.log('Dropped InvgateView_25 if existed\n');

        const invgateSyncService = require('./services/invgateSyncService');
        await invgateSyncService.ensureTables();
        console.log('Tables ensured\n');

        console.log('Starting syncSingleView(25)...');
        const result = await invgateSyncService.syncSingleView(25);

        console.log('\n=== RESULT ===');
        console.log(JSON.stringify(result, null, 2));

        // Verify table
        const count = await pool.request().query("SELECT COUNT(*) AS cnt FROM InvgateView_25");
        console.log('\nTable row count:', count.recordset[0].cnt);

    } catch (err) {
        console.error('\n❌ FATAL ERROR:', err.message);
        console.error('Stack:', err.stack);
    }
    process.exit(0);
}

main();
