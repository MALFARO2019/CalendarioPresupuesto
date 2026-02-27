require('dotenv').config({ path: '.env' });
const { poolPromise, sql } = require('./db');

async function checkS84() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT * FROM DIM_NOMBRES_ALMACEN WHERE CODALMACEN LIKE '%S84%' OR CODALMACEN LIKE '%S85%'
        `);
        console.log("RECORDS S84/S85:", res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkS84();
