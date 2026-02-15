const { sql, poolPromise } = require('./db');

/**
 * Send password email to user using SQL Server Database Mail
 * @param {string} email - User email address
 * @param {string} clave - 6-digit password
 * @param {string} nombre - User name (optional)
 * @returns {Promise<boolean>} - Success status
 */
async function sendPasswordEmail(email, clave, nombre = '') {
    try {
        const pool = await poolPromise;

        const subject = 'Tu código de acceso - Calendario de Presupuesto';
        const bodyHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc2626 0%, #f59e0b 100%); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
        .code-box { background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
        .code-label { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .code { font-size: 36px; font-weight: bold; color: #dc2626; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .instructions { font-size: 14px; color: #6b7280; line-height: 1.6; margin-top: 20px; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .warning-text { color: #92400e; font-size: 13px; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Calendario de Presupuesto</h1>
        </div>
        
        <div class="content">
            <div class="greeting">
                Hola${nombre ? ' ' + nombre : ''},
            </div>
            
            <p style="color: #4b5563; line-height: 1.6;">
                Has solicitado tu código de acceso para el <strong>Calendario de Presupuesto</strong> de Rosti Pollos.
            </p>
            
            <div class="code-box">
                <div class="code-label">Tu Código de Acceso</div>
                <div class="code">${clave}</div>
            </div>
            
            <div class="warning">
                <p class="warning-text">
                    <strong>⚠️ Importante:</strong> No compartas este código con nadie. 
                    Si no solicitaste este código, ignora este correo.
                </p>
            </div>
            
            <div class="instructions">
                <strong>Instrucciones de acceso:</strong><br>
                1. Ingresa a la aplicación<br>
                2. Coloca tu correo electrónico: <strong>${email}</strong><br>
                3. Ingresa el código de 6 dígitos mostrado arriba<br>
            </div>
        </div>
        
        <div class="footer">
            <p style="margin: 5px 0;">Rosti Pollos Costa Rica</p>
            <p style="margin: 5px 0;">alertas@rostipolloscr.com</p>
            <p style="margin: 15px 0 0 0; font-size: 11px;">
                Este es un correo automático, por favor no responder.
            </p>
        </div>
    </div>
</body>
</html>
        `;

        // Send email using SQL Server Database Mail
        await pool.request()
            .input('recipients', sql.NVarChar, email)
            .input('subject', sql.NVarChar, subject)
            .input('body', sql.NVarChar(sql.MAX), bodyHTML)
            .query(`
                EXEC msdb.dbo.sp_send_dbmail 
                    @recipients = @recipients,
                    @subject = @subject,
                    @body = @body,
                    @body_format = 'HTML'
            `);

        console.log('✅ Email sent successfully via SQL Database Mail to:', email);
        return true;
    } catch (error) {
        console.error('❌ Error sending email via Database Mail:');
        console.error('   Message:', error.message);
        console.error('   Code:', error.code);
        console.error('   Full error:', error);
        return false;
    }
}

/**
 * Verify Database Mail is configured (optional check)
 */
async function verifyEmailService() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COUNT(*) AS ProfileCount 
            FROM msdb.dbo.sysmail_profile
        `);

        if (result.recordset[0].ProfileCount > 0) {
            console.log('✅ SQL Database Mail profiles found');
            return true;
        } else {
            console.warn('⚠️ No Database Mail profiles configured');
            return false;
        }
    } catch (error) {
        console.error('❌ Database Mail check error:', error.message);
        return false;
    }
}

/**
 * Send report email with HTML body
 * @param {string} recipientEmail - Recipient email
 * @param {string} senderName - Name of sender
 * @param {string} reportTitle - Report title (e.g., "Calendario Mensual 2026")
 * @param {object} reportData - Report metadata
 * @param {string} htmlContent - HTML table/content of the report
 * @returns {Promise<boolean>}
 */
async function sendReportEmail(recipientEmail, senderName, reportTitle, reportData, htmlContent) {
    try {
        const pool = await poolPromise;

        const subject = `${reportTitle} - Rosti Pollos`;
        const bodyHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc2626 0%, #f59e0b 100%); padding: 25px 30px; }
        .header h1 { color: white; margin: 0; font-size: 22px; }
        .header p { color: rgba(255,255,255,0.85); margin: 5px 0 0 0; font-size: 13px; }
        .meta { background: #f9fafb; padding: 15px 30px; border-bottom: 1px solid #e5e7eb; }
        .meta-row { display: flex; flex-wrap: wrap; gap: 20px; }
        .meta-item { font-size: 13px; color: #6b7280; }
        .meta-item strong { color: #374151; }
        .content { padding: 20px 30px; }
        .report-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .report-table th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
        .report-table td { padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }
        .report-table tr:nth-child(even) { background: #fafafa; }
        .pct-green { color: #16a34a; font-weight: 600; }
        .pct-red { color: #dc2626; font-weight: 600; }
        .pct-orange { color: #ea580c; font-weight: 600; }
        .footer { background: #f9fafb; padding: 15px 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${reportTitle}</h1>
            <p>Reporte generado por ${senderName}</p>
        </div>
        
        <div class="meta">
            <div class="meta-row">
                <div class="meta-item"><strong>Local:</strong> ${reportData.local || 'Todos'}</div>
                <div class="meta-item"><strong>KPI:</strong> ${reportData.kpi || 'Ventas'}</div>
                <div class="meta-item"><strong>Canal:</strong> ${reportData.canal || 'Todos'}</div>
                <div class="meta-item"><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-CR')}</div>
            </div>
        </div>
        
        <div class="content">
            ${htmlContent}
        </div>
        
        <div class="footer">
            <p>Rosti Pollos Costa Rica | alertas@rostipolloscr.com</p>
            <p>Para ver el reporte completo, ingrese a la aplicación Calendario de Presupuesto</p>
        </div>
    </div>
</body>
</html>
        `;

        await pool.request()
            .input('recipients', sql.NVarChar, recipientEmail)
            .input('subject', sql.NVarChar, subject)
            .input('body', sql.NVarChar(sql.MAX), bodyHTML)
            .query(`
                EXEC msdb.dbo.sp_send_dbmail 
                    @recipients = @recipients,
                    @subject = @subject,
                    @body = @body,
                    @body_format = 'HTML'
            `);

        console.log('✅ Report email sent to:', recipientEmail);
        return true;
    } catch (error) {
        console.error('❌ Error sending report email:', error.message);
        return false;
    }
}

module.exports = {
    sendPasswordEmail,
    sendReportEmail,
    verifyEmailService
};
