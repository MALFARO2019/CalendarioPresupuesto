const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Ensure security tables exist in the database
 */
async function ensureSecurityTables() {
    try {
        const pool = await poolPromise;

        // Create APP_USUARIOS table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIOS' AND xtype='U')
            BEGIN
                CREATE TABLE APP_USUARIOS (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Email NVARCHAR(255) NOT NULL UNIQUE,
                    Nombre NVARCHAR(255) NULL,
                    Clave NVARCHAR(10) NOT NULL DEFAULT '000000',
                    Activo BIT NOT NULL DEFAULT 1,
                    AccesoTendencia BIT NOT NULL DEFAULT 0,
                    AccesoTactica BIT NOT NULL DEFAULT 0,
                    AccesoEventos BIT NOT NULL DEFAULT 0,
                    EsAdmin BIT NOT NULL DEFAULT 0,
                    EsProtegido BIT NOT NULL DEFAULT 0,
                    FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
                    FechaModificacion DATETIME NULL
                );
            END
        `);

        // Add Clave column if table already exists but column doesn't
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'Clave')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD Clave NVARCHAR(10) NOT NULL DEFAULT '000000';
            END
        `);

        // Add permission columns if they don't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoTendencia')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoTendencia BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoEventos')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoEventos BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoTactica')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoTactica BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'EsAdmin')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD EsAdmin BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'EsProtegido')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD EsProtegido BIT NOT NULL DEFAULT 0;
            END
        `);

        // Add module-specific permissions
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoPresupuesto')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoPresupuesto BIT NOT NULL DEFAULT 1;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoTiempos')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoTiempos BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoEvaluaciones')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoEvaluaciones BIT NOT NULL DEFAULT 0;
            END

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoPersonal')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoPersonal BIT NOT NULL DEFAULT 0;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoInventarios')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoInventarios BIT NOT NULL DEFAULT 0;
            END
        `);

        // Add granular Presupuesto permissions
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoPresupuestoMensual')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoPresupuestoMensual BIT NOT NULL DEFAULT 1;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoPresupuestoAnual')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoPresupuestoAnual BIT NOT NULL DEFAULT 1;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoPresupuestoRangos')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoPresupuestoRangos BIT NOT NULL DEFAULT 1;
            END
        `);

        // Add Modelo Presupuesto permissions to APP_USUARIOS
        const modeloPresupuestoColumns = [
            'accesoModeloPresupuesto', 'verConfigModelo', 'verConsolidadoMensual',
            'verAjustePresupuesto', 'verVersiones', 'verBitacora', 'verReferencias',
            'editarConsolidado', 'ejecutarRecalculo', 'ajustarCurva', 'restaurarVersiones'
        ];
        for (const col of modeloPresupuestoColumns) {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = '${col}')
                BEGIN
                    ALTER TABLE APP_USUARIOS ADD [${col}] BIT NOT NULL DEFAULT 0;
                END
            `);
        }

        // Add DashboardLocales column for user-specific KPI config
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'DashboardLocales')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD DashboardLocales NVARCHAR(MAX) NULL;
            END
        `);

        // Add ComparativePeriod column for user-specific comparative period preference
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'ComparativePeriod')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD ComparativePeriod VARCHAR(20) NULL DEFAULT 'Month';
            END
        `);

        // Add PermitirEnvioClave column (controls if user can receive password by email)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'PermitirEnvioClave')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD PermitirEnvioClave BIT NOT NULL DEFAULT 1;
            END
        `);

        // Add Cedula and Telefono columns to APP_USUARIOS (migrated from DIM_PERSONAL)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'Cedula')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD Cedula NVARCHAR(30) NULL;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'Telefono')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD Telefono NVARCHAR(30) NULL;
            END
        `);

        // TODO:  Create performance indexes on RSM_ALCANCE_DIARIO if they don't exist
        // Temporarily commented out - KPI column doesn't exist in RSM_ALCANCE_DIARIO
        /*
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ALCANCE_Local_KPI_Fecha' AND object_id = OBJECT_ID('RSM_ALCANCE_DIARIO'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_ALCANCE_Local_KPI_Fecha 
                ON RSM_ALCANCE_DIARIO (Local, KPI, Fecha)
                INCLUDE (MontoReal, Monto, MontoAnterior, MontoRealAcumulado, MontoAcumulado);
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ALCANCE_Fecha' AND object_id = OBJECT_ID('RSM_ALCANCE_DIARIO'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_ALCANCE_Fecha 
                ON RSM_ALCANCE_DIARIO (Fecha)
                INCLUDE (Local, KPI, MontoReal, Monto, MontoAnterior);
            END
        `);
        */


        // Create APP_USUARIO_ALMACEN table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIO_ALMACEN' AND xtype='U')
            BEGIN
                CREATE TABLE APP_USUARIO_ALMACEN (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    UsuarioId INT NOT NULL,
                    Local NVARCHAR(255) NOT NULL,
                    CONSTRAINT FK_UsuarioAlmacen_Usuario FOREIGN KEY (UsuarioId) 
                        REFERENCES APP_USUARIOS(Id) ON DELETE CASCADE
                );
            END
        `);

        // Create APP_USUARIO_CANAL table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIO_CANAL' AND xtype='U')
            BEGIN
                CREATE TABLE APP_USUARIO_CANAL (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    UsuarioId INT NOT NULL,
                    Canal NVARCHAR(50) NOT NULL,
                    CONSTRAINT FK_UsuarioCanal_Usuario FOREIGN KEY (UsuarioId) 
                        REFERENCES APP_USUARIOS(Id) ON DELETE CASCADE
                );
                
                CREATE INDEX IX_UsuarioCanal_UsuarioId ON APP_USUARIO_CANAL(UsuarioId);
            END
        `);

        // Migrate existing users: assign all canales to users who don't have any
        await pool.request().query(`
            DECLARE @AllCanales TABLE (Canal NVARCHAR(50));
            INSERT INTO @AllCanales VALUES 
                ('Salón'),
                ('Llevar'),
                ('Express'),
                ('AutoPollo'),
                ('UberEats'),
                ('ECommerce'),
                ('WhatsApp');

            INSERT INTO APP_USUARIO_CANAL (UsuarioId, Canal)
            SELECT u.Id, c.Canal
            FROM APP_USUARIOS u
            CROSS JOIN @AllCanales c
            WHERE NOT EXISTS (SELECT 1 FROM APP_USUARIO_CANAL uc WHERE uc.UsuarioId = u.Id);
        `);


        // Create or update superadmin user
        const superAdminResult = await pool.request().query(`
            SELECT Id FROM APP_USUARIOS WHERE Email = 'soporte@rostipolloscr.com'
        `);

        if (superAdminResult.recordset.length === 0) {
            await pool.request().query(`
                INSERT INTO APP_USUARIOS (Email, Nombre, Clave, Activo, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, EsAdmin, EsProtegido)
                VALUES ('soporte@rostipolloscr.com', 'Soporte Técnico', 'R0st1p017', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
            `);
            console.log('✅ Superadmin user created');
        } else {
            await pool.request().query(`
                UPDATE APP_USUARIOS
                SET Nombre = 'Soporte Técnico',
                    Clave = 'R0st1p017',
                    Activo = 1,
                    AccesoTendencia = 1,
                    AccesoTactica = 1,
                    AccesoEventos = 1,
                    AccesoPresupuesto = 1,
                    AccesoTiempos = 1,
                    AccesoEvaluaciones = 1,
                    AccesoInventarios = 1,
                    AccesoPersonal = 1,
                    EsAdmin = 1,
                    EsProtegido = 1,
                    accesoModeloPresupuesto = 1,
                    verConfigModelo = 1,
                    verConsolidadoMensual = 1,
                    verAjustePresupuesto = 1,
                    verVersiones = 1,
                    verBitacora = 1,
                    verReferencias = 1,
                    editarConsolidado = 1,
                    ejecutarRecalculo = 1,
                    ajustarCurva = 1,
                    restaurarVersiones = 1
                WHERE Email = 'soporte@rostipolloscr.com'
            `);
        }

        // Create APP_CONFIGURACION table for system-wide settings
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_CONFIGURACION' AND xtype='U')
            BEGIN
                CREATE TABLE APP_CONFIGURACION (
                    Clave NVARCHAR(100) NOT NULL PRIMARY KEY,
                    Valor NVARCHAR(MAX) NOT NULL,
                    FechaModificacion DATETIME NULL,
                    UsuarioModificacion NVARCHAR(255) NULL
                );
            END
        `);

        // Insert default Tactica prompt if not exists
        const tacticaPromptExists = await pool.request()
            .input('clave', sql.NVarChar, 'TACTICA_PROMPT')
            .query('SELECT Clave FROM APP_CONFIGURACION WHERE Clave = @clave');

        if (tacticaPromptExists.recordset.length === 0) {
            const defaultPrompt = `Sos un consultor estratégico de ventas para la cadena de restaurantes Rostipollos en Costa Rica.

