const { sql, poolPromise } = require('./db');

// ============================================
// Ensure reports tables exist
// ============================================
async function ensureReportsTables() {
    try {
        const pool = await poolPromise;

        // DIM_REPORTES
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTES')
            CREATE TABLE DIM_REPORTES (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                Nombre NVARCHAR(200) NOT NULL,
                Descripcion NVARCHAR(500) NULL,
                Icono NVARCHAR(10) DEFAULT '📊',
                Categoria NVARCHAR(100) DEFAULT 'General',
                QuerySQL NVARCHAR(MAX) NOT NULL,
                Columnas NVARCHAR(MAX) NULL,
                Parametros NVARCHAR(MAX) NULL,
                Frecuencia NVARCHAR(20) DEFAULT 'Diario',
                HoraEnvio NVARCHAR(5) DEFAULT '07:00',
                DiaSemana INT NULL,
                DiaMes INT NULL,
                FormatoSalida NVARCHAR(20) DEFAULT 'html',
                TemplateAsunto NVARCHAR(500) NULL,
                TemplateEncabezado NVARCHAR(MAX) NULL,
                Activo BIT DEFAULT 1,
                Orden INT DEFAULT 0,
                TipoEspecial NVARCHAR(100) NULL,
                CreadoPor NVARCHAR(200) NULL,
                FechaCreacion DATETIME DEFAULT GETDATE(),
                ModificadoPor NVARCHAR(200) NULL,
                FechaModificacion DATETIME NULL
            )
        `);

        // DIM_REPORTE_SUSCRIPCIONES
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTE_SUSCRIPCIONES')
            CREATE TABLE DIM_REPORTE_SUSCRIPCIONES (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                ReporteID INT NOT NULL,
                UsuarioID INT NOT NULL,
                Activo BIT DEFAULT 1,
                EmailDestino NVARCHAR(200) NULL,
                FrecuenciaPersonal NVARCHAR(20) NULL,
                HoraEnvioPersonal NVARCHAR(5) NULL,
                DiaSemanaPersonal INT NULL,
                DiaMesPersonal INT NULL,
                ParametrosFijos NVARCHAR(MAX) NULL,
                UltimoEnvio DATETIME NULL,
                TotalEnvios INT DEFAULT 0,
                FechaSuscripcion DATETIME DEFAULT GETDATE(),
                CONSTRAINT FK_Suscripcion_Reporte FOREIGN KEY (ReporteID) REFERENCES DIM_REPORTES(ID) ON DELETE CASCADE
            )
        `);

        // DIM_REPORTE_ACCESO
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTE_ACCESO')
            CREATE TABLE DIM_REPORTE_ACCESO (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                ReporteID INT NOT NULL,
                PerfilID INT NOT NULL,
                FechaAsignacion DATETIME DEFAULT GETDATE(),
                AsignadoPor NVARCHAR(200) NULL,
                CONSTRAINT FK_Acceso_Reporte FOREIGN KEY (ReporteID) REFERENCES DIM_REPORTES(ID) ON DELETE CASCADE
            )
        `);

        // Add permission columns if missing
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_USUARIOS') AND name = 'AccesoReportes')
                ALTER TABLE DIM_USUARIOS ADD AccesoReportes BIT DEFAULT 0
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERFILES') AND name = 'AccesoReportes')
                ALTER TABLE DIM_PERFILES ADD AccesoReportes BIT DEFAULT 0
            `);
        } catch (e) {
            console.warn('⚠️ Reports: Could not add permission columns:', e.message);
        }

        // Add TipoEspecial if missing
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_REPORTES') AND name = 'TipoEspecial')
                ALTER TABLE DIM_REPORTES ADD TipoEspecial NVARCHAR(100) NULL
            `);
        } catch (e) {
            console.warn('⚠️ Reports: Could not add TipoEspecial column:', e.message);
        }

        // Add PermitirProgramacionCustom & PermitirEnviarAhora if missing
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_REPORTES') AND name = 'PermitirProgramacionCustom')
                ALTER TABLE DIM_REPORTES ADD PermitirProgramacionCustom BIT DEFAULT 1
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_REPORTES') AND name = 'PermitirEnviarAhora')
                ALTER TABLE DIM_REPORTES ADD PermitirEnviarAhora BIT DEFAULT 1
            `);
        } catch (e) {
            console.warn('⚠️ Reports: Could not add new config columns:', e.message);
        }


        // Seed: Reporte Nocturno de Ventas
        try {
            const existing = await pool.request().query(
                `SELECT ID FROM DIM_REPORTES WHERE TipoEspecial = 'alcance-nocturno'`
            );
            if (existing.recordset.length === 0) {
                await pool.request().query(`
                    INSERT INTO DIM_REPORTES
                        (Nombre, Descripcion, Icono, Categoria, QuerySQL, Frecuencia, HoraEnvio,
                         FormatoSalida, TemplateAsunto, TipoEspecial, Orden, CreadoPor)
                    VALUES
                        (N'Reporte Nocturno de Ventas',
                         N'Alcance de presupuesto por canal: Hoy, Ayer, Semana, Mes y YTD.',
                         N'🌙', N'Ventas',
                         N'-- Gestionado por reporteNocturno.js',
                         N'Diario', N'21:00',
                         N'html',
                         N'🌙 Reporte Nocturno de Ventas — {{fecha}}',
                         N'alcance-nocturno',
                         10, N'sistema')
                `);
                console.log('✅ Reports: Reporte Nocturno de Ventas registrado');
            }
        } catch (e) {
            console.warn('⚠️ Reports: Could not seed reporte nocturno:', e.message);
        }

        console.log('✅ Reports tables ensured');
    } catch (error) {
        console.error('❌ Error ensuring reports tables:', error.message);
    }
}

