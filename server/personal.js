const { sql, poolPromise } = require('./db');

// ==========================================
// CONTROL DE PERSONAL
// ==========================================

/**
 * Ensure the DIM_PERSONAL table exists.
 * Called once on startup.
 */
async function ensurePersonalTable() {
    try {
        const pool = await poolPromise;
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL')
            CREATE TABLE DIM_PERSONAL (
                ID          INT IDENTITY(1,1) PRIMARY KEY,
                NOMBRE      NVARCHAR(200) NOT NULL,
                CORREO      NVARCHAR(200) NULL,
                CEDULA      NVARCHAR(30)  NULL,
                TELEFONO    NVARCHAR(30)  NULL,
                ACTIVO      BIT DEFAULT 1,
                CREADO_EN   DATETIME DEFAULT GETDATE(),
                ACTUALIZADO DATETIME DEFAULT GETDATE()
            )
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL_ASIGNACIONES')
            CREATE TABLE DIM_PERSONAL_ASIGNACIONES (
                ID              INT IDENTITY(1,1) PRIMARY KEY,
                PERSONAL_ID     INT NOT NULL,
                LOCAL           NVARCHAR(200) NOT NULL,
                PERFIL          NVARCHAR(100) NOT NULL,
                FECHA_INICIO    DATE NOT NULL,
                FECHA_FIN       DATE NULL,
                NOTAS           NVARCHAR(500) NULL,
                ACTIVO          BIT DEFAULT 1,
                CREADO_EN       DATETIME DEFAULT GETDATE(),
                ACTUALIZADO     DATETIME DEFAULT GETDATE(),
                CONSTRAINT FK_PERSONAL_ASIG FOREIGN KEY (PERSONAL_ID) REFERENCES DIM_PERSONAL(ID)
            )
        `);
        console.log('✅ DIM_PERSONAL tables ready');
    } catch (err) {
        console.error('Error ensuring DIM_PERSONAL tables:', err.message);
    }
}

// ─── Personas ─────────────────────────────────────────────────────────────────

async function getAllPersonal() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT p.*,
               (SELECT COUNT(*) FROM DIM_PERSONAL_ASIGNACIONES a WHERE a.PERSONAL_ID = p.ID AND a.ACTIVO = 1) AS TotalAsignaciones
        FROM DIM_PERSONAL p
        ORDER BY p.NOMBRE
    `);
    return result.recordset;
}

async function createPersona(nombre, correo, cedula, telefono) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('correo', sql.NVarChar, correo || null)
        .input('cedula', sql.NVarChar, cedula || null)
        .input('telefono', sql.NVarChar, telefono || null)
        .query(`
            INSERT INTO DIM_PERSONAL (NOMBRE, CORREO, CEDULA, TELEFONO)
            OUTPUT INSERTED.*
            VALUES (@nombre, @correo, @cedula, @telefono)
        `);
    return result.recordset[0];
}

async function updatePersona(id, nombre, correo, cedula, telefono, activo) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('nombre', sql.NVarChar, nombre)
        .input('correo', sql.NVarChar, correo || null)
        .input('cedula', sql.NVarChar, cedula || null)
        .input('telefono', sql.NVarChar, telefono || null)
        .input('activo', sql.Bit, activo !== undefined ? (activo ? 1 : 0) : 1)
        .query(`
            UPDATE DIM_PERSONAL
            SET NOMBRE=@nombre, CORREO=@correo, CEDULA=@cedula, TELEFONO=@telefono,
                ACTIVO=@activo, ACTUALIZADO=GETDATE()
            OUTPUT INSERTED.*
            WHERE ID=@id
        `);
    return result.recordset[0];
}

async function deletePersona(id) {
    const pool = await poolPromise;
    // Soft delete
    await pool.request()
        .input('id', sql.Int, id)
        .query(`UPDATE DIM_PERSONAL SET ACTIVO=0, ACTUALIZADO=GETDATE() WHERE ID=@id`);
}

// ─── Asignaciones ─────────────────────────────────────────────────────────────

