// Import the new connection manager
const { sql, getActivePool, dbManager } = require('./dbConnectionManager');

// Database connection modes for hybrid configuration
const MODES = {
    DIRECT: 'direct',
    HYBRID: 'hybrid'
};

/**
 * Get current database mode
 * This is for the hybrid configuration system, not the failover system
 */
function getCurrentMode() {
    // Check if APP_DB_CONFIG has a saved mode
    // For now, return 'direct' as default
    // TODO: This should query APP_DB_CONFIG to get the actual saved mode
    return process.env.DB_MODE || 'direct';
}

// Export for backward compatibility
module.exports = {
    sql,
    poolPromise: new Promise((resolve) => {
        // Wait for pool to be available
        const checkPool = setInterval(() => {
            const pool = getActivePool();
            if (pool) {
                clearInterval(checkPool);
                resolve(pool);
            }
        }, 100);
    }),
    getActivePool,
    dbManager,
    getCurrentMode,
    MODES
};
