/**
 * storeAliasService.js
 * Central service for mapping store name aliases to CODALMACEN.
 * Reads/writes to APP_STORE_ALIAS in RP_BI_RESUMENES.
 */
const { sql, poolPromise } = require('../db');

// Column → Fuente mapping for DIM_NOMBRES_ALMACEN
const COL_FUENTE_MAP = {
    NOMBRE_CONTA: 'CONTA',
    NOMBRE_INOCUIDAD: 'INOCUIDAD',
    NOMBRE_MERCADEO: 'MERCADEO',
    NOMBRE_QUEJAS: 'QUEJAS',
    NOMBRE_JUSTO: 'JUSTO',
    NOMBRE_CALIDAD: 'CALIDAD',
    NOMBRE_OPERACIONES: 'OPERACIONES',
    NOMBRE_GENERAL: 'GENERAL'
};

/**
 * Ensure the APP_STORE_ALIAS table exists.
 */
async function ensureStoreAliasTable() {
    try {
        const pool = await poolPromise;
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_STORE_ALIAS')
            BEGIN
                CREATE TABLE APP_STORE_ALIAS (
                    Id            INT IDENTITY(1,1) PRIMARY KEY,
                    Alias         NVARCHAR(255) NOT NULL,
                    CodAlmacen    NVARCHAR(50)  NOT NULL,
                    Fuente        NVARCHAR(50)  NULL,
                    Activo        BIT DEFAULT 1,
                    FechaCreacion DATETIME2 DEFAULT GETDATE(),
                    FuenteKey     AS ISNULL(Fuente, '_ALL_') PERSISTED
                );
                CREATE UNIQUE INDEX UQ_StoreAlias
                    ON APP_STORE_ALIAS(Alias, FuenteKey);
            END
        `);
        console.log('✅ APP_STORE_ALIAS table ready');
    } catch (err) {
        console.error('Error ensuring APP_STORE_ALIAS:', err.message);
    }
}

/**
 * Seed from DIM_NOMBRES_ALMACEN – extract all non-null name columns
 * and insert as aliases. Skips duplicates.
 * @returns {{ inserted: number, skipped: number }}
 */
async function seedFromDimNombres() {
    const pool = await poolPromise;

    // Read all rows from DIM_NOMBRES_ALMACEN
    const result = await pool.request().query(`
        SELECT RTRIM(CODALMACEN) AS CodAlmacen,
               NOMBRE_CONTA, NOMBRE_INOCUIDAD, NOMBRE_MERCADEO,
               NOMBRE_QUEJAS, NOMBRE_JUSTO, NOMBRE_CALIDAD,
               NOMBRE_OPERACIONES, NOMBRE_GENERAL
        FROM DIM_NOMBRES_ALMACEN
    `);

    let inserted = 0;
    let skipped = 0;

    for (const row of result.recordset) {
        const codAlmacen = (row.CodAlmacen || '').trim();
        if (!codAlmacen) continue;

        for (const [col, fuente] of Object.entries(COL_FUENTE_MAP)) {
            const alias = (row[col] || '').trim();
            if (!alias) continue;

            try {
                await pool.request()
                    .input('alias', sql.NVarChar, alias)
                    .input('cod', sql.NVarChar, codAlmacen)
                    .input('fuente', sql.NVarChar, fuente)
                    .query(`
                        IF NOT EXISTS (
                            SELECT 1 FROM APP_STORE_ALIAS
                            WHERE Alias = @alias AND ISNULL(Fuente,'_ALL_') = ISNULL(@fuente,'_ALL_')
                        )
                        INSERT INTO APP_STORE_ALIAS (Alias, CodAlmacen, Fuente)
                        VALUES (@alias, @cod, @fuente)
                    `);
                inserted++;
            } catch (e) {
                // Duplicate key – skip
                skipped++;
            }
        }
    }

    return { inserted, skipped, total: result.recordset.length };
}

/**
 * Resolve an alias to its CODALMACEN.
 * Prefers exact fuente match, then falls to NULL fuente (generic).
 * @param {string} nombre
 * @param {string|null} fuente
 * @returns {string|null} CODALMACEN or null
 */
async function resolveAlias(nombre, fuente = null) {
    if (!nombre) return null;
    const pool = await poolPromise;
    const result = await pool.request()
        .input('alias', sql.NVarChar, nombre.trim())
        .input('fuente', sql.NVarChar, fuente)
        .query(`
            SELECT TOP 1 CodAlmacen FROM APP_STORE_ALIAS
            WHERE Alias = @alias AND Activo = 1
              AND (Fuente = @fuente OR Fuente IS NULL)
            ORDER BY CASE WHEN Fuente = @fuente THEN 0 ELSE 1 END
        `);
    return result.recordset[0]?.CodAlmacen || null;
}

/**
 * Get all aliases, optionally filtered.
 */
async function getAllAliases(fuente = null, search = null) {
    const pool = await poolPromise;
    const req = pool.request();
    let where = 'WHERE 1=1';

    if (fuente) {
        req.input('fuente', sql.NVarChar, fuente);
        where += ' AND a.Fuente = @fuente';
    }
    if (search) {
        req.input('search', sql.NVarChar, `%${search}%`);
        where += ' AND (a.Alias LIKE @search OR a.CodAlmacen LIKE @search)';
    }

    const result = await req.query(`
        SELECT a.Id, a.Alias, RTRIM(a.CodAlmacen) AS CodAlmacen, a.Fuente, a.Activo, a.FechaCreacion
        FROM APP_STORE_ALIAS a
        ${where}
        ORDER BY a.CodAlmacen, a.Fuente, a.Alias
    `);
    return result.recordset;
}

/**
 * Add a new alias.
 */
async function addAlias(alias, codAlmacen, fuente = null) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('alias', sql.NVarChar, alias.trim())
        .input('cod', sql.NVarChar, codAlmacen.trim())
        .input('fuente', sql.NVarChar, fuente || null)
        .query(`
            INSERT INTO APP_STORE_ALIAS (Alias, CodAlmacen, Fuente)
            OUTPUT INSERTED.*
            VALUES (@alias, @cod, @fuente)
        `);
    return result.recordset[0];
}

/**
 * Update an existing alias.
 */
async function updateAlias(id, alias, codAlmacen, fuente) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('alias', sql.NVarChar, alias.trim())
        .input('cod', sql.NVarChar, codAlmacen.trim())
        .input('fuente', sql.NVarChar, fuente || null)
        .query(`
            UPDATE APP_STORE_ALIAS
            SET Alias = @alias, CodAlmacen = @cod, Fuente = @fuente
            OUTPUT INSERTED.*
            WHERE Id = @id
        `);
    return result.recordset[0];
}

/**
 * Soft-delete (deactivate) an alias.
 */
async function deleteAlias(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM APP_STORE_ALIAS WHERE Id = @id');
}

/**
 * Get distinct CODALMACEN list from DIM_NOMBRES_ALMACEN for combo boxes.
 */
async function getStoreList() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT RTRIM(CODALMACEN) AS CodAlmacen, NOMBRE_CONTA AS Nombre
        FROM DIM_NOMBRES_ALMACEN
        WHERE NOMBRE_CONTA IS NOT NULL AND NOMBRE_CONTA != ''
        ORDER BY NOMBRE_CONTA
    `);
    return result.recordset;
}

