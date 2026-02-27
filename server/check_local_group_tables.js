const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== VERIFICANDO TABLAS LOCALES DE GRUPOS ===');

    try {
        const cabCount = await pool.request().query('SELECT COUNT(*) as Filas FROM dbo.KpisRosti_GruposAlmacenCab');
        console.log(`KpisRosti_GruposAlmacenCab: ${cabCount.recordset[0].Filas} filas`);
    } catch (e) {
        console.error('Error KpisRosti_GruposAlmacenCab:', e.message);
    }

    try {
        const linCount = await pool.request().query('SELECT COUNT(*) as Filas FROM dbo.KpisRosti_GruposAlmacenLin');
        console.log(`KpisRosti_GruposAlmacenLin: ${linCount.recordset[0].Filas} filas`);
    } catch (e) {
        console.error('Error KpisRosti_GruposAlmacenLin:', e.message);
    }

    process.exit(0);
})().catch(e => { console.error('Error general:', e.message); process.exit(1); });
