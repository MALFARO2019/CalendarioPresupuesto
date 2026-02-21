require('dotenv').config();
const sql = require('mssql');
const axios = require('axios');

const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_InvGate',
    options: { encrypt: true, trustServerCertificate: true }
};

const NEW_CLIENT_ID = '019c73a6-4a61-7255-a508-610c25dd4a6b';
const NEW_CLIENT_SECRET = 'l0qwE-g)zAQ?~mH>5nZwmkGl?heTp?iRi3NPaxFC7x:#NUx*ZhD2I+x.GYIG,H~k';
const TOKEN_URL = 'https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token';
const API_BASE_URL = 'https://rostipollos.cloud.invgate.net/api/v1'; // v1, not v2

async function upsert(pool, key, value) {
    const r = await pool.request()
        .input('k', sql.NVarChar, key)
        .query('SELECT 1 FROM InvgateConfig WHERE ConfigKey=@k');
    if (r.recordset.length > 0) {
        await pool.request()
            .input('k', sql.NVarChar, key)
            .input('v', sql.NVarChar, value)
            .query('UPDATE InvgateConfig SET ConfigValue=@v, UpdatedAt=GETDATE() WHERE ConfigKey=@k');
    } else {
        await pool.request()
            .input('k', sql.NVarChar, key)
            .input('v', sql.NVarChar, value)
            .query('INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES (@k, @v)');
    }
    console.log(`✅ ${key} updated`);
}

async function main() {
    const pool = await sql.connect(cfg);
    console.log('Connected to KPIsRosti_InvGate\n');

    await upsert(pool, 'CLIENT_ID', NEW_CLIENT_ID);
    await upsert(pool, 'CLIENT_SECRET', NEW_CLIENT_SECRET);
    await upsert(pool, 'TOKEN_URL', TOKEN_URL);
    await upsert(pool, 'API_BASE_URL', API_BASE_URL);

    console.log('\n=== Testing OAuth with new credentials ===');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', NEW_CLIENT_ID);
    params.append('client_secret', NEW_CLIENT_SECRET);

    try {
        const resp = await axios.post(TOKEN_URL, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });

        if (resp.data.error) {
            console.log('❌ OAuth error:', resp.data.error_description || resp.data.error);
        } else {
            const token = resp.data.access_token;
            console.log('✅ OAuth token obtained!');
            console.log('   Expires in:', resp.data.expires_in, 'seconds');
            console.log('   Token (first 30):', token.substring(0, 30) + '...');

            // Test API call
            console.log('\n=== Testing API call /api/v1/incidents ===');
            try {
                const apiResp = await axios.get(`${API_BASE_URL}/incidents?per_page=1`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                    timeout: 15000
                });
                console.log('✅ API call SUCCESS! Status:', apiResp.status);
                console.log('   Response keys:', Object.keys(apiResp.data || {}).join(', '));
            } catch (apiErr) {
                console.log('❌ API call failed:', apiErr.response?.status, apiErr.response?.data || apiErr.message);
                // Try helpdesks endpoint
                console.log('\nTrying /api/v1/helpdesks ...');
                try {
                    const r2 = await axios.get(`${API_BASE_URL}/helpdesks`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                        timeout: 15000
                    });
                    console.log('✅ /helpdesks SUCCESS! Keys:', Object.keys(r2.data || {}).join(', '));
                } catch (e2) {
                    console.log('❌ /helpdesks also failed:', e2.response?.status, e2.message);
                }
            }
        }
    } catch (err) {
        console.log('❌ Failed:', err.response?.data || err.message);
    }

    await sql.close();
    console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
