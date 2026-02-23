/**
 * invgate_endpoints.js
 * REST API endpoints for InvGate Service Management integration
 * Registered via registerInvgateEndpoints(app, authMiddleware)
 */
const { getInvgatePool, sql } = require('./invgateDb');
const invgateService = require('./services/invgateService');
const invgateSyncService = require('./services/invgateSyncService');
const invgateCron = require('./jobs/invgateCron');
const invgateMappingService = require('./services/invgateMappingService');
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
function decryptValue(encrypted) {
    if (!encrypted || !encrypted.includes(':')) return encrypted;
    const [ivHex, enc] = encrypted.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncKey(), Buffer.from(ivHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
}

function requireAdmin(req, res) {
    if (!req.user?.esAdmin) {
        res.status(403).json({ error: 'Se requiere acceso de administrador' });
        return false;
    }
    return true;
}

function registerInvgateEndpoints(app, authMiddleware) {

    // ══════════════════════════════════════════
    // CONFIG — OAuth credentials
    // ══════════════════════════════════════════

    app.get('/api/invgate/config', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(
                'SELECT ConfigKey, ConfigValue FROM InvgateConfig'
            );
            const config = {};
            result.recordset.forEach(r => {
                config[r.ConfigKey.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())] =
                    r.ConfigKey === 'CLIENT_SECRET' ? (r.ConfigValue ? '••••' : '') : r.ConfigValue;
            });
            res.json(config);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/invgate/config', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getInvgatePool();
            const { clientId, clientSecret, tokenUrl, apiBaseUrl, syncInterval, syncEnabled } = req.body;

            async function setKey(key, value) {
                await pool.request()
                    .input('k', sql.NVarChar, key)
                    .input('v', sql.NVarChar, value)
                    .query(`
                        MERGE InvgateConfig AS t USING (SELECT @k AS k) AS s ON t.ConfigKey = s.k
                        WHEN MATCHED THEN UPDATE SET ConfigValue = @v
                        WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue) VALUES (@k, @v);
                    `);
            }

            if (clientId !== undefined) await setKey('CLIENT_ID', clientId);
            if (clientSecret && clientSecret !== '••••') await setKey('CLIENT_SECRET', encryptValue(clientSecret));
            if (tokenUrl !== undefined) await setKey('TOKEN_URL', tokenUrl);
            if (apiBaseUrl !== undefined) await setKey('API_BASE_URL', apiBaseUrl);
            if (syncInterval !== undefined) await setKey('SYNC_INTERVAL_HOURS', String(syncInterval));
            if (syncEnabled !== undefined) await setKey('SYNC_ENABLED', syncEnabled ? 'true' : 'false');

            // Force service to reload credentials
            invgateService.accessToken = null;
            invgateService.tokenExpiry = null;

            // Restart cron with new settings
            if (syncInterval !== undefined || syncEnabled !== undefined) {
                await invgateCron.restart();
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // CONNECTION TEST
    // ══════════════════════════════════════════

    app.post('/api/invgate/test-connection', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await invgateService.testConnection();
            res.json(result);
        } catch (err) {
            res.json({ success: false, message: err.message });
        }
    });

    // ══════════════════════════════════════════
    // HELPDESKS (Solicitudes)
    // ══════════════════════════════════════════

    app.get('/api/invgate/helpdesks', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            // Try API first, fall back to local DB
            let helpdesks = [];
            let apiError = null;
            try {
                const apiHelpdesks = await invgateService.getHelpdesks();
                // Sync to DB while we're at it
                const pool = await getInvgatePool();
                for (const hd of apiHelpdesks) {
                    await pool.request()
                        .input('id', sql.Int, hd.id)
                        .input('nombre', sql.NVarChar, hd.name || '')
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM InvgateHelpdesks WHERE HelpdeskID = @id)
                                INSERT INTO InvgateHelpdesks (HelpdeskID, Nombre) VALUES (@id, @nombre)
                            ELSE
                                UPDATE InvgateHelpdesks SET Nombre = @nombre WHERE HelpdeskID = @id
                        `);
                }
            } catch (e) {
                apiError = e.message;
            }
            // Always return from DB (has SyncEnabled flag)
            const pool = await getInvgatePool();
            const result = await pool.request().query(`
                SELECT h.HelpdeskID as id, h.Nombre as name, h.SyncEnabled as syncEnabled,
                       ISNULL((SELECT COUNT(*) FROM InvgateTickets t WHERE t.HelpdeskID = h.HelpdeskID), 0) as totalTickets
                FROM InvgateHelpdesks h ORDER BY h.Nombre
            `);
            helpdesks = result.recordset.map(r => ({
                id: r.id, name: r.name, syncEnabled: !!r.syncEnabled, totalTickets: r.totalTickets
            }));
            res.json({ helpdesks, apiError });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.put('/api/invgate/helpdesks/:id/toggle', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await getInvgatePool();
            const { enabled, name } = req.body;
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .input('enabled', sql.Bit, enabled ? 1 : 0)
                .query('UPDATE InvgateHelpdesks SET SyncEnabled = @enabled WHERE HelpdeskID = @id');
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // VIEWS — Configuration & Data
    // ══════════════════════════════════════════

    // List configured views
    app.get('/api/invgate/views', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            res.json(await invgateSyncService.getViewConfigs());
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Add/update a view
    app.post('/api/invgate/views', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { viewId, nombre, columns } = req.body;
            if (!viewId || !nombre) return res.status(400).json({ error: 'viewId y nombre son requeridos' });
            const result = await invgateSyncService.saveView(parseInt(viewId), nombre, columns || []);
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a view
    app.delete('/api/invgate/views/:id', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            await invgateSyncService.deleteView(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Toggle sync for a view
    app.put('/api/invgate/views/:id/toggle', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { enabled } = req.body;
            await invgateSyncService.toggleView(parseInt(req.params.id), enabled);
            res.json({ success: true, viewId: parseInt(req.params.id), enabled });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Preview live data from a view (from InvGate API)
    app.get('/api/invgate/views/:id/preview', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const preview = await invgateService.getViewPreview(parseInt(req.params.id));
            res.json(preview);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Sync a single view
    app.post('/api/invgate/views/:id/sync', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const viewId = parseInt(req.params.id);
            const result = await invgateSyncService.syncSingleView(viewId, 'MANUAL');
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get synced data for a view (from DB)
    app.get('/api/invgate/views/:id/data', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const data = await invgateSyncService.getViewData(parseInt(req.params.id));
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // SYNC — Manual triggers & status
    // ══════════════════════════════════════════

    app.post('/api/invgate/sync', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { type } = req.body;
            if (type === 'incremental') {
                const result = await invgateSyncService.incrementalSync('MANUAL');
                res.json(result);
            } else {
                const result = await invgateSyncService.fullSync('MANUAL');
                res.json(result);
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/invgate/sync-status', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const cronStatus = invgateCron.getStatus();
            const lastSync = await invgateSyncService.getLastSyncStatus();
            res.json({ cron: cronStatus, lastSync });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/invgate/sync-logs', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const logs = await invgateSyncService.getSyncLogs(parseInt(req.query.limit) || 20);
            res.json(logs);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // TICKETS — Query data
    // ══════════════════════════════════════════

    app.get('/api/invgate/tickets', authMiddleware, async (req, res) => {
        try {
            const pool = await getInvgatePool();
            const { helpdeskId, status, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let where = '1=1';
            const request = pool.request()
                .input('limit', sql.Int, parseInt(limit))
                .input('offset', sql.Int, offset);

            if (helpdeskId) {
                where += ' AND HelpdeskID = @hdId';
                request.input('hdId', sql.Int, parseInt(helpdeskId));
            }
            if (status) {
                where += ' AND Estado = @status';
                request.input('status', sql.NVarChar, status);
            }

            const result = await request.query(`
                SELECT * FROM InvgateTickets WHERE ${where}
                ORDER BY FechaCreacion DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `);

            const countReq = pool.request();
            if (helpdeskId) countReq.input('hdId', sql.Int, parseInt(helpdeskId));
            if (status) countReq.input('status', sql.NVarChar, status);
            const countResult = await countReq.query(`SELECT COUNT(*) AS Total FROM InvgateTickets WHERE ${where}`);

            res.json({
                data: result.recordset,
                total: countResult.recordset[0]?.Total || result.recordset.length,
                page: parseInt(page),
                limit: parseInt(limit)
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // REPORTS — Dashboard-style aggregations
    // ══════════════════════════════════════════

    app.get('/api/invgate/reports/summary', authMiddleware, async (req, res) => {
        try {
            const pool = await getInvgatePool();
            const { from, to, helpdeskId } = req.query;

            let where = '1=1';
            const request = pool.request();
            if (from) { where += ' AND FechaCreacion >= @from'; request.input('from', sql.DateTime, new Date(from)); }
            if (to) { where += ' AND FechaCreacion <= @to'; request.input('to', sql.DateTime, new Date(to)); }
            if (helpdeskId) { where += ' AND HelpdeskID = @hdId'; request.input('hdId', sql.Int, parseInt(helpdeskId)); }

            const result = await request.query(`
                SELECT
                    COUNT(*) AS TotalTickets,
                    SUM(CASE WHEN Estado IN ('closed', '3', '4') THEN 1 ELSE 0 END) AS Cerrados,
                    SUM(CASE WHEN Estado NOT IN ('closed', '3', '4') THEN 1 ELSE 0 END) AS Abiertos,
                    AVG(TiempoResolucion) AS AvgResolucion,
                    AVG(TiempoRespuesta) AS AvgRespuesta
                FROM InvgateTickets WHERE ${where}
            `);
            res.json(result.recordset[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════
    // MAPPINGS — Field mapping config & resolution
    // ══════════════════════════════════════════

    // Ensure mapping config table exists on startup
    invgateMappingService.ensureMappingTable().catch(e =>
        console.warn('⚠️ Could not ensure InvgateViewMappings table:', e.message)
    );

    // Get mappings for a view
    app.get('/api/invgate/views/:id/mappings', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const mappings = await invgateMappingService.getMappings(parseInt(req.params.id));
            res.json(mappings);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Set a mapping (fieldType: 'PERSONA' | 'CODALMACEN')
    app.post('/api/invgate/views/:id/mappings', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { fieldType, columnName } = req.body;
            if (!fieldType || !columnName) {
                return res.status(400).json({ error: 'fieldType y columnName son requeridos' });
            }
            await invgateMappingService.setMapping(
                parseInt(req.params.id), fieldType, columnName,
                req.user?.nombre || req.user?.email || 'ADMIN'
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a mapping
    app.delete('/api/invgate/views/:id/mappings/:fieldType', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            await invgateMappingService.deleteMapping(parseInt(req.params.id), req.params.fieldType);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Resolve all mappings for a view
    app.post('/api/invgate/views/:id/resolve-mappings', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await invgateMappingService.resolveAllMappings(parseInt(req.params.id));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get unmapped records for a view
    app.get('/api/invgate/views/:id/unmapped', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await invgateMappingService.getUnmappedRecords(parseInt(req.params.id));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get mapping stats for a view
    app.get('/api/invgate/views/:id/mapping-stats', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await invgateMappingService.getMappingStats(parseInt(req.params.id));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Manual persona mapping: directly map a source value → user ID
    app.post('/api/invgate/views/:id/map-persona', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { sourceValue, userId, userName } = req.body;
            if (!sourceValue || !userId || !userName) {
                return res.status(400).json({ error: 'sourceValue, userId, and userName are required' });
            }
            const result = await invgateMappingService.mapPersonaManual(
                parseInt(req.params.id), sourceValue, parseInt(userId), userName
            );
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get all resolved mappings for a view (grouped by source value)
    app.get('/api/invgate/views/:id/resolved-mappings', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const result = await invgateMappingService.getResolvedMappings(parseInt(req.params.id));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Clear a resolved mapping for a specific source value
    app.delete('/api/invgate/views/:id/resolved-mappings', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { fieldType, sourceValue } = req.body;
            if (!fieldType || sourceValue === undefined) {
                return res.status(400).json({ error: 'fieldType y sourceValue son requeridos' });
            }
            const result = await invgateMappingService.clearResolvedMapping(
                parseInt(req.params.id), fieldType, sourceValue
            );
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Lookup stores for InvGate mapping dropdowns
    app.get('/api/invgate/lookup-stores', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { poolPromise } = require('./db');
            const mainPool = await poolPromise;
            const r = await mainPool.request().query(`
                SELECT DISTINCT RTRIM(gi.CODALMACEN) AS CODALMACEN, am.NOMBREALMACEN AS NOMBRE
                FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN gi
                INNER JOIN ROSTIPOLLOS_P.dbo.ALMACEN am ON am.CODALMACEN = gi.CODALMACEN
                WHERE IDGRUPO = '3000'
                ORDER BY CODALMACEN
            `);
            res.json(r.recordset.map(s => ({ CodAlmacen: s.CODALMACEN?.trim(), Nombre: s.NOMBRE?.trim() })));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Lookup active users for persona mapping dropdowns
    app.get('/api/invgate/lookup-users', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { poolPromise } = require('./db');
            const mainPool = await poolPromise;
            const r = await mainPool.request().query(
                `SELECT Id, Nombre FROM APP_USUARIOS WHERE Activo = 1 ORDER BY Nombre`
            );
            res.json(r.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Save a store alias (maps a source value → CodAlmacen)
    app.post('/api/invgate/views/:id/map-store', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const { sourceValue, codAlmacen } = req.body;
            if (!sourceValue || !codAlmacen) {
                return res.status(400).json({ error: 'sourceValue and codAlmacen are required' });
            }
            const { poolPromise, sql: mainSql } = require('./db');
            const mainPool = await poolPromise;
            // Insert into APP_STORE_ALIAS
            await mainPool.request()
                .input('alias', mainSql.NVarChar, sourceValue.trim())
                .input('cod', mainSql.NVarChar, codAlmacen.trim())
                .input('fuente', mainSql.NVarChar, 'InvGate')
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM APP_STORE_ALIAS WHERE Alias = @alias AND CodAlmacen = @cod)
                    INSERT INTO APP_STORE_ALIAS (Alias, CodAlmacen, Fuente, Activo) VALUES (@alias, @cod, @fuente, 1)
                `);
            // Re-resolve mappings for this view
            await invgateMappingService.resolveAllMappings(parseInt(req.params.id));
            const stats = await invgateMappingService.getMappingStats(parseInt(req.params.id));
            res.json({ ok: true, stats });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    console.log('📋 InvGate endpoints registered');
}

module.exports = registerInvgateEndpoints;
