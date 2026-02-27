/**
 * gruposAlmacenDb.js
 * Base de datos para Grupos de Almacén.
 * Crea tablas KpisRosti_GruposAlmacenCab y KpisRosti_GruposAlmacenLin en RP_BI_RESUMENES.
 */
const { poolPromise, sql } = require('./db');

// ── Ensure tables ──────────────────────────────────────────────

async function ensureGruposAlmacenTables() {
    const pool = await poolPromise;

    // Cabecera
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'KpisRosti_GruposAlmacenCab')
        BEGIN
            CREATE TABLE KpisRosti_GruposAlmacenCab (
                IDGRUPO       INT IDENTITY(1,1) PRIMARY KEY,
                DESCRIPCION   NVARCHAR(200)  NOT NULL,
                CODVISIBLE    INT            NOT NULL DEFAULT 20,
                Activo        BIT            NOT NULL DEFAULT 1,
                FechaCreacion DATETIME2      NOT NULL DEFAULT GETDATE()
            );
        END
    `);

    // Líneas (miembros)
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'KpisRosti_GruposAlmacenLin')
        BEGIN
            CREATE TABLE KpisRosti_GruposAlmacenLin (
                Id            INT IDENTITY(1,1) PRIMARY KEY,
                IDGRUPO       INT            NOT NULL REFERENCES KpisRosti_GruposAlmacenCab(IDGRUPO) ON DELETE CASCADE,
                CODALMACEN    NVARCHAR(50)   NOT NULL,
                Activo        BIT            NOT NULL DEFAULT 1,
                CONSTRAINT UQ_GrupoAlmacenLin UNIQUE (IDGRUPO, CODALMACEN)
            );
        END
    `);

    console.log('✅ KpisRosti_GruposAlmacen tables ready');
}

// ── Import from ROSTIPOLLOS_P ──────────────────────────────────

async function importFromRostipollos() {
    const pool = await poolPromise;

    // Fetch cabeceras
    const cabResult = await pool.request().query(`
        SELECT IDGRUPO, DESCRIPCION, CODVISIBLE
        FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB
        WHERE CODVISIBLE = 20
    `);

    if (cabResult.recordset.length === 0) {
        return { imported: 0, message: 'No se encontraron grupos con CODVISIBLE = 20' };
    }

    let importedGroups = 0;
    let importedLines = 0;

    for (const cab of cabResult.recordset) {
        // Check if already exists (by DESCRIPCION)
        const exists = await pool.request()
            .input('desc', sql.NVarChar, cab.DESCRIPCION)
            .query(`SELECT IDGRUPO FROM KpisRosti_GruposAlmacenCab WHERE DESCRIPCION = @desc`);

        let localIdGrupo;

        if (exists.recordset.length > 0) {
            localIdGrupo = exists.recordset[0].IDGRUPO;
        } else {
            const ins = await pool.request()
                .input('desc', sql.NVarChar, cab.DESCRIPCION)
                .input('codvis', sql.Int, cab.CODVISIBLE)
                .query(`
                    INSERT INTO KpisRosti_GruposAlmacenCab (DESCRIPCION, CODVISIBLE)
                    OUTPUT INSERTED.IDGRUPO
                    VALUES (@desc, @codvis)
                `);
            localIdGrupo = ins.recordset[0].IDGRUPO;
            importedGroups++;
        }

        // Fetch líneas from source
        const linResult = await pool.request()
            .input('idgrupo', sql.Int, cab.IDGRUPO)
            .query(`
                SELECT CODALMACEN
                FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN
                WHERE IDGRUPO = @idgrupo
            `);

        for (const lin of linResult.recordset) {
            try {
                await pool.request()
                    .input('idgrupo', sql.Int, localIdGrupo)
                    .input('codalmacen', sql.NVarChar, lin.CODALMACEN)
                    .query(`
                        IF NOT EXISTS (
                            SELECT 1 FROM KpisRosti_GruposAlmacenLin
                            WHERE IDGRUPO = @idgrupo AND CODALMACEN = @codalmacen
                        )
                        INSERT INTO KpisRosti_GruposAlmacenLin (IDGRUPO, CODALMACEN)
                        VALUES (@idgrupo, @codalmacen)
                    `);
                importedLines++;
            } catch (e) {
                // ignore duplicates
            }
        }
    }

    return { imported: importedGroups, lines: importedLines, message: `Importados ${importedGroups} grupos y ${importedLines} líneas` };
}

// ── CRUD Grupos ────────────────────────────────────────────────

