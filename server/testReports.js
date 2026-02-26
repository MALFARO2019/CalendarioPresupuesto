const { sql, poolPromise } = require('./db');

async function ensureReport() {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`SELECT ID FROM DIM_REPORTES WHERE TipoEspecial = 'alcance-nocturno'`);

        if (result.recordset.length === 0) {
            console.log('Insertando reporte alcance-nocturno en DIM_REPORTES...');
            await pool.request().query(`
                INSERT INTO DIM_REPORTES (
                    Nombre, Descripcion, Icono, Categoria, TipoEspecial, 
                    QuerySQL, Frecuencia, HoraEnvio, FormatoSalida, Activo
                ) VALUES (
                    'Alcance de Presupuesto Nocturno',
                    'Reporte automático generado en la noche con el cruce de ventas reales vs presupuesto',
                    '🌙',
                    'Ventas',
                    'alcance-nocturno',
                    '--', -- No requiere query dinámico, usa lógica hardcoded
                    'Diario',
                    '22:00',
                    'html',
                    1
                )
            `);
            console.log('✅ Reporte insertado con éxito');
        } else {
            console.log('✅ El reporte ya existe en base de datos. ID:', result.recordset[0].ID);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

ensureReport();