Analizá los siguientes datos de **{{kpi}}** para **{{storeName}}** del año **{{year}}** y generá un reporte EJECUTIVO de oportunidades tácticas.

## Datos Mensuales
{{monthlyTable}}

## Totales Anuales
{{annualTotals}}

## Instrucciones
Generá un análisis EJECUTIVO en español, con las siguientes secciones. Usá formato markdown:

### 1. 📊 Resumen Ejecutivo
Un párrafo conciso con la situación actual del negocio.

### 2. 🔍 Análisis de Brechas
- Identificá los meses con mayor diferencia negativa entre Real y Presupuesto.
- Comparación con año anterior: ¿estamos creciendo o decreciendo?
- Identificá patrones (ej: meses débiles sistemáticos).

### 3. 🎯 Oportunidades Tácticas (Top 5)
Las 5 oportunidades más concretas y accionables para mejorar {{kpi}}, con estimación de impacto potencial en colones o porcentaje.

### 4. ⚠️ Alertas y Riesgos
Meses futuros que requieren atención especial basándose en tendencias históricas.

### 5. 📈 Proyección y Metas
- ¿Es alcanzable el presupuesto anual basándose en la tendencia actual?
- ¿Cuánto necesitamos vender diariamente en promedio para cerrar la brecha?
- Meta sugerida para los próximos 3 meses.