// ============================================
// REPORT CRUD
// ============================================

async function getReports() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT r.*, 
            (SELECT COUNT(*) FROM DIM_REPORTE_SUSCRIPCIONES WHERE ReporteID = r.ID AND Activo = 1) AS TotalSuscriptores
        FROM DIM_REPORTES r
        ORDER BY r.Orden, r.Nombre
    `);
    return result.recordset;
}

async function getReportsForUser(userId, perfilId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('perfilId', sql.Int, perfilId || 0)
        .query(`
            SELECT DISTINCT r.*,
                CASE WHEN s.ID IS NOT NULL THEN 1 ELSE 0 END AS Suscrito,
                s.Activo AS SuscripcionActiva,
                s.ID AS SuscripcionID
            FROM DIM_REPORTES r
            LEFT JOIN DIM_REPORTE_ACCESO a ON a.ReporteID = r.ID AND a.PerfilID = @perfilId
            LEFT JOIN DIM_REPORTE_SUSCRIPCIONES s ON s.ReporteID = r.ID AND s.UsuarioID = @userId
            WHERE r.Activo = 1
              AND (a.PerfilID IS NOT NULL OR EXISTS (
                  SELECT 1 FROM DIM_USUARIOS WHERE ID = @userId AND (EsAdmin = 1 OR AccesoReportes = 1)
              ))
            ORDER BY r.Orden, r.Nombre
        `);
    return result.recordset;
}

async function getReportById(id) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM DIM_REPORTES WHERE ID = @id');
    return result.recordset[0] || null;
}

async function createReport(data, createdBy) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombre', sql.NVarChar(200), data.nombre)
        .input('descripcion', sql.NVarChar(500), data.descripcion || null)
        .input('icono', sql.NVarChar(10), data.icono || '📊')
        .input('categoria', sql.NVarChar(100), data.categoria || 'General')
        .input('querySQL', sql.NVarChar(sql.MAX), data.querySQL)
        .input('columnas', sql.NVarChar(sql.MAX), data.columnas ? JSON.stringify(data.columnas) : null)
        .input('parametros', sql.NVarChar(sql.MAX), data.parametros ? JSON.stringify(data.parametros) : null)
        .input('frecuencia', sql.NVarChar(20), data.frecuencia || 'Diario')
        .input('horaEnvio', sql.NVarChar(5), data.horaEnvio || '07:00')
        .input('diaSemana', sql.Int, data.diaSemana || null)
        .input('diaMes', sql.Int, data.diaMes || null)
        .input('formatoSalida', sql.NVarChar(20), data.formatoSalida || 'html')
        .input('templateAsunto', sql.NVarChar(500), data.templateAsunto || null)
        .input('templateEncabezado', sql.NVarChar(sql.MAX), data.templateEncabezado || null)
        .input('tipoEspecial', sql.NVarChar(100), data.tipoEspecial || null)
        .input('permitirProgramacionCustom', sql.Bit, data.permitirProgramacionCustom !== undefined ? data.permitirProgramacionCustom : true)
        .input('permitirEnviarAhora', sql.Bit, data.permitirEnviarAhora !== undefined ? data.permitirEnviarAhora : true)
        .input('orden', sql.Int, data.orden || 0)
        .input('creadoPor', sql.NVarChar(200), createdBy)
        .query(`
            INSERT INTO DIM_REPORTES (Nombre, Descripcion, Icono, Categoria, QuerySQL, Columnas, Parametros,
                Frecuencia, HoraEnvio, DiaSemana, DiaMes, FormatoSalida, TemplateAsunto, TemplateEncabezado, TipoEspecial, PermitirProgramacionCustom, PermitirEnviarAhora, Orden, CreadoPor)
            VALUES (@nombre, @descripcion, @icono, @categoria, @querySQL, @columnas, @parametros,
                @frecuencia, @horaEnvio, @diaSemana, @diaMes, @formatoSalida, @templateAsunto, @templateEncabezado, @tipoEspecial, @permitirProgramacionCustom, @permitirEnviarAhora, @orden, @creadoPor);
            SELECT SCOPE_IDENTITY() AS ID
        `);
    return result.recordset[0].ID;
}

async function updateReport(id, data, modifiedBy) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('nombre', sql.NVarChar(200), data.nombre)
        .input('descripcion', sql.NVarChar(500), data.descripcion || null)
        .input('icono', sql.NVarChar(10), data.icono || '📊')
        .input('categoria', sql.NVarChar(100), data.categoria || 'General')
        .input('querySQL', sql.NVarChar(sql.MAX), data.querySQL)
        .input('columnas', sql.NVarChar(sql.MAX), data.columnas ? JSON.stringify(data.columnas) : null)
        .input('parametros', sql.NVarChar(sql.MAX), data.parametros ? JSON.stringify(data.parametros) : null)
        .input('frecuencia', sql.NVarChar(20), data.frecuencia || 'Diario')
        .input('horaEnvio', sql.NVarChar(5), data.horaEnvio || '07:00')
        .input('diaSemana', sql.Int, data.diaSemana || null)
        .input('diaMes', sql.Int, data.diaMes || null)
        .input('formatoSalida', sql.NVarChar(20), data.formatoSalida || 'html')
        .input('templateAsunto', sql.NVarChar(500), data.templateAsunto || null)
        .input('templateEncabezado', sql.NVarChar(sql.MAX), data.templateEncabezado || null)
        .input('tipoEspecial', sql.NVarChar(100), data.tipoEspecial || null)
        .input('permitirProgramacionCustom', sql.Bit, data.permitirProgramacionCustom !== undefined ? data.permitirProgramacionCustom : true)
        .input('permitirEnviarAhora', sql.Bit, data.permitirEnviarAhora !== undefined ? data.permitirEnviarAhora : true)
        .input('activo', sql.Bit, data.activo !== undefined ? data.activo : true)
        .input('orden', sql.Int, data.orden || 0)
        .input('modificadoPor', sql.NVarChar(200), modifiedBy)
        .query(`
            UPDATE DIM_REPORTES SET
                Nombre = @nombre, Descripcion = @descripcion, Icono = @icono, Categoria = @categoria,
                QuerySQL = @querySQL, Columnas = @columnas, Parametros = @parametros,
                Frecuencia = @frecuencia, HoraEnvio = @horaEnvio, DiaSemana = @diaSemana, DiaMes = @diaMes,
                FormatoSalida = @formatoSalida, TemplateAsunto = @templateAsunto, TemplateEncabezado = @templateEncabezado,
                TipoEspecial = @tipoEspecial, PermitirProgramacionCustom = @permitirProgramacionCustom, PermitirEnviarAhora = @permitirEnviarAhora, Activo = @activo, Orden = @orden,
                ModificadoPor = @modificadoPor, FechaModificacion = GETDATE()
            WHERE ID = @id
        `);
}

async function deleteReport(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM DIM_REPORTES WHERE ID = @id');
}

// ============================================
// SUBSCRIPTIONS
// ============================================

async function getSubscriptions(userId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT s.*, r.Nombre, r.Descripcion, r.Icono, r.Categoria, r.Frecuencia AS FrecuenciaDefault,
                r.HoraEnvio AS HoraEnvioDefault, r.DiaSemana AS DiaSemanaDefault, r.DiaMes AS DiaMesDefault
            FROM DIM_REPORTE_SUSCRIPCIONES s
            JOIN DIM_REPORTES r ON r.ID = s.ReporteID
            WHERE s.UsuarioID = @userId
            ORDER BY r.Nombre
        `);
    return result.recordset;
}

