const { poolPromise } = require('./db.js');
async function test() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT Email, EsAdmin, ISNULL(accesoModeloPresupuesto,0) as accesoModeloPresupuesto, ISNULL(ajustarCurva,0) as ajustarCurva, ISNULL(aprobarAjustes,0) as aprobarAjustes FROM APP_USUARIOS WHERE Email = 'kvalle@rostipolloscr.com'");
        console.log(result.recordset[0]);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
test();