IMPORTANTE:
- Sé específico con números y porcentajes.
- Enfocate en acciones PRÁCTICAS para un gerente de restaurante.
- No repitas los datos crudos, interpretalos.
- Máximo 600 palabras.
- Usá colones costarricenses (₡) como moneda.`;

            await pool.request()
                .input('clave', sql.NVarChar, 'TACTICA_PROMPT')
                .input('valor', sql.NVarChar, defaultPrompt)
                .query('INSERT INTO APP_CONFIGURACION (Clave, Valor) VALUES (@clave, @valor)');
            console.log('✅ Default Tactica prompt inserted');
        }

        // Create APP_PERFILES table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_PERFILES' AND xtype='U')
            BEGIN
                CREATE TABLE APP_PERFILES (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Nombre NVARCHAR(100) NOT NULL UNIQUE,
                    Descripcion NVARCHAR(500) NULL,
                    AccesoTendencia BIT NOT NULL DEFAULT 0,
                    AccesoTactica BIT NOT NULL DEFAULT 0,
                    AccesoEventos BIT NOT NULL DEFAULT 0,
                    AccesoPresupuesto BIT NOT NULL DEFAULT 1,
                    AccesoPresupuestoMensual BIT NOT NULL DEFAULT 1,
                    AccesoPresupuestoAnual BIT NOT NULL DEFAULT 1,
                    AccesoPresupuestoRangos BIT NOT NULL DEFAULT 1,
                    AccesoTiempos BIT NOT NULL DEFAULT 0,
                    AccesoEvaluaciones BIT NOT NULL DEFAULT 0,
                    AccesoInventarios BIT NOT NULL DEFAULT 0,
                    AccesoPersonal BIT NOT NULL DEFAULT 0,
                    EsAdmin BIT NOT NULL DEFAULT 0,
                    PermitirEnvioClave BIT NOT NULL DEFAULT 1,
                    FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
                    FechaModificacion DATETIME NULL,
                    UsuarioCreador NVARCHAR(255) NULL
                );
            END
        `);

        // Add granular Presupuesto permissions to APP_PERFILES if they don't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_PERFILES') AND name = 'AccesoPresupuestoMensual')
            BEGIN
                ALTER TABLE APP_PERFILES ADD AccesoPresupuestoMensual BIT NOT NULL DEFAULT 1;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_PERFILES') AND name = 'AccesoPresupuestoAnual')
            BEGIN
                ALTER TABLE APP_PERFILES ADD AccesoPresupuestoAnual BIT NOT NULL DEFAULT 1;
            END
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_PERFILES') AND name = 'AccesoPresupuestoRangos')
            BEGIN
                ALTER TABLE APP_PERFILES ADD AccesoPresupuestoRangos BIT NOT NULL DEFAULT 1;
            END
        `);

        // Add AccesoPersonal column to APP_PERFILES if it doesn't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_PERFILES') AND name = 'AccesoPersonal')
            BEGIN
                ALTER TABLE APP_PERFILES ADD AccesoPersonal BIT NOT NULL DEFAULT 0;
            END
        `);

        // Add Modelo Presupuesto permissions to APP_PERFILES
        for (const col of modeloPresupuestoColumns) {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_PERFILES') AND name = '${col}')
                BEGIN
                    ALTER TABLE APP_PERFILES ADD [${col}] BIT NOT NULL DEFAULT 0;
                END
            `);
        }

        // Add PerfilId column to APP_USUARIOS if it doesn't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'PerfilId')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD PerfilId INT NULL;
                ALTER TABLE APP_USUARIOS ADD CONSTRAINT FK_Usuario_Perfil 
                    FOREIGN KEY (PerfilId) REFERENCES APP_PERFILES(Id) ON DELETE SET NULL;
                CREATE NONCLUSTERED INDEX IX_Usuarios_PerfilId ON APP_USUARIOS(PerfilId);
            END
        `);

        // Insert default profiles if they don't exist
        const profilesExist = await pool.request()
            .query('SELECT COUNT(*) as Count FROM APP_PERFILES');

        if (profilesExist.recordset[0].Count === 0) {
            await pool.request().query(`
                INSERT INTO APP_PERFILES (Nombre, Descripcion, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoPresupuestoMensual, AccesoPresupuestoAnual, AccesoPresupuestoRangos, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, AccesoPersonal, EsAdmin, PermitirEnvioClave, UsuarioCreador)
                VALUES 
                    ('Administrador', 'Acceso completo a todos los módulos y configuración del sistema', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'Sistema'),
                    ('Gerente Regional', 'Acceso a presupuesto, tendencia y análisis táctico para gestión de múltiples locales', 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 'Sistema'),
                    ('Supervisor', 'Acceso a presupuesto y gestión de eventos', 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 'Sistema'),
                    ('Consulta', 'Solo lectura de módulo de presupuesto, sin envío de clave por correo', 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 'Sistema');
            `);
            /* Note: If columns were added later, UPDATE existing profiles here to set defaults if needed */

            console.log('✅ Default profiles created');
        }

        // Create APP_BITACORA_LOGIN table for login audit
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_BITACORA_LOGIN' AND xtype='U')
            BEGIN
                CREATE TABLE APP_BITACORA_LOGIN (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Email NVARCHAR(255) NOT NULL,
                    Nombre NVARCHAR(255) NULL,
                    Exito BIT NOT NULL DEFAULT 0,
                    Motivo NVARCHAR(255) NULL,
                    IP NVARCHAR(100) NULL,
                    UserAgent NVARCHAR(500) NULL,
                    Fecha DATETIME NOT NULL DEFAULT GETDATE()
                );
            END
        `);

        console.log('✅ Security tables verified/created');
    } catch (err) {
        console.error('⚠️ Could not create security tables:', err.message);
    }
}

/**
 * Log a login event (fire-and-forget)
 */
async function logLoginEvent(email, nombre, exito, motivo, ip, userAgent) {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('email', sql.NVarChar, email || '')
            .input('nombre', sql.NVarChar, nombre || null)
            .input('exito', sql.Bit, exito)
            .input('motivo', sql.NVarChar, motivo || null)
            .input('ip', sql.NVarChar, (ip || '').substring(0, 100))
            .input('userAgent', sql.NVarChar, (userAgent || '').substring(0, 500))
            .query('INSERT INTO APP_BITACORA_LOGIN (Email, Nombre, Exito, Motivo, IP, UserAgent) VALUES (@email, @nombre, @exito, @motivo, @ip, @userAgent)');
    } catch (err) {
        console.error('⚠️ Error logging login event:', err.message);
    }
}

/**
 * Get login audit log with optional filters
 */
async function getLoginAudit(fechaDesde, fechaHasta, emailFilter) {
    const pool = await poolPromise;
    let query = 'SELECT TOP 500 Id, Email, Nombre, Exito, Motivo, IP, UserAgent, Fecha FROM APP_BITACORA_LOGIN WHERE 1=1';
    const request = pool.request();

    if (fechaDesde) {
        query += ' AND Fecha >= @desde';
        request.input('desde', sql.DateTime, new Date(fechaDesde));
    }
    if (fechaHasta) {
        // Add 1 day to include the entire end date
        const hasta = new Date(fechaHasta);
        hasta.setDate(hasta.getDate() + 1);
        query += ' AND Fecha < @hasta';
        request.input('hasta', sql.DateTime, hasta);
    }
    if (emailFilter) {
        query += ' AND Email LIKE @emailFilter';
        request.input('emailFilter', sql.NVarChar, `%${emailFilter}%`);
    }

    query += ' ORDER BY Fecha DESC';
    const result = await request.query(query);

    return result.recordset.map(r => ({
        id: r.Id,
        email: r.Email,
        nombre: r.Nombre,
        exito: r.Exito,
        motivo: r.Motivo,
        ip: r.IP,
        userAgent: r.UserAgent,
        fecha: r.Fecha
    }));
}

/**
 * Login: validate email + PIN, return long-lived JWT
 */
async function loginUser(email, clave, ip, userAgent) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT Id, Email, Nombre, Clave, Activo, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoPresupuestoMensual, AccesoPresupuestoAnual, AccesoPresupuestoRangos, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, AccesoPersonal, EsAdmin, EsProtegido, ISNULL(accesoModeloPresupuesto,0) as accesoModeloPresupuesto, ISNULL(verConfigModelo,0) as verConfigModelo, ISNULL(verConsolidadoMensual,0) as verConsolidadoMensual, ISNULL(verAjustePresupuesto,0) as verAjustePresupuesto, ISNULL(verVersiones,0) as verVersiones, ISNULL(verBitacora,0) as verBitacora, ISNULL(verReferencias,0) as verReferencias, ISNULL(editarConsolidado,0) as editarConsolidado, ISNULL(ejecutarRecalculo,0) as ejecutarRecalculo, ISNULL(ajustarCurva,0) as ajustarCurva, ISNULL(restaurarVersiones,0) as restaurarVersiones FROM APP_USUARIOS WHERE Email = @email');

    if (result.recordset.length === 0) {
        logLoginEvent(email, null, false, 'Usuario no encontrado', ip, userAgent);
        return { success: false, message: 'Usuario no encontrado. Contacte al administrador.' };
    }

    const user = result.recordset[0];

    console.log('🔐 Login attempt:', {
        email,
        claveReceived: `[${clave}]`,
        claveInDB: `[${user.Clave}]`,
        claveMatch: user.Clave.trim() === clave.trim()
    });

    if (!user.Activo) {
        logLoginEvent(email, user.Nombre, false, 'Usuario desactivado', ip, userAgent);
        return { success: false, message: 'Usuario desactivado. Contacte al administrador.' };
    }

    // Verify PIN - trim both values to avoid whitespace issues
    if (user.Clave.trim() !== clave.trim()) {
        console.log('❌ Password mismatch');
        logLoginEvent(email, user.Nombre, false, 'Clave incorrecta', ip, userAgent);
        return { success: false, message: 'Clave incorrecta.' };
    }

    // Get user's allowed stores
    const storesResult = await pool.request()
        .input('userId', sql.Int, user.Id)
        .query('SELECT Local FROM APP_USUARIO_ALMACEN WHERE UsuarioId = @userId');

    const allowedStores = storesResult.recordset.map(r => r.Local);

    // Get user's allowed canales
    const canalesResult = await pool.request()
        .input('userId', sql.Int, user.Id)
        .query('SELECT Canal FROM APP_USUARIO_CANAL WHERE UsuarioId = @userId');

    const allowedCanales = canalesResult.recordset.map(r => r.Canal);

    // Generate long-lived JWT (365 days - session persists until admin changes PIN)
    const token = jwt.sign(
        {
            userId: user.Id,
            email: user.Email,
            nombre: user.Nombre,
            allowedStores: allowedStores,
            allowedCanales: allowedCanales,
            claveHash: clave, // Store PIN in token to detect changes
            accesoTendencia: user.AccesoTendencia,
            accesoTactica: user.AccesoTactica,
            accesoEventos: user.AccesoEventos,
            accesoPresupuesto: user.AccesoPresupuesto,
            accesoPresupuestoMensual: user.AccesoPresupuestoMensual,
            accesoPresupuestoAnual: user.AccesoPresupuestoAnual,
            accesoPresupuestoRangos: user.AccesoPresupuestoRangos,
            accesoTiempos: user.AccesoTiempos,
            accesoEvaluaciones: user.AccesoEvaluaciones,
            accesoInventarios: user.AccesoInventarios,
            accesoPersonal: user.AccesoPersonal,
            // Modelo Presupuesto
            accesoModeloPresupuesto: user.accesoModeloPresupuesto,
            verConfigModelo: user.verConfigModelo,
            verConsolidadoMensual: user.verConsolidadoMensual,
            verAjustePresupuesto: user.verAjustePresupuesto,
            verVersiones: user.verVersiones,
            verBitacora: user.verBitacora,
            verReferencias: user.verReferencias,
            editarConsolidado: user.editarConsolidado,
            ejecutarRecalculo: user.ejecutarRecalculo,
            ajustarCurva: user.ajustarCurva,
            restaurarVersiones: user.restaurarVersiones,
            esAdmin: user.EsAdmin,
            esProtegido: user.EsProtegido
        },
        JWT_SECRET,
        { expiresIn: '365d' }
    );

    // Log successful login
    logLoginEvent(email, user.Nombre, true, 'Login exitoso', ip, userAgent);

    return {
        success: true,
        token,
        user: {
            id: user.Id,
            email: user.Email,
            nombre: user.Nombre,
            accesoTendencia: user.AccesoTendencia,
            accesoTactica: user.AccesoTactica,
            accesoEventos: user.AccesoEventos,
            accesoPresupuesto: user.AccesoPresupuesto,
            accesoPresupuestoMensual: user.AccesoPresupuestoMensual,
            accesoPresupuestoAnual: user.AccesoPresupuestoAnual,
            accesoPresupuestoRangos: user.AccesoPresupuestoRangos,
            accesoTiempos: user.AccesoTiempos,
            accesoEvaluaciones: user.AccesoEvaluaciones,
            accesoInventarios: user.AccesoInventarios,
            accesoPersonal: user.AccesoPersonal,
            // Modelo Presupuesto
            accesoModeloPresupuesto: user.accesoModeloPresupuesto,
            verConfigModelo: user.verConfigModelo,
            verConsolidadoMensual: user.verConsolidadoMensual,
            verAjustePresupuesto: user.verAjustePresupuesto,
            verVersiones: user.verVersiones,
            verBitacora: user.verBitacora,
            verReferencias: user.verReferencias,
            editarConsolidado: user.editarConsolidado,
            ejecutarRecalculo: user.ejecutarRecalculo,
            ajustarCurva: user.ajustarCurva,
            restaurarVersiones: user.restaurarVersiones,
            esAdmin: user.EsAdmin,
            esProtegido: user.EsProtegido,
            allowedStores,
            allowedCanales
        }
    };
}

/**
 * Middleware to verify JWT token and check PIN hasn't changed
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    console.log('🔐🔐🔐 AUTH MIDDLEWARE CALLED 🔐🔐🔐');
    console.log(`📍 ${req.method} ${req.path}`);
    console.log(`📨 Headers received:`, JSON.stringify(req.headers, null, 2));

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ FAILED: No auth header or invalid format');
        console.log('   authHeader:', authHeader);
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.substring(7);
    console.log(`🎫 Token received (first 50 chars): ${token.substring(0, 50)}...`);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`✅ Token verified successfully`);
        console.log(`👤 User: ${decoded.email} (admin: ${decoded.esAdmin})`);
        req.user = decoded;
        next();
    } catch (err) {
        console.log(`❌ FAILED: Token verification error`);
        console.log(`   Error:`, err.message);
        console.log(`   Token (first 100): ${token.substring(0, 100)}`);
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

/**
 * Verify token is still valid (user exists, is active, PIN hasn't changed)
 */
async function verifyTokenValid(decoded) {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, decoded.userId)
            .query('SELECT Id, Clave, Activo FROM APP_USUARIOS WHERE Id = @id');

        if (result.recordset.length === 0) return false;
        const user = result.recordset[0];
        if (!user.Activo) return false;
        // Check if PIN was changed by admin
        if (decoded.claveHash && user.Clave !== decoded.claveHash) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Verify admin password
 */
function verifyAdminPassword(password) {
    return password === ADMIN_PASSWORD;
}

/**
 * Get all users with their stores
 */
async function getAllUsers() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT u.Id, u.Email, u.Nombre, u.Clave, u.Activo, u.AccesoTendencia, u.AccesoTactica, u.AccesoEventos, u.AccesoPresupuesto, u.AccesoPresupuestoMensual, u.AccesoPresupuestoAnual, u.AccesoPresupuestoRangos, u.AccesoTiempos, u.AccesoEvaluaciones, u.AccesoInventarios, u.AccesoPersonal, u.EsAdmin, u.EsProtegido, u.FechaCreacion,
               u.Cedula, u.Telefono,
               ISNULL(u.PermitirEnvioClave, 1) as PermitirEnvioClave,
               u.PerfilId,
               ISNULL(u.accesoModeloPresupuesto, 0) as accesoModeloPresupuesto,
               ISNULL(u.verConfigModelo, 0) as verConfigModelo,
               ISNULL(u.verConsolidadoMensual, 0) as verConsolidadoMensual,
               ISNULL(u.verAjustePresupuesto, 0) as verAjustePresupuesto,
               ISNULL(u.verVersiones, 0) as verVersiones,
               ISNULL(u.verBitacora, 0) as verBitacora,
               ISNULL(u.verReferencias, 0) as verReferencias,
               ISNULL(u.editarConsolidado, 0) as editarConsolidado,
               ISNULL(u.ejecutarRecalculo, 0) as ejecutarRecalculo,
               ISNULL(u.ajustarCurva, 0) as ajustarCurva,
               ISNULL(u.restaurarVersiones, 0) as restaurarVersiones,
               (SELECT STRING_AGG(a2.Local, ', ') FROM APP_USUARIO_ALMACEN a2 WHERE a2.UsuarioId = u.Id) AS Almacenes,
               (SELECT STRING_AGG(c2.Canal, ', ') FROM APP_USUARIO_CANAL c2 WHERE c2.UsuarioId = u.Id) AS Canales
        FROM APP_USUARIOS u
        ORDER BY u.Email
    `);

    // Map SQL Server PascalCase to JavaScript camelCase
    return result.recordset.map(user => ({
        id: user.Id,
        email: user.Email,
        nombre: user.Nombre,
        clave: user.Clave,
        activo: user.Activo,
        accesoTendencia: user.AccesoTendencia,
        accesoTactica: user.AccesoTactica,
        accesoEventos: user.AccesoEventos,
        accesoPresupuesto: user.AccesoPresupuesto,
        accesoPresupuestoMensual: user.AccesoPresupuestoMensual,
        accesoPresupuestoAnual: user.AccesoPresupuestoAnual,
        accesoPresupuestoRangos: user.AccesoPresupuestoRangos,
        accesoTiempos: user.AccesoTiempos,
        accesoEvaluaciones: user.AccesoEvaluaciones,
        accesoInventarios: user.AccesoInventarios,
        accesoPersonal: user.AccesoPersonal,
        // Modelo Presupuesto
        accesoModeloPresupuesto: user.accesoModeloPresupuesto,
        verConfigModelo: user.verConfigModelo,
        verConsolidadoMensual: user.verConsolidadoMensual,
        verAjustePresupuesto: user.verAjustePresupuesto,
        verVersiones: user.verVersiones,
        verBitacora: user.verBitacora,
        verReferencias: user.verReferencias,
        editarConsolidado: user.editarConsolidado,
        ejecutarRecalculo: user.ejecutarRecalculo,
        ajustarCurva: user.ajustarCurva,
        restaurarVersiones: user.restaurarVersiones,
        esAdmin: user.EsAdmin,
        esProtegido: user.EsProtegido,
        permitirEnvioClave: user.PermitirEnvioClave,
        cedula: user.Cedula || null,
        telefono: user.Telefono || null,
        fechaCreacion: user.FechaCreacion,
        perfilId: user.PerfilId ?? null,
        allowedStores: user.Almacenes ? user.Almacenes.split(', ') : [],
        allowedCanales: user.Canales ? user.Canales.split(', ') : []
    }));
}

