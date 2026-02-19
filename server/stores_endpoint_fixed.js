// GET /api/stores - Return stores and groups user has access to
app.get('/api/stores', authMiddleware, async (req, res) => {
    console.log('📍 /api/stores called by user:', req.user?.email);
    try {
        const pool = await poolPromise;
        const userStores = req.user.allowedStores || [];

        // Simple query: get each Local and check if it has any 'G' codes
        let query = `
            SELECT DISTINCT 
                Local,
                MAX(CASE WHEN LEFT(CODALMACEN, 1) = 'G' THEN 1 ELSE 0 END) AS HasGroupCode
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026
        `;

        if (userStores.length > 0) {
            const request = pool.request();
            const storeList = userStores.map((s, i) => `@store${i}`).join(', ');
            query += ` AND Local IN (${storeList})`;
            userStores.forEach((store, i) => {
                request.input(`store${i}`, sql.NVarChar, store);
            });
            query += ' GROUP BY Local ORDER BY Local';

            const result = await request.query(query);
            const groups = result.recordset.filter(r => r.HasGroupCode === 1).map(r => r.Local);
            const individuals = result.recordset.filter(r => r.HasGroupCode !== 1).map(r => r.Local);

            console.log(`✅ Found ${groups.length} groups and ${individuals.length} individuals for user`);
            res.json({ groups, individuals });
        } else {
            query += ' GROUP BY Local ORDER BY Local';
            const result = await pool.request().query(query);
            const groups = result.recordset.filter(r => r.HasGroupCode === 1).map(r => r.Local);
            const individuals = result.recordset.filter(r => r.HasGroupCode !== 1).map(r => r.Local);

            console.log(`✅ Found ${groups.length} groups and ${individuals.length} individuals (all access)`);
            res.json({ groups, individuals });
        }
    } catch (err) {
        console.error('❌ Error in /api/stores:', err);
        res.status(500).json({ error: err.message });
    }
});