async function getAsignaciones(personalId) {
    const pool = await poolPromise;
    const req = pool.request();
    let where = 'WHERE a.ACTIVO = 1';
    if (personalId) {
        req.input('pid', sql.Int, personalId);
        where += ' AND a.PERSONAL_ID = @pid';
    }
    const result = await req.query(`
        SELECT a.*, p.NOMBRE AS PERSONAL_NOMBRE, p.CORREO AS PERSONAL_CORREO
        FROM DIM_PERSONAL_ASIGNACIONES a
        INNER JOIN DIM_PERSONAL p ON a.PERSONAL_ID = p.ID
        ${where}
        ORDER BY a.FECHA_INICIO DESC, p.NOMBRE
    `);
    return result.recordset;
}

async function createAsignacion(personalId, local, perfil, fechaInicio, fechaFin, notas) {
    const pool = await poolPromise;

    // Check for duplicate: same person, same profile, overlapping dates
    const dupCheck = await pool.request()
        .input('pid', sql.Int, personalId)
        .input('perfil', sql.NVarChar, perfil)
        .input('local', sql.NVarChar, local)
        .input('fi', sql.Date, fechaInicio)
        .query(`
            SELECT COUNT(*) AS cnt FROM DIM_PERSONAL_ASIGNACIONES
            WHERE PERSONAL_ID=@pid AND PERFIL=@perfil AND LOCAL=@local AND ACTIVO=1
              AND FECHA_INICIO <= ISNULL(@fi, GETDATE())
              AND (FECHA_FIN IS NULL OR FECHA_FIN >= @fi)
        `);
    if (dupCheck.recordset[0].cnt > 0) {
        throw new Error('Ya existe una asignación activa para esta persona, perfil y local en ese período');
    }

    const result = await pool.request()
        .input('pid', sql.Int, personalId)
        .input('local', sql.NVarChar, local)
        .input('perfil', sql.NVarChar, perfil)
        .input('fi', sql.Date, fechaInicio)
        .input('ff', sql.Date, fechaFin || null)
        .input('notas', sql.NVarChar, notas || null)
        .query(`
            INSERT INTO DIM_PERSONAL_ASIGNACIONES (PERSONAL_ID, LOCAL, PERFIL, FECHA_INICIO, FECHA_FIN, NOTAS)
            OUTPUT INSERTED.*
            VALUES (@pid, @local, @perfil, @fi, @ff, @notas)
        `);
    return result.recordset[0];
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
            UPDATE DIM_PERSONAL_ASIGNACIONES
            SET LOCAL=@local, PERFIL=@perfil, FECHA_INICIO=@fi, FECHA_FIN=@ff, NOTAS=@notas, ACTUALIZADO=GETDATE()
            OUTPUT INSERTED.*
            WHERE ID=@id
        `);
    return result.recordset[0];
}

async function deleteAsignacion(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query(`UPDATE DIM_PERSONAL_ASIGNACIONES SET ACTIVO=0, ACTUALIZADO=GETDATE() WHERE ID=@id`);
}

// ─── Locales sin cobertura ────────────────────────────────────────────────────

async function getLocalesSinCobertura(perfil) {
    const pool = await poolPromise;
    const req = pool.request();
    let perfilFilter = '';
    if (perfil) {
        req.input('perfil', sql.NVarChar, perfil);
        perfilFilter = `AND a.PERFIL = @perfil`;
    }
    // Get all distinct stores from budget data, minus those with active assignments
    const result = await req.query(`
        SELECT DISTINCT d.GrupoAlmacen AS Local
        FROM DIM_PRESUPUESTO d
        WHERE d.GrupoAlmacen IS NOT NULL AND d.GrupoAlmacen != ''
          AND NOT EXISTS (
              SELECT 1 FROM DIM_PERSONAL_ASIGNACIONES a
              WHERE a.LOCAL = d.GrupoAlmacen AND a.ACTIVO = 1
              ${perfilFilter}
              AND (a.FECHA_FIN IS NULL OR a.FECHA_FIN >= GETDATE())
          )
        ORDER BY d.GrupoAlmacen
    `);
    return result.recordset;
}

module.exports = {
    ensurePersonalTable,
    getAllPersonal, createPersona, updatePersona, deletePersona,
    getAsignaciones, createAsignacion, updateAsignacion, deleteAsignacion,
    getLocalesSinCobertura
};
