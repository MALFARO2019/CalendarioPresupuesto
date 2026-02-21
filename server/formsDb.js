const sql = require('mssql');

// Configuración de conexión para base de datos Forms (separada)
const formsDbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_WForms', // Base de datos separada
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    }
};

// Pool de conexiones para Forms
let formsPool = null;

/**
 * Get or create connection pool for Forms database
 */
async function getFormsPool() {
    if (!formsPool) {
        try {
            formsPool = await new sql.ConnectionPool(formsDbConfig).connect();
            console.log('✅ Connected to KPIsRosti_WForms database');
        } catch (err) {
            console.error('❌ KPIsRosti_WForms database connection failed:', err);
            throw err;
        }
    }
    return formsPool;
}

/**
 * Close Forms database connection
 */
async function closeFormsPool() {
    if (formsPool) {
        await formsPool.close();
        formsPool = null;
        console.log('🔌 KPIsRosti_WForms database connection closed');
    }
}

module.exports = {
    formsDbConfig,
    getFormsPool,
    closeFormsPool,
    sql
};
