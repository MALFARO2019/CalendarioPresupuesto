const axios = require('axios');

const CLIENT_ID = '019c73a6-4a61-7255-a508-610c25dd4a6b';
const CLIENT_SECRET = 'l0qwE-g)zAQ?~mH>5nZwmkGl?heTp?iRi3NPaxFC7x:#NUx*ZhD2I+x.GYIG,H~k';
const TOKEN_URL = 'https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token';
const API_BASE = 'https://rostipollos.cloud.invgate.net/api/v1';

async function test() {
    // Get token
    const p = new URLSearchParams();
    p.append('grant_type', 'client_credentials');
    p.append('client_id', CLIENT_ID);
    p.append('client_secret', CLIENT_SECRET);
    const tokenResp = await axios.post(TOKEN_URL, p, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000
    });
    const token = tokenResp.data.access_token;
    console.log('✅ Token obtained (first 30):', token.substring(0, 30) + '...');

    // Test API with Bearer token
    const endpoints = ['/incidents', '/incidents?per_page=1', '/helpdesks', '/categories'];
    for (const ep of endpoints) {
        try {
            const r = await axios.get(`${API_BASE}${ep}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                timeout: 15000
            });
            console.log(`✅ GET ${ep} → ${r.status} keys:`, Object.keys(r.data || {}).join(', '));
            if (r.data) {
                const sample = JSON.stringify(r.data).substring(0, 200);
                console.log('   Sample:', sample);
            }
            break; // stop on first success
        } catch (e) {
            console.log(`❌ GET ${ep} → ${e.response?.status}`, e.response?.headers?.['www-authenticate'] || e.message);
        }
    }
}

test().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
