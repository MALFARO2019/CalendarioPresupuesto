const sql = require('mssql');
require('dotenv').config();

/**
 * Database Connection Manager with Automatic Failover
 * Manages connections to primary and auxiliary databases with health checks
 */

class DatabaseConnectionManager {
    constructor() {
        this.primaryConfig = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };

        this.auxiliaryConfig = null;
        this.primaryPool = null;
        this.auxiliaryPool = null;
        this.activeMode = 'primary'; // 'primary' or 'auxiliary'
        this.primaryHealthy = true;
        this.lastHealthCheck = null;
        this.reconnectInterval = null;
    }

    /**
     * Initialize primary database connection
     */
    async initializePrimary() {
        try {
            if (this.primaryPool) {
                await this.primaryPool.close();
            }

            this.primaryPool = await new sql.ConnectionPool(this.primaryConfig).connect();
            this.activeMode = 'primary';
            this.primaryHealthy = true;
            this.lastHealthCheck = new Date();

            console.log('✅ Connected to SQL Server:', this.primaryConfig.server);
            console.log('   Database:', this.primaryConfig.database);
            console.log('✅ Database Mode: PRIMARY');

            // Stop reconnect attempts if we were on auxiliary
            this.stopReconnectAttempts();

            return true;
        } catch (err) {
            console.error('❌ Failed to connect to primary database:', err.message);
            this.primaryHealthy = false;

            // Try to failover to auxiliary
            await this.tryFailoverToAuxiliary();
            return false;
        }
    }

    /**
     * Load auxiliary database configuration from APP_CONFIGURACION table
     */
    async loadAuxiliaryConfig() {
        try {
            // We must use primary pool to read config
            if (!this.primaryPool) {
                return null;
            }

            const result = await this.primaryPool.request()
                .query(`
                    SELECT Clave, Valor 
                    FROM APP_CONFIGURACION 
                    WHERE Clave IN ('DB_AUX_SERVER', 'DB_AUX_DATABASE', 'DB_AUX_USERNAME', 'DB_AUX_PASSWORD')
                `);

            const configMap = {};
            result.recordset.forEach(row => {
                configMap[row.Clave] = row.Valor;
            });

            if (!configMap.DB_AUX_SERVER || !configMap.DB_AUX_DATABASE) {
                return null;
            }

            this.auxiliaryConfig = {
                user: configMap.DB_AUX_USERNAME || 'sa',
                password: configMap.DB_AUX_PASSWORD || '',
                server: configMap.DB_AUX_SERVER,
                database: configMap.DB_AUX_DATABASE,
                options: {
                    encrypt: false,
                    trustServerCertificate: true,
                    enableArithAbort: true
                },
                pool: {
                    max: 10,
                    min: 0,
                    idleTimeoutMillis: 30000
                }
            };

            console.log('📋 Loaded auxiliary DB config:', configMap.DB_AUX_SERVER, '/', configMap.DB_AUX_DATABASE);
            return this.auxiliaryConfig;
        } catch (err) {
            console.error('⚠️ Failed to load auxiliary config:', err.message);
            return null;
        }
    }

    /**
     * Try to failover to auxiliary database
     */
    async tryFailoverToAuxiliary() {
        console.log('🔄 Attempting failover to auxiliary database...');

        // Load config if not already loaded
        if (!this.auxiliaryConfig) {
            await this.loadAuxiliaryConfig();
        }

        if (!this.auxiliaryConfig) {
            console.error('❌ No auxiliary database configured. Cannot failover.');
            throw new Error('Primary database unavailable and no auxiliary configured');
        }

        try {
            if (this.auxiliaryPool) {
                await this.auxiliaryPool.close();
            }

            this.auxiliaryPool = await new sql.ConnectionPool(this.auxiliaryConfig).connect();
            this.activeMode = 'auxiliary';
            this.primaryHealthy = false;

            console.log('⚠️ FAILOVER SUCCESSFUL - Now using AUXILIARY database');
            console.log('   Server:', this.auxiliaryConfig.server);
            console.log('   Database:', this.auxiliaryConfig.database);

            // Start attempting to reconnect to primary
            this.startReconnectAttempts();

            return true;
        } catch (err) {
            console.error('❌ Failed to connect to auxiliary database:', err.message);
            throw new Error('Both primary and auxiliary databases are unavailable');
        }
    }

    /**
     * Start periodic attempts to reconnect to primary database
     */
    startReconnectAttempts() {
        if (this.reconnectInterval) {
            return; // Already attempting
        }

        console.log('🔁 Starting periodic reconnection attempts to primary database...');

        this.reconnectInterval = setInterval(async () => {
            console.log('🔄 Attempting to reconnect to primary database...');
            try {
                const testPool = await new sql.ConnectionPool(this.primaryConfig).connect();
                await testPool.close();

                // Success! Switch back to primary
                console.log('✅ Primary database is back online. Switching back...');
                await this.initializePrimary();
            } catch (err) {
                console.log('⏳ Primary database still unavailable. Will retry in 30 seconds.');
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Stop reconnection attempts
     */
    stopReconnectAttempts() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
            console.log('⏸️ Stopped reconnection attempts');
        }
    }

    /**
     * Get the active connection pool (primary or auxiliary)
     */
    getActivePool() {
        if (this.activeMode === 'primary') {
            return this.primaryPool;
        } else {
            return this.auxiliaryPool;
        }
    }

    /**
     * Test connection to a specific configuration
     */
    async testConnection(config) {
        try {
            const testPool = await new sql.ConnectionPool(config).connect();
            await testPool.close();
            return { success: true, message: 'Connection successful' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /**
     * Get current database status
     */
    getCurrentStatus() {
        return {
            activeMode: this.activeMode,
            primaryHealthy: this.primaryHealthy,
            auxiliaryConfigured: this.auxiliaryConfig !== null,
            lastHealthCheck: this.lastHealthCheck
        };
    }

    /**
     * Perform health check on primary database
     */
    async checkPrimaryHealth() {
        try {
            if (!this.primaryPool) {
                this.primaryHealthy = false;
                return false;
            }

            await this.primaryPool.request().query('SELECT 1');
            this.primaryHealthy = true;
            this.lastHealthCheck = new Date();
            return true;
        } catch (err) {
            this.primaryHealthy = false;
            console.error('⚠️ Primary database health check failed:', err.message);

            // If we're currently on primary and it failed, try to failover
            if (this.activeMode === 'primary') {
                await this.tryFailoverToAuxiliary();
            }

            return false;
        }
    }
}

// Create singleton instance
const dbManager = new DatabaseConnectionManager();

// Initialize on module load
(async () => {
    await dbManager.initializePrimary();
    await dbManager.loadAuxiliaryConfig();
})();

module.exports = {
    sql,
    getActivePool: () => dbManager.getActivePool(),
    dbManager,
    // Legacy support
    poolPromise: new Promise((resolve) => {
        const interval = setInterval(() => {
            const pool = dbManager.getActivePool();
            if (pool) {
                clearInterval(interval);
                resolve(pool);
            }
        }, 100);
    })
};
