const { sql, poolPromise } = require('./db');

// ==========================================
// CONTROL DE PERSONAL — Uses APP_USUARIOS
// ==========================================
// 
// DIM_PERSONAL is no longer used — assignments reference APP_USUARIOS.Id directly.

async function ensurePersonalTable() {
    try {
        const pool = await poolPromise;

        // 1. DIM_PERSONAL_ASIGNACIONES — now references APP_USUARIOS.Id via USUARIO_ID
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL_ASIGNACIONES')
            CREATE TABLE DIM_PERSONAL_ASIGNACIONES (
                ID           INT IDENTITY(1,1) PRIMARY KEY,
                USUARIO_ID   INT NOT NULL,
                LOCAL        NVARCHAR(200) NOT NULL,
                PERFIL       NVARCHAR(100) NOT NULL,
                FECHA_INICIO DATE NOT NULL,
                FECHA_FIN    DATE NULL,
                NOTAS        NVARCHAR(500) NULL,
                ACTIVO       BIT DEFAULT 1,
                CREADO_EN    DATETIME DEFAULT GETDATE()
            )
        `);

        // Migration: If table has old PERSONAL_ID column but no USUARIO_ID, add USUARIO_ID
        await pool.request().query(`
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERSONAL_ASIGNACIONES') AND name = 'PERSONAL_ID')
            AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERSONAL_ASIGNACIONES') AND name = 'USUARIO_ID')
            BEGIN
                ALTER TABLE DIM_PERSONAL_ASIGNACIONES ADD USUARIO_ID INT NULL;
            END
        `);

        // Migrate PERSONAL_ID → USUARIO_ID via DIM_PERSONAL name matching (only if both columns and DIM_PERSONAL exist)
        await pool.request().query(`
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERSONAL_ASIGNACIONES') AND name = 'USUARIO_ID')
            AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERSONAL_ASIGNACIONES') AND name = 'PERSONAL_ID')
            AND EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL')
            BEGIN
                UPDATE a SET a.USUARIO_ID = u.Id
                FROM DIM_PERSONAL_ASIGNACIONES a
                INNER JOIN DIM_PERSONAL p ON p.ID = a.PERSONAL_ID
                INNER JOIN APP_USUARIOS u ON LOWER(LTRIM(RTRIM(u.Nombre))) = LOWER(LTRIM(RTRIM(p.NOMBRE)))
                WHERE a.USUARIO_ID IS NULL;
            END
        `);

        // Make PERSONAL_ID nullable so new inserts (that only use USUARIO_ID) don't fail
        await pool.request().query(`
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERSONAL_ASIGNACIONES') AND name = 'PERSONAL_ID' AND is_nullable = 0)
            BEGIN
                ALTER TABLE DIM_PERSONAL_ASIGNACIONES ALTER COLUMN PERSONAL_ID INT NULL;
            END
        `);


        // 2. DIM_PERSONAL_CARGOS
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL_CARGOS')
            CREATE TABLE DIM_PERSONAL_CARGOS (
                ID     INT IDENTITY(1,1) PRIMARY KEY,
                NOMBRE NVARCHAR(100) NOT NULL,
                ACTIVO BIT DEFAULT 1
            )
        `);
        // Default cargos
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM DIM_PERSONAL_CARGOS)
            BEGIN
                INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES ('Administrador');
                INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES ('Encargado');
                INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES ('Vendedor');
            END
        `);

        // Migrate Cedula/Telefono from DIM_PERSONAL to APP_USUARIOS if DIM_PERSONAL exists
        await pool.request().query(`
            IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL')
            BEGIN
                -- Copy Cedula from DIM_PERSONAL to APP_USUARIOS (where APP_USUARIOS.Cedula is NULL)
                UPDATE u
                SET u.Cedula = p.CEDULA
                FROM APP_USUARIOS u
                INNER JOIN DIM_PERSONAL p ON LOWER(LTRIM(RTRIM(u.Nombre))) = LOWER(LTRIM(RTRIM(p.NOMBRE)))
                WHERE u.Cedula IS NULL AND p.CEDULA IS NOT NULL;

                -- Copy Telefono from DIM_PERSONAL to APP_USUARIOS
                UPDATE u
                SET u.Telefono = p.TELEFONO
                FROM APP_USUARIOS u
                INNER JOIN DIM_PERSONAL p ON LOWER(LTRIM(RTRIM(u.Nombre))) = LOWER(LTRIM(RTRIM(p.NOMBRE)))
                WHERE u.Telefono IS NULL AND p.TELEFONO IS NOT NULL;
            END
        `);

        console.log('✅ Personal tables ensured (using APP_USUARIOS)');
    } catch (err) {
        console.error('❌ Error ensuring personal tables:', err.message);
    }
}

// ─── Read: List all active users (replaces old getAllPersonal from DIM_PERSONAL) ───

async function getAllPersonal() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT u.Id as ID, u.Nombre as NOMBRE, u.Email as CORREO, u.Cedula as CEDULA, u.Telefono as TELEFONO, u.Activo as ACTIVO,
               (SELECT COUNT(*) FROM DIM_PERSONAL_ASIGNACIONES a WHERE a.USUARIO_ID = u.Id AND a.ACTIVO = 1) as asignacionesActivas
        FROM APP_USUARIOS u
        WHERE u.Activo = 1
        ORDER BY u.Nombre
    `);
    return result.recordset.map(r => ({
        ID: r.ID,
        NOMBRE: r.NOMBRE,
        CORREO: r.CORREO,
        CEDULA: r.CEDULA,
        TELEFONO: r.TELEFONO,
        ACTIVO: r.ACTIVO,
        TotalAsignaciones: r.asignacionesActivas
    }));
}

