const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { userId: 1, email: 'soporte@rostipolloscr.com' },
    process.env.JWT_SECRET || 'rosti-secret-2025'
);

console.log('Testing /api/user/dashboard-config...');
fetch('http://localhost:3000/api/user/dashboard-config', {
    headers: { 'Authorization': `Bearer ${token}` }
})
    .then(r => r.json())
    .then(data => {
        console.log('✅ Dashboard config response:', JSON.stringify(data, null, 2));

        // Now test multi-kpi endpoint
        console.log('\nTesting /api/dashboard/multi-kpi...');
        const params = new URLSearchParams({
            locales: 'Corporativo',
            startDate: '2026-01-01',
            endDate: '2026-02-15',
            yearType: 'anterior',
            comparativePeriod: 'Month'
        });

        return fetch(`http://localhost:3000/api/dashboard/multi-kpi?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    })
    .then(r => r.json())
    .then(data => {
        console.log('✅ Multi-KPI response:', JSON.stringify(data, null, 2));
        console.log('\n🔍 Checking for trend data...');
        if (data.results && data.results[0] && data.results[0].stats) {
            const ventas = data.results[0].stats.Ventas;
            if (ventas) {
                console.log('Ventas trendPresupuesto:', ventas.trendPresupuesto);
                console.log('Ventas trendAnterior:', ventas.trendAnterior);
            }
        }
    })
    .catch(err => console.error('❌ Error:', err.message));