async function getGrupos() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT
            c.IDGRUPO, c.DESCRIPCION, c.CODVISIBLE, c.Activo, c.FechaCreacion,
            (SELECT COUNT(*) FROM KpisRosti_GruposAlmacenLin l WHERE l.IDGRUPO = c.IDGRUPO AND l.Activo = 1) AS TotalMiembros
        FROM KpisRosti_GruposAlmacenCab c
        ORDER BY c.DESCRIPCION
    `);
    return result.recordset;
}

async function getGrupoById(id) {
    const pool = await poolPromise;
    const cab = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT * FROM KpisRosti_GruposAlmacenCab WHERE IDGRUPO = @id`);

    if (cab.recordset.length === 0) return null;

    const lin = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT * FROM KpisRosti_GruposAlmacenLin WHERE IDGRUPO = @id AND Activo = 1 ORDER BY CODALMACEN`);

    return { ...cab.recordset[0], lineas: lin.recordset };
}

async function createGrupo(descripcion, codvisible = 20) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('desc', sql.NVarChar, descripcion)
        .input('codvis', sql.Int, codvisible)
        .query(`
            INSERT INTO KpisRosti_GruposAlmacenCab (DESCRIPCION, CODVISIBLE)
            OUTPUT INSERTED.*
            VALUES (@desc, @codvis)
        `);
    return result.recordset[0];
}

async function updateGrupo(id, descripcion, codvisible, activo) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('desc', sql.NVarChar, descripcion)
        .input('codvis', sql.Int, codvisible)
        .input('activo', sql.Bit, activo)
        .query(`
            UPDATE KpisRosti_GruposAlmacenCab
            SET DESCRIPCION = @desc, CODVISIBLE = @codvis, Activo = @activo
            WHERE IDGRUPO = @id;
            SELECT * FROM KpisRosti_GruposAlmacenCab WHERE IDGRUPO = @id;
        `);
    return result.recordset[0] || null;
}

async function deleteGrupo(id) {
    const pool = await poolPromise;
    // CASCADE will delete lines
    await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM KpisRosti_GruposAlmacenCab WHERE IDGRUPO = @id`);
}

// ── CRUD Líneas ────────────────────────────────────────────────

async function getLineas(idgrupo) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('idgrupo', sql.Int, idgrupo)
        .query(`SELECT * FROM KpisRosti_GruposAlmacenLin WHERE IDGRUPO = @idgrupo AND Activo = 1 ORDER BY CODALMACEN`);
    return result.recordset;
}

async function addLinea(idgrupo, codalmacen) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('idgrupo', sql.Int, idgrupo)
        .input('codalmacen', sql.NVarChar, codalmacen)
        .query(`
            INSERT INTO KpisRosti_GruposAlmacenLin (IDGRUPO, CODALMACEN)
            OUTPUT INSERTED.*
            VALUES (@idgrupo, @codalmacen)
        `);
    return result.recordset[0];
}

async function removeLinea(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM KpisRosti_GruposAlmacenLin WHERE Id = @id`);
}

// ── Stores list (for select dropdown) ──────────────────────────

async function getAvailableStores() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT RTRIM(CODALMACEN) AS CODALMACEN, NOMBRE_CONTA AS NOMBRE
        FROM DIM_NOMBRES_ALMACEN
        WHERE NOMBRE_CONTA IS NOT NULL AND NOMBRE_CONTA != ''
        ORDER BY CODALMACEN
    `);
    return result.recordset;
}

// ── Store details update (edit alias inline) ──────────────────────────

async function updateStoreName(codalmacen, nombre) {
    const pool = await poolPromise;
    await pool.request()
        .input('codalmacen', sql.NChar(10), codalmacen)
        .input('nombre', sql.NVarChar(200), nombre)
        .query(`
            IF EXISTS (SELECT 1 FROM DIM_NOMBRES_ALMACEN WHERE CODALMACEN = @codalmacen)
            BEGIN
                UPDATE DIM_NOMBRES_ALMACEN
                SET NOMBRE_CONTA = @nombre,
                    NOMBRE_INOCUIDAD = ISNULL(NOMBRE_INOCUIDAD, @nombre),
                    NOMBRE_MERCADEO = ISNULL(NOMBRE_MERCADEO, @nombre),
                    NOMBRE_QUEJAS = ISNULL(NOMBRE_QUEJAS, @nombre),
                    NOMBRE_JUSTO = ISNULL(NOMBRE_JUSTO, @nombre),
                    NOMBRE_CALIDAD = ISNULL(NOMBRE_CALIDAD, @nombre),
                    NOMBRE_OPERACIONES = ISNULL(NOMBRE_OPERACIONES, @nombre),
                    NOMBRE_GENERAL = ISNULL(NOMBRE_GENERAL, @nombre)
                WHERE CODALMACEN = @codalmacen
            END
            ELSE
            BEGIN
                INSERT INTO DIM_NOMBRES_ALMACEN 
                (CODALMACEN, NOMBRE_CONTA, NOMBRE_INOCUIDAD, NOMBRE_MERCADEO, NOMBRE_QUEJAS, NOMBRE_JUSTO, NOMBRE_CALIDAD, NOMBRE_OPERACIONES, NOMBRE_GENERAL)
                VALUES 
                (@codalmacen, @nombre, @nombre, @nombre, @nombre, @nombre, @nombre, @nombre, @nombre)
            END
        `);
    return { success: true };
}

module.exports = {
    ensureGruposAlmacenTables,
    importFromRostipollos,
    getGrupos,
    getGrupoById,
    createGrupo,
    updateGrupo,
    deleteGrupo,
    getLineas,
    addLinea,
    removeLinea,
    getAvailableStores,
    updateStoreName
};
