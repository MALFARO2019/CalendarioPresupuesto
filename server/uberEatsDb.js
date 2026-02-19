/**
 * uberEatsDb.js
 * Dedicated connection pool for KpisRosti_UberEats database
 * Pattern mirrors invgateDb.js
 */
const mssql = require('mssql');
require('dotenv').config();

const sql = mssql;

let pool = null;

function getUberEatsConfig() {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: 'KpisRosti_UberEats',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        connectionTimeout: 30000,
        requestTimeout: 60000,
        pool: {
            max: 5,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
}

async function getUberEatsPool() {
    if (pool && pool.connected) return pool;
    try {
        pool = await new mssql.ConnectionPool(getUberEatsConfig()).connect();
        pool.on('error', err => {
            console.error('❌ UberEats DB pool error:', err.message);
            pool = null;
        });
        return pool;
    } catch (err) {
        pool = null;
        throw new Error('No se pudo conectar a KpisRosti_UberEats: ' + err.message);
    }
}

/**
 * Create the KpisRosti_UberEats database if it doesn't exist,
 * then create all required tables.
 */
async function ensureUberEatsTables() {
    try {
        // First: ensure the database itself exists (connect to master)
        const masterPool = await new mssql.ConnectionPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: 'master',
            options: { encrypt: false, trustServerCertificate: true },
            connectionTimeout: 30000
        }).connect();

        await masterPool.request().query(`
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'KpisRosti_UberEats')
            BEGIN
                CREATE DATABASE KpisRosti_UberEats;
            END
        `);
        await masterPool.close();
        console.log('✅ Database KpisRosti_UberEats ready');

        // Now connect and create tables
        const p = await getUberEatsPool();

        // Config table — stores API credentials and settings
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsConfig' AND xtype='U')
            CREATE TABLE UberEatsConfig (
                Id               INT IDENTITY(1,1) PRIMARY KEY,
                ConfigKey        NVARCHAR(100) NOT NULL UNIQUE,
                ConfigValue      NVARCHAR(MAX),
                Descripcion      NVARCHAR(255),
                FechaModificacion DATETIME2 DEFAULT GETDATE()
            )
        `);

        // Seed default config keys if empty
        await p.request().query(`
            IF NOT EXISTS (SELECT 1 FROM UberEatsConfig)
            BEGIN
                INSERT INTO UberEatsConfig (ConfigKey, ConfigValue, Descripcion) VALUES
                ('CLIENT_ID',      NULL,    'Uber Eats API Client ID'),
                ('CLIENT_SECRET',  NULL,    'Uber Eats API Client Secret (encriptado)'),
                ('SYNC_ENABLED',   'false', 'Activar sincronizacion automatica'),
                ('SYNC_HOUR',      '3',     'Hora del dia para sync automatico (0-23)'),
                ('DAYS_BACK',      '1',     'Cuantos dias atras sincronizar'),
                ('LAST_SYNC',      NULL,    'Fecha y hora del ultimo sync exitoso'),
                ('REPORT_TYPES',   'FINANCE_SUMMARY_REPORT', 'Tipos de reporte separados por coma')
            END
            ELSE BEGIN
                IF NOT EXISTS (SELECT 1 FROM UberEatsConfig WHERE ConfigKey = 'REPORT_TYPES')
                    INSERT INTO UberEatsConfig (ConfigKey, ConfigValue, Descripcion)
                    VALUES ('REPORT_TYPES', 'FINANCE_SUMMARY_REPORT', 'Tipos de reporte separados por coma')
            END
        `);

        // Stores table
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsStores' AND xtype='U')
            CREATE TABLE UberEatsStores (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                StoreId         NVARCHAR(255) NOT NULL UNIQUE,
                Nombre          NVARCHAR(255),
                Activo          BIT DEFAULT 1,
                FechaCreacion   DATETIME2 DEFAULT GETDATE()
            )
        `);

        // FINANCE_SUMMARY_REPORT / PAYMENT_DETAILS_REPORT
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsOrdenes' AND xtype='U')
            CREATE TABLE UberEatsOrdenes (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                OrderId         NVARCHAR(255) UNIQUE,
                StoreId         NVARCHAR(255),
                NombreLocal     NVARCHAR(255),
                FechaPedido     DATETIME2,
                VentaBruta      DECIMAL(18,2) DEFAULT 0,
                NetoPagado      DECIMAL(18,2) DEFAULT 0,
                ComisionUber    DECIMAL(18,2) DEFAULT 0,
                Descuentos      DECIMAL(18,2) DEFAULT 0,
                Impuestos       DECIMAL(18,2) DEFAULT 0,
                Moneda          NVARCHAR(10)  DEFAULT 'CRC',
                TipoEntrega     NVARCHAR(50),
                MetodoPago      NVARCHAR(50),
                FuenteReporte   NVARCHAR(100),
                FechaSync       DATETIME2 DEFAULT GETDATE()
            )
        `);
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UberOrdenes_Store_Fecha')
            CREATE INDEX IX_UberOrdenes_Store_Fecha ON UberEatsOrdenes(StoreId, FechaPedido)
        `);
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UberOrdenes_Fecha')
            CREATE INDEX IX_UberOrdenes_Fecha ON UberEatsOrdenes(FechaPedido)
        `);

        // ORDER_HISTORY
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsHistorialOrdenes' AND xtype='U')
            CREATE TABLE UberEatsHistorialOrdenes (
                Id                  INT IDENTITY(1,1) PRIMARY KEY,
                OrderId             NVARCHAR(255) UNIQUE,
                StoreId             NVARCHAR(255),
                NombreLocal         NVARCHAR(255),
                FechaPedido         DATETIME2,
                FechaEntrega        DATETIME2,
                Estado              NVARCHAR(50),
                TipoEntrega         NVARCHAR(50),
                SubtotalCliente     DECIMAL(18,2) DEFAULT 0,
                TotalCliente        DECIMAL(18,2) DEFAULT 0,
                PropinaConductor    DECIMAL(18,2) DEFAULT 0,
                Moneda              NVARCHAR(10)  DEFAULT 'CRC',
                NombreCliente       NVARCHAR(255),
                CantidadItems       INT DEFAULT 0,
                FechaSync           DATETIME2 DEFAULT GETDATE()
            )
        `);

        // ADJUSTMENT_REPORT
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsAjustes' AND xtype='U')
            CREATE TABLE UberEatsAjustes (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                AjusteId        NVARCHAR(255) UNIQUE,
                OrderId         NVARCHAR(255),
                StoreId         NVARCHAR(255),
                NombreLocal     NVARCHAR(255),
                FechaAjuste     DATETIME2,
                TipoAjuste      NVARCHAR(100),
                Monto           DECIMAL(18,2) DEFAULT 0,
                Moneda          NVARCHAR(10)  DEFAULT 'CRC',
                Motivo          NVARCHAR(MAX),
                FechaSync       DATETIME2 DEFAULT GETDATE()
            )
        `);

        // DOWNTIME_REPORT
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsDowntime' AND xtype='U')
            CREATE TABLE UberEatsDowntime (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                StoreId         NVARCHAR(255),
                NombreLocal     NVARCHAR(255),
                FechaInicio     DATETIME2,
                FechaFin        DATETIME2,
                DuracionMinutos INT DEFAULT 0,
                TipoDowntime    NVARCHAR(100),
                Motivo          NVARCHAR(255),
                FechaSync       DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT UQ_Downtime UNIQUE (StoreId, FechaInicio)
            )
        `);

        // FEEDBACK_REPORT
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsFeedback' AND xtype='U')
            CREATE TABLE UberEatsFeedback (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                FeedbackId      NVARCHAR(255) UNIQUE,
                OrderId         NVARCHAR(255),
                StoreId         NVARCHAR(255),
                NombreLocal     NVARCHAR(255),
                FechaFeedback   DATETIME2,
                Calificacion    DECIMAL(3,2),
                Comentario      NVARCHAR(MAX),
                TipoFeedback    NVARCHAR(100),
                FechaSync       DATETIME2 DEFAULT GETDATE()
            )
        `);

        // MENU_ITEM_INSIGHTS
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsMenuInsights' AND xtype='U')
            CREATE TABLE UberEatsMenuInsights (
                Id              INT IDENTITY(1,1) PRIMARY KEY,
                StoreId         NVARCHAR(255),
                NombreLocal     NVARCHAR(255),
                Fecha           DATE,
                ItemId          NVARCHAR(255),
                NombreItem      NVARCHAR(255),
                CantidadVendida INT DEFAULT 0,
                IngresoTotal    DECIMAL(18,2) DEFAULT 0,
                Moneda          NVARCHAR(10) DEFAULT 'CRC',
                FechaSync       DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT UQ_MenuInsight UNIQUE (StoreId, Fecha, ItemId)
            )
        `);

        // Sync log table
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UberEatsSyncLog' AND xtype='U')
            CREATE TABLE UberEatsSyncLog (
                Id                   INT IDENTITY(1,1) PRIMARY KEY,
                FechaSync            DATE,
                ReportType           NVARCHAR(100),
                ReportId             NVARCHAR(255),
                Status               NVARCHAR(50),
                RegistrosProcesados  INT DEFAULT 0,
                Mensaje              NVARCHAR(MAX),
                FechaEjecucion       DATETIME2 DEFAULT GETDATE()
            )
        `);

        console.log('✅ UberEats tables ready in KpisRosti_UberEats');
    } catch (err) {
        console.error('❌ Error ensuring UberEats tables:', err.message);
    }
}

module.exports = { getUberEatsPool, ensureUberEatsTables, sql };
