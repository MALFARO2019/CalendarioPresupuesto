const reportsDb = require('../reportsDb');
const { sendReportEmail } = require('../emailService');
const { buildReportHtml } = require('../reports_endpoints');
const { generarReporteAlcance } = require('../reporteNocturno');
const { sql, poolPromise } = require('../db');

let cronInterval = null;

async function start() {
    if (cronInterval) return;

    console.log('📊 Reports cron job started (checks every minute)');

    // Run every minute
    cronInterval = setInterval(async () => {
        try {
            await checkAndSendReports();
        } catch (error) {
            console.error('❌ Reports cron error:', error.message);
        }
    }, 60 * 1000);
}

function stop() {
    if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
        console.log('📊 Reports cron job stopped');
    }
}

// Helper: fetch user's allowed stores and channels
async function getUserPermissions(userId) {
    try {
        const pool = await poolPromise;
        const storesResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT Local FROM APP_USUARIO_ALMACEN WHERE UsuarioId = @userId');
        const canalesResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT Canal FROM APP_USUARIO_CANAL WHERE UsuarioId = @userId');
        return {
            allowedStores: storesResult.recordset.map(r => r.Local),
            allowedCanales: canalesResult.recordset.map(r => r.Canal)
        };
    } catch (e) {
        console.warn('⚠️ Could not fetch user permissions:', e.message);
        return { allowedStores: [], allowedCanales: [] };
    }
}

async function checkAndSendReports() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    // JS: 0=Sunday, we want 1=Monday..7=Sunday
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const dayOfMonth = now.getDate();

    const dueSubs = await reportsDb.getDueSubscriptions(currentHour, currentMinute, dayOfWeek, dayOfMonth);

    if (dueSubs.length === 0) return;

    console.log(`📊 Reports cron: ${dueSubs.length} report(s) due at ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);

    for (const sub of dueSubs) {
        try {
            const fixedParams = sub.ParametrosFijos ? JSON.parse(sub.ParametrosFijos) : {};
            const emailTo = sub.EmailDestino || sub.Email;
            const subject = sub.TemplateAsunto
                ? sub.TemplateAsunto.replace('{{fecha}}', now.toLocaleDateString('es-CR'))
                : `${sub.ReporteNombre} - ${now.toLocaleDateString('es-CR')}`;

            // ── Reportes con lógica especial ─────────────────
            if (sub.TipoEspecial === 'alcance-nocturno') {
                // Fetch user permissions for personalized report
                const userPerms = await getUserPermissions(sub.UsuarioID);

                // Apply subscription-level filters (intersect with user permissions)
                let effectivePerms = { ...userPerms };
                if (fixedParams.filtroGrupos && fixedParams.filtroGrupos.length > 0) {
                    // Subscription filter: only include groups/stores that user also has permission for
                    const allowed = new Set(userPerms.allowedStores);
                    effectivePerms.allowedStores = allowed.size > 0
                        ? fixedParams.filtroGrupos.filter(g => allowed.has(g))
                        : fixedParams.filtroGrupos; // no user restrictions = allow all selected
                }
                if (fixedParams.filtroLocales && fixedParams.filtroLocales.length > 0) {
                    // Merge locales into allowedStores (they share the same dimension)
                    const allowed = new Set(userPerms.allowedStores);
                    const filteredLocales = allowed.size > 0
                        ? fixedParams.filtroLocales.filter(l => allowed.has(l))
                        : fixedParams.filtroLocales;
                    if (effectivePerms.allowedStores && effectivePerms.allowedStores.length > 0) {
                        effectivePerms.allowedStores = [...new Set([...effectivePerms.allowedStores, ...filteredLocales])];
                    } else {
                        effectivePerms.allowedStores = filteredLocales;
                    }
                }
                if (fixedParams.filtroCanales && fixedParams.filtroCanales.length > 0) {
                    const allowed = new Set(userPerms.allowedCanales);
                    effectivePerms.allowedCanales = allowed.size > 0
                        ? fixedParams.filtroCanales.filter(c => allowed.has(c))
                        : fixedParams.filtroCanales;
                }

                const config = { nombre: sub.ReporteNombre, icono: sub.Icono || '📊' };
                const { ok } = await generarReporteAlcance([emailTo], effectivePerms, config);
                if (ok) {
                    await reportsDb.markSubscriptionSent(sub.ID);
                    console.log(`  ✅ Reporte nocturno enviado a ${emailTo}`);
                } else {
                    console.error(`  ❌ Reporte nocturno falló para ${emailTo}`);
                }
                continue;
            }

            // ── Flujo genérico (QuerySQL) ──────────────────
            const report = {
                Nombre: sub.ReporteNombre,
                Descripcion: null,
                TemplateAsunto: sub.TemplateAsunto,
                TemplateEncabezado: sub.TemplateEncabezado,
                QuerySQL: sub.QuerySQL,
                Columnas: sub.Columnas,
                Parametros: sub.Parametros
            };
            const result = await reportsDb.executeReport(sub.ReporteID, fixedParams);
            const htmlContent = buildReportHtml(report, result);

            const sent = await sendReportEmail(
                emailTo,
                'Sistema Automático',
                subject,
                { local: fixedParams.local || 'Todos', kpi: fixedParams.kpi || '-', canal: fixedParams.canal || 'Todos' },
                htmlContent
            );

            if (sent) {
                await reportsDb.markSubscriptionSent(sub.ID);
                console.log(`  ✅ Sent "${sub.ReporteNombre}" to ${emailTo}`);
            } else {
                console.error(`  ❌ Failed to send "${sub.ReporteNombre}" to ${emailTo}`);
            }
        } catch (error) {
            console.error(`  ❌ Error processing subscription ${sub.ID}:`, error.message);
        }
    }
}

module.exports = { start, stop };
