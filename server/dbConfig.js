const { sql, getActivePool } = require('./dbConnectionManager');
const crypto = require('crypto');

// Encryption settings
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || 'default-key-change-in-production-32'; // Must be 32 chars
const IV_LENGTH = 16;

/**
 * Encrypt a password
 */
function encryptPassword(password) {
    if (!password) return null;

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(
            ENCRYPTION_ALGORITHM,
            Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32)),
            iv
        );

        let encrypted = cipher.update(password, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        console.error('Error encrypting password:', err);
        // Fallback: return as-is (not secure, but better than crashing)
        return password;
    }
}

/**
 * Decrypt a password
 */
function decryptPassword(encrypted) {
    if (!encrypted) return '';

    try {
        const parts = encrypted.split(':');
        if (parts.length !== 2) {
            // Not encrypted, return as-is
            return encrypted;
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];

        const decipher = crypto.createDecipheriv(
            ENCRYPTION_ALGORITHM,
            Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32)),
            iv
        );

        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (err) {
        console.error('Error decrypting password:', err);
        // Fallback: return as-is
        return encrypted;
    }
}

/**
 * Get current database configuration
 */
async function getDBConfig() {
    try {
        const pool = await getActivePool();
        const result = await pool.request().query(`
            SELECT TOP 1 
                Id,
                Modo,
                DirectServer,
                DirectDatabase,
                DirectUser,
                DirectPassword,
                ReadServer,
                ReadDatabase,
                ReadUser,
                ReadPassword,
                WriteServer,
                WriteDatabase,
                WriteUser,
                WritePassword,
                FechaModificacion,
                UsuarioModificacion
            FROM APP_DB_CONFIG
            ORDER BY FechaModificacion DESC
        `);

        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        // Decrypt passwords (return empty string if not set or decryption fails)
        const safeDecrypt = (enc) => { try { return enc ? decryptPassword(enc) : ''; } catch { return ''; } };
        row.DirectPassword = safeDecrypt(row.DirectPassword);
        row.ReadPassword = safeDecrypt(row.ReadPassword);
        row.WritePassword = safeDecrypt(row.WritePassword);
        return row;
    } catch (err) {
        console.error('Error getting DB config:', err);
        throw err;
    }
}

/**
 * Save database configuration
 */
async function saveDBConfig(config, username = 'admin') {
    try {
        const pool = await getActivePool();

        // Encrypt passwords if provided
        const directPassword = config.directPassword ? encryptPassword(config.directPassword) : null;
        const readPassword = config.readPassword ? encryptPassword(config.readPassword) : null;
        const writePassword = config.writePassword ? encryptPassword(config.writePassword) : null;

        const result = await pool.request()
            .input('modo', sql.NVarChar, config.modo)
            .input('directServer', sql.NVarChar, config.directServer)
            .input('directDatabase', sql.NVarChar, config.directDatabase)
            .input('directUser', sql.NVarChar, config.directUser)
            .input('directPassword', sql.NVarChar, directPassword)
            .input('readServer', sql.NVarChar, config.readServer)
            .input('readDatabase', sql.NVarChar, config.readDatabase)
            .input('readUser', sql.NVarChar, config.readUser)
            .input('readPassword', sql.NVarChar, readPassword)
            .input('writeServer', sql.NVarChar, config.writeServer)
            .input('writeDatabase', sql.NVarChar, config.writeDatabase)
            .input('writeUser', sql.NVarChar, config.writeUser)
            .input('writePassword', sql.NVarChar, writePassword)
            .input('usuario', sql.NVarChar, username)
            .query(`
                INSERT INTO APP_DB_CONFIG (
                    Modo,
                    DirectServer,
                    DirectDatabase,
                    DirectUser,
                    DirectPassword,
                    ReadServer,
                    ReadDatabase,
                    ReadUser,
                    ReadPassword,
                    WriteServer,
                    WriteDatabase,
                    WriteUser,
                    WritePassword,
                    FechaModificacion,
                    UsuarioModificacion
                )
                VALUES (
                    @modo,
                    @directServer,
                    @directDatabase,
                    @directUser,
                    @directPassword,
                    @readServer,
                    @readDatabase,
                    @readUser,
                    @readPassword,
                    @writeServer,
                    @writeDatabase,
                    @writeUser,
                    @writePassword,
                    GETDATE(),
                    @usuario
                )
            `);

        console.log(`✅ Database config saved by ${username}`);
        return true;
    } catch (err) {
        console.error('Error saving DB config:', err);
        throw err;
    }
}

/**
 * Test a database connection without saving
 */
async function testConnection(config) {
    const mssql = require('mssql');

    try {
        let testConfig;

        if (config.modo === 'direct') {
            testConfig = {
                user: config.directUser,
                password: config.directPassword,
                server: config.directServer,
                database: config.directDatabase,
                options: {
                    encrypt: false,
                    trustServerCertificate: true
                },
                connectionTimeout: 10000
            };
        } else if (config.modo === 'hybrid') {
            // Test both read and write connections
            const readConfig = {
                user: config.readUser,
                password: config.readPassword,
                server: config.readServer,
                database: config.readDatabase,
                options: {
                    encrypt: true,
                    trustServerCertificate: false
                },
                connectionTimeout: 10000
            };

            const writeConfig = {
                user: config.writeUser,
                password: config.writePassword,
                server: config.writeServer,
                database: config.writeDatabase,
                options: {
                    encrypt: false,
                    trustServerCertificate: true
                },
                connectionTimeout: 10000
            };

            // Test read connection
            const readPool = await new mssql.ConnectionPool(readConfig).connect();
            await readPool.request().query('SELECT 1 AS Test');
            await readPool.close();

            // Test write connection
            const writePool = await new mssql.ConnectionPool(writeConfig).connect();
            await writePool.request().query('SELECT 1 AS Test');
            await writePool.close();

            return { success: true, message: 'Conexiones de lectura y escritura exitosas' };
        }

        // Test direct connection
        const pool = await new mssql.ConnectionPool(testConfig).connect();
        await pool.request().query('SELECT 1 AS Test');
        await pool.close();

        return { success: true, message: 'Conexión exitosa' };
    } catch (err) {
        console.error('Connection test failed:', err);
        return { success: false, message: err.message };
    }
}

module.exports = {
    getDBConfig,
    saveDBConfig,
    testConnection,
    encryptPassword,
    decryptPassword
};