async function subscribe(reporteId, userId, config = {}) {
    const pool = await poolPromise;
    // Upsert: insert or reactivate
    const existing = await pool.request()
        .input('reporteId', sql.Int, reporteId)
        .input('userId', sql.Int, userId)
        .query('SELECT ID FROM DIM_REPORTE_SUSCRIPCIONES WHERE ReporteID = @reporteId AND UsuarioID = @userId');

    if (existing.recordset.length > 0) {
        await pool.request()
            .input('id', sql.Int, existing.recordset[0].ID)
            .input('emailDestino', sql.NVarChar(200), config.emailDestino || null)
            .input('frecuenciaPersonal', sql.NVarChar(20), config.frecuenciaPersonal || null)
            .input('horaEnvioPersonal', sql.NVarChar(5), config.horaEnvioPersonal || null)
            .input('diaSemanaPersonal', sql.Int, config.diaSemanaPersonal || null)
            .input('diaMesPersonal', sql.Int, config.diaMesPersonal || null)
            .input('parametrosFijos', sql.NVarChar(sql.MAX), config.parametrosFijos ? JSON.stringify(config.parametrosFijos) : null)
            .query(`
                UPDATE DIM_REPORTE_SUSCRIPCIONES SET 
                    Activo = 1, EmailDestino = @emailDestino, FrecuenciaPersonal = @frecuenciaPersonal,
                    HoraEnvioPersonal = @horaEnvioPersonal, DiaSemanaPersonal = @diaSemanaPersonal,
                    DiaMesPersonal = @diaMesPersonal, ParametrosFijos = @parametrosFijos
                WHERE ID = @id
            `);
        return existing.recordset[0].ID;
    } else {
        const result = await pool.request()
            .input('reporteId', sql.Int, reporteId)
            .input('userId', sql.Int, userId)
            .input('emailDestino', sql.NVarChar(200), config.emailDestino || null)
            .input('frecuenciaPersonal', sql.NVarChar(20), config.frecuenciaPersonal || null)
            .input('horaEnvioPersonal', sql.NVarChar(5), config.horaEnvioPersonal || null)
            .input('diaSemanaPersonal', sql.Int, config.diaSemanaPersonal || null)
            .input('diaMesPersonal', sql.Int, config.diaMesPersonal || null)
            .input('parametrosFijos', sql.NVarChar(sql.MAX), config.parametrosFijos ? JSON.stringify(config.parametrosFijos) : null)
            .query(`
                INSERT INTO DIM_REPORTE_SUSCRIPCIONES (ReporteID, UsuarioID, EmailDestino, FrecuenciaPersonal, 
                    HoraEnvioPersonal, DiaSemanaPersonal, DiaMesPersonal, ParametrosFijos)
                VALUES (@reporteId, @userId, @emailDestino, @frecuenciaPersonal,
                    @horaEnvioPersonal, @diaSemanaPersonal, @diaMesPersonal, @parametrosFijos);
                SELECT SCOPE_IDENTITY() AS ID
            `);
        return result.recordset[0].ID;
    }
}

