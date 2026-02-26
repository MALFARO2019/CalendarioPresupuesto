/**
 * Shared helper to resolve the active Alcance table name.
 * Used by server.js, tendencia.js, and any other module that queries RSM_ALCANCE_DIARIO.
 */
const { sql, poolPromise } = require('./db');

const ALCANCE_TABLE_DEFAULT = 'RSM_ALCANCE_DIARIO';
const ALCANCE_TABLE_ALLOWED = ['RSM_ALCANCE_DIARIO', 'RSM_ALCANCE_DIARIO_TEST'];
let _cache = { name: ALCANCE_TABLE_DEFAULT, ts: 0 };
const CACHE_TTL = 30000; // 30 seconds

/**
 * Get the globally configured alcance table name (system-wide setting).
 */
async function getAlcanceTableName(pool) {
    const now = Date.now();
    if (now - _cache.ts < CACHE_TTL) {
        return _cache.name;
    }
    try {
        if (!pool) pool = await poolPromise;
        const result = await pool.request()
            .input('clave', sql.NVarChar, 'ALCANCE_TABLE_NAME')
            .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
        const val = result.recordset[0]?.Valor || ALCANCE_TABLE_DEFAULT;
        const tableName = isAllowedTable(val) ? val : ALCANCE_TABLE_DEFAULT;
        _cache = { name: tableName, ts: now };
        return tableName;
    } catch (err) {
        console.error('⚠️ getAlcanceTableName error, using default:', err.message);
        return _cache.name || ALCANCE_TABLE_DEFAULT;
    }
}

/**
 * Get the effective alcance table for a specific user.
 * If the user has a personal override configured, use that.
 * Otherwise, fall back to the global system setting.
 */
async function getAlcanceTableNameForUser(pool, userId) {
    if (!userId) return getAlcanceTableName(pool);
    try {
        if (!pool) pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT AlcanceTableOverride FROM APP_USUARIOS WHERE Id = @userId');
        const override = result.recordset[0]?.AlcanceTableOverride;
        if (override && isAllowedTable(override)) {
            return override;
        }
    } catch (err) {
        console.error('⚠️ getAlcanceTableNameForUser error, falling back to global:', err.message);
    }
    return getAlcanceTableName(pool);
}

/**
 * Check if a table name is in the allowed list or matches the RSM_ALCANCE_DIARIO pattern
 * (supports dynamic tables from MODELO_PRESUPUESTO_CONFIG).
 */
function isAllowedTable(name) {
    if (ALCANCE_TABLE_ALLOWED.includes(name)) return true;
    // Allow any table that starts with RSM_ALCANCE_DIARIO (e.g. RSM_ALCANCE_DIARIO_V2)
    if (/^RSM_ALCANCE_DIARIO/.test(name)) return true;
    return false;
}

function invalidateAlcanceTableCache() {
    _cache.ts = 0;
}

module.exports = { getAlcanceTableName, getAlcanceTableNameForUser, invalidateAlcanceTableCache, isAllowedTable, ALCANCE_TABLE_DEFAULT, ALCANCE_TABLE_ALLOWED };