// ─── Asignaciones CRUD ─────────────────────────────────────────────────────

async function getAsignaciones(usuarioId = null, month = null, year = null) {
    const pool = await poolPromise;
    let query = `
        SELECT a.ID, a.USUARIO_ID, u.Nombre as USUARIO_NOMBRE,
               a.LOCAL, a.PERFIL, a.FECHA_INICIO, a.FECHA_FIN, a.NOTAS, a.ACTIVO
        FROM DIM_PERSONAL_ASIGNACIONES a
        INNER JOIN APP_USUARIOS u ON u.Id = a.USUARIO_ID
        WHERE a.ACTIVO = 1
    `;
    const request = pool.request();
    if (usuarioId) {
        query += ' AND a.USUARIO_ID = @uid';
        request.input('uid', sql.Int, usuarioId);
    }
    if (month && year) {
        query += ` AND (
            (MONTH(a.FECHA_INICIO) <= @month AND YEAR(a.FECHA_INICIO) <= @year)
            AND (a.FECHA_FIN IS NULL OR (MONTH(a.FECHA_FIN) >= @month AND YEAR(a.FECHA_FIN) >= @year))
        )`;
        request.input('month', sql.Int, month);
        request.input('year', sql.Int, year);
    }
    query += ' ORDER BY a.FECHA_INICIO DESC';
    const result = await request.query(query);
    return result.recordset;
}

