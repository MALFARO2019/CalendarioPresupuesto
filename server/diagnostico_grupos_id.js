const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== TODOS LOS GRUPOS ===');
    const result = await pool.request().query(`
        SELECT IDGRUPO, DESCRIPCION
        FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB WITH (NOLOCK)
        WHERE CODVISIBLE = 20
        ORDER BY IDGRUPO
    `);
    console.table(result.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
