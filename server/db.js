// Import the new connection manager
const { sql, poolPromise, getPool, getCurrentMode, MODES } = require('./dbConnectionManager');

// Export everything from connection manager
module.exports = {
    sql,
    poolPromise,  // Backward compatibility
    getPool,      // New recommended way
    getCurrentMode,
    MODES
};
