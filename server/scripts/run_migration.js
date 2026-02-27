const { sql, poolPromise } = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    try {
        const pool = await poolPromise;
        const pt1 = fs.readFileSync(path.join(__dirname, 'migrate_ajustes_pt1.sql'), 'utf-8');
        const pt2 = fs.readFileSync(path.join(__dirname, 'SP_CALCULAR_PRESUPUESTO.sql'), 'utf-8');

        // Execute parts of script 1 separated by GO (simple split)
        const parts = pt1.split('GO').map(s => s.trim()).filter(s => s.length > 0);
        for (const p of parts) {
            await pool.request().query(p);
            console.log('Executed batch from pt1');
        }

        await pool.request().query(pt2);
        console.log('Executed pt2 SP_CALCULAR_PRESUPUESTO');

        // Extract again to verify
        const testRes = await pool.request().query("SELECT Estado FROM MODELO_PRESUPUESTO_AJUSTES");
        console.log("Column exists. Row count:", testRes.recordset.length);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runMigrations();
