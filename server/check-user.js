const { poolPromise } = require('./db');

async function checkUser() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT Email, AccesoEventos, EsAdmin, Activo FROM APP_USUARIOS WHERE Email LIKE '%gvalverde%'");
        console.dir(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkUser();
