require('dotenv').config({ override: true });
const formsService = require('./services/formsService');

async function testGet() {
    console.log('Testing formsService.getConfig...');
    const secret = await formsService.getConfig('CLIENT_SECRET');
    console.log('CLIENT_SECRET:', secret ? `"${secret.substring(0, 10)}..." (${secret.length} chars)` : 'NULL/EMPTY');
    const tenantId = await formsService.getConfig('TENANT_ID');
    console.log('TENANT_ID:', tenantId);
    const clientId = await formsService.getConfig('CLIENT_ID');
    console.log('CLIENT_ID:', clientId);
    process.exit(0);
}
testGet().catch(e => { console.error(e); process.exit(1); });
