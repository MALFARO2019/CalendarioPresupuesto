require('dotenv').config();
const sql = require('mssql');
const axios = require('axios');

const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'InvGateData',
    options: { encrypt: true, trustServerCertificate: true }
};

async function main() {
    const pool = await sql.connect(cfg);

    // 1. Read current values
    const result = await pool.request().query(
        "SELECT ConfigKey, ConfigValue FROM InvgateConfig WHERE ConfigKey IN ('TOKEN_URL','CLIENT_ID','CLIENT_SECRET','API_BASE_URL') ORDER BY ConfigKey"
    );

    console.log('\n=== CURRENT DB VALUES ===');
    result.recordset.forEach(r => {
        const preview = r.ConfigKey === 'CLIENT_SECRET'
            ? r.ConfigValue.substring(0, 10) + '...[' + (r.ConfigValue?.length || 0) + ' chars]'
            : r.ConfigValue;
        console.log(`  ${r.ConfigKey}: ${preview}`);
    });

    // Extract values
    const config = {};
    result.recordset.forEach(r => config[r.ConfigKey] = r.ConfigValue);

    const currentTokenUrl = config['TOKEN_URL'];
    const correctTokenUrl = 'https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token';

    console.log('\n=== TOKEN URL ANALYSIS ===');
    console.log('Current  :', currentTokenUrl);
    console.log('Correct  :', correctTokenUrl);
    console.log('Match    :', currentTokenUrl === correctTokenUrl ? '✅ YES' : '❌ NO — NEEDS FIX');

    // 2. Fix TOKEN_URL if wrong
    if (currentTokenUrl !== correctTokenUrl) {
        console.log('\nFixing TOKEN_URL...');
        await pool.request()
            .input('v', sql.NVarChar, correctTokenUrl)
            .query("UPDATE InvgateConfig SET ConfigValue=@v, UpdatedAt=GETDATE() WHERE ConfigKey='TOKEN_URL'");
        console.log('✅ TOKEN_URL updated to:', correctTokenUrl);
    }

    // 3. Try OAuth with both possible CLIENT_ID values
    const clientId = config['CLIENT_ID'];
    const clientSecret = config['CLIENT_SECRET'];

    console.log('\n=== TESTING OAUTH ===');
    console.log('Token URL:', correctTokenUrl);
    console.log('CLIENT_ID:', clientId);

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        const response = await axios.post(correctTokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });

        console.log('✅ SUCCESS! Response status:', response.status);
        console.log('   Response keys:', Object.keys(response.data).join(', '));
        if (response.data.access_token) {
            console.log('   Token (first 20):', response.data.access_token.substring(0, 20) + '...');
        }
    } catch (err) {
        console.log('❌ FAILED:', err.response?.data || err.message);

        // Try with the API_KEY as alternate CLIENT_ID
        const altClientId = '019c6c8e-9c7c-738e-9dd5-69b6bd09860c';
        if (altClientId !== clientId) {
            console.log('\nTrying with alternate CLIENT_ID (original API Key):', altClientId);
            try {
                const params2 = new URLSearchParams();
                params2.append('grant_type', 'client_credentials');
                params2.append('client_id', altClientId);
                params2.append('client_secret', clientSecret);

                const resp2 = await axios.post(correctTokenUrl, params2, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000
                });
                console.log('✅ Alternate CLIENT_ID SUCCESS! Keys:', Object.keys(resp2.data).join(', '));
            } catch (err2) {
                console.log('❌ Alternate also failed:', err2.response?.data || err2.message);
            }
        }
    }

    // 4. Try with API Key header auth directly on incidents endpoint
    const apiKey = config['API_KEY'] || '019c6c8e-9c7c-738e-9dd5-69b6bd09860c';
    const apiBase = config['API_BASE_URL'] || 'https://rostipollos.cloud.invgate.net/api/v2';
    console.log('\n=== TESTING API KEY DIRECT AUTH ===');
    console.log('API Base:', apiBase);
    console.log('API Key:', apiKey ? apiKey.substring(0, 15) + '...' : 'NULL');

    const authHeaders = [
        { 'Authorization': `Token token=${apiKey}` },
        { 'Authorization': `api_token ${apiKey}` },
        { 'Authorization': `Bearer ${apiKey}` },
        { 'X-API-Key': apiKey },
        { 'api-token': apiKey }
    ];

    for (const headers of authHeaders) {
        try {
            const resp = await axios.get(`${apiBase}/incidents?per_page=1`, { headers, timeout: 10000 });
            console.log(`✅ DIRECT SUCCESS with header: ${JSON.stringify(headers)}`);
            console.log('   Response:', JSON.stringify(resp.data).substring(0, 200));
            break;
        } catch (err) {
            const code = err.response?.status || 'ERR';
            const hKey = Object.keys(headers)[0];
            console.log(`❌ ${code} with ${hKey}`);
            if (err.response?.status === 401 || err.response?.status === 403) {
                console.log('   Body:', JSON.stringify(err.response?.data).substring(0, 100));
            }
        }
    }

    await sql.close();
    console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
