/**
 * invgateMappingService.js
 * Manages field mappings for InvGate View tables:
 *   - Which column maps to "Persona" (resolved via APP_USUARIOS)
 *   - Which column maps to "CodAlmacen" (resolved via APP_STORE_ALIAS)
 *
 * Every InvgateView_N table gets three extra columns: _CODALMACEN, _PERSONAL_ID, _PERSONAL_NOMBRE
 * After sync, this service tries to resolve the values automatically.
 *
 * Pattern copied from formsMappingService.js — adapted for InvGate pool.
 */

const { getInvgatePool, sql } = require('../invgateDb');
const { sql: mainSql, poolPromise } = require('../db');

// ─── Table name helper ────────────────────────────────────────────
// Must match _viewTableName() in invgateSyncService.js exactly.
function _slugifyViewName(name) {
    if (!name) return '';
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove accents
        .replace(/[^a-zA-Z0-9\s]/g, '')                    // keep alphanumeric + spaces
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))  // PascalCase
        .join('')
        .substring(0, 50);                                  // max 50 chars
}

async function viewTableName(viewId) {
    const pool = await getInvgatePool();
    const result = await pool.request()
        .input('vid', sql.Int, parseInt(viewId))
        .query('SELECT Nombre FROM InvgateViews WHERE ViewID = @vid');
    const nombre = result.recordset[0]?.Nombre || '';
    const slug = _slugifyViewName(nombre);
    return slug ? `InvgateView_${parseInt(viewId)}_${slug}` : `InvgateView_${parseInt(viewId)}`;
}

// ─── Ensure mapping config table exists ───────────────────────────

