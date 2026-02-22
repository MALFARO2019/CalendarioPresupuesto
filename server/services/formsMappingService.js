/**
 * formsMappingService.js
 * Manages field mappings for Forms tables:
 *   - Which column maps to "Persona/Usuario" (resolved via APP_USUARIOS)
 *   - Which column maps to "CodAlmacen" (resolved via APP_STORE_ALIAS)
 * 
 * Every Frm_* table gets two extra columns: _CODALMACEN and _PERSONAL_ID
 * When a sync happens, this service tries to resolve the values automatically.
 */

const { getFormsPool, sql } = require('../formsDb');
const { sql: mainSql, poolPromise } = require('../db');

// --- Ensure mapping config table exists ---

async function ensureMappingTable() {
    const pool = await getFormsPool();
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FormsFieldMappings')
        BEGIN
            CREATE TABLE FormsFieldMappings (
                ID              INT IDENTITY(1,1) PRIMARY KEY,
                SourceID        INT NOT NULL,
                FieldType       NVARCHAR(50) NOT NULL,
                ColumnName      NVARCHAR(200) NOT NULL,
                CreatedAt       DATETIME DEFAULT GETDATE(),
                UpdatedAt       DATETIME DEFAULT GETDATE(),
                UpdatedBy       NVARCHAR(200) NULL,
                CONSTRAINT UQ_FormsFieldMappings UNIQUE (SourceID, FieldType)
            );
        END
    `);
    // Value mappings dictionary (manual assignment of form values → IDs)
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FormsValueMappings')
        BEGIN
            CREATE TABLE FormsValueMappings (
                ID              INT IDENTITY(1,1) PRIMARY KEY,
                SourceValue     NVARCHAR(500) NOT NULL,
                MappingType     NVARCHAR(50) NOT NULL,
                ResolvedValue   NVARCHAR(200) NOT NULL,
                ResolvedLabel   NVARCHAR(500) NULL,
                CreatedAt       DATETIME DEFAULT GETDATE(),
                CreatedBy       NVARCHAR(200) NULL,
                CONSTRAINT UQ_FormsValueMappings UNIQUE (SourceValue, MappingType)
            );
        END
    `);
}

// --- Get mappings for a source ---

async function getMappings(sourceId) {
    const pool = await getFormsPool();
    const result = await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .query('SELECT * FROM FormsFieldMappings WHERE SourceID = @sourceId');
    return result.recordset;
}

// --- Set mapping ---

async function setMapping(sourceId, fieldType, columnName, updatedBy) {
    const pool = await getFormsPool();
    await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .input('fieldType', sql.NVarChar, fieldType)
        .input('columnName', sql.NVarChar, columnName)
        .input('updatedBy', sql.NVarChar, updatedBy)
        .query(`
            MERGE FormsFieldMappings AS target
            USING (SELECT @sourceId AS SourceID, @fieldType AS FieldType) AS source
            ON target.SourceID = source.SourceID AND target.FieldType = source.FieldType
            WHEN MATCHED THEN
                UPDATE SET ColumnName = @columnName, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
            WHEN NOT MATCHED THEN
                INSERT (SourceID, FieldType, ColumnName, UpdatedBy)
                VALUES (@sourceId, @fieldType, @columnName, @updatedBy);
        `);
}

// --- Delete mapping ---

async function deleteMapping(sourceId, fieldType) {
    const pool = await getFormsPool();
    await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .input('fieldType', sql.NVarChar, fieldType)
        .query('DELETE FROM FormsFieldMappings WHERE SourceID = @sourceId AND FieldType = @fieldType');
}

// --- Ensure mapping columns exist in a Frm_* table ---

