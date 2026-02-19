const { getFormsPool, sql } = require('../formsDb');

/**
 * Dynamic Table Manager for Microsoft Forms
 * Auto-creates Frm_{id}_{slug} tables per form source on first sync.
 * Adds new columns via ALTER TABLE on subsequent syncs if form questions change.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize alias to a valid SQL table name suffix
 * e.g. "Visita Operativa Ops (3)" → "VisitaOperativaOps3"
 */
function slugify(text) {
    return text
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove accents
        .replace(/[^a-zA-Z0-9\s]/g, '')                    // keep alphanumeric + spaces
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))  // PascalCase
        .join('')
        .substring(0, 50);                                  // max 50 chars for suffix
}

/**
 * Build the table name for a given source
 * e.g. Frm_1_VisitaOperativaOps
 */
function getTableName(sourceId, alias) {
    return `Frm_${sourceId}_${slugify(alias)}`;
}

/**
 * Detect SQL type from a sample of values in a column
 */
function detectColumnType(values) {
    const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonEmpty.length === 0) return 'NVARCHAR(255)';

    // Check if all are integers
    if (nonEmpty.every(v => Number.isInteger(Number(v)) && !isNaN(Number(v)) && String(v).trim() !== '')) {
        const nums = nonEmpty.map(Number);
        const max = Math.max(...nums);
        if (max <= 2147483647) return 'INT';
    }

    // Check if all are decimals
    if (nonEmpty.every(v => !isNaN(Number(v)) && String(v).trim() !== '')) {
        return 'DECIMAL(18,4)';
    }

    // Check if all are dates
    if (nonEmpty.every(v => {
        if (typeof v === 'number') return true; // Excel serial date
        const d = new Date(v);
        return !isNaN(d.getTime()) && String(v).length > 6;
    })) {
        return 'DATETIME';
    }

    // Check max length for text — always use MAX to avoid truncation
    return 'NVARCHAR(MAX)';
}

/**
 * Sanitize a column name to be a valid SQL identifier
 */
function sanitizeColumnName(name) {
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 100)
        || 'Col_Unknown';
}

// ─── Reserved system columns (always present) ─────────────────────────────────

const SYSTEM_COLUMNS = ['ID', 'ResponseID', 'RespondentEmail', 'RespondentName', 'SubmittedAt', 'SyncedAt'];
const SYSTEM_COLUMNS_LOWER = new Set(SYSTEM_COLUMNS.map(c => c.toLowerCase()));

/**
 * Get safe column name for an Excel header, avoiding collisions with system columns.
 * If it collides, prefix with 'Q_'.
 */
