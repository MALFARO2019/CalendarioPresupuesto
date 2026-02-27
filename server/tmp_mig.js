const { poolPromise } = require('./db');

async function run() {
    try {
        const pool = await poolPromise;
        await pool.request().query('ALTER TABLE APP_Notif_Versiones ADD ImagenUrl NVARCHAR(500) NULL;');
        console.log('Migration successful: ADD ImagenUrl to APP_Notif_Versiones');
    } catch (e) {
        console.error('Migration failed:', e.message);
    } finally {
        process.exit(0);
    }
}
run();