async function ensureMappingTable() {
    const pool = await getInvgatePool();
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateViewMappings')
        BEGIN
            CREATE TABLE InvgateViewMappings (
                ID          INT IDENTITY(1,1) PRIMARY KEY,
                ViewID      INT NOT NULL,
                FieldType   NVARCHAR(50) NOT NULL,
                ColumnName  NVARCHAR(200) NOT NULL,
                CreatedAt   DATETIME DEFAULT GETDATE(),
                UpdatedAt   DATETIME DEFAULT GETDATE(),
                UpdatedBy   NVARCHAR(200) NULL,
                CONSTRAINT UQ_InvgateViewMappings UNIQUE (ViewID, FieldType)
            );
        END
    `);
}

// ─── Get mappings for a view ──────────────────────────────────────

async function getMappings(viewId) {
    const pool = await getInvgatePool();
    const result = await pool.request()
        .input('viewId', sql.Int, viewId)
        .query('SELECT * FROM InvgateViewMappings WHERE ViewID = @viewId');
    return result.recordset;
}

// ─── Set mapping ──────────────────────────────────────────────────

async function setMapping(viewId, fieldType, columnName, updatedBy) {
    const pool = await getInvgatePool();
    await pool.request()
        .input('viewId', sql.Int, viewId)
        .input('fieldType', sql.NVarChar, fieldType)
        .input('columnName', sql.NVarChar, columnName)
        .input('updatedBy', sql.NVarChar, updatedBy || 'SYSTEM')
        .query(`
            MERGE InvgateViewMappings AS target
            USING (SELECT @viewId AS ViewID, @fieldType AS FieldType) AS source
            ON target.ViewID = source.ViewID AND target.FieldType = source.FieldType
            WHEN MATCHED THEN
                UPDATE SET ColumnName = @columnName, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
            WHEN NOT MATCHED THEN
                INSERT (ViewID, FieldType, ColumnName, UpdatedBy)
                VALUES (@viewId, @fieldType, @columnName, @updatedBy);
        `);
}

// ─── Delete mapping ───────────────────────────────────────────────

async function deleteMapping(viewId, fieldType) {
    const pool = await getInvgatePool();
    await pool.request()
        .input('viewId', sql.Int, viewId)
        .input('fieldType', sql.NVarChar, fieldType)
        .query('DELETE FROM InvgateViewMappings WHERE ViewID = @viewId AND FieldType = @fieldType');
}

// ─── Ensure mapping columns exist in InvgateView_N table ─────────

async function ensureMappingColumns(tableName) {
    const pool = await getInvgatePool();

    const cols = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
    const existing = new Set(cols.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

    if (!existing.has('_codalmacen')) {
        try {
            await pool.request().query(`ALTER TABLE [${tableName}] ADD [_CODALMACEN] NVARCHAR(50) NULL`);
            console.log(`  + Added _CODALMACEN to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _CODALMACEN: ${e.message.substring(0, 80)}`);
        }
    }

    if (!existing.has('_personal_id')) {
        try {
            await pool.request().query(`ALTER TABLE [${tableName}] ADD [_PERSONAL_ID] INT NULL`);
            console.log(`  + Added _PERSONAL_ID to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _PERSONAL_ID: ${e.message.substring(0, 80)}`);
        }
    }

    if (!existing.has('_personal_nombre')) {
        try {
            await pool.request().query(`ALTER TABLE [${tableName}] ADD [_PERSONAL_NOMBRE] NVARCHAR(200) NULL`);
            console.log(`  + Added _PERSONAL_NOMBRE to ${tableName}`);
        } catch (e) {
            console.warn(`  ! Could not add _PERSONAL_NOMBRE: ${e.message.substring(0, 80)}`);
        }
    }
}

// ─── Resolve CODALMACEN for a single value ────────────────────────

async function resolveCodAlmacen(aliasValue) {
    if (!aliasValue || !String(aliasValue).trim()) return null;
    try {
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

// ─── Resolve PersonalID for a single value (uses APP_USUARIOS) ────

async function resolvePersonalId(personaValue) {
    if (!personaValue || !String(personaValue).trim()) return null;
    try {
        const mainPool = await poolPromise;
        const val = String(personaValue).trim();

        // Try exact match on Nombre
        let result = await mainPool.request()
            .input('nombre', mainSql.NVarChar, val)
            .query(`SELECT TOP 1 Id, Nombre FROM APP_USUARIOS WHERE Nombre = @nombre AND Activo = 1`);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        // Try LIKE match
        result = await mainPool.request()
            .input('nombre', mainSql.NVarChar, `%${val}%`)
            .query(`SELECT TOP 1 Id, Nombre FROM APP_USUARIOS WHERE Nombre LIKE @nombre AND Activo = 1 ORDER BY LEN(Nombre)`);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        // Try by Email
        result = await mainPool.request()
            .input('correo', mainSql.NVarChar, val)
            .query(`SELECT TOP 1 Id, Nombre FROM APP_USUARIOS WHERE Email = @correo AND Activo = 1`);
        if (result.recordset.length > 0) {
            return { id: result.recordset[0].Id, nombre: result.recordset[0].Nombre };
        }

        return null;
    } catch (e) {
        console.warn(`  ! resolvePersonalId error: ${e.message.substring(0, 80)}`);
        return null;
    }
}


// ─── Resolve mappings for ALL rows in a view table ────────────────

async function resolveAllMappings(viewId) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    // Check table exists
    const exists = await pool.request()
        .query(`SELECT OBJECT_ID('${tableName}', 'U') AS tid`);
    if (!exists.recordset[0]?.tid) {
        return { message: 'Tabla no existe. Ejecute un sync primero.', resolved: 0, total: 0 };
    }

    const mappings = await getMappings(viewId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');

    if (!personaMapping && !almacenMapping) {
        return { message: 'No hay mapeos configurados para esta vista', resolved: 0, total: 0 };
    }

    await ensureMappingColumns(tableName);

    let resolved = 0;
    let failed = 0;
    let total = 0;

    // Resolve CODALMACEN (skip if __NO_MAP__)
    if (almacenMapping && almacenMapping.ColumnName !== '__NO_MAP__') {
        const colName = almacenMapping.ColumnName;
        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);

        if (colCheck.recordset.length > 0) {
            const rows = await pool.request().query(`
                SELECT [_RowId], [${colName}] AS SourceValue
                FROM [${tableName}]
                WHERE [_CODALMACEN] IS NULL AND [${colName}] IS NOT NULL AND RTRIM(LTRIM([${colName}])) != ''
            `);
            total += rows.recordset.length;

            for (const row of rows.recordset) {
                const cod = await resolveCodAlmacen(row.SourceValue);
                if (cod) {
                    await pool.request()
                        .input('id', sql.Int, row._RowId)
                        .input('cod', sql.NVarChar, cod)
                        .query(`UPDATE [${tableName}] SET [_CODALMACEN] = @cod WHERE [_RowId] = @id`);
                    resolved++;
                } else {
                    failed++;
                }
            }
        }
    }

    // Resolve PERSONAL (skip if __NO_MAP__)
    if (personaMapping && personaMapping.ColumnName !== '__NO_MAP__') {
        const colName = personaMapping.ColumnName;
        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);

        if (colCheck.recordset.length > 0) {
            const rows = await pool.request().query(`
                SELECT [_RowId], [${colName}] AS SourceValue
                FROM [${tableName}]
                WHERE [_PERSONAL_ID] IS NULL AND [${colName}] IS NOT NULL AND RTRIM(LTRIM([${colName}])) != ''
            `);
            total += rows.recordset.length;

            for (const row of rows.recordset) {
                const persona = await resolvePersonalId(row.SourceValue);
                if (persona) {
                    await pool.request()
                        .input('id', sql.Int, row._RowId)
                        .input('pid', sql.Int, persona.id)
                        .input('pnombre', sql.NVarChar, persona.nombre)
                        .query(`UPDATE [${tableName}] SET [_PERSONAL_ID] = @pid, [_PERSONAL_NOMBRE] = @pnombre WHERE [_RowId] = @id`);
                    resolved++;
                } else {
                    failed++;
                }
            }
        }
    }

    return { resolved, failed, total, message: `Resueltos: ${resolved}, Sin resolver: ${failed}, Total procesados: ${total}` };
}

// ─── Get unmapped records ─────────────────────────────────────────

async function getUnmappedRecords(viewId) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    const exists = await pool.request()
        .query(`SELECT OBJECT_ID('${tableName}', 'U') AS tid`);
    if (!exists.recordset[0]?.tid) {
        return { unmapped: [], unmappedCount: 0, totalCount: 0, mappingsConfigured: false };
    }

    const mappings = await getMappings(viewId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA' && m.ColumnName !== '__NO_MAP__');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN' && m.ColumnName !== '__NO_MAP__');

    if (!personaMapping && !almacenMapping) {
        return { unmapped: [], unmappedCount: 0, totalCount: 0, mappingsConfigured: false };
    }

    await ensureMappingColumns(tableName);

    // Get column list for the table
    const colResult = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl ORDER BY ORDINAL_POSITION`);
    const allCols = colResult.recordset.map(r => r.COLUMN_NAME);

    const conditions = [];
    if (almacenMapping) {
        conditions.push(`([_CODALMACEN] IS NULL AND [${almacenMapping.ColumnName}] IS NOT NULL AND RTRIM(LTRIM([${almacenMapping.ColumnName}])) != '')`);
    }
    if (personaMapping) {
        conditions.push(`([_PERSONAL_ID] IS NULL AND [${personaMapping.ColumnName}] IS NOT NULL AND RTRIM(LTRIM([${personaMapping.ColumnName}])) != '')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE (${conditions.join(' OR ')})` : '';
    const selectCols = allCols.map(c => `[${c}]`).join(', ');

    const unmapped = await pool.request().query(`
        SELECT TOP 100 ${selectCols}
        FROM [${tableName}]
        ${whereClause}
        ORDER BY [_RowId] DESC
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

// ─── Get mapping stats for a view ─────────────────────────────────

async function getMappingStats(viewId) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

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
            COUNT([_CODALMACEN]) AS withCodAlmacen,
            COUNT([_PERSONAL_ID]) AS withPersonalId,
            SUM(CASE WHEN [_CODALMACEN] IS NULL THEN 1 ELSE 0 END) AS withoutCodAlmacen,
            SUM(CASE WHEN [_PERSONAL_ID] IS NULL THEN 1 ELSE 0 END) AS withoutPersonalId
        FROM [${tableName}]
    `);

    const mappings = await getMappings(viewId);

    return {
        exists: true,
        hasMappingColumns: true,
        stats: stats.recordset[0],
        mappings: mappings.map(m => ({ fieldType: m.FieldType, columnName: m.ColumnName }))
    };
}

// ─── Hook for post-sync resolution ────────────────────────────────

async function resolveAfterSync(viewId) {
    try {
        // Auto-detect mappings if none are configured yet
        let mappings = await getMappings(viewId);
        if (mappings.length === 0) {
            const detected = await autoDetectMappings(viewId);
            if (detected > 0) {
                mappings = await getMappings(viewId);
            }
        }

        if (mappings.length === 0) return;

        const tableName = await viewTableName(viewId);
        await ensureMappingColumns(tableName);

        // Seed any new store names into APP_STORE_ALIAS before resolution
        const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');
        if (almacenMapping && almacenMapping.ColumnName !== '__NO_MAP__') {
            await seedStoreAliasesFromView(viewId, almacenMapping.ColumnName);
        }

        const result = await resolveAllMappings(viewId);
        if (result.resolved > 0 || result.failed > 0) {
            console.log(`  📎 Mapping resolved: ${result.resolved}/${result.total} for ${tableName} (${result.failed} sin resolver)`);
        }
    } catch (e) {
        console.warn(`  ! Post-sync mapping error: ${e.message.substring(0, 100)}`);
    }
}

// ─── Auto-detect store/persona columns by name heuristics ─────────

const STORE_COLUMN_PATTERNS = [
    'restaurante', 'local', 'sucursal', 'almacen', 'almacén',
    'tienda', 'store', 'punto_de_venta', 'pdv'
];
const PERSONA_COLUMN_PATTERNS = [
    'cliente', 'agente', 'creador', 'usuario', 'persona',
    'responsable', 'asignado', 'operador', 'customer'
];

async function autoDetectMappings(viewId) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    // Check if any existing mappings (including __NO_MAP__) already set
    const existing = await getMappings(viewId);
    const hasPersona = existing.some(m => m.FieldType === 'PERSONA');
    const hasAlmacen = existing.some(m => m.FieldType === 'CODALMACEN');
    if (hasPersona && hasAlmacen) return 0; // Both already configured

    // Get columns of the view table
    const colResult = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
    const columns = colResult.recordset.map(r => r.COLUMN_NAME);

    let detected = 0;

    // Auto-detect CODALMACEN column (only if not already mapped)
    if (!hasAlmacen) {
        const storeCol = columns.find(col => {
            const lower = col.toLowerCase().replace(/[_:]/g, '');
            return STORE_COLUMN_PATTERNS.some(p => lower.includes(p));
        });
        if (storeCol) {
            console.log(`  🔍 Auto-detected store column: [${storeCol}] for view ${viewId}`);
            await setMapping(viewId, 'CODALMACEN', storeCol, 'AUTO_DETECT');
            detected++;
        }
    }

    // Auto-detect PERSONA column (only if not already mapped)
    if (!hasPersona) {
        const personaCol = columns.find(col => {
            const lower = col.toLowerCase().replace(/[_:]/g, '');
            return PERSONA_COLUMN_PATTERNS.some(p => lower.includes(p));
        });
        if (personaCol) {
            console.log(`  🔍 Auto-detected persona column: [${personaCol}] for view ${viewId}`);
            await setMapping(viewId, 'PERSONA', personaCol, 'AUTO_DETECT');
            detected++;
        }
    }

    return detected;
}

