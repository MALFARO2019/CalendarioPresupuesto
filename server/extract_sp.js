const fs = require('fs');
const { poolPromise } = require('./db.js');

(async () => {
    try {
        const pool = await poolPromise;
        const r = await pool.request().query("sp_helptext 'SP_CALCULAR_PRESUPUESTO'");
        const def = r.recordset.map(row => row.Text).join('');
        fs.writeFileSync('sp_current.sql', def);
        console.log('Successfully written to sp_current.sql');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
