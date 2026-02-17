const express = require('express');
const { sql } = require('./db');
const { dbManager } = require('./dbConnectionManager');

const router = express.Router();

/**
 * Auxiliary Database Administration Endpoints
 * Requires admin authentication
 */

// POST /api/admin/db-config/auxiliary - Save auxiliary DB configuration
router.post('/db-config/auxiliary', async (req, res) => {
    try {
        const { server, database, username, password } = req.body;

        if (!server || !database) {
            return res.status(400).json({ error: 'Server y Database son requeridos' });
        }

        // Test connection first
        const testConfig = {
            user: username || 'sa',
            password: password || '',
            server: server,
            database: database,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };

        const testResult = await dbManager.testConnection(testConfig);
        if (!testResult.success) {
            return res.status(400).json({
                error: 'No se pudo conectar a la base de datos auxiliar',
                details: testResult.message
            });
        }

        // Save to APP_CONFIGURACION
        const pool = dbManager.getActivePool();
        const usuario = req.user?.email || 'admin';

        await pool.request()
            .input('usuario', sql.NVarChar, usuario)
            .input('server', sql.NVarChar, server)
            .input('database', sql.NVarChar, database)
            .input('username', sql.NVarChar, username || 'sa')
            .input('password', sql.NVarChar, password || '')
            .query(`
                MERGE APP_CONFIGURACION AS target
                USING (SELECT 'DB_AUX_SERVER' AS Clave) AS source
                ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @server, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_SERVER', @server, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target
                USING (SELECT 'DB_AUX_DATABASE' AS Clave) AS source
                ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @database, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_DATABASE', @database, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target
                USING (SELECT 'DB_AUX_USERNAME' AS Clave) AS source
                ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @username, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_USERNAME', @username, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target
                USING (SELECT 'DB_AUX_PASSWORD' AS Clave) AS source
                ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @password, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_PASSWORD', @password, GETDATE(), @usuario);
            `);

        // Reload auxiliary config in dbManager
        await dbManager.loadAuxiliaryConfig();

        console.log(`✅ Auxiliary DB config saved by ${usuario}`);
        res.json({ success: true, message: 'Configuración guardada y conexión verificada' });
    } catch (err) {
        console.error('Error saving auxiliary DB config:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/db-config/auxiliary - Get auxiliary DB configuration
router.get('/db-config/auxiliary', async (req, res) => {
    try {
        const pool = dbManager.getActivePool();
        const result = await pool.request().query(`
            SELECT Clave, Valor 
            FROM APP_CONFIGURACION 
            WHERE Clave IN ('DB_AUX_SERVER', 'DB_AUX_DATABASE', 'DB_AUX_USERNAME')
        `);

        const config = {};
        result.recordset.forEach(row => {
            const key = row.Clave.replace('DB_AUX_', '').toLowerCase();
            config[key] = row.Valor;
        });

        res.json(config);
    } catch (err) {
        console.error('Error getting auxiliary DB config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/db-config/test-auxiliary - Test auxiliary DB connection
router.post('/db-config/test-auxiliary', async (req, res) => {
    try {
        const { server, database, username, password } = req.body;

        if (!server || !database) {
            return res.status(400).json({ error: 'Server y Database son requeridos' });
        }

        const testConfig = {
            user: username || 'sa',
            password: password || '',
            server: server,
            database: database,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };

        const result = await dbManager.testConnection(testConfig);
        res.json(result);
    } catch (err) {
        console.error('Error testing auxiliary DB connection:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/db-status - Get current database status
router.get('/db-status', async (req, res) => {
    try {
        const status = dbManager.getCurrentStatus();
        res.json(status);
    } catch (err) {
        console.error('Error getting DB status:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/db-sync - Synchronize data from primary to auxiliary
router.post('/db-sync', async (req, res) => {
    try {
        // Load auxiliary config
        await dbManager.loadAuxiliaryConfig();

        if (!dbManager.auxiliaryConfig) {
            return res.status(400).json({ error: 'No hay configuración de BD auxiliar' });
        }

        // Test auxiliary connection
        const testResult = await dbManager.testConnection(dbManager.auxiliaryConfig);
        if (!testResult.success) {
            return res.status(400).json({
                error: 'No se puede conectar a la BD auxiliar',
                details: testResult.message
            });
        }

        console.log('🔄 Starting database synchronization...');

        // Get primary pool and create auxiliary pool
        const primaryPool = dbManager.getActivePool();
        const auxPool = await new sql.ConnectionPool(dbManager.auxiliaryConfig).connect();

        const syncStats = {};

        try {
            // 1. Sync RSM_ALCANCE_DIARIO (only >= 2026)
            console.log('📊 Syncing RSM_ALCANCE_DIARIO...');

            const alcanceData = await primaryPool.request().query(`
                SELECT * FROM RSM_ALCANCE_DIARIO WHERE Año >= 2026
            `);

            await auxPool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RSM_ALCANCE_DIARIO' AND xtype='U')
                CREATE TABLE RSM_ALCANCE_DIARIO (
                    Fecha DATE,
                    Año INT,
                    Mes INT,
                    Dia INT,
                    Local NVARCHAR(255),
                    CODALMACEN NVARCHAR(50),
                    Canal NVARCHAR(50),
                    Tipo NVARCHAR(50),
                    MontoReal DECIMAL(18,2),
                    Monto DECIMAL(18,2),
                    Monto_Acumulado DECIMAL(18,2),
                    MontoAnterior DECIMAL(18,2),
                    MontoAnterior_Acumulado DECIMAL(18,2),
                    MontoAnteriorAjustado DECIMAL(18,2),
                    MontoAnteriorAjustado_Acumulado DECIMAL(18,2)
                )
            `);

            if (alcanceData.recordset.length > 0) {
                await auxPool.request().query(`TRUNCATE TABLE RSM_ALCANCE_DIARIO`);

                // Batch insert for better performance
                for (let i = 0; i < alcanceData.recordset.length; i += 1000) {
                    const batch = alcanceData.recordset.slice(i, i + 1000);
                    const values = batch.map((_, idx) => {
                        const offset = i + idx;
                        return `(@Fecha${offset}, @Año${offset}, @Mes${offset}, @Dia${offset}, @Local${offset}, @CODALMACEN${offset}, @Canal${offset}, @Tipo${offset}, @MontoReal${offset}, @Monto${offset}, @Monto_Acumulado${offset}, @MontoAnterior${offset}, @MontoAnterior_Acumulado${offset}, @MontoAnteriorAjustado${offset}, @MontoAnteriorAjustado_Acumulado${offset})`;
                    }).join(',');

                    const request = auxPool.request();
                    batch.forEach((row, idx) => {
                        const offset = i + idx;
                        request.input(`Fecha${offset}`, sql.Date, row.Fecha);
                        request.input(`Año${offset}`, sql.Int, row.Año);
                        request.input(`Mes${offset}`, sql.Int, row.Mes);
                        request.input(`Dia${offset}`, sql.Int, row.Dia);
                        request.input(`Local${offset}`, sql.NVarChar, row.Local);
                        request.input(`CODALMACEN${offset}`, sql.NVarChar, row.CODALMACEN);
                        request.input(`Canal${offset}`, sql.NVarChar, row.Canal);
                        request.input(`Tipo${offset}`, sql.NVarChar, row.Tipo);
                        request.input(`MontoReal${offset}`, sql.Decimal(18, 2), row.MontoReal);
                        request.input(`Monto${offset}`, sql.Decimal(18, 2), row.Monto);
                        request.input(`Monto_Acumulado${offset}`, sql.Decimal(18, 2), row.Monto_Acumulado);
                        request.input(`MontoAnterior${offset}`, sql.Decimal(18, 2), row.MontoAnterior);
                        request.input(`MontoAnterior_Acumulado${offset}`, sql.Decimal(18, 2), row.MontoAnterior_Acumulado);
                        request.input(`MontoAnteriorAjustado${offset}`, sql.Decimal(18, 2), row.MontoAnteriorAjustado);
                        request.input(`MontoAnteriorAjustado_Acumulado${offset}`, sql.Decimal(18, 2), row.MontoAnteriorAjustado_Acumulado);
                    });

                    await request.query(`
                        INSERT INTO RSM_ALCANCE_DIARIO VALUES ${values}
                    `);
                }
            }

            syncStats.RSM_ALCANCE_DIARIO = alcanceData.recordset.length;
            console.log(`✅ Synced ${alcanceData.recordset.length} records from RSM_ALCANCE_DIARIO`);

            // 2. Sync APP_USUARIOS (all records)
            console.log('👥 Syncing APP_USUARIOS...');
            const usuariosData = await primaryPool.request().query(`SELECT * FROM APP_USUARIOS`);

            await auxPool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIOS' AND xtype='U')
                CREATE TABLE APP_USUARIOS (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Email NVARCHAR(255) UNIQUE NOT NULL,
                    Nombre NVARCHAR(255) NOT NULL,
                    Clave NVARCHAR(10) NOT NULL,
                    Activo BIT DEFAULT 1,
                    AccesoTendencia BIT DEFAULT 0,
                    AccesoTactica BIT DEFAULT 0,
                    AccesoEventos BIT DEFAULT 0,
                    AccesoPresupuesto BIT DEFAULT 1,
                    AccesoTiempos BIT DEFAULT 0,
                    AccesoEvaluaciones BIT DEFAULT 0,
                    AccesoInventarios BIT DEFAULT 0,
                    EsAdmin BIT DEFAULT 0,
                    EsProtegido BIT DEFAULT 0,
                    DashboardLocales NVARCHAR(MAX),
                    ComparativePeriod VARCHAR(20) DEFAULT 'Month'
                )
            `);

            if (usuariosData.recordset.length > 0) {
                await auxPool.request().query(`DELETE FROM APP_USUARIOS`);
                await auxPool.request().query(`DBCC CHECKIDENT ('APP_USUARIOS', RESEED, 0)`);

                for (const user of usuariosData.recordset) {
                    await auxPool.request()
                        .input('Email', sql.NVarChar, user.Email)
                        .input('Nombre', sql.NVarChar, user.Nombre)
                        .input('Clave', sql.NVarChar, user.Clave)
                        .input('Activo', sql.Bit, user.Activo)
                        .input('AccesoTendencia', sql.Bit, user.AccesoTendencia)
                        .input('AccesoTactica', sql.Bit, user.AccesoTactica)
                        .input('AccesoEventos', sql.Bit, user.AccesoEventos)
                        .input('AccesoPresupuesto', sql.Bit, user.AccesoPresupuesto)
                        .input('AccesoTiempos', sql.Bit, user.AccesoTiempos)
                        .input('AccesoEvaluaciones', sql.Bit, user.AccesoEvaluaciones)
                        .input('AccesoInventarios', sql.Bit, user.AccesoInventarios)
                        .input('EsAdmin', sql.Bit, user.EsAdmin)
                        .input('EsProtegido', sql.Bit, user.EsProtegido)
                        .input('DashboardLocales', sql.NVarChar, user.DashboardLocales)
                        .input('ComparativePeriod', sql.VarChar, user.ComparativePeriod)
                        .query(`
                            INSERT INTO APP_USUARIOS (Email, Nombre, Clave, Activo, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, EsAdmin, EsProtegido, DashboardLocales, ComparativePeriod)
                            VALUES (@Email, @Nombre, @Clave, @Activo, @AccesoTendencia, @AccesoTactica, @AccesoEventos, @AccesoPresupuesto, @AccesoTiempos, @AccesoEvaluaciones, @AccesoInventarios, @EsAdmin, @EsProtegido, @DashboardLocales, @ComparativePeriod)
                        `);
                }
            }

            syncStats.APP_USUARIOS = usuariosData.recordset.length;
            console.log(`✅ Synced ${usuariosData.recordset.length} records from APP_USUARIOS`);


            // 3. Sync APP_USUARIO_CANAL (user-channel associations)
            console.log(' Syncing APP_USUARIO_CANAL...');
            const canalData = await primaryPool.request().query(`SELECT * FROM APP_USUARIO_CANAL`);

            await auxPool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIO_CANAL' AND xtype='U')
                CREATE TABLE APP_USUARIO_CANAL (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    UsuarioId INT NOT NULL,
                    Canal NVARCHAR(50) NOT NULL,
                    UNIQUE(UsuarioId, Canal)
                )
            `);

            if (canalData.recordset.length > 0) {
                await auxPool.request().query(`DELETE FROM APP_USUARIO_CANAL`);

                for (const row of canalData.recordset) {
                    await auxPool.request()
                        .input('UsuarioId', sql.Int, row.UsuarioId)
                        .input('Canal', sql.NVarChar, row.Canal)
                        .query(`
                            INSERT INTO APP_USUARIO_CANAL (UsuarioId, Canal)
                            VALUES (@UsuarioId, @Canal)
                        `);
                }
            }

            syncStats.APP_USUARIO_CANAL = canalData.recordset.length;
            console.log(` Synced ${canalData.recordset.length} records from APP_USUARIO_CANAL`);
            // Close auxiliary connection
            await auxPool.close();

            console.log('✅ Database synchronization completed');
            res.json({
                success: true,
                message: 'Sincronización completada',
                stats: syncStats
            });

        } catch (syncErr) {
            await auxPool.close();
            throw syncErr;
        }

    } catch (err) {
        console.error('Error in database sync:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
