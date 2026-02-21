/**
 * Shared helper to resolve the active Alcance table name.
 * Used by server.js, tendencia.js, and any other module that queries RSM_ALCANCE_DIARIO.
 */
const { sql, poolPromise } = require('./db');

const ALCANCE_TABLE_DEFAULT = 'RSM_ALCANCE_DIARIO';
const ALCANCE_TABLE_ALLOWED = ['RSM_ALCANCE_DIARIO', 'RSM_ALCANCE_DIARIO_TEST'];
let _cache = { name: ALCANCE_TABLE_DEFAULT, ts: 0 };
const CACHE_TTL = 30000; // 30 seconds

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
        const tableName = ALCANCE_TABLE_ALLOWED.includes(val) ? val : ALCANCE_TABLE_DEFAULT;
        _cache = { name: tableName, ts: now };
        return tableName;
    } catch (err) {
        console.error('⚠️ getAlcanceTableName error, using default:', err.message);
        return _cache.name || ALCANCE_TABLE_DEFAULT;
    }
}

function invalidateAlcanceTableCache() {
    _cache.ts = 0;
}

module.exports = { getAlcanceTableName, invalidateAlcanceTableCache, ALCANCE_TABLE_DEFAULT, ALCANCE_TABLE_ALLOWED };