/**
 * Create a new user with store access and PIN
 */
async function createUser(email, nombre, clave, stores, canales, accesoTendencia = false, accesoTactica = false, accesoEventos = false, accesoPresupuesto = true, accesoPresupuestoMensual = true, accesoPresupuestoAnual = true, accesoPresupuestoRangos = true, accesoTiempos = false, accesoEvaluaciones = false, accesoInventarios = false, accesoPersonal = false, esAdmin = false, modeloPresupuestoPerms = {}, perfilId = null, cedula = null, telefono = null) {
    const pool = await poolPromise;

    // Validate: at least one module permission must be active (unless admin)
    if (!esAdmin && !accesoPresupuesto && !accesoTiempos && !accesoEvaluaciones && !accesoInventarios && !accesoPersonal) {
        throw new Error('Al menos un módulo debe estar activo');
    }

    // Validate: at least one canal must be selected
    if (!canales || canales.length === 0) {
        throw new Error('Debe seleccionar al menos un canal');
    }

    const pin = clave || Math.floor(100000 + Math.random() * 900000).toString();

    // Insert user
    const userResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .input('nombre', sql.NVarChar, nombre || '')
        .input('clave', sql.NVarChar, pin)
        .input('accesoTendencia', sql.Bit, accesoTendencia)
        .input('accesoTactica', sql.Bit, accesoTactica)
        .input('accesoEventos', sql.Bit, accesoEventos)
        .input('accesoPresupuesto', sql.Bit, accesoPresupuesto)
        .input('accesoPresupuestoMensual', sql.Bit, accesoPresupuestoMensual)
        .input('accesoPresupuestoAnual', sql.Bit, accesoPresupuestoAnual)
        .input('accesoPresupuestoRangos', sql.Bit, accesoPresupuestoRangos)
        .input('accesoTiempos', sql.Bit, accesoTiempos)
        .input('accesoEvaluaciones', sql.Bit, accesoEvaluaciones)
        .input('accesoInventarios', sql.Bit, accesoInventarios)
        .input('accesoPersonal', sql.Bit, accesoPersonal)
        .input('esAdmin', sql.Bit, esAdmin)
        .input('accesoModeloPresupuesto', sql.Bit, modeloPresupuestoPerms.accesoModeloPresupuesto || false)
        .input('verConfigModelo', sql.Bit, modeloPresupuestoPerms.verConfigModelo || false)
        .input('verConsolidadoMensual', sql.Bit, modeloPresupuestoPerms.verConsolidadoMensual || false)
        .input('verAjustePresupuesto', sql.Bit, modeloPresupuestoPerms.verAjustePresupuesto || false)
        .input('verVersiones', sql.Bit, modeloPresupuestoPerms.verVersiones || false)
        .input('verBitacora', sql.Bit, modeloPresupuestoPerms.verBitacora || false)
        .input('verReferencias', sql.Bit, modeloPresupuestoPerms.verReferencias || false)
        .input('editarConsolidado', sql.Bit, modeloPresupuestoPerms.editarConsolidado || false)
        .input('ejecutarRecalculo', sql.Bit, modeloPresupuestoPerms.ejecutarRecalculo || false)
        .input('ajustarCurva', sql.Bit, modeloPresupuestoPerms.ajustarCurva || false)
        .input('restaurarVersiones', sql.Bit, modeloPresupuestoPerms.restaurarVersiones || false)
        .input('perfilId', sql.Int, perfilId)
        .input('cedula', sql.NVarChar, cedula || null)
        .input('telefono', sql.NVarChar, telefono || null)
        .query(`
            INSERT INTO APP_USUARIOS (Email, Nombre, Clave, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoPresupuestoMensual, AccesoPresupuestoAnual, AccesoPresupuestoRangos, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, AccesoPersonal, EsAdmin, accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones, PerfilId, Cedula, Telefono) 
            OUTPUT INSERTED.Id, INSERTED.Clave
            VALUES (@email, @nombre, @clave, @accesoTendencia, @accesoTactica, @accesoEventos, @accesoPresupuesto, @accesoPresupuestoMensual, @accesoPresupuestoAnual, @accesoPresupuestoRangos, @accesoTiempos, @accesoEvaluaciones, @accesoInventarios, @accesoPersonal, @esAdmin, @accesoModeloPresupuesto, @verConfigModelo, @verConsolidadoMensual, @verAjustePresupuesto, @verVersiones, @verBitacora, @verReferencias, @editarConsolidado, @ejecutarRecalculo, @ajustarCurva, @restaurarVersiones, @perfilId, @cedula, @telefono)
        `);

    const userId = userResult.recordset[0].Id;
    const generatedPin = userResult.recordset[0].Clave;

    // Insert store access
    if (stores && stores.length > 0) {
        for (const store of stores) {
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('local', sql.NVarChar, store)
                .query('INSERT INTO APP_USUARIO_ALMACEN (UsuarioId, Local) VALUES (@userId, @local)');
        }
    }

    // Insert canal access
    for (const canal of canales) {
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('canal', sql.NVarChar, canal)
            .query('INSERT INTO APP_USUARIO_CANAL (UsuarioId, Canal) VALUES (@userId, @canal)');
    }

    return { userId, clave: generatedPin };
}