function getSafeColName(rawName) {
    let safe = sanitizeColumnName(rawName);
    if (!safe || SYSTEM_COLUMNS_LOWER.has(safe.toLowerCase())) {
        safe = 'Q_' + safe;
    }
    return safe;
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Ensure the Frm_* table exists for a source.
 * Creates it if missing, or adds new columns if the form has new questions.
 * 
 * @param {number} sourceId
 * @param {string} alias
 * @param {Array<{name: string, sampleValues: any[]}>} columns - detected from Excel headers
 * @returns {string} tableName
 */
async function ensureFormTable(sourceId, alias, columns) {
    const pool = await getFormsPool();
    const tableName = getTableName(sourceId, alias);

    // Check if table exists
    const exists = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`SELECT 1 FROM sys.tables WHERE name = @tbl`);

    if (exists.recordset.length === 0) {
        // Build CREATE TABLE with system columns + detected columns
        // Track used names to avoid duplicates
        const usedNames = new Set(SYSTEM_COLUMNS_LOWER);
        const colDefs = [];
        for (const col of columns) {
            let safeName = getSafeColName(col.name);
            // If still duplicate (e.g. two Excel cols map to same safe name), skip
            if (usedNames.has(safeName.toLowerCase())) continue;
            usedNames.add(safeName.toLowerCase());
            const colType = detectColumnType(col.sampleValues || []);
            colDefs.push(`    [${safeName}] ${colType} NULL`);
        }

        const createSql = `
            CREATE TABLE [${tableName}] (
                [ID]             INT IDENTITY(1,1) PRIMARY KEY,
                [ResponseID]     NVARCHAR(100) NOT NULL,
                [RespondentEmail] NVARCHAR(200) NULL,
                [RespondentName]  NVARCHAR(200) NULL,
                [SubmittedAt]    DATETIME NULL,
                [SyncedAt]       DATETIME DEFAULT GETDATE()
                ${colDefs.length > 0 ? ',\n' + colDefs.join(',\n') : ''}
                ,CONSTRAINT [UQ_${tableName.substring(0, 100)}_RID] UNIQUE ([ResponseID])
            )
        `;
        await pool.request().query(createSql);
        console.log(`✅ Created table ${tableName}`);

        // Register table name in FormsSources
        await pool.request()
            .input('id', sql.Int, sourceId)
            .input('tbl', sql.NVarChar, tableName)
            .query(`UPDATE FormsSources SET TableName = @tbl WHERE SourceID = @id`);

    } else {
        // Table exists — check for new columns and add them
        const existingCols = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = @tbl
            `);
        const existingNames = new Set(existingCols.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

        for (const col of columns) {
            const safeName = getSafeColName(col.name);
            if (!existingNames.has(safeName.toLowerCase())) {
                const colType = detectColumnType(col.sampleValues || []);
                try {
                    await pool.request().query(
                        `ALTER TABLE [${tableName}] ADD [${safeName}] ${colType} NULL`
                    );
                    console.log(`  ➕ Added column ${safeName} (${colType}) to ${tableName}`);
                } catch (e) {
                    console.warn(`  ⚠️ Could not add column ${safeName}: ${e.message.substring(0, 80)}`);
                }
            }
        }
    }

    return tableName;
}

/**
 * Upsert a single form response row into the Frm_* table.
 * Uses MERGE to insert or update based on ResponseID.
 */
async function upsertFormRow(tableName, responseId, respondentEmail, respondentName, submittedAt, rowData) {
    const pool = await getFormsPool();

    // Get current columns of the table (excluding system cols)
    const colsResult = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = @tbl AND COLUMN_NAME NOT IN (${SYSTEM_COLUMNS.map(c => `'${c}'`).join(',')})
        `);

    const tableCols = colsResult.recordset;
    if (tableCols.length === 0) return;

    // Build the request with all parameters
    const req = pool.request();
    req.input('responseId', sql.NVarChar, responseId || '');
    req.input('email', sql.NVarChar, respondentEmail || null);
    req.input('name', sql.NVarChar, respondentName || null);
    req.input('submittedAt', sql.DateTime, submittedAt || null);

    const setClauses = [];
    const insertCols = [];
    const insertVals = [];

    for (const col of tableCols) {
        const colName = col.COLUMN_NAME;
        // Find matching key in rowData: try exact, then sanitized match, then Q_ prefixed
        const matchKey = Object.keys(rowData).find(k => {
            const s = getSafeColName(k);
            return s.toLowerCase() === colName.toLowerCase();
        }) || Object.keys(rowData).find(k => sanitizeColumnName(k).toLowerCase() === colName.toLowerCase());
        let val = matchKey !== undefined ? rowData[matchKey] : null;

        // Type coercion
        if (val === '' || val === undefined) val = null;

        const paramName = `p_${colName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        req.input(paramName, sql.NVarChar(sql.MAX), val !== null ? String(val) : null);
        setClauses.push(`target.[${colName}] = source.[${colName}]`);
        insertCols.push(`[${colName}]`);
        insertVals.push(`source.[${colName}]`);
    }

    // Build MERGE statement
    const sourceSelect = [
        `@responseId AS ResponseID`,
        `@email AS RespondentEmail`,
        `@name AS RespondentName`,
        `@submittedAt AS SubmittedAt`,
        ...tableCols.map(col => `@p_${col.COLUMN_NAME.replace(/[^a-zA-Z0-9]/g, '_')} AS [${col.COLUMN_NAME}]`)
    ].join(', ');

    const mergeSql = `
        MERGE [${tableName}] AS target
        USING (SELECT ${sourceSelect}) AS source
        ON target.ResponseID = source.ResponseID
        WHEN MATCHED THEN UPDATE SET
            target.RespondentEmail = source.RespondentEmail,
            target.RespondentName = source.RespondentName,
            target.SubmittedAt = source.SubmittedAt,
            target.SyncedAt = GETDATE(),
            ${setClauses.join(',\n            ')}
        WHEN NOT MATCHED THEN INSERT
            (ResponseID, RespondentEmail, RespondentName, SubmittedAt, SyncedAt, ${insertCols.join(', ')})
            VALUES
            (source.ResponseID, source.RespondentEmail, source.RespondentName, source.SubmittedAt, GETDATE(), ${insertVals.join(', ')});
    `;

    await req.query(mergeSql);
}

/**
 * Get column info for a Frm_* table (for KPI/dashboard use)
 */
async function getTableColumns(tableName) {
    const pool = await getFormsPool();
    const result = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tbl
            ORDER BY ORDINAL_POSITION
        `);
    return result.recordset;
}

/**
 * Get basic KPIs for a Frm_* table:
 * - Total rows
 * - For each numeric column: SUM, AVG, MIN, MAX
 */
async function getTableKpis(tableName) {
    const pool = await getFormsPool();

    // Get numeric columns
    const numCols = await pool.request()
        .input('tbl', sql.NVarChar, tableName)
        .query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tbl
              AND DATA_TYPE IN ('int', 'decimal', 'float', 'numeric', 'bigint', 'smallint', 'tinyint')
              AND COLUMN_NAME NOT IN ('ID')
        `);

    const total = await pool.request().query(`SELECT COUNT(*) AS total FROM [${tableName}]`);
    const kpis = { total: total.recordset[0].total, columns: {} };

    for (const col of numCols.recordset) {
        const name = col.COLUMN_NAME;
        try {
            const r = await pool.request().query(`
                SELECT 
                    SUM([${name}]) AS suma,
                    AVG(CAST([${name}] AS FLOAT)) AS promedio,
                    MIN([${name}]) AS minimo,
                    MAX([${name}]) AS maximo,
                    COUNT([${name}]) AS conteo
                FROM [${tableName}]
                WHERE [${name}] IS NOT NULL
            `);
            kpis.columns[name] = r.recordset[0];
        } catch (e) { /* skip */ }
    }

    return kpis;
}

module.exports = { getTableName, slugify, sanitizeColumnName, detectColumnType, ensureFormTable, upsertFormRow, getTableColumns, getTableKpis };
