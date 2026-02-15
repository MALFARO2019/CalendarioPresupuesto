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

module.exports = {
    sendPasswordEmail,
    verifyEmailService
};
