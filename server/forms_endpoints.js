// ==========================================
// MICROSOFT FORMS ENDPOINTS (admin only)
// ==========================================

module.exports = function registerFormsEndpoints(app, authMiddleware) {

    const formsService = require('./services/formsService');
    const formsSyncService = require('./services/formsSyncService');
    const formsCron = require('./jobs/formsCron');
    const { getFormsPool, sql } = require('./formsDb');
    const { getTableColumns, getTableKpis, getTableName } = require('./services/formsDynamicTable');

    // ─── Azure AD Config ──────────────────────────────────────────────────────

    // GET /api/forms/config
    app.get('/api/forms/config', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const secretVal = await formsService.getConfig('CLIENT_SECRET');
            const config = {
                tenantId: await formsService.getConfig('TENANT_ID') || '',
                clientId: await formsService.getConfig('CLIENT_ID') || '',
                clientSecret: secretVal ? '••••••••' : '',
                hasSecret: !!secretVal,
                serviceAccount: await formsService.getConfig('SERVICE_ACCOUNT') || '',
                syncEnabled: (await formsService.getConfig('SYNC_ENABLED')) === 'true',
                syncInterval: parseInt(await formsService.getConfig('SYNC_INTERVAL_HOURS')) || 6,
                lastSyncDate: await formsService.getConfig('LAST_SYNC_DATE') || null
            };
            res.json(config);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/config/reveal — muestra el secret y service account en texto plano (solo admin)
    app.get('/api/forms/config/reveal', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const [secret, serviceAccount] = await Promise.all([
                formsService.getConfig('CLIENT_SECRET'),
                formsService.getConfig('SERVICE_ACCOUNT')
            ]);
            res.json({
                clientSecret: secret || '',
                serviceAccount: serviceAccount || ''
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/forms/config
    app.post('/api/forms/config', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { tenantId, clientId, clientSecret, serviceAccount, syncEnabled, syncInterval } = req.body;
            const by = req.user.email;
            if (tenantId !== undefined) await formsService.updateConfig('TENANT_ID', tenantId, by);
            if (clientId !== undefined) await formsService.updateConfig('CLIENT_ID', clientId, by);
            if (clientSecret !== undefined && clientSecret && !clientSecret.includes('•'))
                await formsService.updateConfig('CLIENT_SECRET', clientSecret, by);
            if (serviceAccount !== undefined) await formsService.updateConfig('SERVICE_ACCOUNT', serviceAccount || '', by);
            if (syncEnabled !== undefined) await formsService.updateConfig('SYNC_ENABLED', syncEnabled.toString(), by);
            if (syncInterval !== undefined) await formsService.updateConfig('SYNC_INTERVAL_HOURS', syncInterval.toString(), by);
            if (syncEnabled !== undefined || syncInterval !== undefined) await formsCron.restart();
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/forms/test-connection
    app.post('/api/forms/test-connection', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const result = await formsService.testConnection();
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── FormsSources CRUD ────────────────────────────────────────────────────

    // GET /api/forms/sources — list all configured forms
    app.get('/api/forms/sources', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const pool = await getFormsPool();

            // Get sources with count from FormResponses
            const result = await pool.request().query(`
                SELECT s.*,
                       (SELECT COUNT(*) FROM FormResponses r WHERE r.SourceID = s.SourceID) AS TotalRespuestas
                FROM FormsSources s
                ORDER BY s.CreatedAt DESC
            `);

            const sources = result.recordset;

            // For each source, get UltimaRespuesta from Frm_* table (or FormResponses as fallback)
            for (const src of sources) {
                try {
                    let tableName = src.TableName || null;

                    // Auto-discover table if TableName is missing
                    if (!tableName) {
                        const discovered = await pool.request()
                            .input('pattern', sql.NVarChar, `Frm_${src.SourceID}_%`)
                            .query(`SELECT TOP 1 name FROM sys.tables WHERE name LIKE @pattern ORDER BY name`);
                        if (discovered.recordset.length > 0) {
                            tableName = discovered.recordset[0].name;
                            // Save it back to FormsSources for future calls
                            await pool.request()
                                .input('id', sql.Int, src.SourceID)
                                .input('tbl', sql.NVarChar, tableName)
                                .query(`UPDATE FormsSources SET TableName = @tbl WHERE SourceID = @id`);
                            src.TableName = tableName;
                        }
                    }

                    if (tableName) {
                        // Verify table exists
                        const tableCheck = await pool.request()
                            .input('tname', sql.NVarChar, tableName)
                            .query(`SELECT 1 FROM sys.tables WHERE name = @tname`);
                        if (tableCheck.recordset.length > 0) {
                            const maxDate = await pool.request()
                                .query(`SELECT MAX(SubmittedAt) AS UltimaRespuesta, COUNT(*) AS total FROM [${tableName}]`);
                            src.UltimaRespuesta = maxDate.recordset[0]?.UltimaRespuesta || null;
                            src.TotalRespuestas = maxDate.recordset[0]?.total || 0;
                            continue;
                        }
                    }

                    // Fallback: FormResponses table
                    const maxDate = await pool.request()
                        .input('sid', sql.Int, src.SourceID)
                        .query(`SELECT MAX(SubmittedAt) AS UltimaRespuesta, COUNT(*) AS total FROM FormResponses WHERE SourceID = @sid`);
                    src.UltimaRespuesta = maxDate.recordset[0]?.UltimaRespuesta || null;
                    src.TotalRespuestas = maxDate.recordset[0]?.total || src.TotalRespuestas || 0;
                } catch (e) {
                    console.error(`Error getting UltimaRespuesta for source ${src.SourceID}:`, e.message);
                    src.UltimaRespuesta = null;
                }
            }

            res.json(sources);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/forms/sources — add new form source
    app.post('/api/forms/sources', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { alias, excelUrl, ownerEmail } = req.body;
            if (!alias || !excelUrl || !ownerEmail) {
                return res.status(400).json({ error: 'alias, excelUrl y ownerEmail son requeridos' });
            }
            const normalizedUrl = excelUrl.trim();
            const pool = await getFormsPool();

            // Check for duplicate URL before inserting
            const dup = await pool.request()
                .input('url', sql.NVarChar, normalizedUrl)
                .query('SELECT SourceID, Alias FROM FormsSources WHERE ExcelUrl = @url');
            if (dup.recordset.length > 0) {
                return res.status(409).json({
                    error: `Este formulario ya está configurado como "${dup.recordset[0].Alias}" (ID: ${dup.recordset[0].SourceID})`
                });
            }

            const result = await pool.request()
                .input('alias', sql.NVarChar, alias.trim())
                .input('excelUrl', sql.NVarChar, normalizedUrl)
                .input('ownerEmail', sql.NVarChar, ownerEmail.toLowerCase().trim())
                .input('by', sql.NVarChar, req.user.email)
                .query(`
                    INSERT INTO FormsSources (Alias, ExcelUrl, OwnerEmail, CreatedBy, UpdatedBy)
                    OUTPUT INSERTED.*
                    VALUES (@alias, @excelUrl, @ownerEmail, @by, @by)
                `);
            const newSource = result.recordset[0];

            // Auto-resolve DriveId/ItemId in background (fire-and-forget)
            (async () => {
                try {
                    console.log(`🔍 Auto-resolving DriveId/ItemId for "${alias}"...`);
                    const resolved = await formsService.resolveExcelFromUrl(normalizedUrl, ownerEmail.toLowerCase().trim());
                    await pool.request()
                        .input('id', sql.Int, newSource.SourceID)
                        .input('driveId', sql.NVarChar, resolved.driveId)
                        .input('itemId', sql.NVarChar, resolved.itemId)
                        .input('sheetName', sql.NVarChar, resolved.sheetName || 'Sheet1')
                        .input('by', sql.NVarChar, req.user.email)
                        .query(`
                            UPDATE FormsSources 
                            SET DriveId = @driveId, ItemId = @itemId, SheetName = @sheetName,
                                UpdatedAt = GETDATE(), UpdatedBy = @by
                            WHERE SourceID = @id
                        `);
                    console.log(`✅ Auto-resolved "${alias}": DriveId=${resolved.driveId?.substring(0, 20)}... ItemId=${resolved.itemId?.substring(0, 20)}...`);
                } catch (resolveErr) {
                    console.warn(`⚠️ Auto-resolve failed for "${alias}": ${resolveErr.message.substring(0, 120)}. User can resolve manually.`);
                }
            })();

            res.json(newSource);
        } catch (err) {
            // Catch DB-level unique constraint violation as fallback
            if (err.message.includes('duplicate key') || err.message.includes('UQ_FormsSources')) {
                return res.status(409).json({ error: 'Este formulario ya está configurado (URL duplicada)' });
            }
            res.status(500).json({ error: err.message });
        }
    });


    // PUT /api/forms/sources/:id — update form source
    app.put('/api/forms/sources/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { alias, excelUrl, ownerEmail, activo } = req.body;
            const pool = await getFormsPool();

            // Build dynamic update
            const updates = [];
            const request = pool.request().input('id', sql.Int, parseInt(req.params.id)).input('by', sql.NVarChar, req.user.email);
            if (alias !== undefined) { updates.push('Alias = @alias'); request.input('alias', sql.NVarChar, alias); }
            if (excelUrl !== undefined) {
                updates.push('ExcelUrl = @excelUrl'); request.input('excelUrl', sql.NVarChar, excelUrl);
                updates.push('DriveId = NULL');
                updates.push('ItemId = NULL');
            } // reset resolved IDs when URL changes
            if (ownerEmail !== undefined) { updates.push('OwnerEmail = @ownerEmail'); request.input('ownerEmail', sql.NVarChar, ownerEmail.toLowerCase().trim()); }
            if (activo !== undefined) { updates.push('Activo = @activo'); request.input('activo', sql.Bit, activo ? 1 : 0); }
            updates.push('UpdatedAt = GETDATE()', 'UpdatedBy = @by');

            const result = await request.query(`
                UPDATE FormsSources SET ${updates.join(', ')}
                OUTPUT INSERTED.*
                WHERE SourceID = @id
            `);
            if (result.recordset.length === 0) return res.status(404).json({ error: 'Formulario no encontrado' });
            res.json(result.recordset[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/forms/sources/:id — permanently delete source and its responses
    app.delete('/api/forms/sources/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const pool = await getFormsPool();
            const id = parseInt(req.params.id);

            // Check source exists first
            const check = await pool.request().input('id', sql.Int, id)
                .query('SELECT SourceID FROM FormsSources WHERE SourceID = @id');
            if (check.recordset.length === 0) return res.status(404).json({ error: 'Formulario no encontrado' });

            // Delete responses (only if SourceID column exists in FormResponses)
            try {
                const colCheck = await pool.request().query(
                    `SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FormResponses') AND name = 'SourceID'`
                );
                if (colCheck.recordset.length > 0) {
                    await pool.request().input('id', sql.Int, id)
                        .query('DELETE FROM FormResponses WHERE SourceID = @id');
                }
            } catch (e) { console.warn('Could not delete FormResponses:', e.message); }

            // Delete sync logs (only if SourceID column exists in FormsSyncLog)
            try {
                const colCheck2 = await pool.request().query(
                    `SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FormsSyncLog') AND name = 'SourceID'`
                );
                if (colCheck2.recordset.length > 0) {
                    await pool.request().input('id', sql.Int, id)
                        .query('DELETE FROM FormsSyncLog WHERE SourceID = @id');
                }
            } catch (e) { console.warn('Could not delete FormsSyncLog:', e.message); }

            // Delete the Frm_* dynamic table if it exists
            try {
                const srcInfo = await pool.request().input('id', sql.Int, id)
                    .query('SELECT TableName FROM FormsSources WHERE SourceID = @id');
                const tableName = srcInfo.recordset[0]?.TableName;
                if (tableName) {
                    const tblExists = await pool.request().input('tbl', sql.NVarChar, tableName)
                        .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
                    if (tblExists.recordset.length > 0) {
                        await pool.request().query(`DROP TABLE [${tableName}]`);
                        console.log(`🗑️ Dropped table ${tableName}`);
                    }
                }
            } catch (e) { console.warn('Could not drop Frm_* table:', e.message); }

            // Delete the source itself
            await pool.request().input('id', sql.Int, id)
                .query('DELETE FROM FormsSources WHERE SourceID = @id');

            res.json({ success: true, deleted: id });
        } catch (err) {
            console.error('DELETE /forms/sources error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });


    // POST /api/forms/sources/:id/resolve — resolve DriveId/ItemId from Excel URL
    app.post('/api/forms/sources/:id/resolve', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const pool = await getFormsPool();
            const srcResult = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('SELECT * FROM FormsSources WHERE SourceID = @id');
            if (srcResult.recordset.length === 0) return res.status(404).json({ error: 'Formulario no encontrado' });

            const source = srcResult.recordset[0];
            const resolved = await formsService.resolveExcelFromUrl(source.ExcelUrl, source.OwnerEmail);

            await pool.request()
                .input('id', sql.Int, source.SourceID)
                .input('driveId', sql.NVarChar, resolved.driveId)
                .input('itemId', sql.NVarChar, resolved.itemId)
                .input('sheetName', sql.NVarChar, resolved.sheetName || 'Sheet1')
                .input('by', sql.NVarChar, req.user.email)
                .query(`
                    UPDATE FormsSources 
                    SET DriveId = @driveId, ItemId = @itemId, SheetName = @sheetName,
                        UpdatedAt = GETDATE(), UpdatedBy = @by
                    WHERE SourceID = @id
                `);

            res.json({ success: true, driveId: resolved.driveId, itemId: resolved.itemId, sheetName: resolved.sheetName });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/forms/sources/:id/sync — sync a specific form
    app.post('/api/forms/sources/:id/sync', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const result = await formsSyncService.syncSource(parseInt(req.params.id), req.user.email);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Sync ─────────────────────────────────────────────────────────────────

    // POST /api/forms/sync
    app.post('/api/forms/sync', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { type = 'INCREMENTAL' } = req.body;
            const result = await formsCron.triggerManualSync(type, req.user.email);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/sync-status
    app.get('/api/forms/sync-status', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const status = await formsSyncService.getLatestSyncStatus();
            const cronStatus = await formsCron.getStatus();
            res.json({ lastSync: status, cronJob: cronStatus });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/sync-logs
    app.get('/api/forms/sync-logs', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const pageSize = parseInt(req.query.pageSize) || 20;
            const pageNumber = parseInt(req.query.page) || 1;
            const result = await formsSyncService.getSyncLogs(pageSize, pageNumber);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Responses & Reports ──────────────────────────────────────────────────

    // GET /api/forms/responses
    app.get('/api/forms/responses', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const { sourceId, email, startDate, endDate, page = 1, pageSize = 50 } = req.query;
            const pgNum = parseInt(page);
            const pgSize = parseInt(pageSize);

            // ── Determine which tables to query ──────────────────────────────
            let sourcesToQuery = [];

            const discoverTable = async (src) => {
                if (src.TableName) return src;
                const disc = await pool.request()
                    .input('pattern', sql.NVarChar, `Frm_${src.SourceID}_%`)
                    .query(`SELECT TOP 1 name FROM sys.tables WHERE name LIKE @pattern ORDER BY name`);
                if (disc.recordset.length > 0) {
                    src.TableName = disc.recordset[0].name;
                    await pool.request().input('id', sql.Int, src.SourceID).input('tbl', sql.NVarChar, src.TableName)
                        .query(`UPDATE FormsSources SET TableName = @tbl WHERE SourceID = @id`);
                }
                return src;
            };

            if (sourceId) {
                const srcResult = await pool.request()
                    .input('id', sql.Int, parseInt(sourceId))
                    .query(`SELECT SourceID, Alias, TableName FROM FormsSources WHERE SourceID = @id`);
                if (srcResult.recordset.length > 0) {
                    const src = await discoverTable(srcResult.recordset[0]);
                    if (src.TableName) sourcesToQuery.push(src);
                }
            } else {
                const allSrc = await pool.request()
                    .query(`SELECT SourceID, Alias, TableName FROM FormsSources WHERE Activo = 1 ORDER BY SourceID`);
                for (const src of allSrc.recordset) {
                    await discoverTable(src);
                    if (src.TableName) {
                        const chk = await pool.request().input('t', sql.NVarChar, src.TableName)
                            .query(`SELECT 1 FROM sys.tables WHERE name = @t`);
                        if (chk.recordset.length > 0) sourcesToQuery.push(src);
                    }
                }
            }

            if (sourcesToQuery.length === 0) {
                return res.json({ responses: [], total: 0, page: pgNum, pageSize: pgSize, totalPages: 0 });
            }

            // ── System columns to exclude from Answers JSON ───────────────────
            const SYSTEM_COLS = new Set(['id', 'responseid', 'respondentemail', 'respondentname', 'submittedat', 'syncedat']);

            // ── Query each table separately and merge in JS ───────────────────
            const emailFilter = email ? `%${email}%` : null;
            const startDt = startDate ? new Date(startDate) : null;
            const endDt = endDate ? new Date(endDate + 'T23:59:59') : null;

            let allRows = [];

            for (const src of sourcesToQuery) {
                try {
                    // Get column names for this table
                    const colsResult = await pool.request()
                        .input('tbl', sql.NVarChar, src.TableName)
                        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl ORDER BY ORDINAL_POSITION`);
                    const allCols = colsResult.recordset.map(r => r.COLUMN_NAME);
                    const answerCols = allCols.filter(c => !SYSTEM_COLS.has(c.toLowerCase()));

                    // Build WHERE conditions
                    const conditions = [];
                    const req2 = pool.request();
                    if (emailFilter) {
                        conditions.push(`RespondentEmail LIKE @email`);
                        req2.input('email', sql.NVarChar, emailFilter);
                    }
                    if (startDt) {
                        conditions.push(`SubmittedAt >= @startDate`);
                        req2.input('startDate', sql.DateTime, startDt);
                    }
                    if (endDt) {
                        conditions.push(`SubmittedAt <= @endDate`);
                        req2.input('endDate', sql.DateTime, endDt);
                    }
                    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

                    // Select system columns + answer columns
                    const answerColsSql = answerCols.map(c => `[${c}]`).join(', ');
                    const selectSql = `
                        SELECT 
                            CAST(ID AS NVARCHAR(50)) AS ResponseID,
                            RespondentEmail, RespondentName, SubmittedAt, SyncedAt
                            ${answerCols.length > 0 ? ', ' + answerColsSql : ''}
                        FROM [${src.TableName}]
                        ${whereClause}
                    `;

                    const tableResult = await req2.query(selectSql);

                    // Convert rows: build Answers JSON from answer columns
                    for (const row of tableResult.recordset) {
                        const answers = {};
                        for (const col of answerCols) {
                            answers[col] = row[col] ?? null;
                        }
                        allRows.push({
                            ResponseID: row.ResponseID,
                            SourceID: src.SourceID,
                            FormAlias: src.Alias,
                            RespondentEmail: row.RespondentEmail,
                            RespondentName: row.RespondentName,
                            SubmittedAt: row.SubmittedAt,
                            SyncedAt: row.SyncedAt,
                            Answers: JSON.stringify(answers)
                        });
                    }
                } catch (tableErr) {
                    console.error(`Error querying ${src.TableName}:`, tableErr.message);
                }
            }

            // Sort by SubmittedAt DESC
            allRows.sort((a, b) => {
                const da = a.SubmittedAt ? new Date(a.SubmittedAt).getTime() : 0;
                const db = b.SubmittedAt ? new Date(b.SubmittedAt).getTime() : 0;
                return db - da;
            });

            // Paginate
            const total = allRows.length;
            const totalPages = Math.ceil(total / pgSize);
            const startIdx = (pgNum - 1) * pgSize;
            const pageRows = allRows.slice(startIdx, startIdx + pgSize);

            res.json({ responses: pageRows, total, page: pgNum, pageSize: pgSize, totalPages });
        } catch (err) {
            console.error('GET /forms/responses error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/responses/:id
    app.get('/api/forms/responses/:id', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const result = await pool.request()
                .input('id', sql.NVarChar, req.params.id)
                .query('SELECT r.*, s.Alias as FormAlias FROM FormResponses r LEFT JOIN FormsSources s ON r.SourceID = s.SourceID WHERE r.ResponseID = @id');
            if (result.recordset.length === 0) return res.status(404).json({ error: 'No encontrado' });
            res.json(result.recordset[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/reports/summary
    app.get('/api/forms/reports/summary', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const [forms, responses, week, lastSync] = await Promise.all([
                pool.request().query('SELECT COUNT(*) as total FROM FormsSources WHERE Activo = 1'),
                pool.request().query('SELECT COUNT(*) as total FROM FormResponses'),
                pool.request().query('SELECT COUNT(*) as total FROM FormResponses WHERE SubmittedAt >= DATEADD(DAY,-7,GETDATE())'),
                formsSyncService.getLatestSyncStatus()
            ]);
            res.json({
                totalForms: forms.recordset[0].total,
                totalResponses: responses.recordset[0].total,
                responsesThisWeek: week.recordset[0].total,
                lastSync: lastSync?.FechaSync || null
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/reports/by-form — forms with owner info (for the report)
    app.get('/api/forms/reports/by-form', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const result = await pool.request().query(`
                SELECT 
                    s.SourceID, s.Alias, s.OwnerEmail, s.ExcelUrl,
                    s.Activo, s.UltimaSync, s.CreatedAt,
                    CASE WHEN s.DriveId IS NOT NULL AND s.ItemId IS NOT NULL THEN 1 ELSE 0 END AS Resuelto,
                    (SELECT COUNT(*) FROM FormResponses r WHERE r.SourceID = s.SourceID) AS TotalRespuestas,
                    (SELECT MAX(r.SubmittedAt) FROM FormResponses r WHERE r.SourceID = s.SourceID) AS UltimaRespuesta
                FROM FormsSources s
                ORDER BY s.Activo DESC, s.Alias
            `);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/reports/by-date
    app.get('/api/forms/reports/by-date', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const { days = 30 } = req.query;
            const result = await pool.request()
                .input('days', sql.Int, parseInt(days))
                .query(`
                    SELECT CAST(SubmittedAt AS DATE) as Fecha, COUNT(*) as TotalResponses
                    FROM FormResponses
                    WHERE SubmittedAt >= DATEADD(DAY, -@days, GETDATE())
                    GROUP BY CAST(SubmittedAt AS DATE)
                    ORDER BY Fecha
                `);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/sources/:id/table-info — columns of the Frm_* table
    app.get('/api/forms/sources/:id/table-info', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('SELECT SourceID, Alias, TableName FROM FormsSources WHERE SourceID = @id');
            if (src.recordset.length === 0) return res.status(404).json({ error: 'Formulario no encontrado' });
            const { SourceID, Alias, TableName } = src.recordset[0];
            const tableName = TableName || getTableName(SourceID, Alias);

            // Check if table exists
            const exists = await pool.request()
                .input('tbl', sql.NVarChar, tableName)
                .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
            if (exists.recordset.length === 0) {
                return res.json({ tableName, exists: false, columns: [] });
            }

            const columns = await getTableColumns(tableName);
            const countR = await pool.request().query(`SELECT COUNT(*) AS total FROM [${tableName}]`);
            res.json({ tableName, exists: true, total: countR.recordset[0].total, columns });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/forms/sources/:id/kpi — numeric KPIs from Frm_* table
    app.get('/api/forms/sources/:id/kpi', authMiddleware, async (req, res) => {
        try {
            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('SELECT SourceID, Alias, TableName FROM FormsSources WHERE SourceID = @id');
            if (src.recordset.length === 0) return res.status(404).json({ error: 'Formulario no encontrado' });
            const { SourceID, Alias, TableName } = src.recordset[0];
            const tableName = TableName || getTableName(SourceID, Alias);

            const exists = await pool.request()
                .input('tbl', sql.NVarChar, tableName)
                .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
            if (exists.recordset.length === 0) {
                return res.json({ tableName, exists: false, kpis: null, message: 'Tabla no creada aún. Realice un Sync primero.' });
            }

            const kpis = await getTableKpis(tableName);
            res.json({ tableName, exists: true, kpis });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Start cron on startup
    (async () => {
        try { await formsCron.start(); }
        catch (error) { console.error('❌ Error starting Forms cron:', error.message); }
    })();

}; // end registerFormsEndpoints
