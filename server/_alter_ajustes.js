const sql = require('mssql');
const config = require('./dbConfig');

async function main() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log("Conectado a la BD");

        const alterQuery = `
            ALTER TABLE MODELO_PRESUPUESTO_AJUSTES
            ADD 
                FechaCreacion DATETIME DEFAULT GETDATE(),
                FechaAprobacion DATETIME NULL,
                UsuarioRechaza NVARCHAR(200) NULL,
                FechaRechazo DATETIME NULL;
        `;

        await pool.request().query(alterQuery);
        console.log("Columnas agregadas con éxito a MODELO_PRESUPUESTO_AJUSTES");

    } catch (err) {
        console.error('Error alterando la tabla:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