async function unsubscribe(reporteId, userId) {
    const pool = await poolPromise;
    await pool.request()
        .input('reporteId', sql.Int, reporteId)
        .input('userId', sql.Int, userId)
        .query('DELETE FROM DIM_REPORTE_SUSCRIPCIONES WHERE ReporteID = @reporteId AND UsuarioID = @userId');
}

async function toggleSubscription(subscriptionId, activo) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, subscriptionId)
        .input('activo', sql.Bit, activo)
        .query('UPDATE DIM_REPORTE_SUSCRIPCIONES SET Activo = @activo WHERE ID = @id');
}

async function updateSubscription(subscriptionId, config) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, subscriptionId)
        .input('emailDestino', sql.NVarChar(200), config.emailDestino || null)
        .input('frecuenciaPersonal', sql.NVarChar(20), config.frecuenciaPersonal || null)
        .input('horaEnvioPersonal', sql.NVarChar(5), config.horaEnvioPersonal || null)
        .input('diaSemanaPersonal', sql.Int, config.diaSemanaPersonal || null)
        .input('diaMesPersonal', sql.Int, config.diaMesPersonal || null)
        .input('parametrosFijos', sql.NVarChar(sql.MAX), config.parametrosFijos ? JSON.stringify(config.parametrosFijos) : null)
        .input('activo', sql.Bit, config.activo !== undefined ? config.activo : true)
        .query(`
            UPDATE DIM_REPORTE_SUSCRIPCIONES SET 
                Activo = @activo, EmailDestino = @emailDestino, FrecuenciaPersonal = @frecuenciaPersonal,
                HoraEnvioPersonal = @horaEnvioPersonal, DiaSemanaPersonal = @diaSemanaPersonal,
                DiaMesPersonal = @diaMesPersonal, ParametrosFijos = @parametrosFijos
            WHERE ID = @id
        `);
}

