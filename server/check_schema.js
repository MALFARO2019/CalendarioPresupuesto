const { sql, poolPromise } = require('./db');

async function check() {
    try {
        const pool = await poolPromise;
        const res3 = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MODELO_PRESUPUESTO_AJUSTES'`);

        console.log('AJUSTES cols:', res3.recordset.map(r => r.COLUMN_NAME));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
