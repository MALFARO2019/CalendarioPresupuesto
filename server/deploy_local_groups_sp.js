const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
    try {
        const pool = await poolPromise;
        const spContent = fs.readFileSync(path.join(__dirname, 'sp_after_fix_2026-02-26.sql'), 'utf-8'); // UTF-8 because the tool modifies in utf-8

        console.log('⏳ Desplegando SP_CALCULAR_PRESUPUESTO modificado nuevamente...');

        // Execute the ALTER PROCEDURE script
        await pool.request().batch(spContent);

        console.log('✅ Despliegue del SP exitoso!');

        // Recalcular Produccion para que aplique
        console.log('⏳ Recalculando Producción con orígenes de datos locales verdaderos...');
        const request = pool.request();
        request.timeout = 600000;

        const res = await request
            .input('NombrePresupuesto', 'Producción')
            .input('TablaDestino', 'RSM_ALCANCE_DIARIO')
            .input('Usuario', 'SISTEMA_LOCAL')
            .input('CrearVersion', 1)
            .execute('SP_CALCULAR_PRESUPUESTO');

        console.log('✅ Recálculo exitoso con las tablas locales!');

        process.exit(0);

    } catch (err) {
        console.error('❌ Error general:', err.message);
        process.exit(1);
    }
})();
