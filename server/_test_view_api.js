require('dotenv').config();
const axios = require('axios');
const svc = require('./services/invgateService');

(async () => {
    try {
        await svc.initialize();
        const token = await svc.getAccessToken();
        const baseUrl = svc.apiBaseUrl;

        // Test 1: /incidents/by.view with ids[]=25
        console.log('\n=== TEST 1: /incidents/by.view?ids[]=25 ===');
        try {
            const resp1 = await axios.get(`${baseUrl}/incidents/by.view`, {
                params: { 'ids[]': 25 },
                headers: { Authorization: `Bearer ${token}` }
            });
            const data1 = resp1.data;
            const keys1 = Object.keys(data1);
            console.log('Keys count:', keys1.length, 'Keys:', keys1.slice(0, 20));
            for (const k of keys1.slice(0, 3)) {
                const v = data1[k];
                if (typeof v === 'object') {
                    console.log(`  Ticket ${k}: fields=${Object.keys(v).length}, title="${v.title || 'N/A'}"`);
                }
            }
        } catch (e) {
            console.log('FAILED:', e.response?.status, e.response?.data?.error || e.message);
        }

        // Test 2: Try /views to list available views
        console.log('\n=== TEST 2: /views ===');
        try {
            const resp2 = await axios.get(`${baseUrl}/views`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Views response type:', typeof resp2.data);
            if (Array.isArray(resp2.data)) {
                console.log('Views count:', resp2.data.length);
                resp2.data.slice(0, 5).forEach(v => console.log('  View:', JSON.stringify(v)));
            } else {
                const keys = Object.keys(resp2.data);
                console.log('Keys:', keys.slice(0, 10));
                for (const k of keys.slice(0, 3)) {
                    console.log(`  ${k}:`, JSON.stringify(resp2.data[k]).substring(0, 200));
                }
            }
        } catch (e) {
            console.log('FAILED:', e.response?.status, e.response?.data?.error || e.message);
        }

        // Test 3: Try different endpoint for view listing
        console.log('\n=== TEST 3: /incidents.by.view ===');
        try {
            const resp3 = await axios.get(`${baseUrl}/incidents.by.view`, {
                params: { 'ids[]': 25 },
                headers: { Authorization: `Bearer ${token}` }
            });
            const keys = Object.keys(resp3.data);
            console.log('Keys count:', keys.length);
            for (const k of keys.slice(0, 3)) {
                const v = resp3.data[k];
                if (typeof v === 'object') {
                    console.log(`  ${k}: fields=${Object.keys(v).length}`);
                }
            }
        } catch (e) {
            console.log('FAILED:', e.response?.status, e.response?.data?.error || e.message);
        }

        // Test 4: /incidents with view filter
        console.log('\n=== TEST 4: /incidents?view_id=25 ===');
        try {
            const resp4 = await axios.get(`${baseUrl}/incidents`, {
                params: { view_id: 25 },
                headers: { Authorization: `Bearer ${token}` }
            });
            const data4 = resp4.data;
            console.log('Type:', typeof data4);
            if (typeof data4 === 'object') {
                const keys = Object.keys(data4);
                console.log('Keys count:', keys.length, 'First 5:', keys.slice(0, 5));
            }
        } catch (e) {
            console.log('FAILED:', e.response?.status, e.response?.data?.error || e.message);
        }

        // Test 5: /incidents/by.helpdesk with view filter parameter
        console.log('\n=== TEST 5: /incidents/by.helpdesk?ids[]=5 (known helpdesk for quejas) ===');
        try {
            const resp5 = await axios.get(`${baseUrl}/incidents/by.helpdesk`, {
                params: { 'ids[]': 5 },
                headers: { Authorization: `Bearer ${token}` }
            });
            const data5 = resp5.data;
            const keys5 = Object.keys(data5);
            console.log('Keys count:', keys5.length, 'First 5:', keys5.slice(0, 5));
        } catch (e) {
            console.log('FAILED:', e.response?.status, e.response?.data?.error || e.message);
        }

    } catch (e) {
        console.error('Init error:', e.message);
    }
    process.exit(0);
})();
