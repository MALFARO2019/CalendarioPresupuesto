const sql = require('mssql');

// Configuración de conexión para base de datos Invgate (separada)
const invgateDbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_InvGate', // Base de datos separada
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 120000
    }
};

// Pool de conexiones para InvGate
let invgatePool = null;

/**
 * Get or create connection pool for InvGate database
 */
async function getInvgatePool() {
    if (!invgatePool) {
        try {
            invgatePool = await new sql.ConnectionPool(invgateDbConfig).connect();
            console.log('✅ Connected to InvGate database');
        } catch (err) {
            invgatePool = null; // Reset so next call retries
            console.error('❌ InvGate database connection failed:', err.message);
            throw err;
        }
    }
    return invgatePool;
}

/**
 * Close InvGate database connection
 */
async function closeInvgatePool() {
    if (invgatePool) {
        await invgatePool.close();
        invgatePool = null;
        console.log('🔌 InvGate database connection closed');
    }
}

module.exports = {
    invgateDbConfig,
    getInvgatePool,
    closeInvgatePool,
    sql
};
