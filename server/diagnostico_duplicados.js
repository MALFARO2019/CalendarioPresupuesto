const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== INSPECCIONANDO CORPORATIVO ===');
    const result = await pool.request().query(`
        SELECT Fecha, idLocal, [Local], Serie, idDia, Dia, Mes, CodAlmacen, Canal, Tipo, 
               Monto, MontoAnterior, MontoAnteriorAjustado
        FROM RSM_ALCANCE_DIARIO
        WHERE NombrePresupuesto = 'Producción'
          AND [Local] = 'Corporativo'
          AND Canal = 'Todos'
          AND Tipo = 'Ventas'
          AND Fecha = '2026-02-19'
    `);
    console.table(result.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
