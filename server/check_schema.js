const { poolPromise } = require('./db.js');
async function run() {
    try {
        const pool = await poolPromise;
        const res1 = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DIM_EVENTOS'");
        console.log("DIM_EVENTOS Columns:", res1.recordset);

        const res2 = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DIM_EVENTOS_FECHAS'");
        console.log("DIM_EVENTOS_FECHAS Columns:", res2.recordset);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
