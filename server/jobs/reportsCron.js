const reportsDb = require('../reportsDb');
const { sendReportEmail } = require('../emailService');
const { buildReportHtml } = require('../reports_endpoints');

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
            // Parse params
            const fixedParams = sub.ParametrosFijos ? JSON.parse(sub.ParametrosFijos) : {};

            // Execute the report query
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

            // Build HTML
            const htmlContent = buildReportHtml(report, result);

            // Determine recipient email
            const emailTo = sub.EmailDestino || sub.Email;
            const subject = sub.TemplateAsunto
                ? sub.TemplateAsunto.replace('{{fecha}}', now.toLocaleDateString('es-CR'))
                : `${sub.ReporteNombre} - ${now.toLocaleDateString('es-CR')}`;

            // Send email
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
