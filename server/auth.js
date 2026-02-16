const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'calendario-presupuestal-secret-key-2026';
const ADMIN_PASSWORD = 'R0st1p017';

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
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('APP_USUARIOS') AND name = 'AccesoInventarios')
            BEGIN
                ALTER TABLE APP_USUARIOS ADD AccesoInventarios BIT NOT NULL DEFAULT 0;
            END
        `);

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
                    EsAdmin = 1,
                    EsProtegido = 1
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

        console.log('✅ Security tables verified/created');
    } catch (err) {
        console.error('⚠️ Could not create security tables:', err.message);
    }
}

/**
 * Login: validate email + PIN, return long-lived JWT
 */
async function loginUser(email, clave) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT Id, Email, Nombre, Clave, Activo, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, EsAdmin, EsProtegido FROM APP_USUARIOS WHERE Email = @email');

    if (result.recordset.length === 0) {
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
        return { success: false, message: 'Usuario desactivado. Contacte al administrador.' };
    }

    // Verify PIN - trim both values to avoid whitespace issues
    if (user.Clave.trim() !== clave.trim()) {
        console.log('❌ Password mismatch');
        return { success: false, message: 'Clave incorrecta.' };
    }

    // Get user's allowed stores
    const storesResult = await pool.request()
        .input('userId', sql.Int, user.Id)
        .query('SELECT Local FROM APP_USUARIO_ALMACEN WHERE UsuarioId = @userId');

    const allowedStores = storesResult.recordset.map(r => r.Local);

    // Generate long-lived JWT (365 days - session persists until admin changes PIN)
    const token = jwt.sign(
        {
            userId: user.Id,
            email: user.Email,
            nombre: user.Nombre,
            allowedStores: allowedStores,
            claveHash: clave, // Store PIN in token to detect changes
            accesoTendencia: user.AccesoTendencia,
            accesoTactica: user.AccesoTactica,
            accesoEventos: user.AccesoEventos,
            accesoPresupuesto: user.AccesoPresupuesto,
            accesoTiempos: user.AccesoTiempos,
            accesoEvaluaciones: user.AccesoEvaluaciones,
            accesoInventarios: user.AccesoInventarios,
            esAdmin: user.EsAdmin,
            esProtegido: user.EsProtegido
        },
        JWT_SECRET,
        { expiresIn: '365d' }
    );

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
            accesoTiempos: user.AccesoTiempos,
            accesoEvaluaciones: user.AccesoEvaluaciones,
            accesoInventarios: user.AccesoInventarios,
            esAdmin: user.EsAdmin,
            esProtegido: user.EsProtegido,
            allowedStores
        }
    };
}

/**
 * Middleware to verify JWT token and check PIN hasn't changed
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
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
        SELECT u.Id, u.Email, u.Nombre, u.Clave, u.Activo, u.AccesoTendencia, u.AccesoTactica, u.AccesoEventos, u.AccesoPresupuesto, u.AccesoTiempos, u.AccesoEvaluaciones, u.AccesoInventarios, u.EsAdmin, u.EsProtegido, u.FechaCreacion,
               STRING_AGG(ua.Local, ', ') AS Almacenes
        FROM APP_USUARIOS u
        LEFT JOIN APP_USUARIO_ALMACEN ua ON u.Id = ua.UsuarioId
        GROUP BY u.Id, u.Email, u.Nombre, u.Clave, u.Activo, u.AccesoTendencia, u.AccesoTactica, u.AccesoEventos, u.AccesoPresupuesto, u.AccesoTiempos, u.AccesoEvaluaciones, u.AccesoInventarios, u.EsAdmin, u.EsProtegido, u.FechaCreacion
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
        accesoTiempos: user.AccesoTiempos,
        accesoEvaluaciones: user.AccesoEvaluaciones,
        accesoInventarios: user.AccesoInventarios,
        esAdmin: user.EsAdmin,
        esProtegido: user.EsProtegido,
        fechaCreacion: user.FechaCreacion,
        allowedStores: user.Almacenes ? user.Almacenes.split(', ') : []
    }));
}

/**
 * Create a new user with store access and PIN
 */
async function createUser(email, nombre, clave, stores, accesoTendencia = false, accesoTactica = false, accesoEventos = false, accesoPresupuesto = true, accesoTiempos = false, accesoEvaluaciones = false, accesoInventarios = false, esAdmin = false) {
    const pool = await poolPromise;

    // Validate: at least one module permission must be active (unless admin)
    if (!esAdmin && !accesoPresupuesto && !accesoTiempos && !accesoEvaluaciones && !accesoInventarios) {
        throw new Error('Al menos un módulo debe estar activo');
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
        .input('accesoTiempos', sql.Bit, accesoTiempos)
        .input('accesoEvaluaciones', sql.Bit, accesoEvaluaciones)
        .input('accesoInventarios', sql.Bit, accesoInventarios)
        .input('esAdmin', sql.Bit, esAdmin)
        .query(`
            INSERT INTO APP_USUARIOS (Email, Nombre, Clave, AccesoTendencia, AccesoTactica, AccesoEventos, AccesoPresupuesto, AccesoTiempos, AccesoEvaluaciones, AccesoInventarios, EsAdmin) 
            OUTPUT INSERTED.Id, INSERTED.Clave
            VALUES (@email, @nombre, @clave, @accesoTendencia, @accesoTactica, @accesoEventos, @accesoPresupuesto, @accesoTiempos, @accesoEvaluaciones, @accesoInventarios, @esAdmin)
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

    return { userId, clave: generatedPin };
}

/**
 * Update user (including PIN change)
 */
async function updateUser(userId, email, nombre, activo, clave, stores, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoTiempos, accesoEvaluaciones, accesoInventarios, esAdmin) {
    const pool = await poolPromise;

    // Protect superadmin user
    const checkResult = await pool.request()
        .input('id', sql.Int, userId)
        .query('SELECT EsProtegido FROM APP_USUARIOS WHERE Id = @id');

    if (checkResult.recordset.length > 0 && checkResult.recordset[0].EsProtegido) {
        throw new Error('No se puede modificar el usuario protegido del sistema');
    }

    // Validate: at least one module permission must be active for active users (unless admin)
    if (activo && !esAdmin && !accesoPresupuesto && !accesoTiempos && !accesoEvaluaciones && !accesoInventarios) {
        throw new Error('Al menos un módulo debe estar activo para usuarios activos');
    }

    let updateQuery = `
        UPDATE APP_USUARIOS 
        SET Email = @email, Nombre = @nombre, Activo = @activo, 
            AccesoTendencia = @accesoTendencia, AccesoTactica = @accesoTactica, AccesoEventos = @accesoEventos,
            AccesoPresupuesto = @accesoPresupuesto, AccesoTiempos = @accesoTiempos, AccesoEvaluaciones = @accesoEvaluaciones, AccesoInventarios = @accesoInventarios,
            EsAdmin = @esAdmin,
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
        .input('accesoTiempos', sql.Bit, accesoTiempos)
        .input('accesoEvaluaciones', sql.Bit, accesoEvaluaciones)
        .input('accesoInventarios', sql.Bit, accesoInventarios)
        .input('esAdmin', sql.Bit, esAdmin);

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
    ADMIN_PASSWORD
};
