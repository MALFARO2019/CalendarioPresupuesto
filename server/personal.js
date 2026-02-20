const { sql, poolPromise } = require('./db');

// ==========================================
// CONTROL DE PERSONAL
// ==========================================

/**
 * Ensure the DIM_PERSONAL tables exist.
 * Called once on startup.
 */
async function ensurePersonalTable() {
    try {
        const pool = await poolPromise;

        // 1. Personal
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

        // 2. Cargos (New)
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DIM_PERSONAL_CARGOS')
            BEGIN
                CREATE TABLE DIM_PERSONAL_CARGOS (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    NOMBRE      NVARCHAR(100) NOT NULL,
                    ACTIVO      BIT DEFAULT 1,
                    CREADO_EN   DATETIME DEFAULT GETDATE()
                );
                
                INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES ('Administrador'), ('Supervisor'), ('Vendedor'), ('Cajero');
            END
        `);

        // 3. Asignaciones
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

async function getAsignaciones(personalId, month, year) {
    const pool = await poolPromise;
    const req = pool.request();
    let where = 'WHERE a.ACTIVO = 1';

    if (personalId) {
        req.input('pid', sql.Int, personalId);
        where += ' AND a.PERSONAL_ID = @pid';
    }

    if (month && year) {
        const m = parseInt(month);
        const y = parseInt(year);
        const startDate = new Date(y, m - 1, 1);
        const endDate = new Date(y, m, 0);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        req.input('startDate', sql.DateTime, startDate);
        req.input('endDate', sql.DateTime, endDate);
        where += ` AND a.FECHA_INICIO <= @endDate AND (a.FECHA_FIN IS NULL OR a.FECHA_FIN >= @startDate)`;
    }

    const result = await req.query(`
        SELECT a.*, p.NOMBRE AS PERSONAL_NOMBRE, p.CORREO AS PERSONAL_CORREO
        FROM DIM_PERSONAL_ASIGNACIONES a
        INNER JOIN DIM_PERSONAL p ON a.PERSONAL_ID = p.ID
        ${where}
        ORDER BY a.FECHA_INICIO DESC, p.NOMBRE
    `);

    // Map to uppercase properties to match frontend interface if needed, or ensure frontend supports mixed case
    // The query returns uppercase column names usually in mssql driver
    return result.recordset;
}

async function createAsignacion(personalId, local, perfil, fechaInicio, fechaFin, notas) {
    const pool = await poolPromise;
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

// ─── Cargos (Profiles) ───────────────────────────────────────────────────────

async function getAllCargos() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM DIM_PERSONAL_CARGOS WHERE ACTIVO = 1 ORDER BY NOMBRE');
    return result.recordset;
}

async function createCargo(nombre) {
    const pool = await poolPromise;
    await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .query('INSERT INTO DIM_PERSONAL_CARGOS (NOMBRE) VALUES (@nombre)');
}

async function deleteCargo(id, reassignTo) {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const currentCargoResult = await transaction.request()
            .input('id', sql.Int, id)
            .query('SELECT NOMBRE FROM DIM_PERSONAL_CARGOS WHERE ID = @id');

        if (currentCargoResult.recordset.length === 0) throw new Error('Cargo no encontrado');
        const cargoName = currentCargoResult.recordset[0].NOMBRE;

        if (reassignTo) {
            await transaction.request()
                .input('oldProfile', sql.NVarChar, cargoName)
                .input('newProfile', sql.NVarChar, reassignTo)
                .query('UPDATE DIM_PERSONAL_ASIGNACIONES SET PERFIL = @newProfile WHERE PERFIL = @oldProfile AND ACTIVO = 1');
        }

        await transaction.request()
            .input('id', sql.Int, id)
            .query('UPDATE DIM_PERSONAL_CARGOS SET ACTIVO = 0 WHERE ID = @id');

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

// ─── Locales sin cobertura ────────────────────────────────────────────────────

async function getLocalesSinCobertura(perfil, month, year) {
    const pool = await poolPromise;
    let perfilFilter = '';

    // 1. Get ALL individual stores (almacenes, no grupos) from DIM_NOMBRES_ALMACEN
    const storeRes = await pool.request().query(`
        SELECT RTRIM(CODALMACEN) AS CodAlmacen, NOMBRE_CONTA AS Nombre
        FROM DIM_NOMBRES_ALMACEN 
        WHERE NOMBRE_CONTA IS NOT NULL 
          AND NOMBRE_CONTA != ''
          AND RTRIM(CODALMACEN) NOT LIKE 'G%'
        ORDER BY NOMBRE_CONTA
    `);
    const allStores = storeRes.recordset.map(r => r.Nombre);

    // 2. Dates
    let startDate, endDate;
    if (month && year) {
        const m = parseInt(month);
        const y = parseInt(year);
        startDate = new Date(y, m - 1, 1);
        endDate = new Date(y, m, 0);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
    } else {
        startDate = new Date();
        endDate = new Date();
    }

    // 3. Get covered stores
    const req = pool.request();
    req.input('startDate', sql.DateTime, startDate);
    req.input('endDate', sql.DateTime, endDate);

    if (perfil) {
        req.input('perfil', sql.NVarChar, perfil);
        perfilFilter = `AND PERFIL = @perfil`;
    }

    const coverageQuery = `
        SELECT DISTINCT LOCAL 
        FROM DIM_PERSONAL_ASIGNACIONES 
        WHERE ACTIVO = 1 
        ${perfilFilter}
        AND FECHA_INICIO <= @endDate
        AND (FECHA_FIN IS NULL OR FECHA_FIN >= @startDate)
    `;
    const coverageRes = await req.query(coverageQuery);
    const coveredStores = new Set(coverageRes.recordset.map(r => r.LOCAL));

    const missing = allStores.filter(s => !coveredStores.has(s));
    return missing.map(s => ({ Local: s, PerfilesFaltantes: perfil }));
}

// ─── Almacenes (solo individuales, sin grupos) ──────────────────────────────

async function getAllStores() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT RTRIM(CODALMACEN) AS CodAlmacen, NOMBRE_CONTA AS Nombre
        FROM DIM_NOMBRES_ALMACEN 
        WHERE NOMBRE_CONTA IS NOT NULL 
          AND NOMBRE_CONTA != ''
          AND RTRIM(CODALMACEN) NOT LIKE 'G%'
        ORDER BY NOMBRE_CONTA
    `);
    return result.recordset.map(r => r.Nombre);
}