// ─── Seed store aliases from InvGate view data into APP_STORE_ALIAS ──

async function seedStoreAliasesFromView(viewId, storeColumnName) {
    try {
        const pool = await getInvgatePool();
        const mainPool = await poolPromise;
        const tableName = await viewTableName(viewId);

        // Get distinct store names from the view table
        const storeNames = await pool.request().query(`
            SELECT DISTINCT [${storeColumnName}] AS StoreName
            FROM [${tableName}]
            WHERE [${storeColumnName}] IS NOT NULL AND RTRIM(LTRIM([${storeColumnName}])) != ''
        `);

        let seeded = 0;
        for (const row of storeNames.recordset) {
            const alias = row.StoreName.trim();
            if (!alias) continue;

            // Check if alias already exists in APP_STORE_ALIAS
            const existing = await mainPool.request()
                .input('alias', mainSql.NVarChar, alias)
                .query(`SELECT TOP 1 CodAlmacen FROM APP_STORE_ALIAS WHERE LOWER(Alias) = LOWER(@alias)`);

            if (existing.recordset.length === 0) {
                // Try fuzzy match against DIM_NOMBRES_ALMACEN
                const fuzzy = await mainPool.request()
                    .input('alias', mainSql.NVarChar, `%${alias}%`)
                    .query(`
                        SELECT TOP 1 CODALMACEN FROM DIM_NOMBRES_ALMACEN
                        WHERE NOMBRE_QUEJAS LIKE @alias
                           OR NOMBRE_GENERAL LIKE @alias
                           OR NOMBRE_OPERACIONES LIKE @alias
                           OR NOMBRE_MERCADEO LIKE @alias
                    `);

                if (fuzzy.recordset.length > 0) {
                    const cod = fuzzy.recordset[0].CODALMACEN.trim();
                    await mainPool.request()
                        .input('alias', mainSql.NVarChar, alias)
                        .input('cod', mainSql.NVarChar, cod)
                        .input('fuente', mainSql.NVarChar, 'INVGATE')
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM APP_STORE_ALIAS WHERE Alias = @alias AND Fuente = @fuente)
                            INSERT INTO APP_STORE_ALIAS (Alias, CodAlmacen, Fuente) VALUES (@alias, @cod, @fuente)
                        `);
                    seeded++;
                }
            }
        }

        if (seeded > 0) {
            console.log(`  🏪 Seeded ${seeded} new store aliases from InvGate view ${viewId}`);
        }
    } catch (e) {
        console.warn(`  ! Error seeding store aliases: ${e.message.substring(0, 100)}`);
    }
}

// ─── Manually map a persona source value → user ID in a view table ────
async function mapPersonaManual(viewId, sourceValue, userId, userName) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    const mappings = await getMappings(viewId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    if (!personaMapping) throw new Error('No persona mapping configured for this view');

    await ensureMappingColumns(tableName);

    const colName = personaMapping.ColumnName;
    const result = await pool.request()
        .input('src', sql.NVarChar, sourceValue.trim())
        .input('pid', sql.Int, userId)
        .input('pname', sql.NVarChar, userName)
        .query(`
            UPDATE [${tableName}]
            SET [_PERSONAL_ID] = @pid, [_PERSONAL_NOMBRE] = @pname
            WHERE RTRIM(LTRIM([${colName}])) = @src AND [_PERSONAL_ID] IS NULL
        `);
    return { updated: result.rowsAffected[0] || 0, sourceValue, userId, userName };
}

// ─── Get ALL resolved mappings from the data table (grouped by source value) ──
async function getResolvedMappings(viewId) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    const exists = await pool.request()
        .query(`SELECT OBJECT_ID('${tableName}', 'U') AS tid`);
    if (!exists.recordset[0]?.tid) {
        return { almacen: [], persona: [] };
    }

    const mappings = await getMappings(viewId);
    const personaMapping = mappings.find(m => m.FieldType === 'PERSONA');
    const almacenMapping = mappings.find(m => m.FieldType === 'CODALMACEN');

    // Check mapping columns exist
    const cols = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME IN ('_CODALMACEN', '_PERSONAL_ID', '_PERSONAL_NOMBRE')`);
    const existingCols = new Set(cols.recordset.map(r => r.COLUMN_NAME));

    const result = { almacen: [], persona: [] };

    // Resolved CODALMACEN mappings
    if (almacenMapping && almacenMapping.ColumnName !== '__NO_MAP__' && existingCols.has('_CODALMACEN')) {
        const colName = almacenMapping.ColumnName;
        // Verify source column exists
        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);
        if (colCheck.recordset.length > 0) {
            const rows = await pool.request().query(`
                SELECT [${colName}] AS sourceValue, [_CODALMACEN] AS resolvedValue, COUNT(*) AS cnt
                FROM [${tableName}]
                WHERE [_CODALMACEN] IS NOT NULL
                GROUP BY [${colName}], [_CODALMACEN]
                ORDER BY cnt DESC
            `);
            // Enrich with store names from main database
            try {
                const mainPool = await poolPromise;
                const storesResult = await mainPool.request().query(`
                    SELECT DISTINCT RTRIM(gi.CODALMACEN) AS CODALMACEN, am.NOMBREALMACEN AS NOMBRE
                    FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN gi
                    INNER JOIN ROSTIPOLLOS_P.dbo.ALMACEN am ON am.CODALMACEN = gi.CODALMACEN
                    WHERE IDGRUPO = '3000'
                    ORDER BY CODALMACEN
                `);
                const storeMap = {};
                for (const s of storesResult.recordset) { storeMap[s.CODALMACEN] = s.NOMBRE; }
                result.almacen = rows.recordset.map(r => ({
                    sourceValue: r.sourceValue || '',
                    resolvedValue: r.resolvedValue,
                    resolvedNombre: r.resolvedValue ? (storeMap[r.resolvedValue] || null) : null,
                    count: r.cnt
                }));
            } catch (e) {
                console.warn('  ! Could not enrich store names:', e.message?.substring(0, 80));
                result.almacen = rows.recordset.map(r => ({
                    sourceValue: r.sourceValue || '',
                    resolvedValue: r.resolvedValue,
                    count: r.cnt
                }));
            }
        }
    }

    // Resolved PERSONA mappings
    if (personaMapping && personaMapping.ColumnName !== '__NO_MAP__' && existingCols.has('_PERSONAL_ID')) {
        const colName = personaMapping.ColumnName;
        const colCheck = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .input('col', sql.NVarChar, colName)
            .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME = @col`);
        if (colCheck.recordset.length > 0) {
            const nameSelect = existingCols.has('_PERSONAL_NOMBRE') ? ', [_PERSONAL_NOMBRE] AS resolvedName' : '';
            const nameGroup = existingCols.has('_PERSONAL_NOMBRE') ? ', [_PERSONAL_NOMBRE]' : '';
            const rows = await pool.request().query(`
                SELECT [${colName}] AS sourceValue, [_PERSONAL_ID] AS resolvedId${nameSelect}, COUNT(*) AS cnt
                FROM [${tableName}]
                WHERE [_PERSONAL_ID] IS NOT NULL
                GROUP BY [${colName}], [_PERSONAL_ID]${nameGroup}
                ORDER BY cnt DESC
            `);
            result.persona = rows.recordset.map(r => ({
                sourceValue: r.sourceValue || '',
                resolvedId: r.resolvedId,
                resolvedName: r.resolvedName || '',
                count: r.cnt
            }));
        }
    }

    return result;
}

// ─── Clear resolved mapping for a specific source value ───────────────────────
async function clearResolvedMapping(viewId, fieldType, sourceValue) {
    const pool = await getInvgatePool();
    const tableName = await viewTableName(viewId);

    const mappings = await getMappings(viewId);
    const mapping = mappings.find(m => m.FieldType === fieldType);
    if (!mapping) throw new Error(`No mapping configured for ${fieldType}`);

    const colName = mapping.ColumnName;
    if (colName === '__NO_MAP__') throw new Error('Cannot clear a __NO_MAP__ mapping');

    await ensureMappingColumns(tableName);

    let updated = 0;
    if (fieldType === 'CODALMACEN') {
        const result = await pool.request()
            .input('src', sql.NVarChar, sourceValue.trim())
            .query(`
                UPDATE [${tableName}]
                SET [_CODALMACEN] = NULL
                WHERE RTRIM(LTRIM([${colName}])) = @src AND [_CODALMACEN] IS NOT NULL
            `);
        updated = result.rowsAffected[0] || 0;
    } else if (fieldType === 'PERSONA') {
        const result = await pool.request()
            .input('src', sql.NVarChar, sourceValue.trim())
            .query(`
                UPDATE [${tableName}]
                SET [_PERSONAL_ID] = NULL, [_PERSONAL_NOMBRE] = NULL
                WHERE RTRIM(LTRIM([${colName}])) = @src AND [_PERSONAL_ID] IS NOT NULL
            `);
        updated = result.rowsAffected[0] || 0;
    }

    return { cleared: updated, fieldType, sourceValue };
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
    autoDetectMappings,
    mapPersonaManual,
    getResolvedMappings,
    clearResolvedMapping
};
