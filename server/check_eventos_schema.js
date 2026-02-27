require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
    try {
        const pool = await poolPromise;

        console.log("=== APP_CALENDARIO_FECHAS_ESPECIALES ===");
        const resFechas = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'APP_CALENDARIO_FECHAS_ESPECIALES'");
        console.table(resFechas.recordset);

        console.log("=== APP_CALENDARIO_EVENTOS_ESPECIALES ===");
        const resEventos = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'APP_CALENDARIO_EVENTOS_ESPECIALES'");
        console.table(resEventos.recordset);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
