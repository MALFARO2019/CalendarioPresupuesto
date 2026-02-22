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

    // Get synced data for a view (from DB) — paginated
    app.get('/api/invgate/views/:id/data', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 100;
            const data = await invgateSyncService.getViewData(parseInt(req.params.id), page, pageSize);
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── In-memory tracking for background syncs ──
    const viewSyncStatus = {}; // { viewId: { status: 'running'|'done'|'error', startedAt, message, result } }

    // Sync a single view (fire-and-forget — runs in background)
    app.post('/api/invgate/views/:id/sync', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const viewId = parseInt(req.params.id);

        if (viewSyncStatus[viewId]?.status === 'running') {
            return res.json({ status: 'already_running', message: 'Sync ya en progreso para esta vista' });
        }

        // Start in background
        viewSyncStatus[viewId] = { status: 'running', startedAt: new Date().toISOString(), message: 'Sincronización iniciada...' };
        res.json({ status: 'started', message: 'Sincronización iniciada en segundo plano' });

        // Run async — don't await
        invgateSyncService.syncSingleView(viewId)
            .then(result => {
                viewSyncStatus[viewId] = {
                    status: 'done',
                    startedAt: viewSyncStatus[viewId]?.startedAt,
                    finishedAt: new Date().toISOString(),
                    message: `✅ ${result.totalNew || 0} nuevos, ${result.totalUpdated || 0} actualizados`,
                    result
                };
                console.log(`✅ Background sync for view ${viewId} completed:`, result);
            })
            .catch(err => {
                viewSyncStatus[viewId] = {
                    status: 'error',
                    startedAt: viewSyncStatus[viewId]?.startedAt,
                    finishedAt: new Date().toISOString(),
                    message: `❌ ${err.message}`
                };
                console.error(`❌ Background sync for view ${viewId} failed:`, err.message);
            });
    });

    // Poll sync status for a view
    app.get('/api/invgate/views/:id/sync-status', authMiddleware, async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const viewId = parseInt(req.params.id);
        const status = viewSyncStatus[viewId] || { status: 'idle' };
        res.json(status);

        // ──────────────────────────────────────────
        // VIEW MAPPINGS — Persona & CodAlmacen
        // ──────────────────────────────────────────

        // Get mappings for a view
        app.get('/api/invgate/views/:id/mappings', authMiddleware, async (req, res) => {
            if (!requireAdmin(req, res)) return;
            try {
                await invgateMappingService.ensureMappingTable();
                const mappings = await invgateMappingService.getMappings(parseInt(req.params.id));
                res.json(mappings);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // Set a mapping for a view
        app.post('/api/invgate/views/:id/mappings', authMiddleware, async (req, res) => {
            if (!requireAdmin(req, res)) return;
            try {
                await invgateMappingService.ensureMappingTable();
                const { fieldType, columnName } = req.body;
                if (!fieldType || !columnName) return res.status(400).json({ error: 'fieldType y columnName son requeridos' });
                await invgateMappingService.setMapping(parseInt(req.params.id), fieldType, columnName, req.user?.nombre || 'admin');
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

        // Get unmapped records for a view
        app.get('/api/invgate/views/:id/unmapped', authMiddleware, async (req, res) => {
            if (!requireAdmin(req, res)) return;
            try {
                const data = await invgateMappingService.getUnmappedRecords(parseInt(req.params.id));
                res.json(data);
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

        // Get mapping stats for a view
        app.get('/api/invgate/views/:id/mapping-stats', authMiddleware, async (req, res) => {
            if (!requireAdmin(req, res)) return;
            try {
                const stats = await invgateMappingService.getMappingStats(parseInt(req.params.id));
                res.json(stats);
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
                const syncType = req.body.syncType || req.body.type || 'full';
                if (syncType === 'incremental') {
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

                const countResult = await pool.request()
                    .query(`SELECT COUNT(*) AS Total FROM InvgateTickets WHERE ${where.replace(/@hdId|@status/g, '0')}`);

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

        console.log('📋 InvGate endpoints registered');
    }


module.exports = registerInvgateEndpoints;