async function createAsignacion(usuarioId, local, perfil, fechaInicio, fechaFin, notas) {
    const pool = await poolPromise;
    // Verify user exists
    const userCheck = await pool.request().input('uid', sql.Int, usuarioId)
        .query('SELECT Id, Nombre FROM APP_USUARIOS WHERE Id = @uid');
    if (userCheck.recordset.length === 0) throw new Error('Usuario no encontrado');

    // Check for duplicate active assignment
    const dupCheck = await pool.request()
        .input('uid', sql.Int, usuarioId)
        .input('local', sql.NVarChar, local)
        .input('perfil', sql.NVarChar, perfil)
        .query(`
            SELECT COUNT(*) as cnt FROM DIM_PERSONAL_ASIGNACIONES
            WHERE USUARIO_ID = @uid AND LOCAL = @local AND PERFIL = @perfil AND ACTIVO = 1
        `);
    if (dupCheck.recordset[0].cnt > 0) throw new Error('Ya existe una asignación activa para este usuario en ese local con ese perfil');

    const result = await pool.request()
        .input('uid', sql.Int, usuarioId)
        .input('local', sql.NVarChar, local)
        .input('perfil', sql.NVarChar, perfil)
        .input('fi', sql.Date, fechaInicio)
        .input('ff', sql.Date, fechaFin || null)
        .input('notas', sql.NVarChar, notas || null)
        .query(`
            INSERT INTO DIM_PERSONAL_ASIGNACIONES (USUARIO_ID, LOCAL, PERFIL, FECHA_INICIO, FECHA_FIN, NOTAS)
            OUTPUT INSERTED.*
            VALUES (@uid, @local, @perfil, @fi, @ff, @notas)
        `);
    const row = result.recordset[0];
    return { ...row, USUARIO_NOMBRE: userCheck.recordset[0].Nombre };
}

async function updateAsignacion(id, local, perfil, fechaInicio, fechaFin, notas) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('local', sql.NVarChar, local)
        .input('perfil', sql.NVarChar, perfil)
        .input('fi', sql.Date, fechaInicio)
        .input('ff', sql.Date, fechaFin || null)
        .input('notas', sql.NVarChar, notas || null)
        .query(`
            UPDATE DIM_PERSONAL_ASIGNACIONES SET LOCAL=@local, PERFIL=@perfil, FECHA_INICIO=@fi, FECHA_FIN=@ff, NOTAS=@notas WHERE ID=@id;
            SELECT a.*, u.Nombre as USUARIO_NOMBRE
            FROM DIM_PERSONAL_ASIGNACIONES a
            INNER JOIN APP_USUARIOS u ON u.Id = a.USUARIO_ID
            WHERE a.ID = @id
        `);
    return result.recordset[0];
}

async function deleteAsignacion(id) {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id)
        .query('UPDATE DIM_PERSONAL_ASIGNACIONES SET ACTIVO = 0 WHERE ID = @id');
    return { success: true };
}

// ─── Stores for Personal module ────────────────────────────────────────────

async function getPersonalStores() {
    const pool = await poolPromise;
    try {
        const result = await pool.request().query(`
            SELECT DISTINCT Local FROM APP_USUARIO_ALMACEN ORDER BY Local
        `);
        return result.recordset.map(r => r.Local);
    } catch {
        return [];
    }
}

// ─── Coverage analysis ─────────────────────────────────────────────────────

async function getCargos() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT NOMBRE FROM DIM_PERSONAL_CARGOS WHERE ACTIVO = 1
    `);
    return result.recordset.map(r => r.NOMBRE);
}

async function getLocalesSinCobertura(perfil, month, year) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('perfil', sql.NVarChar, perfil)
        .input('month', sql.Int, month)
        .input('year', sql.Int, year)
        .query(`
            SELECT DISTINCT a.Local
            FROM APP_USUARIO_ALMACEN a
            WHERE a.Local NOT IN (
                SELECT DISTINCT a2.LOCAL
                FROM DIM_PERSONAL_ASIGNACIONES a2
                WHERE a2.PERFIL = @perfil
                  AND a2.ACTIVO = 1
                  AND (
                    YEAR(a2.FECHA_INICIO) < @year
                    OR (YEAR(a2.FECHA_INICIO) = @year AND MONTH(a2.FECHA_INICIO) <= @month)
                  )
                  AND (
                    a2.FECHA_FIN IS NULL
                    OR YEAR(a2.FECHA_FIN) > @year
                    OR (YEAR(a2.FECHA_FIN) = @year AND MONTH(a2.FECHA_FIN) >= @month)
                  )
            )
            ORDER BY a.Local
        `);
    return result.recordset.map(r => ({ Local: r.Local, PerfilesFaltantes: perfil }));
}

// ─── Cargo management ──────────────────────────────────────────────────────

async function getAllCargos() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT ID, NOMBRE, ACTIVO FROM DIM_PERSONAL_CARGOS ORDER BY NOMBRE
    `);
    return result.recordset;
}