/**
 * Update user (including PIN change)
 */
async function updateUser(userId, email, nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, permitirEnvioClave, perfilId = null, accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones, cedula = null, telefono = null) {
    const pool = await poolPromise;

    // Protect superadmin user
    const checkResult = await pool.request()
        .input('id', sql.Int, userId)
        .query('SELECT EsProtegido FROM APP_USUARIOS WHERE Id = @id');

    if (checkResult.recordset.length > 0 && checkResult.recordset[0].EsProtegido) {
        throw new Error('No se puede modificar el usuario protegido del sistema');
    }

    // Validate: at least one module permission must be active for active users (unless admin)
    if (activo && !esAdmin && !accesoPresupuesto && !accesoTiempos && !accesoEvaluaciones && !accesoInventarios && !accesoPersonal) {
        throw new Error('Al menos un módulo debe estar activo para usuarios activos');
    }

    // Validate: at least one canal must be selected
    if (!canales || canales.length === 0) {
        throw new Error('Debe seleccionar al menos un canal');
    }

    let updateQuery = `
        UPDATE APP_USUARIOS 
        SET Email = @email, Nombre = @nombre, Activo = @activo, 
            AccesoTendencia = @accesoTendencia, AccesoTactica = @accesoTactica, AccesoEventos = @accesoEventos,
            AccesoPresupuesto = @accesoPresupuesto,
            AccesoPresupuestoMensual = @accesoPresupuestoMensual, AccesoPresupuestoAnual = @accesoPresupuestoAnual, AccesoPresupuestoRangos = @accesoPresupuestoRangos,
            AccesoTiempos = @accesoTiempos, AccesoEvaluaciones = @accesoEvaluaciones, AccesoInventarios = @accesoInventarios, AccesoPersonal = @accesoPersonal,
            EsAdmin = @esAdmin, PermitirEnvioClave = @permitirEnvioClave,
            PerfilId = @perfilId,
            Cedula = @cedula, Telefono = @telefono,
            accesoModeloPresupuesto = @accesoModeloPresupuesto,
            verConfigModelo = @verConfigModelo,
            verConsolidadoMensual = @verConsolidadoMensual,
            verAjustePresupuesto = @verAjustePresupuesto,
            verVersiones = @verVersiones,
            verBitacora = @verBitacora,
            verReferencias = @verReferencias,
            editarConsolidado = @editarConsolidado,
            ejecutarRecalculo = @ejecutarRecalculo,
            ajustarCurva = @ajustarCurva,
            restaurarVersiones = @restaurarVersiones,
            FechaModificacion = GETDATE()
    `;
    const request = pool.request()
        .input('id', sql.Int, userId)
        .input('email', sql.NVarChar, email)
        .input('nombre', sql.NVarChar, nombre || '')
        .input('activo', sql.Bit, activo)
        .input('accesoTendencia', sql.Bit, accesoTendencia)
        .input('accesoTactica', sql.Bit, accesoTactica)
        .input('accesoEventos', sql.Bit, accesoEventos)
        .input('accesoPresupuesto', sql.Bit, accesoPresupuesto)
        .input('accesoPresupuestoMensual', sql.Bit, accesoPresupuestoMensual)
        .input('accesoPresupuestoAnual', sql.Bit, accesoPresupuestoAnual)
        .input('accesoPresupuestoRangos', sql.Bit, accesoPresupuestoRangos)
        .input('accesoTiempos', sql.Bit, accesoTiempos)
        .input('accesoEvaluaciones', sql.Bit, accesoEvaluaciones)
        .input('accesoInventarios', sql.Bit, accesoInventarios)
        .input('accesoPersonal', sql.Bit, accesoPersonal)
        .input('esAdmin', sql.Bit, esAdmin)
        .input('permitirEnvioClave', sql.Bit, permitirEnvioClave !== undefined ? permitirEnvioClave : true)
        .input('perfilId', sql.Int, perfilId)
        .input('cedula', sql.NVarChar, cedula || null)
        .input('telefono', sql.NVarChar, telefono || null)
        .input('accesoModeloPresupuesto', sql.Bit, accesoModeloPresupuesto || false)
        .input('verConfigModelo', sql.Bit, verConfigModelo || false)
        .input('verConsolidadoMensual', sql.Bit, verConsolidadoMensual || false)
        .input('verAjustePresupuesto', sql.Bit, verAjustePresupuesto || false)
        .input('verVersiones', sql.Bit, verVersiones || false)
        .input('verBitacora', sql.Bit, verBitacora || false)
        .input('verReferencias', sql.Bit, verReferencias || false)
        .input('editarConsolidado', sql.Bit, editarConsolidado || false)
        .input('ejecutarRecalculo', sql.Bit, ejecutarRecalculo || false)
        .input('ajustarCurva', sql.Bit, ajustarCurva || false)
        .input('restaurarVersiones', sql.Bit, restaurarVersiones || false);

    if (clave) {
        updateQuery += ', Clave = @clave';
        request.input('clave', sql.NVarChar, clave);
    }

    updateQuery += ' WHERE Id = @id';
    await request.query(updateQuery);

    // Replace stores
    await pool.request()
        .input('userId', sql.Int, userId)
        .query('DELETE FROM APP_USUARIO_ALMACEN WHERE UsuarioId = @userId');

    if (stores && stores.length > 0) {
        for (const store of stores) {
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('local', sql.NVarChar, store)
                .query('INSERT INTO APP_USUARIO_ALMACEN (UsuarioId, Local) VALUES (@userId, @local)');
        }
    }

    // Replace canales
    await pool.request()
        .input('userId', sql.Int, userId)
        .query('DELETE FROM APP_USUARIO_CANAL WHERE UsuarioId = @userId');

    for (const canal of canales) {
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('canal', sql.NVarChar, canal)
            .query('INSERT INTO APP_USUARIO_CANAL (UsuarioId, Canal) VALUES (@userId, @canal)');
    }
}

