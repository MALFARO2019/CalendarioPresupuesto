const axios = require('axios');

// Kpis Rosti v3 credentials
const CLIENT_ID = '019c73a6-4a61-7255-a508-610c25dd4a6b';
const CLIENT_SECRET = 'l0qwE-g)zAQ?~mH>5nZwmkGl?heTp?iRi3NPaxFC7x:#NUx*ZhD2I+x.GYIG,H~k';
const TOKEN_URL = 'https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token';
const API_BASE = 'https://rostipollos.cloud.invgate.net/api/v1';

async function test() {
    console.log('CLIENT_ID:', CLIENT_ID);
    console.log('SECRET length:', CLIENT_SECRET.length);
    console.log('TOKEN_URL:', TOKEN_URL);

    // Test 1: standard form body
    console.log('\n--- Test 1: standard form body ---');
    const p = new URLSearchParams();
    p.append('grant_type', 'client_credentials');
    p.append('client_id', CLIENT_ID);
    p.append('client_secret', CLIENT_SECRET);
    console.log('Encoded body:', p.toString());

    try {
        const r = await axios.post(TOKEN_URL, p, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });
        console.log('✅ STATUS:', r.status, 'KEYS:', Object.keys(r.data).join(', '));
        if (r.data.access_token) {
            console.log('TOKEN:', r.data.access_token.substring(0, 30) + '...');
        } else {
            console.log('DATA:', JSON.stringify(r.data));
        }
    } catch (e) {
        console.log('❌', e.response?.status, JSON.stringify(e.response?.data) || e.message);
    }

    // Test 2: Basic Auth  
    console.log('\n--- Test 2: Basic Auth header ---');
    const b64 = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    try {
        const r2 = await axios.post(TOKEN_URL, 'grant_type=client_credentials', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${b64}`
            },
            timeout: 15000
        });
        console.log('✅ STATUS:', r2.status, JSON.stringify(r2.data));
    } catch (e) {
        console.log('❌', e.response?.status, JSON.stringify(e.response?.data) || e.message);
    }

    // Test 3: Probe /api/v1 without auth to see what error we get
    console.log('\n--- Test 3: /api/v1/incidents without auth ---');
    try {
        const r3 = await axios.get(`${API_BASE}/incidents`, { timeout: 10000 });
        console.log('✅ STATUS:', r3.status);
    } catch (e) {
        console.log('Status:', e.response?.status);
        console.log('WWW-Authenticate:', e.response?.headers['www-authenticate']);
        console.log('Response:', JSON.stringify(e.response?.data).substring(0, 200));
    }
}

test().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
