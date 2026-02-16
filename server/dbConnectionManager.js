const sql = require('mssql');
require('dotenv').config();

// Database connection modes
const MODES = {
    DIRECT: 'direct',
    HYBRID: 'hybrid'
};

// Connection pools
let readPool = null;
let writePool = null;
let directPool = null;
let currentMode = null;

/**
 * Get database configuration from APP_DB_CONFIG table
 * Returns null if table doesn't exist or no config found
 */
async function getConfigFromDatabase() {
    try {
        // Try to connect with env vars to read config
        const tempConfig = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: {
                encrypt: false,
                trustServerCertificate: true
            }
        };

        const tempPool = await new sql.ConnectionPool(tempConfig).connect();

        // Check if APP_DB_CONFIG table exists
        const tableCheck = await tempPool.request().query(`
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'APP_DB_CONFIG'
        `);

        if (tableCheck.recordset[0].count === 0) {
            await tempPool.close();
            return null;
        }

        // Get latest config
        const result = await tempPool.request().query(`
            SELECT TOP 1 * FROM APP_DB_CONFIG 
            ORDER BY FechaModificacion DESC
        `);

        await tempPool.close();

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (err) {
        console.warn('⚠️ Could not read config from database:', err.message);
        return null;
    }
}

/**
 * Decrypt password (basic implementation - replace with crypto for production)
 */
function decryptPassword(encrypted) {
    if (!encrypted) return '';
    // For now, just return as-is. In production, implement proper decryption
    // TODO: Implement actual encryption/decryption using crypto module
    return encrypted;
}

/**
 * Create connection pool for Direct SQL mode
 */
async function createDirectPool() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: {
            encrypt: false,
            trustServerCertificate: true
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        },
        requestTimeout: 30000
    };

    directPool = await new sql.ConnectionPool(config).connect();
    console.log('✅ Database Mode: DIRECT');
    console.log('   Connected to:', process.env.DB_SERVER);
    console.log('   Database:', process.env.DB_DATABASE);
    return directPool;
}

/**
 * Create connection pools for Azure Hybrid mode
 */
async function createHybridPools(dbConfig = null) {
    // Get config from env vars or database
    let readServer, readDatabase, readUser, readPassword;
    let writeServer, writeDatabase, writeUser, writePassword;

    if (dbConfig) {
        // From database config
        readServer = dbConfig.ReadServer;
        readDatabase = dbConfig.ReadDatabase;
        readUser = dbConfig.ReadUser;
        readPassword = decryptPassword(dbConfig.ReadPassword);

        writeServer = dbConfig.WriteServer;
        writeDatabase = dbConfig.WriteDatabase;
        writeUser = dbConfig.WriteUser;
        writePassword = decryptPassword(dbConfig.WritePassword);
    } else {
        // From env vars
        readServer = process.env.DB_READ_SERVER;
        readDatabase = process.env.DB_READ_DATABASE;
        readUser = process.env.DB_READ_USER;
        readPassword = process.env.DB_READ_PASSWORD;

        writeServer = process.env.DB_WRITE_SERVER;
        writeDatabase = process.env.DB_WRITE_DATABASE;
        writeUser = process.env.DB_WRITE_USER;
        writePassword = process.env.DB_WRITE_PASSWORD;
    }

    // Validate config
    if (!readServer || !writeServer) {
        throw new Error('Hybrid mode requires READ and WRITE server configuration');
    }

    // Create READ pool (Azure SQL)
    const readConfig = {
        user: readUser,
        password: readPassword,
        server: readServer,
        database: readDatabase,
        options: {
            encrypt: true, // Azure SQL requires encryption
            trustServerCertificate: false
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        },
        requestTimeout: 30000
    };

    // Create WRITE pool (On-premise via Hybrid Connection)
    const writeConfig = {
        user: writeUser,
        password: writePassword,
        server: writeServer,
        database: writeDatabase,
        options: {
            encrypt: false,
            trustServerCertificate: true
        },
        pool: {
            max: 5,
            min: 0,
            idleTimeoutMillis: 30000
        },
        requestTimeout: 30000
    };

    readPool = await new sql.ConnectionPool(readConfig).connect();
    writePool = await new sql.ConnectionPool(writeConfig).connect();

    console.log('✅ Database Mode: HYBRID');
    console.log('   READ Pool (Azure SQL):', readServer);
    console.log('   WRITE Pool (On-premise):', writeServer);

    return { readPool, writePool };
}

/**
 * Initialize database connections based on mode
 */
async function initializeConnections() {
    try {
        // Determine mode: env var > database config > default to direct
        let mode = process.env.DB_MODE?.toLowerCase();

        if (!mode) {
            // Try to get mode from database
            const dbConfig = await getConfigFromDatabase();
            if (dbConfig) {
                mode = dbConfig.Modo?.toLowerCase();

                if (mode === MODES.HYBRID) {
                    await createHybridPools(dbConfig);
                    currentMode = MODES.HYBRID;
                    return;
                }
            }
        }

        // If mode is explicitly hybrid from env
        if (mode === MODES.HYBRID) {
            await createHybridPools();
            currentMode = MODES.HYBRID;
            return;
        }

        // Default to direct mode
        await createDirectPool();
        currentMode = MODES.DIRECT;

    } catch (err) {
        console.error('❌ Database Connection Failed!');
        console.error('   Error:', err.message);
        throw err;
    }
}

/**
 * Get appropriate pool for the query type
 * @param {string} queryType - 'read' or 'write'
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool(queryType = 'read') {
    // Ensure connections are initialized
    if (!directPool && !readPool && !writePool) {
        await initializeConnections();
    }

    // In direct mode, use the same pool for everything
    if (currentMode === MODES.DIRECT) {
        return directPool;
    }

    // In hybrid mode, route based on query type
    if (currentMode === MODES.HYBRID) {
        if (queryType === 'write') {
            return writePool;
        }
        return readPool;
    }

    throw new Error('Database not initialized');
}

/**
 * Get connection pool promise for backward compatibility
 */
const poolPromise = (async () => {
    await initializeConnections();
    return directPool || readPool; // Return primary pool
})();

/**
 * Close all connections
 */
async function closeAllConnections() {
    const promises = [];

    if (directPool) promises.push(directPool.close());
    if (readPool) promises.push(readPool.close());
    if (writePool) promises.push(writePool.close());

    await Promise.all(promises);

    directPool = null;
    readPool = null;
    writePool = null;
    currentMode = null;

    console.log('✅ All database connections closed');
}

/**
 * Get current mode
 */
function getCurrentMode() {
    return currentMode;
}

module.exports = {
    sql,
    poolPromise,
    getPool,
    initializeConnections,
    closeAllConnections,
    getCurrentMode,
    MODES
};