async function createCargo(nombre) {
    const pool = await poolPromise;
    const dup = await pool.request().input('nombre', sql.NVarChar, nombre)
        .query('SELECT COUNT(*) as cnt FROM DIM_PERSONAL_CARGOS WHERE NOMBRE = @nombre');
    if (dup.recordset[0].cnt > 0) throw new Error('Cargo ya existe');
    await pool.request().input('nombre', sql.NVarChar, nombre)
        .query('INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES (@nombre)');
    return { success: true };
}

async function deleteCargo(id) {
    const pool = await poolPromise;
    // Check if in use
    const cargoResult = await pool.request().input('id', sql.Int, id)
        .query('SELECT NOMBRE FROM DIM_PERSONAL_CARGOS WHERE ID = @id');
    if (cargoResult.recordset.length === 0) throw new Error('Cargo no encontrado');
    const perfil = cargoResult.recordset[0].NOMBRE;

    const inUse = await pool.request().input('perfil', sql.NVarChar, perfil)
        .query('SELECT COUNT(*) as cnt FROM DIM_PERSONAL_ASIGNACIONES WHERE PERFIL = @perfil AND ACTIVO = 1');
    if (inUse.recordset[0].cnt > 0) throw new Error(`No se puede eliminar: ${inUse.recordset[0].cnt} asignaciones activas usan este perfil`);

    await pool.request().input('id', sql.Int, id)
        .query('DELETE FROM DIM_PERSONAL_CARGOS WHERE ID = @id');
    return { success: true };
}

async function renameCargo(id, newName) {
    const pool = await poolPromise;
    const old = await pool.request().input('id', sql.Int, id)
        .query('SELECT NOMBRE FROM DIM_PERSONAL_CARGOS WHERE ID = @id');
    if (old.recordset.length === 0) throw new Error('Cargo no encontrado');

    // Rename in assignments too
    await pool.request()
        .input('oldPerfil', sql.NVarChar, old.recordset[0].NOMBRE)
        .input('newPerfil', sql.NVarChar, newName)
        .query('UPDATE DIM_PERSONAL_ASIGNACIONES SET PERFIL = @newPerfil WHERE PERFIL = @oldPerfil AND ACTIVO = 1');

    await pool.request().input('id', sql.Int, id).input('nombre', sql.NVarChar, newName)
        .query('UPDATE DIM_PERSONAL_CARGOS SET NOMBRE = @nombre WHERE ID = @id');
    return { success: true };
}

// ─── Personal por local ────────────────────────────────────────────────────

async function getPersonalPorLocal(local) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('local', sql.NVarChar, local)
        .query(`
            SELECT a.ID, a.USUARIO_ID, u.Nombre as USUARIO_NOMBRE,
                   a.LOCAL, a.PERFIL, a.FECHA_INICIO, a.FECHA_FIN
            FROM DIM_PERSONAL_ASIGNACIONES a
            INNER JOIN APP_USUARIOS u ON u.Id = a.USUARIO_ID
            WHERE a.LOCAL = @local AND a.ACTIVO = 1
              AND (a.FECHA_FIN IS NULL OR a.FECHA_FIN >= CAST(GETDATE() AS DATE))
            ORDER BY a.PERFIL, u.Nombre
        `);
    return result.recordset;
}

module.exports = {
    ensurePersonalTable,
    getAllPersonal,
    getAsignaciones,
    createAsignacion,
    updateAsignacion,
    deleteAsignacion,
    getPersonalStores,
    getAllStores: getPersonalStores, // alias for server.js compatibility
    getCargos,
    getLocalesSinCobertura,
    getAllCargos,
    createCargo,
    deleteCargo,
    renameCargo,
    getPersonalPorLocal
};