/**
 * Get distinct fuentes currently in use.
 */
async function getFuentes() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT DISTINCT Fuente FROM APP_STORE_ALIAS
        WHERE Fuente IS NOT NULL
        ORDER BY Fuente
    `);
    return result.recordset.map(r => r.Fuente);
}

/**
 * Get stats: how many aliases per fuente, total stores covered.
 */
async function getStats() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT
            COUNT(*) AS TotalAliases,
            COUNT(DISTINCT CodAlmacen) AS TotalStores,
            COUNT(DISTINCT Fuente) AS TotalFuentes
        FROM APP_STORE_ALIAS
        WHERE Activo = 1
    `);
    const byFuente = await pool.request().query(`
        SELECT ISNULL(Fuente, 'Sin fuente') AS Fuente, COUNT(*) AS Total
        FROM APP_STORE_ALIAS
        WHERE Activo = 1
        GROUP BY Fuente
        ORDER BY Total DESC
    `);
    return {
        ...result.recordset[0],
        byFuente: byFuente.recordset
    };
}

module.exports = {
    ensureStoreAliasTable,
    seedFromDimNombres,
    resolveAlias,
    getAllAliases,
    addAlias,
    updateAlias,
    deleteAlias,
    getStoreList,
    getFuentes,
    getStats
};
