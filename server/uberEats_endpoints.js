/**
 * uberEats_endpoints.js
 * REST API endpoints for Uber Eats integration
 * Registered via registerUberEatsEndpoints(app, authMiddleware)
 */
const { getUberEatsPool, sql } = require('./uberEatsDb');
const uberEatsService = require('./services/uberEatsService');
const uberEatsCron = require('./jobs/uberEatsCron');
const crypto = require('crypto');

function getEncKey() {
    const k = process.env.DB_ENCRYPTION_KEY || 'default-key-change-in-production-32';
    return Buffer.from(k.padEnd(32, '0').substring(0, 32));
}
function encryptValue(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncKey(), iv);
    return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function requireAdmin(req, res) {
    if (!req.user?.esAdmin) {
        res.status(403).json({ error: 'Se requiere acceso de administrador' });
        return false;
    }
    return true;
}

function registerUberEatsEndpoints(app, authMiddleware) {

    // ══════════════════════════════════════════
    // CONFIG
    // ══════════════════════════════════════════

    // GET /api/uber-eats/config — Read all config keys (no secret)
    app.get('/api/uber-eats/config', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getUberEatsPool();
            const result = await pool.request().query(
                `SELECT ConfigKey, ConfigValue, Descripcion, FechaModificacion FROM UberEatsConfig`
            );
            // Mask the secret
            const config = {};
            result.recordset.forEach(r => {
                config[r.ConfigKey] = {
                    value: r.ConfigKey === 'CLIENT_SECRET'
                        ? (r.ConfigValue ? '••••••••' : null)
                        : r.ConfigValue,
                    descripcion: r.Descripcion,
                    fechaModificacion: r.FechaModificacion
                };
            });
            res.json(config);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/uber-eats/config — Save configuration
    // Body: { clientId?, clientSecret?, syncEnabled?, syncHour?, daysBack? }
    app.post('/api/uber-eats/config', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            console.log('📝 UberEats config save - body:', JSON.stringify({
                clientId: req.body.clientId ? `[${req.body.clientId.length} chars]` : undefined,
                clientSecret: req.body.clientSecret ? '[SET]' : undefined,
                syncEnabled: req.body.syncEnabled,
                syncHour: req.body.syncHour,
                daysBack: req.body.daysBack,
                reportTypes: req.body.reportTypes
            }));
            const pool = await getUberEatsPool();
            console.log('📝 UberEats DB pool connected:', pool.connected);
            const { clientId, clientSecret, syncEnabled, syncHour, daysBack, reportTypes } = req.body;

            async function setKey(key, value) {
                await pool.request()
                    .input('k', sql.NVarChar, key)
                    .input('v', sql.NVarChar, value)
                    .query(`
                        MERGE UberEatsConfig AS t USING (SELECT @k AS k) AS s ON t.ConfigKey = s.k
                        WHEN MATCHED THEN UPDATE SET ConfigValue = @v, FechaModificacion = GETDATE()
                        WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue) VALUES (@k, @v);
                    `);
            }

            if (clientId !== undefined) {
                console.log('📝 Saving CLIENT_ID:', clientId);
                await setKey('CLIENT_ID', clientId);
            }
            if (clientSecret !== undefined && clientSecret !== '') {
                console.log('📝 Saving CLIENT_SECRET (encrypted)');
                await setKey('CLIENT_SECRET', encryptValue(clientSecret));
            }
            if (syncEnabled !== undefined) {
                console.log('📝 Saving SYNC_ENABLED:', syncEnabled);
                await setKey('SYNC_ENABLED', syncEnabled ? 'true' : 'false');
            }
            if (syncHour !== undefined) {
                console.log('📝 Saving SYNC_HOUR:', syncHour);
                await setKey('SYNC_HOUR', String(syncHour));
            }
            if (daysBack !== undefined) {
                console.log('📝 Saving DAYS_BACK:', daysBack);
                await setKey('DAYS_BACK', String(daysBack));
            }
            if (reportTypes !== undefined) {
                console.log('📝 Saving REPORT_TYPES:', reportTypes);
                await setKey('REPORT_TYPES', String(reportTypes));
            }

            // Reset service so it re-reads from DB
            uberEatsService.initialized = false;
            uberEatsService.accessToken = null;

            // Restart cron if sync settings changed
            if (syncEnabled !== undefined || syncHour !== undefined) {
                await uberEatsCron.restart();
            }

            console.log('✅ UberEats config saved successfully');
            res.json({ success: true, message: 'Configuración guardada' });
        } catch (err) {
            console.error('❌ UberEats config save error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // STORES
    // ══════════════════════════════════════════

    // GET /api/uber-eats/stores
    app.get('/api/uber-eats/stores', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getUberEatsPool();
            const result = await pool.request().query(
                `SELECT Id, StoreId, Nombre, Activo, FechaCreacion FROM UberEatsStores ORDER BY FechaCreacion`
            );
            res.json(result.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/uber-eats/stores — Add store
    app.post('/api/uber-eats/stores', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { storeId, nombre } = req.body;
            if (!storeId) return res.status(400).json({ error: 'storeId es requerido' });
            const pool = await getUberEatsPool();
            await pool.request()
                .input('sid', sql.NVarChar(255), storeId.trim())
                .input('nom', sql.NVarChar(255), nombre || storeId.trim())
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM UberEatsStores WHERE StoreId = @sid)
                        INSERT INTO UberEatsStores (StoreId, Nombre) VALUES (@sid, @nom)
                    ELSE
                        UPDATE UberEatsStores SET Nombre = @nom, Activo = 1 WHERE StoreId = @sid
                `);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/uber-eats/stores/:id — Update store (nombre / activo)
    app.put('/api/uber-eats/stores/:id', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { nombre, activo } = req.body;
            const pool = await getUberEatsPool();
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .input('nombre', sql.NVarChar(255), nombre)
                .input('activo', sql.Bit, activo ? 1 : 0)
                .query(`UPDATE UberEatsStores SET Nombre = @nombre, Activo = @activo WHERE Id = @id`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/uber-eats/stores/:id
    app.delete('/api/uber-eats/stores/:id', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getUberEatsPool();
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query(`DELETE FROM UberEatsStores WHERE Id = @id`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // CONNECTION TEST & SYNC
    // ══════════════════════════════════════════

    // POST /api/uber-eats/test — Test API connection
    app.post('/api/uber-eats/test', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await uberEatsService.testConnection();
            res.json(result);
        } catch (err) {
            res.json({ success: false, message: err.message });
        }
    });

    // POST /api/uber-eats/sync — Manual sync
    app.post('/api/uber-eats/sync', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            // Run async, respond immediately
            const { startDate, endDate } = req.body;
            res.json({ success: true, message: 'Sincronización iniciada. Revisa el log en unos minutos.' });
            // Fire and forget
            uberEatsService.syncDailyReports('MANUAL').catch(err => {
                console.error('❌ Manual UberEats sync failed:', err.message);
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/uber-eats/sync-status
    app.get('/api/uber-eats/sync-status', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getUberEatsPool();
            const lastSync = await pool.request().query(
                `SELECT TOP 1 * FROM UberEatsSyncLog ORDER BY FechaEjecucion DESC`
            );
            const lastSyncConfig = await pool.request().query(
                `SELECT ConfigValue FROM UberEatsConfig WHERE ConfigKey = 'LAST_SYNC'`
            );
            res.json({
                cron: uberEatsCron.getStatus(),
                lastSync: lastSync.recordset[0] || null,
                lastSyncTime: lastSyncConfig.recordset[0]?.ConfigValue || null
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/uber-eats/sync-log — Last N sync log entries
    app.get('/api/uber-eats/sync-log', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getUberEatsPool();
            const limit = parseInt(req.query.limit) || 20;
            const result = await pool.request()
                .input('lim', sql.Int, limit)
                .query(`SELECT TOP (@lim) * FROM UberEatsSyncLog ORDER BY FechaEjecucion DESC`);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // DATA / DASHBOARD
    // ══════════════════════════════════════════

    // GET /api/uber-eats/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=
    app.get('/api/uber-eats/dashboard', authMiddleware, async (req, res) => {
        try {
            const pool = await getUberEatsPool();
            const { from, to, storeId } = req.query;

            const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
            const toDate = to || new Date().toISOString().split('T')[0];

            let storeFilter = '';
            const request = pool.request()
                .input('from', sql.Date, fromDate)
                .input('to', sql.Date, toDate);

            if (storeId) {
                storeFilter = 'AND StoreId = @storeId';
                request.input('storeId', sql.NVarChar(255), storeId);
            }

            const result = await request.query(`
                SELECT
                    COUNT(*)           AS TotalOrdenes,
                    SUM(VentaBruta)    AS VentaBruta,
                    SUM(NetoPagado)    AS NetoPagado,
                    SUM(ComisionUber)  AS ComisionUber,
                    SUM(Descuentos)    AS Descuentos,
                    SUM(Impuestos)     AS Impuestos,
                    AVG(VentaBruta)    AS TicketPromedio,
                    CASE WHEN SUM(VentaBruta) > 0
                         THEN ROUND(SUM(ComisionUber) / SUM(VentaBruta) * 100, 2)
                         ELSE 0 END   AS PorcentajeComision
                FROM UberEatsOrdenes
                WHERE FechaPedido BETWEEN @from AND @to ${storeFilter}
            `);

            // By store breakdown
            const byStore = await pool.request()
                .input('from', sql.Date, fromDate)
                .input('to', sql.Date, toDate)
                .query(`
                    SELECT
                        StoreId, NombreLocal,
                        COUNT(*)        AS Ordenes,
                        SUM(VentaBruta) AS VentaBruta,
                        SUM(NetoPagado) AS NetoPagado,
                        AVG(VentaBruta) AS TicketPromedio
                    FROM UberEatsOrdenes
                    WHERE FechaPedido BETWEEN @from AND @to
                    GROUP BY StoreId, NombreLocal
                    ORDER BY VentaBruta DESC
                `);

            // Daily trend
            const diario = await pool.request()
                .input('from', sql.Date, fromDate)
                .input('to', sql.Date, toDate)
                .query(`
                    SELECT
                        CAST(FechaPedido AS DATE) AS Fecha,
                        COUNT(*)        AS Ordenes,
                        SUM(VentaBruta) AS VentaBruta,
                        SUM(NetoPagado) AS NetoPagado
                    FROM UberEatsOrdenes
                    WHERE FechaPedido BETWEEN @from AND @to
                    GROUP BY CAST(FechaPedido AS DATE)
                    ORDER BY Fecha
                `);

            res.json({
                periodo: { from: fromDate, to: toDate },
                totales: result.recordset[0],
                porLocal: byStore.recordset,
                tendenciaDiaria: diario.recordset
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/uber-eats/ordenes — Paginated order detail
    app.get('/api/uber-eats/ordenes', authMiddleware, async (req, res) => {
        try {
            const pool = await getUberEatsPool();
            const { from, to, storeId, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
            const toDate = to || new Date().toISOString().split('T')[0];

            const request = pool.request()
                .input('from', sql.Date, fromDate)
                .input('to', sql.Date, toDate)
                .input('limit', sql.Int, parseInt(limit))
                .input('offset', sql.Int, offset);

            let storeFilter = '';
            if (storeId) {
                storeFilter = 'AND StoreId = @storeId';
                request.input('storeId', sql.NVarChar(255), storeId);
            }

            const result = await request.query(`
                SELECT *
                FROM UberEatsOrdenes
                WHERE FechaPedido BETWEEN @from AND @to ${storeFilter}
                ORDER BY FechaPedido DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `);

            const total = await pool.request()
                .input('from', sql.Date, fromDate)
                .input('to', sql.Date, toDate)
                .query(`SELECT COUNT(*) AS Total FROM UberEatsOrdenes WHERE FechaPedido BETWEEN @from AND @to ${storeFilter.includes('@storeId') ? '' : ''}`);

            res.json({
                data: result.recordset,
                total: total.recordset[0].Total,
                page: parseInt(page),
                limit: parseInt(limit)
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    console.log('📋 Uber Eats endpoints registered');
}

module.exports = registerUberEatsEndpoints;