async function ensureMappingColumns(tableName) {
    const pool = await getFormsPool();

    const cols = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = @tbl
        `);
    const existing = new Set(cols.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

    if (!existing.has('_codalmacen')) {
        try {
            await pool.request().query(
                `ALTER TABLE [${tableName}] ADD [_CODALMACEN] NVARCHAR(50) NULL`
            );
            console.log(`  + Added _CODALMACEN to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _CODALMACEN: ${e.message.substring(0, 80)}`);
        }
    }

    if (!existing.has('_personal_id')) {
        try {
            await pool.request().query(
                `ALTER TABLE [${tableName}] ADD [_PERSONAL_ID] INT NULL`
            );
            console.log(`  + Added _PERSONAL_ID to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _PERSONAL_ID: ${e.message.substring(0, 80)}`);
        }
    }

    if (!existing.has('_personal_nombre')) {
        try {
            await pool.request().query(
                `ALTER TABLE [${tableName}] ADD [_PERSONAL_NOMBRE] NVARCHAR(200) NULL`
            );
            console.log(`  + Added _PERSONAL_NOMBRE to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _PERSONAL_NOMBRE: ${e.message.substring(0, 80)}`);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// VALUE MAPPINGS DICTIONARY (manual assignments)
// ══════════════════════════════════════════════════════════════════════════════

async function getValueMappings(mappingType = null) {
    const pool = await getFormsPool();
    let q = 'SELECT * FROM FormsValueMappings';
    if (mappingType) q += ` WHERE MappingType = @type`;
    q += ' ORDER BY SourceValue';
    const req = pool.request();
    if (mappingType) req.input('type', sql.NVarChar, mappingType);
    return (await req.query(q)).recordset;
}

async function setValueMapping(sourceValue, mappingType, resolvedValue, resolvedLabel, createdBy) {
    const pool = await getFormsPool();
    await pool.request()
        .input('sv', sql.NVarChar, sourceValue.trim())
        .input('mt', sql.NVarChar, mappingType)
        .input('rv', sql.NVarChar, resolvedValue)
        .input('rl', sql.NVarChar, resolvedLabel || null)
        .input('cb', sql.NVarChar, createdBy || null)
        .query(`
            MERGE FormsValueMappings AS target
            USING (SELECT @sv AS SourceValue, @mt AS MappingType) AS source
            ON target.SourceValue = source.SourceValue AND target.MappingType = source.MappingType
            WHEN MATCHED THEN
                UPDATE SET ResolvedValue = @rv, ResolvedLabel = @rl, CreatedBy = @cb, CreatedAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (SourceValue, MappingType, ResolvedValue, ResolvedLabel, CreatedBy)
                VALUES (@sv, @mt, @rv, @rl, @cb);
        `);
}

async function deleteValueMapping(id) {
    const pool = await getFormsPool();
    await pool.request().input('id', sql.Int, id)
        .query('DELETE FROM FormsValueMappings WHERE ID = @id');
}

// Check the dictionary for a value
async function checkDictionary(sourceValue, mappingType) {
    if (!sourceValue) return null;
    const pool = await getFormsPool();
    const r = await pool.request()
        .input('sv', sql.NVarChar, String(sourceValue).trim())
        .input('mt', sql.NVarChar, mappingType)
        .query('SELECT TOP 1 ResolvedValue, ResolvedLabel FROM FormsValueMappings WHERE SourceValue = @sv AND MappingType = @mt');
    return r.recordset[0] || null;
}

// --- Resolve CODALMACEN for a single value ---

async function resolveCodAlmacen(aliasValue) {
    if (!aliasValue || !String(aliasValue).trim()) return null;
    try {
        // 1. Check manual dictionary first
        const dict = await checkDictionary(aliasValue, 'CODALMACEN');
        if (dict) return dict.ResolvedValue;

        // 2. Try APP_STORE_ALIAS
        const mainPool = await poolPromise;
        const result = await mainPool.request()
            .input('alias', mainSql.NVarChar, String(aliasValue).trim())
            .query(`
                SELECT TOP 1 CodAlmacen FROM APP_STORE_ALIAS
                WHERE Alias = @alias AND Activo = 1
                ORDER BY CASE WHEN Fuente IS NULL THEN 1 ELSE 0 END
            `);
        return result.recordset[0]?.CodAlmacen || null;
    } catch (e) {
        console.warn(`  ! resolveCodAlmacen error: ${e.message.substring(0, 80)}`);
        return null;
    }
}

// --- Resolve PersonalID for a single value ---

async function resolvePersonalId(personaValue) {
    if (!personaValue || !String(personaValue).trim()) return null;
    try {
        // 1. Check manual dictionary first
        const dict = await checkDictionary(personaValue, 'PERSONA');
        if (dict) return { id: parseInt(dict.ResolvedValue), nombre: dict.ResolvedLabel || dict.ResolvedValue };

        // 2. Try APP_USUARIOS (replaces DIM_PERSONAL)
        const mainPool = await poolPromise;
        const val = String(personaValue).trim();

        // Try exact match on Nombre
        let result = await mainPool.request()
            .input('nombre', mainSql.NVarChar, val)
            .query(`
                SELECT TOP 1 Id, Nombre FROM APP_USUARIOS
                WHERE Nombre = @nombre AND Activo = 1
            `);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        // Try LIKE match
        result = await mainPool.request()
            .input('nombre', mainSql.NVarChar, `%${val}%`)
            .query(`
                SELECT TOP 1 Id, Nombre FROM APP_USUARIOS
                WHERE Nombre LIKE @nombre AND Activo = 1
                ORDER BY LEN(Nombre)
            `);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        // Try by Email
        result = await mainPool.request()
            .input('correo', mainSql.NVarChar, val)
            .query(`
                SELECT TOP 1 Id, Nombre FROM APP_USUARIOS
                WHERE Email = @correo AND Activo = 1
            `);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        return null;
    } catch (e) {
        console.warn(`  ! resolvePersonalId error: ${e.message.substring(0, 80)}`);
        return null;
    }
}

// --- Get DISTINCT unmapped values (for manual mapping UI) ---

async function getDistinctUnmapped(sourceId, tableName) {
    const pool = await getFormsPool();
    const mappings = await getMappings(sourceId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');

    const result = { persona: [], almacen: [], errors: [] };

    if (!personaMapping && !almacenMapping) {
        result.errors.push('No hay mapeos configurados');
        return result;
    }

    // Ensure _CODALMACEN / _PERSONAL_ID columns exist
    try {
        await ensureMappingColumns(tableName);
    } catch (e) {
        console.error(`  ❌ getDistinctUnmapped: ensureMappingColumns failed: ${e.message}`);
        result.errors.push(`Error creando columnas: ${e.message.substring(0, 100)}`);
    }

    // Check which columns exist in the table
    const colCheck = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
    const existingCols = new Set(colCheck.recordset.map(r => r.COLUMN_NAME));

    if (almacenMapping) {
        const col = almacenMapping.ColumnName;
        if (!existingCols.has(col)) {
            result.errors.push(`Columna almacen "${col}" no existe en tabla`);
            console.warn(`  ⚠️ getDistinctUnmapped: Column "${col}" not found in ${tableName}`);
        } else if (!existingCols.has('_CODALMACEN')) {
            result.errors.push('Columna _CODALMACEN no existe en tabla');
        } else {
            try {
                const r = await pool.request().query(`
                    SELECT [${col}] AS sourceValue, COUNT(*) AS cnt
                    FROM [${tableName}]
                    WHERE _CODALMACEN IS NULL AND [${col}] IS NOT NULL AND RTRIM(LTRIM([${col}])) != ''
                    GROUP BY [${col}]
                    ORDER BY COUNT(*) DESC
                `);
                result.almacen = r.recordset;
            } catch (e) {
                console.error(`  ❌ getDistinctUnmapped almacen query error: ${e.message}`);
                result.errors.push(`Error query almacen: ${e.message.substring(0, 100)}`);
            }
        }
    }

    if (personaMapping) {
        const col = personaMapping.ColumnName;
        if (!existingCols.has(col)) {
            result.errors.push(`Columna persona "${col}" no existe en tabla`);
            console.warn(`  ⚠️ getDistinctUnmapped: Column "${col}" not found in ${tableName}`);
        } else if (!existingCols.has('_PERSONAL_ID')) {
            result.errors.push('Columna _PERSONAL_ID no existe en tabla');
        } else {
            try {
                const r = await pool.request().query(`
                    SELECT [${col}] AS sourceValue, COUNT(*) AS cnt
                    FROM [${tableName}]
                    WHERE _PERSONAL_ID IS NULL AND [${col}] IS NOT NULL AND RTRIM(LTRIM([${col}])) != ''
                    GROUP BY [${col}]
                    ORDER BY COUNT(*) DESC
                `);
                result.persona = r.recordset;
            } catch (e) {
                console.error(`  ❌ getDistinctUnmapped persona query error: ${e.message}`);
                result.errors.push(`Error query persona: ${e.message.substring(0, 100)}`);
            }
        }
    }

    console.log(`  📊 getDistinctUnmapped: almacen=${result.almacen.length}, persona=${result.persona.length}, errors=${result.errors.length}`);
    return result;
}

// --- Lookup personal for dropdown search ---

async function lookupPersonal(search) {
    const mainPool = await poolPromise;
    const r = await mainPool.request()
        .input('search', mainSql.NVarChar, `%${search}%`)
        .query(`
            SELECT TOP 20 Id AS ID, Nombre AS NOMBRE, Email AS CORREO FROM APP_USUARIOS
            WHERE Activo = 1 AND (Nombre LIKE @search OR Email LIKE @search)
            ORDER BY Nombre
        `);
    return r.recordset;
}

// --- Lookup stores for dropdown search ---

async function getAllStores() {
    const mainPool = await poolPromise;
    const r = await mainPool.request()
        .query(`
            SELECT DISTINCT
                RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS AS CODALMACEN,
                COALESCE(
                    n.NOMBRE_OPERACIONES,
                    n.NOMBRE_CONTA,
                    n.NOMBRE_INOCUIDAD,
                    n.NOMBRE_JUSTO,
                    d.NOMBREALMACEN COLLATE Modern_Spanish_CI_AS,
                    RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
                ) AS NOMBRE
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
            INNER JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA ON GL.IDGRUPO = GA.IDGRUPO
            LEFT JOIN DIM_NOMBRES_ALMACEN n ON RTRIM(n.CODALMACEN) = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            LEFT JOIN DIM_ALMACEN d ON RTRIM(d.CODALMACEN) COLLATE Modern_Spanish_CI_AS = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            WHERE GA.CODVISIBLE = 20
            ORDER BY CODALMACEN
        `);
    return r.recordset;
}

// --- Resolve mappings for ALL rows in a table ---

async function resolveAllMappings(sourceId, tableName) {
    const pool = await getFormsPool();

    const mappings = await getMappings(sourceId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');

    if (!personaMapping && !almacenMapping) {
        return { message: 'No hay mapeos configurados para este formulario', resolved: 0, total: 0 };
    }

    await ensureMappingColumns(tableName);

    let resolved = 0;
    let failed = 0;
    let total = 0;

    // Resolve CODALMACEN
    if (almacenMapping) {
        const colName = almacenMapping.ColumnName;

        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);

        if (colCheck.recordset.length > 0) {
            const rows = await pool.request().query(`
                SELECT ID, [${colName}] AS SourceValue 
                FROM [${tableName}] 
                WHERE _CODALMACEN IS NULL AND [${colName}] IS NOT NULL AND RTRIM(LTRIM([${colName}])) != ''
            `);
            total += rows.recordset.length;

            for (const row of rows.recordset) {
                const cod = await resolveCodAlmacen(row.SourceValue);
                if (cod) {
                    await pool.request()
                        .input('id', sql.Int, row.ID)
                        .input('cod', sql.NVarChar, cod)
                        .query(`UPDATE [${tableName}] SET _CODALMACEN = @cod WHERE ID = @id`);
                    resolved++;
                } else {
                    failed++;
                }
            }
        }
    }

    // Resolve PERSONAL
    if (personaMapping) {
        const colName = personaMapping.ColumnName;

        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);

        if (colCheck.recordset.length > 0) {
            const rows = await pool.request().query(`
                SELECT ID, [${colName}] AS SourceValue 
                FROM [${tableName}] 
                WHERE _PERSONAL_ID IS NULL AND [${colName}] IS NOT NULL AND RTRIM(LTRIM([${colName}])) != ''
            `);
            total += rows.recordset.length;

            for (const row of rows.recordset) {
                const persona = await resolvePersonalId(row.SourceValue);
                if (persona) {
                    await pool.request()
                        .input('id', sql.Int, row.ID)
                        .input('pid', sql.Int, persona.id)
                        .input('pnombre', sql.NVarChar, persona.nombre)
                        .query(`UPDATE [${tableName}] SET _PERSONAL_ID = @pid, _PERSONAL_NOMBRE = @pnombre WHERE ID = @id`);
                    resolved++;
                } else {
                    failed++;
                }
            }
        }
    }

    return { resolved, failed, total, message: `Resueltos: ${resolved}, Sin resolver: ${failed}, Total procesados: ${total}` };
}

// --- Get unmapped records ---

async function getUnmappedRecords(sourceId, tableName) {
    const pool = await getFormsPool();
    const mappings = await getMappings(sourceId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');

    if (!personaMapping && !almacenMapping) {
        return { unmapped: [], unmappedCount: 0, totalCount: 0, mappingsConfigured: false };
    }

    const conditions = [];
    if (almacenMapping) {
        conditions.push(`(_CODALMACEN IS NULL AND [${almacenMapping.ColumnName}] IS NOT NULL AND RTRIM(LTRIM([${almacenMapping.ColumnName}])) != '')`);
    }
    if (personaMapping) {
        conditions.push(`(_PERSONAL_ID IS NULL AND [${personaMapping.ColumnName}] IS NOT NULL AND RTRIM(LTRIM([${personaMapping.ColumnName}])) != '')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE (${conditions.join(' OR ')})` : '';

    const unmapped = await pool.request().query(`
        SELECT TOP 100 ID, ResponseID, RespondentEmail, SubmittedAt,
               ${almacenMapping ? `[${almacenMapping.ColumnName}] AS _SourceLocal,` : ''}
               ${personaMapping ? `[${personaMapping.ColumnName}] AS _SourcePersona,` : ''}
               _CODALMACEN, _PERSONAL_ID, _PERSONAL_NOMBRE
        FROM [${tableName}]
        ${whereClause}
        ORDER BY SubmittedAt DESC
    `);

    const totalResult = await pool.request().query(`SELECT COUNT(*) AS total FROM [${tableName}]`);
    const total = totalResult.recordset[0].total;

    return {
        unmapped: unmapped.recordset,
        unmappedCount: unmapped.recordset.length,
        totalCount: total,
        mappingsConfigured: true,
        personaColumn: personaMapping?.ColumnName || null,
        almacenColumn: almacenMapping?.ColumnName || null
    };
}

// --- Get mapping stats for a source ---

async function getMappingStats(sourceId, tableName) {
    const pool = await getFormsPool();

    const exists = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
    if (exists.recordset.length === 0) {
        return { exists: false };
    }

    const cols = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME IN ('_CODALMACEN', '_PERSONAL_ID')`);
    const hasMappingCols = cols.recordset.length > 0;

    if (!hasMappingCols) {
        return { exists: true, hasMappingColumns: false };
    }

    const stats = await pool.request().query(`
        SELECT 
            COUNT(*) AS total,
            COUNT(_CODALMACEN) AS withCodAlmacen,
            COUNT(_PERSONAL_ID) AS withPersonalId,
            SUM(CASE WHEN _CODALMACEN IS NULL THEN 1 ELSE 0 END) AS withoutCodAlmacen,
            SUM(CASE WHEN _PERSONAL_ID IS NULL THEN 1 ELSE 0 END) AS withoutPersonalId
        FROM [${tableName}]
    `);

    const mappings = await getMappings(sourceId);

    return {
        exists: true,
        hasMappingColumns: true,
        stats: stats.recordset[0],
        mappings: mappings.map(m => ({ fieldType: m.FieldType, columnName: m.ColumnName }))
    };
}

// --- Hook for post-sync resolution ---

async function resolveAfterSync(sourceId, tableName) {
    try {
        const mappings = await getMappings(sourceId);
        if (mappings.length === 0) return { resolved: 0, failed: 0, total: 0 };

        await ensureMappingColumns(tableName);
        const result = await resolveAllMappings(sourceId, tableName);
        if (result.resolved > 0) {
            console.log(`  Mapping resolved: ${result.resolved}/${result.total} for ${tableName}`);
        }
        return result;
    } catch (e) {
        console.warn(`  ! Post-sync mapping error: ${e.message.substring(0, 100)}`);
        return { resolved: 0, failed: 0, total: 0 };
    }
}

module.exports = {
    ensureMappingTable,
    getMappings,
    setMapping,
    deleteMapping,
    ensureMappingColumns,
    resolveAllMappings,
    getUnmappedRecords,
    getMappingStats,
    resolveAfterSync,
    // Value dictionary
    getValueMappings,
    setValueMapping,
    deleteValueMapping,
    getDistinctUnmapped,
    lookupPersonal,
    lookupStores: getAllStores,
};