// ============================================
// ACCESS CONTROL
// ============================================

async function getReportAccess() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT a.*, r.Nombre AS ReporteNombre, p.Nombre AS PerfilNombre
        FROM DIM_REPORTE_ACCESO a
        JOIN DIM_REPORTES r ON r.ID = a.ReporteID
        JOIN DIM_PERFILES p ON p.ID = a.PerfilID
        ORDER BY r.Nombre, p.Nombre
    `);
    return result.recordset;
}

async function setProfileAccess(reporteId, perfilId, grant, assignedBy) {
    const pool = await poolPromise;
    if (grant) {
        // Upsert
        const existing = await pool.request()
            .input('reporteId', sql.Int, reporteId)
            .input('perfilId', sql.Int, perfilId)
            .query('SELECT ID FROM DIM_REPORTE_ACCESO WHERE ReporteID = @reporteId AND PerfilID = @perfilId');

        if (existing.recordset.length === 0) {
            await pool.request()
                .input('reporteId', sql.Int, reporteId)
                .input('perfilId', sql.Int, perfilId)
                .input('asignadoPor', sql.NVarChar(200), assignedBy)
                .query('INSERT INTO DIM_REPORTE_ACCESO (ReporteID, PerfilID, AsignadoPor) VALUES (@reporteId, @perfilId, @asignadoPor)');
        }
    } else {
        await pool.request()
            .input('reporteId', sql.Int, reporteId)
            .input('perfilId', sql.Int, perfilId)
            .query('DELETE FROM DIM_REPORTE_ACCESO WHERE ReporteID = @reporteId AND PerfilID = @perfilId');
    }
}

async function bulkSetAccess(reporteId, perfilIds, assignedBy) {
    const pool = await poolPromise;
    // Remove all existing
    await pool.request()
        .input('reporteId', sql.Int, reporteId)
        .query('DELETE FROM DIM_REPORTE_ACCESO WHERE ReporteID = @reporteId');
    // Add new
    for (const perfilId of perfilIds) {
        await pool.request()
            .input('reporteId', sql.Int, reporteId)
            .input('perfilId', sql.Int, perfilId)
            .input('asignadoPor', sql.NVarChar(200), assignedBy)
            .query('INSERT INTO DIM_REPORTE_ACCESO (ReporteID, PerfilID, AsignadoPor) VALUES (@reporteId, @perfilId, @asignadoPor)');
    }
}

// ============================================
// REPORT EXECUTION
// ============================================

async function executeReport(reportId, params = {}) {
    const pool = await poolPromise;

    // Get report definition
    const report = await getReportById(reportId);
    if (!report) throw new Error('Reporte no encontrado');

    let querySQL = report.QuerySQL;

    // Replace parameter placeholders: {{local}}, {{canal}}, etc.
    const allowedParams = report.Parametros ? JSON.parse(report.Parametros) : [];
    for (const p of allowedParams) {
        const value = params[p] || '';
        querySQL = querySQL.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), value.replace(/'/g, "''"));
    }

    try {
        const result = await pool.request().query(querySQL);
        return {
            columns: report.Columnas ? JSON.parse(report.Columnas) : null,
            data: result.recordset,
            rowCount: result.recordset.length
        };
    } catch (error) {
        throw new Error(`Error ejecutando reporte: ${error.message}`);
    }
}

// Mark that a subscription was sent
async function markSubscriptionSent(subscriptionId) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, subscriptionId)
        .query(`
            UPDATE DIM_REPORTE_SUSCRIPCIONES 
            SET UltimoEnvio = GETDATE(), TotalEnvios = TotalEnvios + 1 
            WHERE ID = @id
        `);
}

// Get active subscriptions that need to be sent now
async function getDueSubscriptions(currentHour, currentMinute, dayOfWeek, dayOfMonth) {
    const pool = await poolPromise;
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    const result = await pool.request()
        .input('timeStr', sql.NVarChar(5), timeStr)
        .input('dayOfWeek', sql.Int, dayOfWeek)
        .input('dayOfMonth', sql.Int, dayOfMonth)
        .query(`
            SELECT s.*, r.QuerySQL, r.Columnas, r.Parametros, r.Nombre AS ReporteNombre,
                r.TemplateAsunto, r.TemplateEncabezado, r.FormatoSalida, r.TipoEspecial,
                r.Frecuencia AS FrecuenciaDefault, r.HoraEnvio AS HoraEnvioDefault,
                r.DiaSemana AS DiaSemanaDefault, r.DiaMes AS DiaMesDefault,
                u.Email, u.Nombre AS UsuarioNombre
            FROM DIM_REPORTE_SUSCRIPCIONES s
            JOIN DIM_REPORTES r ON r.ID = s.ReporteID AND r.Activo = 1
            JOIN DIM_USUARIOS u ON u.ID = s.UsuarioID AND u.Activo = 1
            WHERE s.Activo = 1
              AND COALESCE(s.HoraEnvioPersonal, r.HoraEnvio) = @timeStr
              AND (
                  -- Diario: siempre
                  (COALESCE(s.FrecuenciaPersonal, r.Frecuencia) = 'Diario')
                  -- Semanal: día de la semana correcto
                  OR (COALESCE(s.FrecuenciaPersonal, r.Frecuencia) = 'Semanal' 
                      AND COALESCE(s.DiaSemanaPersonal, r.DiaSemana) = @dayOfWeek)
                  -- Mensual: día del mes correcto
                  OR (COALESCE(s.FrecuenciaPersonal, r.Frecuencia) = 'Mensual' 
                      AND COALESCE(s.DiaMesPersonal, r.DiaMes) = @dayOfMonth)
              )
        `);
    return result.recordset;
}

module.exports = {
    ensureReportsTables,
    getReports,
    getReportsForUser,
    getReportById,
    createReport,
    updateReport,
    deleteReport,
    getSubscriptions,
    subscribe,
    unsubscribe,
    toggleSubscription,
    updateSubscription,
    getReportAccess,
    setProfileAccess,
    bulkSetAccess,
    executeReport,
    markSubscriptionSent,
    getDueSubscriptions
};