/**
 * Delete user
 */
async function deleteUser(userId) {
    const pool = await poolPromise;

    // Protect superadmin user
    const checkResult = await pool.request()
        .input('id', sql.Int, userId)
        .query('SELECT EsProtegido FROM APP_USUARIOS WHERE Id = @id');

    if (checkResult.recordset.length > 0 && checkResult.recordset[0].EsProtegido) {
        throw new Error('No se puede eliminar el usuario protegido del sistema');
    }

    await pool.request()
        .input('id', sql.Int, userId)
        .query('DELETE FROM APP_USUARIOS WHERE Id = @id');
}

/**
 * Get all profiles with user count
 */
async function getAllProfiles() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT p.*, 
               (SELECT COUNT(*) FROM APP_USUARIOS WHERE PerfilId = p.Id) as UsuariosAsignados
        FROM APP_PERFILES p
        ORDER BY p.Nombre
    `);

    return result.recordset.map(p => ({
        id: p.Id,
        nombre: p.Nombre,
        descripcion: p.Descripcion,
        accesoTendencia: p.AccesoTendencia,
        accesoTactica: p.AccesoTactica,
        accesoEventos: p.AccesoEventos,
        accesoPresupuesto: p.AccesoPresupuesto,
        accesoPresupuestoMensual: p.AccesoPresupuestoMensual,
        accesoPresupuestoAnual: p.AccesoPresupuestoAnual,
        accesoPresupuestoRangos: p.AccesoPresupuestoRangos,
        accesoTiempos: p.AccesoTiempos,
        accesoEvaluaciones: p.AccesoEvaluaciones,
        accesoInventarios: p.AccesoInventarios,
        accesoPersonal: p.AccesoPersonal,
        // Modelo Presupuesto
        accesoModeloPresupuesto: p.accesoModeloPresupuesto || false,
        verConfigModelo: p.verConfigModelo || false,
        verConsolidadoMensual: p.verConsolidadoMensual || false,
        verAjustePresupuesto: p.verAjustePresupuesto || false,
        verVersiones: p.verVersiones || false,
        verBitacora: p.verBitacora || false,
        verReferencias: p.verReferencias || false,
        editarConsolidado: p.editarConsolidado || false,
        ejecutarRecalculo: p.ejecutarRecalculo || false,
        ajustarCurva: p.ajustarCurva || false,
        restaurarVersiones: p.restaurarVersiones || false,
        esAdmin: p.EsAdmin,
        permitirEnvioClave: p.PermitirEnvioClave,
        usuariosAsignados: p.UsuariosAsignados,
        fechaCreacion: p.FechaCreacion,
        fechaModificacion: p.FechaModificacion,
        usuarioCreador: p.UsuarioCreador
    }));
}

/**
 * Create a new profile
 */
async function createProfile(nombre, descripcion, permisos, usuarioCreador) {
    const pool = await poolPromise;

    // Validate unique name
    const existingProfile = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .query('SELECT Id FROM APP_PERFILES WHERE Nombre = @nombre');

    if (existingProfile.recordset.length > 0) {
        throw new Error('Ya existe un perfil con ese nombre');
    }

    const result = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('descripcion', sql.NVarChar, descripcion || '')
        .input('accesoTendencia', sql.Bit, permisos.accesoTendencia || false)
        .input('accesoTactica', sql.Bit, permisos.accesoTactica || false)
        .input('accesoEventos', sql.Bit, permisos.accesoEventos || false)
        .input('accesoPresupuesto', sql.Bit, permisos.accesoPresupuesto !== undefined ? permisos.accesoPresupuesto : true)
        .input('accesoPresupuestoMensual', sql.Bit, permisos.accesoPresupuestoMensual !== undefined ? permisos.accesoPresupuestoMensual : true)
        .input('accesoPresupuestoAnual', sql.Bit, permisos.accesoPresupuestoAnual !== undefined ? permisos.accesoPresupuestoAnual : true)
        .input('accesoPresupuestoRangos', sql.Bit, permisos.accesoPresupuestoRangos !== undefined ? permisos.accesoPresupuestoRangos : true)
        .input('accesoTiempos', sql.Bit, permisos.accesoTiempos || false)
        .input('accesoEvaluaciones', sql.Bit, permisos.accesoEvaluaciones || false)
        .input('accesoInventarios', sql.Bit, permisos.accesoInventarios || false)
        .input('accesoPersonal', sql.Bit, permisos.accesoPersonal || false)
        .input('esAdmin', sql.Bit, permisos.esAdmin || false)
        .input('permitirEnvioClave', sql.Bit, permisos.permitirEnvioClave !== undefined ? permisos.permitirEnvioClave : true)
        .input('usuarioCreador', sql.NVarChar, usuarioCreador || '')
        .input('accesoModeloPresupuesto', sql.Bit, permisos.accesoModeloPresupuesto || false)
        .input('verConfigModelo', sql.Bit, permisos.verConfigModelo || false)
        .input('verConsolidadoMensual', sql.Bit, permisos.verConsolidadoMensual || false)
        .input('verAjustePresupuesto', sql.Bit, permisos.verAjustePresupuesto || false)
        .input('verVersiones', sql.Bit, permisos.verVersiones || false)
        .input('verBitacora', sql.Bit, permisos.verBitacora || false)
        .input('verReferencias', sql.Bit, permisos.verReferencias || false)
        .input('editarConsolidado', sql.Bit, permisos.editarConsolidado || false)
        .input('ejecutarRecalculo', sql.Bit, permisos.ejecutarRecalculo || false)
        .input('ajustarCurva', sql.Bit, permisos.ajustarCurva || false)
        .input('restaurarVersiones', sql.Bit, permisos.restaurarVersiones || false)
        .query(`
            INSERT INTO APP_PERFILES (
                Nombre, Descripcion, AccesoTendencia, AccesoTactica, AccesoEventos,
                AccesoPresupuesto, AccesoPresupuestoMensual, AccesoPresupuestoAnual, AccesoPresupuestoRangos,
                AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, AccesoPersonal,
                EsAdmin, PermitirEnvioClave, UsuarioCreador,
                accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual,
                verAjustePresupuesto, verVersiones, verBitacora, verReferencias,
                editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones
            )
            OUTPUT INSERTED.Id
            VALUES (
                @nombre, @descripcion, @accesoTendencia, @accesoTactica, @accesoEventos,
                @accesoPresupuesto, @accesoPresupuestoMensual, @accesoPresupuestoAnual, @accesoPresupuestoRangos,
                @accesoTiempos, @accesoEvaluaciones, @accesoInventarios, @accesoPersonal,
                @esAdmin, @permitirEnvioClave, @usuarioCreador,
                @accesoModeloPresupuesto, @verConfigModelo, @verConsolidadoMensual,
                @verAjustePresupuesto, @verVersiones, @verBitacora, @verReferencias,
                @editarConsolidado, @ejecutarRecalculo, @ajustarCurva, @restaurarVersiones
            )
        `);

    return result.recordset[0].Id;
}

/**
 * Update profile
 */
async function updateProfile(perfilId, nombre, descripcion, permisos) {
    const pool = await poolPromise;

    // Check if profile exists
    const checkProfile = await pool.request()
        .input('id', sql.Int, perfilId)
        .query('SELECT Id FROM APP_PERFILES WHERE Id = @id');

    if (checkProfile.recordset.length === 0) {
        throw new Error('Perfil no encontrado');
    }

    // Check unique name (excluding current profile)
    const existingProfile = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('id', sql.Int, perfilId)
        .query('SELECT Id FROM APP_PERFILES WHERE Nombre = @nombre AND Id != @id');

    if (existingProfile.recordset.length > 0) {
        throw new Error('Ya existe un perfil con ese nombre');
    }

    await pool.request()
        .input('id', sql.Int, perfilId)
        .input('nombre', sql.NVarChar, nombre)
        .input('descripcion', sql.NVarChar, descripcion || '')
        .input('accesoTendencia', sql.Bit, permisos.accesoTendencia || false)
        .input('accesoTactica', sql.Bit, permisos.accesoTactica || false)
        .input('accesoEventos', sql.Bit, permisos.accesoEventos || false)
        .input('accesoPresupuesto', sql.Bit, permisos.accesoPresupuesto !== undefined ? permisos.accesoPresupuesto : true)
        .input('accesoPresupuestoMensual', sql.Bit, permisos.accesoPresupuestoMensual !== undefined ? permisos.accesoPresupuestoMensual : true)
        .input('accesoPresupuestoAnual', sql.Bit, permisos.accesoPresupuestoAnual !== undefined ? permisos.accesoPresupuestoAnual : true)
        .input('accesoPresupuestoRangos', sql.Bit, permisos.accesoPresupuestoRangos !== undefined ? permisos.accesoPresupuestoRangos : true)
        .input('accesoTiempos', sql.Bit, permisos.accesoTiempos || false)
        .input('accesoEvaluaciones', sql.Bit, permisos.accesoEvaluaciones || false)
        .input('accesoInventarios', sql.Bit, permisos.accesoInventarios || false)
        .input('accesoPersonal', sql.Bit, permisos.accesoPersonal || false)
        .input('esAdmin', sql.Bit, permisos.esAdmin || false)
        .input('permitirEnvioClave', sql.Bit, permisos.permitirEnvioClave !== undefined ? permisos.permitirEnvioClave : true)
        .input('accesoModeloPresupuesto', sql.Bit, permisos.accesoModeloPresupuesto || false)
        .input('verConfigModelo', sql.Bit, permisos.verConfigModelo || false)
        .input('verConsolidadoMensual', sql.Bit, permisos.verConsolidadoMensual || false)
        .input('verAjustePresupuesto', sql.Bit, permisos.verAjustePresupuesto || false)
        .input('verVersiones', sql.Bit, permisos.verVersiones || false)
        .input('verBitacora', sql.Bit, permisos.verBitacora || false)
        .input('verReferencias', sql.Bit, permisos.verReferencias || false)
        .input('editarConsolidado', sql.Bit, permisos.editarConsolidado || false)
        .input('ejecutarRecalculo', sql.Bit, permisos.ejecutarRecalculo || false)
        .input('ajustarCurva', sql.Bit, permisos.ajustarCurva || false)
        .input('restaurarVersiones', sql.Bit, permisos.restaurarVersiones || false)
        .query(`
            UPDATE APP_PERFILES
            SET Nombre = @nombre,
                Descripcion = @descripcion,
                AccesoTendencia = @accesoTendencia,
                AccesoTactica = @accesoTactica,
                AccesoEventos = @accesoEventos,
                AccesoPresupuesto = @accesoPresupuesto,
                AccesoPresupuestoMensual = @accesoPresupuestoMensual,
                AccesoPresupuestoAnual = @accesoPresupuestoAnual,
                AccesoPresupuestoRangos = @accesoPresupuestoRangos,
                AccesoTiempos = @accesoTiempos,
                AccesoEvaluaciones = @accesoEvaluaciones,
                AccesoInventarios = @accesoInventarios,
                AccesoPersonal = @accesoPersonal,
                EsAdmin = @esAdmin,
                PermitirEnvioClave = @permitirEnvioClave,
                accesoModeloPresupuesto = @accesoModeloPresupuesto,
                verConfigModelo = @verConfigModelo,
                verConsolidadoMensual = @verConsolidadoMensual,
                verAjustePresupuesto = @verAjustePresupuesto,
                verVersiones = @verVersiones,
                verBitacora = @verBitacora,
                verReferencias = @verReferencias,
                editarConsolidado = @editarConsolidado,
                ejecutarRecalculo = @ejecutarRecalculo,
                ajustarCurva = @ajustarCurva,
                restaurarVersiones = @restaurarVersiones,
                FechaModificacion = GETDATE()
            WHERE Id = @id
        `);
}

/**
 * Delete profile (only if no users assigned)
 */
async function deleteProfile(perfilId) {
    const pool = await poolPromise;

    // Check if any users are assigned to this profile
    const usersCheck = await pool.request()
        .input('id', sql.Int, perfilId)
        .query('SELECT COUNT(*) as UserCount FROM APP_USUARIOS WHERE PerfilId = @id');

    if (usersCheck.recordset[0].UserCount > 0) {
        throw new Error(`No se puede eliminar el perfil. Tiene ${usersCheck.recordset[0].UserCount} usuario(s) asignado(s)`);
    }

    await pool.request()
        .input('id', sql.Int, perfilId)
        .query('DELETE FROM APP_PERFILES WHERE Id = @id');
}

/**
 * Assign profile to multiple users and optionally sync permissions
 */
async function assignProfileToUsers(perfilId, userIds, syncPermissions = true) {
    const pool = await poolPromise;

    // Get profile permissions
    const profileResult = await pool.request()
        .input('id', sql.Int, perfilId)
        .query('SELECT * FROM APP_PERFILES WHERE Id = @id');

    if (profileResult.recordset.length === 0) {
        throw new Error('Perfil no encontrado');
    }

    const profile = profileResult.recordset[0];

    // Assign profile to users
    for (const userId of userIds) {
        // Update PerfilId
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('perfilId', sql.Int, perfilId)
            .query('UPDATE APP_USUARIOS SET PerfilId = @perfilId WHERE Id = @userId');

        // Optionally sync permissions
        if (syncPermissions) {
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('accesoTendencia', sql.Bit, profile.AccesoTendencia)
                .input('accesoTactica', sql.Bit, profile.AccesoTactica)
                .input('accesoEventos', sql.Bit, profile.AccesoEventos)
                .input('accesoPresupuesto', sql.Bit, profile.AccesoPresupuesto)
                .input('accesoPresupuestoMensual', sql.Bit, profile.AccesoPresupuestoMensual)
                .input('accesoPresupuestoAnual', sql.Bit, profile.AccesoPresupuestoAnual)
                .input('accesoPresupuestoRangos', sql.Bit, profile.AccesoPresupuestoRangos)
                .input('accesoTiempos', sql.Bit, profile.AccesoTiempos)
                .input('accesoEvaluaciones', sql.Bit, profile.AccesoEvaluaciones)
                .input('accesoInventarios', sql.Bit, profile.AccesoInventarios)
                .input('accesoPersonal', sql.Bit, profile.AccesoPersonal)
                .input('esAdmin', sql.Bit, profile.EsAdmin)
                .input('permitirEnvioClave', sql.Bit, profile.PermitirEnvioClave)
                .query(`
                    UPDATE APP_USUARIOS
                    SET AccesoTendencia = @accesoTendencia,
                        AccesoTactica = @accesoTactica,
                        AccesoEventos = @accesoEventos,
                        AccesoPresupuesto = @accesoPresupuesto,
                        AccesoPresupuestoMensual = @accesoPresupuestoMensual,
                        AccesoPresupuestoAnual = @accesoPresupuestoAnual,
                        AccesoPresupuestoRangos = @accesoPresupuestoRangos,
                        AccesoTiempos = @accesoTiempos,
                        AccesoEvaluaciones = @accesoEvaluaciones,
                        AccesoInventarios = @accesoInventarios,
                        AccesoPersonal = @accesoPersonal,
                        EsAdmin = @esAdmin,
                        PermitirEnvioClave = @permitirEnvioClave,
                        FechaModificacion = GETDATE()
                    WHERE Id = @userId
                `);
        }
    }
}

/**
 * Sync profile permissions to all assigned users
 */
async function syncProfilePermissions(perfilId) {
    const pool = await poolPromise;

    // Get profile permissions
    const profileResult = await pool.request()
        .input('id', sql.Int, perfilId)
        .query('SELECT * FROM APP_PERFILES WHERE Id = @id');

    if (profileResult.recordset.length === 0) {
        throw new Error('Perfil no encontrado');
    }

    const profile = profileResult.recordset[0];

    // Update all users with this profile
    await pool.request()
        .input('perfilId', sql.Int, perfilId)
        .input('accesoTendencia', sql.Bit, profile.AccesoTendencia)
        .input('accesoTactica', sql.Bit, profile.AccesoTactica)
        .input('accesoEventos', sql.Bit, profile.AccesoEventos)
        .input('accesoPresupuesto', sql.Bit, profile.AccesoPresupuesto)
        .input('accesoPresupuestoMensual', sql.Bit, profile.AccesoPresupuestoMensual)
        .input('accesoPresupuestoAnual', sql.Bit, profile.AccesoPresupuestoAnual)
        .input('accesoPresupuestoRangos', sql.Bit, profile.AccesoPresupuestoRangos)
        .input('accesoTiempos', sql.Bit, profile.AccesoTiempos)
        .input('accesoEvaluaciones', sql.Bit, profile.AccesoEvaluaciones)
        .input('accesoInventarios', sql.Bit, profile.AccesoInventarios)
        .input('accesoPersonal', sql.Bit, profile.AccesoPersonal)
        .input('esAdmin', sql.Bit, profile.EsAdmin)
        .input('permitirEnvioClave', sql.Bit, profile.PermitirEnvioClave)
        .input('accesoModeloPresupuesto', sql.Bit, profile.accesoModeloPresupuesto || false)
        .input('verConfigModelo', sql.Bit, profile.verConfigModelo || false)
        .input('verConsolidadoMensual', sql.Bit, profile.verConsolidadoMensual || false)
        .input('verAjustePresupuesto', sql.Bit, profile.verAjustePresupuesto || false)
        .input('verVersiones', sql.Bit, profile.verVersiones || false)
        .input('verBitacora', sql.Bit, profile.verBitacora || false)
        .input('verReferencias', sql.Bit, profile.verReferencias || false)
        .input('editarConsolidado', sql.Bit, profile.editarConsolidado || false)
        .input('ejecutarRecalculo', sql.Bit, profile.ejecutarRecalculo || false)
        .input('ajustarCurva', sql.Bit, profile.ajustarCurva || false)
        .input('restaurarVersiones', sql.Bit, profile.restaurarVersiones || false)
        .query(`
            UPDATE APP_USUARIOS
            SET AccesoTendencia = @accesoTendencia,
                AccesoTactica = @accesoTactica,
                AccesoEventos = @accesoEventos,
                AccesoPresupuesto = @accesoPresupuesto,
                AccesoPresupuestoMensual = @accesoPresupuestoMensual,
                AccesoPresupuestoAnual = @accesoPresupuestoAnual,
                AccesoPresupuestoRangos = @accesoPresupuestoRangos,
                AccesoTiempos = @accesoTiempos,
                AccesoEvaluaciones = @accesoEvaluaciones,
                AccesoInventarios = @accesoInventarios,
                AccesoPersonal = @accesoPersonal,
                EsAdmin = @esAdmin,
                PermitirEnvioClave = @permitirEnvioClave,
                accesoModeloPresupuesto = @accesoModeloPresupuesto,
                verConfigModelo = @verConfigModelo,
                verConsolidadoMensual = @verConsolidadoMensual,
                verAjustePresupuesto = @verAjustePresupuesto,
                verVersiones = @verVersiones,
                verBitacora = @verBitacora,
                verReferencias = @verReferencias,
                editarConsolidado = @editarConsolidado,
                ejecutarRecalculo = @ejecutarRecalculo,
                ajustarCurva = @ajustarCurva,
                restaurarVersiones = @restaurarVersiones,
                FechaModificacion = GETDATE()
            WHERE PerfilId = @perfilId AND EsProtegido = 0
        `);

    // Return count of updated users
    const countResult = await pool.request()
        .input('perfilId', sql.Int, perfilId)
        .query('SELECT COUNT(*) as UpdatedCount FROM APP_USUARIOS WHERE PerfilId = @perfilId AND EsProtegido = 0');

    return countResult.recordset[0].UpdatedCount;
}

module.exports = {
    ensureSecurityTables,
    loginUser,
    authMiddleware,
    verifyTokenValid,
    verifyAdminPassword,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    getAllProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    assignProfileToUsers,
    syncProfilePermissions,
    logLoginEvent,
    getLoginAudit,
    ADMIN_PASSWORD
};
