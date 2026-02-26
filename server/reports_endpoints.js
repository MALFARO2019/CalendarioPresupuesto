const reportsDb = require('./reportsDb');
const { sendReportEmail } = require('./emailService');
const { generarReporteAlcance } = require('./reporteNocturno');
const { sql, poolPromise } = require('./db');

// ============================================
// Register reports endpoints
// ============================================
function registerReportsEndpoints(app, authMiddleware) {

    // ---- CATALOG ----

    // GET /api/reports — get reports available to current user
    app.get('/api/reports', authMiddleware, async (req, res) => {
        try {
            const userId = req.user.userId;
            const perfilId = req.user.perfilId || 0;
            const isAdmin = req.user.esAdmin;

            // Always get user-specific view (includes Suscrito, SuscripcionID)
            let reports = await reportsDb.getReportsForUser(userId, perfilId);

            // For admins, also fetch full list to merge admin-only data (TotalSuscriptores)
            // and include any reports that the access filter might have excluded
            if (isAdmin) {
                const allReports = await reportsDb.getReports();
                const userMap = new Map(reports.map(r => [r.ID, r]));
                reports = allReports.map(r => ({
                    ...r,
                    // Merge subscription info from user-specific query
                    Suscrito: userMap.get(r.ID)?.Suscrito || 0,
                    SuscripcionActiva: userMap.get(r.ID)?.SuscripcionActiva || 0,
                    SuscripcionID: userMap.get(r.ID)?.SuscripcionID || null
                }));
            }

            // Parse JSON fields for frontend
            reports = reports.map(r => ({
                ...r,
                columnas: r.Columnas ? safeJsonParse(r.Columnas) : [],
                parametros: r.Parametros ? safeJsonParse(r.Parametros) : []
            }));

            res.json(reports);
        } catch (error) {
            console.error('❌ GET /api/reports error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/reports/:id/preview — execute and preview a report
    app.get('/api/reports/:id/preview', authMiddleware, async (req, res) => {
        try {
            const reportId = parseInt(req.params.id);
            const report = await reportsDb.getReportById(reportId);
            if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

            // Special type reports return HTML directly
            if (report.TipoEspecial === 'alcance-nocturno') {
                const userPerms = {
                    allowedStores: req.user.allowedStores || [],
                    allowedCanales: req.user.allowedCanales || []
                };
                // Generate without sending email - just return HTML
                const { generarReporteAlcancePreview } = require('./reporteNocturno');
                if (generarReporteAlcancePreview) {
                    const config = { nombre: report.Nombre, icono: report.Icono || '📊' };
                    const html = await generarReporteAlcancePreview(userPerms, config);
                    return res.json({ html, isSpecial: true, filtrosDisponibles: report.FiltrosDisponibles || '' });
                }
                return res.json({ html: '<p>Preview no disponible para este tipo de reporte. Use "Generar" para enviarlo por correo.</p>', isSpecial: true });
            }

            const params = req.query || {};
            const result = await reportsDb.executeReport(reportId, params);
            res.json(result);
        } catch (error) {
            console.error('❌ GET /api/reports/:id/preview error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/reports — create report (admin only)
    app.post('/api/reports', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            const id = await reportsDb.createReport(req.body, req.user.email);
            res.json({ success: true, id });
        } catch (error) {
            console.error('❌ POST /api/reports error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/reports/:id — update report (admin only)
    app.put('/api/reports/:id', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            await reportsDb.updateReport(parseInt(req.params.id), req.body, req.user.email);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ PUT /api/reports/:id error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/reports/:id — delete report (admin only)
    app.delete('/api/reports/:id', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            await reportsDb.deleteReport(parseInt(req.params.id));
            res.json({ success: true });
        } catch (error) {
            console.error('❌ DELETE /api/reports/:id error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // ---- SUBSCRIPTIONS ----

    // GET /api/reports/subscriptions — my subscriptions
    app.get('/api/reports/subscriptions', authMiddleware, async (req, res) => {
        try {
            const subs = await reportsDb.getSubscriptions(req.user.userId);
            res.json(subs);
        } catch (error) {
            console.error('❌ GET /api/reports/subscriptions error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });
    // POST /api/reports/:id/subscribe — subscribe to report
    app.post('/api/reports/:id/subscribe', authMiddleware, async (req, res) => {
        try {
            const subId = await reportsDb.subscribe(parseInt(req.params.id), req.user.userId, req.body || {});
            res.json({ success: true, subscriptionId: subId });
        } catch (error) {
            console.error('❌ POST /api/reports/:id/subscribe error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/reports/:id/subscribe — unsubscribe
    app.delete('/api/reports/:id/subscribe', authMiddleware, async (req, res) => {
        try {
            await reportsDb.unsubscribe(parseInt(req.params.id), req.user.userId);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ DELETE /api/reports/:id/subscribe error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/reports/:id/subscribe — update subscription config
    app.put('/api/reports/:id/subscribe', authMiddleware, async (req, res) => {
        try {
            // Find the subscription ID first
            const subs = await reportsDb.getSubscriptions(req.user.userId);
            const sub = subs.find(s => s.ReporteID === parseInt(req.params.id));
            if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

            await reportsDb.updateSubscription(sub.ID, req.body);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ PUT /api/reports/:id/subscribe error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // ---- ACCESS CONTROL ----

    // GET /api/reports/access — get access matrix (admin only)
    app.get('/api/reports/access', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            const access = await reportsDb.getReportAccess();
            res.json(access);
        } catch (error) {
            console.error('❌ GET /api/reports/access error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/reports/:id/access — set access for a report (admin only)
    app.put('/api/reports/:id/access', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            const { perfilIds } = req.body;
            await reportsDb.bulkSetAccess(parseInt(req.params.id), perfilIds || [], req.user.email);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ PUT /api/reports/:id/access error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/reports/user-access — get user-specific access matrix (admin only)
    app.get('/api/reports/user-access', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            // This would return users with direct report assignments
            const pool = await require('./db').poolPromise;
            const result = await pool.request().query(`
                SELECT a.ReporteID, a.UsuarioID, u.Nombre AS UsuarioNombre, u.Email AS UsuarioEmail
                FROM DIM_REPORTE_ACCESO a
                JOIN APP_USUARIOS u ON u.Id = a.UsuarioID
                WHERE a.UsuarioID IS NOT NULL
            `);
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ GET /api/reports/user-access error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/reports/:id/user-access — set specific user access (admin only)
    app.put('/api/reports/:id/user-access', authMiddleware, async (req, res) => {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
        try {
            const { userIds } = req.body; // Array of user IDs to have direct access
            const pool = await require('./db').poolPromise;

            // Transaction-like bulk update for specific report
            await pool.request()
                .input('reporteId', require('./db').sql.Int, parseInt(req.params.id))
                .query('DELETE FROM DIM_REPORTE_ACCESO WHERE ReporteID = @reporteId AND UsuarioID IS NOT NULL');

            for (const uid of (userIds || [])) {
                await pool.request()
                    .input('reporteId', require('./db').sql.Int, parseInt(req.params.id))
                    .input('userId', require('./db').sql.Int, uid)
                    .input('assignedBy', require('./db').sql.NVarChar(200), req.user.email)
                    .query('INSERT INTO DIM_REPORTE_ACCESO (ReporteID, UsuarioID, AsignadoPor) VALUES (@reporteId, @userId, @assignedBy)');
            }

            res.json({ success: true });
        } catch (error) {
            console.error('❌ PUT /api/reports/:id/user-access error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // ---- FILTER OPTIONS ----

    // GET /api/reports/:id/filter-options — get available filter options for a report
    app.get('/api/reports/:id/filter-options', authMiddleware, async (req, res) => {
        try {
            const reportId = parseInt(req.params.id);
            const report = await reportsDb.getReportById(reportId);
            if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

            const rawFiltros = report.FiltrosDisponibles;
            const filtrosStr = typeof rawFiltros === 'string' ? rawFiltros : (rawFiltros ? String(rawFiltros) : '');
            const filtrosDisponibles = filtrosStr.split(',').map(f => f.trim()).filter(Boolean);
            if (filtrosDisponibles.length === 0) {
                return res.json({ grupos: [], locales: [], canales: [] });
            }

            const pool = await poolPromise;
            const userStores = req.user.allowedStores || [];
            const userCanales = req.user.allowedCanales || [];

            let grupos = [];
            let locales = [];
            let canales = [];

            // For alcance-nocturno type, query RSM_ALCANCE_DIARIO for available options
            if (report.TipoEspecial === 'alcance-nocturno') {
                if (filtrosDisponibles.includes('grupos')) {
                    const gruposResult = await pool.request().query(`
                        SELECT DISTINCT Local AS Grupo
                        FROM RSM_ALCANCE_DIARIO
                        WHERE Tipo = 'Ventas' AND Canal = 'Todos'
                          AND SUBSTRING(CODALMACEN, 1, 1) = 'G'
                        ORDER BY Local
                    `);
                    grupos = gruposResult.recordset.map(r => r.Grupo?.trim()).filter(Boolean);
                    // Filter by user permissions if they have store restrictions
                    if (userStores.length > 0) {
                        const allowed = new Set(userStores);
                        grupos = grupos.filter(g => allowed.has(g));
                    }
                }

                if (filtrosDisponibles.includes('locales')) {
                    const localesResult = await pool.request().query(`
                        SELECT DISTINCT Local
                        FROM RSM_ALCANCE_DIARIO
                        WHERE Tipo = 'Ventas' AND Canal = 'Todos'
                          AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                        ORDER BY Local
                    `);
                    locales = localesResult.recordset.map(r => r.Local?.trim()).filter(Boolean);
                    if (userStores.length > 0) {
                        const allowed = new Set(userStores);
                        locales = locales.filter(l => allowed.has(l));
                    }
                }

                if (filtrosDisponibles.includes('canales')) {
                    const canalesResult = await pool.request().query(`
                        SELECT DISTINCT Canal
                        FROM RSM_ALCANCE_DIARIO
                        WHERE Tipo = 'Ventas' AND Canal != 'Todos'
                          AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                        ORDER BY Canal
                    `);
                    canales = canalesResult.recordset.map(r => r.Canal?.trim()).filter(Boolean);
                    if (userCanales.length > 0) {
                        const allowed = new Set(userCanales);
                        canales = canales.filter(c => allowed.has(c));
                    }
                }
            }

            res.json({ grupos, locales, canales, filtrosDisponibles });
        } catch (error) {
            console.error('❌ GET /api/reports/:id/filter-options error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // ---- GENERATE NOW ----

    // POST /api/reports/:id/generate — generate and send report right now
    app.post('/api/reports/:id/generate', authMiddleware, async (req, res) => {
        try {
            const reportId = parseInt(req.params.id);
            const params = req.body.params || {};
            let emailTo = req.body.emailTo || req.user.email;
            const report = await reportsDb.getReportById(reportId);
            if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

            // Security: non-admin users can only send to their own email
            if (!req.user.esAdmin && emailTo !== req.user.email) {
                console.log(`⚠️ Non-admin user ${req.user.email} tried to send report to ${emailTo} — forcing own email`);
                emailTo = req.user.email;
            }

            // ── Reportes con lógica especial ─────────────────────────────
            if (report.TipoEspecial === 'alcance-nocturno') {
                const userPerms = {
                    allowedStores: req.user.allowedStores || [],
                    allowedCanales: req.user.allowedCanales || []
                };

                // Apply subscription-level filters if provided in params
                if (params.filtroGrupos && params.filtroGrupos.length > 0) {
                    const allowed = new Set(userPerms.allowedStores);
                    userPerms.allowedStores = allowed.size > 0
                        ? params.filtroGrupos.filter(g => allowed.has(g))
                        : params.filtroGrupos;
                }
                if (params.filtroLocales && params.filtroLocales.length > 0) {
                    const allowed = new Set(req.user.allowedStores || []);
                    const filteredLocales = allowed.size > 0
                        ? params.filtroLocales.filter(l => allowed.has(l))
                        : params.filtroLocales;
                    if (userPerms.allowedStores && userPerms.allowedStores.length > 0) {
                        userPerms.allowedStores = [...new Set([...userPerms.allowedStores, ...filteredLocales])];
                    } else {
                        userPerms.allowedStores = filteredLocales;
                    }
                }
                if (params.filtroCanales && params.filtroCanales.length > 0) {
                    const allowed = new Set(userPerms.allowedCanales);
                    userPerms.allowedCanales = allowed.size > 0
                        ? params.filtroCanales.filter(c => allowed.has(c))
                        : params.filtroCanales;
                }

                const config = { nombre: report.Nombre, icono: report.Icono || '📊' };
                const { ok } = await generarReporteAlcance([emailTo], userPerms, config);
                return res.json({ success: ok, message: `Reporte nocturno enviado a ${emailTo}` });
            }

            // ── Flujo genérico (QuerySQL) ────────────────────────────────
            const result = await reportsDb.executeReport(reportId, params);
            const htmlContent = buildReportHtml(report, result);
            const subject = report.TemplateAsunto || `${report.Nombre} - KPIs Rosti`;
            const sent = await sendReportEmail(
                emailTo,
                req.user.nombre || req.user.email,
                subject,
                { local: params.local || 'Todos', kpi: params.kpi || '-', canal: params.canal || 'Todos' },
                htmlContent
            );

            if (sent) {
                res.json({ success: true, message: `Reporte enviado a ${emailTo}`, rowCount: result.rowCount });
            } else {
                res.status(500).json({ error: 'Error al enviar el correo' });
            }
        } catch (error) {
            console.error('❌ POST /api/reports/:id/generate error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    console.log('📊 Reports endpoints registered');
}

// ============================================
// Helpers
// ============================================

function safeJsonParse(str) {
    try { return JSON.parse(str); }
    catch { return []; }
}

function buildReportHtml(report, result) {
    const columns = result.columns || Object.keys(result.data[0] || {}).map(k => ({ field: k, label: k, format: 'text' }));

    let html = '';

    // Header
    if (report.TemplateEncabezado) {
        html += report.TemplateEncabezado;
    }

    html += `<h3 style="color:#374151;margin:0 0 10px 0;font-size:16px;">${report.Nombre}</h3>`;
    if (report.Descripcion) {
        html += `<p style="color:#6b7280;font-size:13px;margin:0 0 15px 0;">${report.Descripcion}</p>`;
    }

    // Info
    html += `<p style="color:#9ca3af;font-size:11px;margin:0 0 10px 0;">Filas: ${result.rowCount} | Generado: ${new Date().toLocaleString('es-CR')}</p>`;

    // Table
    html += '<table class="report-table" style="width:100%;border-collapse:collapse;margin:15px 0;">';

    // Header row
    html += '<tr>';
    columns.forEach(col => {
        const align = ['currency', 'number', 'percent'].includes(col.format) ? 'right' : 'left';
        html += `<th style="background:#f3f4f6;padding:10px 12px;text-align:${align};font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">${col.label}</th>`;
    });
    html += '</tr>';

    // Data rows
    result.data.forEach((row, i) => {
        const bg = i % 2 === 0 ? '' : 'background:#fafafa;';
        html += `<tr style="${bg}">`;
        columns.forEach(col => {
            const val = row[col.field];
            const align = ['currency', 'number', 'percent'].includes(col.format) ? 'right' : 'left';
            let formatted = val;

            if (col.format === 'currency' && typeof val === 'number') {
                formatted = '₡' + val.toLocaleString('es-CR', { minimumFractionDigits: 0 });
            } else if (col.format === 'percent' && typeof val === 'number') {
                formatted = (val * 100).toFixed(1) + '%';
                const color = val >= 1 ? '#16a34a' : val >= 0.9 ? '#ea580c' : '#dc2626';
                formatted = `<span style="color:${color};font-weight:600;">${formatted}</span>`;
            } else if (col.format === 'number' && typeof val === 'number') {
                formatted = val.toLocaleString('es-CR');
            }

            html += `<td style="padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:${align};">${formatted ?? '-'}</td>`;
        });
        html += '</tr>';
    });

    html += '</table>';
    return html;
}

module.exports = registerReportsEndpoints;
module.exports.buildReportHtml = buildReportHtml;
