const sql = require('mssql');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000
};

async function main() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log("Conectado a la BD");

        await pool.request().query(`
            IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = N'FechaCreacion' AND Object_ID = Object_ID(N'MODELO_PRESUPUESTO_AJUSTES'))
            BEGIN
                ALTER TABLE MODELO_PRESUPUESTO_AJUSTES ADD FechaCreacion DATETIME DEFAULT GETDATE();
            END
            IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = N'FechaAprobacion' AND Object_ID = Object_ID(N'MODELO_PRESUPUESTO_AJUSTES'))
            BEGIN
                ALTER TABLE MODELO_PRESUPUESTO_AJUSTES ADD FechaAprobacion DATETIME NULL;
            END
            IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = N'UsuarioRechaza' AND Object_ID = Object_ID(N'MODELO_PRESUPUESTO_AJUSTES'))
            BEGIN
                ALTER TABLE MODELO_PRESUPUESTO_AJUSTES ADD UsuarioRechaza NVARCHAR(200) NULL;
            END
            IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = N'FechaRechazo' AND Object_ID = Object_ID(N'MODELO_PRESUPUESTO_AJUSTES'))
            BEGIN
                ALTER TABLE MODELO_PRESUPUESTO_AJUSTES ADD FechaRechazo DATETIME NULL;
            END
        `);
        console.log("Alter realizado con exitos");
    } catch (err) {
        console.error('Error alterando la tabla:', err.message);
    } finally {
        if (pool) await pool.close();
    }
}

main();