// ─── Personal por Local ─────────────────────────────────────────────────────
// Returns all active assignments for a local today as [{ nombre, perfil }]
async function getPersonalPorLocal(local) {
    if (!local) return [];
    const pool = await poolPromise;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await pool.request()
        .input('local', sql.NVarChar, local)
        .input('today', sql.Date, today)
        .query(`
            SELECT p.NOMBRE AS PERSONAL_NOMBRE, a.PERFIL
            FROM DIM_PERSONAL_ASIGNACIONES a
            INNER JOIN DIM_PERSONAL p ON a.PERSONAL_ID = p.ID
            WHERE a.LOCAL = @local
              AND a.ACTIVO = 1
              AND a.FECHA_INICIO <= @today
              AND (a.FECHA_FIN IS NULL OR a.FECHA_FIN >= @today)
            ORDER BY
                CASE a.PERFIL
                    WHEN 'Administrador' THEN 1
                    WHEN 'Supervisor' THEN 2
                    ELSE 3
                END,
                p.NOMBRE
        `);
    return result.recordset.map(r => ({
        nombre: (r.PERSONAL_NOMBRE || '').split(' ')[0],
        perfil: r.PERFIL
    }));
}

module.exports = {
    ensurePersonalTable,
    getAllPersonal, createPersona, updatePersona, deletePersona,
    getAsignaciones, createAsignacion, updateAsignacion, deleteAsignacion,
    getLocalesSinCobertura,
    getAllCargos, createCargo, deleteCargo,
    getAllStores,
    getPersonalPorLocal
};
