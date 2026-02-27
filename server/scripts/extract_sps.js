const { sql, poolPromise } = require('../db');
const fs = require('fs');
const path = require('path');

async function extractSPs() {
    try {
        const pool = await poolPromise;
        const sps = ['SP_AJUSTAR_PRESUPUESTO', 'SP_CALCULAR_PRESUPUESTO'];

        for (const sp of sps) {
            const result = await pool.request()
                .input('spName', sql.NVarChar, sp)
                .query(`EXEC sp_helptext @spName`);

            const text = result.recordset.map(r => r.Text).join('');
            fs.writeFileSync(path.join(__dirname, `${sp}.sql`), text);
            console.log(`Extracted ${sp}`);
        }

        // Check if Estado column exists
        const colCheck = await pool.request()
            .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'MODELO_PRESUPUESTO_AJUSTES' AND COLUMN_NAME = 'Estado'
            `);
        console.log('Column Estado exists:', colCheck.recordset.length > 0);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

extractSPs();
