const { sql, getActivePool } = require('./dbConnectionManager');

/**
 * Ensure APP_DB_CONFIG table exists
 * This table stores database configuration for hybrid/direct connection modes
 */
async function ensureDBConfigTable() {
    try {
        const pool = await getActivePool();

        // Check if table exists
        const tableCheck = await pool.request().query(`
            SELECT * FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'APP_DB_CONFIG'
        `);

        if (tableCheck.recordset.length === 0) {
            // Create table
            await pool.request().query(`
                CREATE TABLE APP_DB_CONFIG (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Modo NVARCHAR(20) NOT NULL CHECK (Modo IN ('direct', 'hybrid')),
                    
                    -- Direct SQL Configuration
                    DirectServer NVARCHAR(255),
                    DirectDatabase NVARCHAR(255),
                    DirectUser NVARCHAR(255),
                    DirectPassword NVARCHAR(500),
                    
                    -- Azure Hybrid Configuration - READ Pool (Azure SQL)
                    ReadServer NVARCHAR(255),
                    ReadDatabase NVARCHAR(255),
                    ReadUser NVARCHAR(255),
                    ReadPassword NVARCHAR(500),
                    
                    -- Azure Hybrid Configuration - WRITE Pool (On-premise)
                    WriteServer NVARCHAR(255),
                    WriteDatabase NVARCHAR(255),
                    WriteUser NVARCHAR(255),
                    WritePassword NVARCHAR(500),
                    
                    FechaModificacion DATETIME DEFAULT GETDATE(),
                    UsuarioModificacion NVARCHAR(255)
                );
            `);

            console.log('✅ APP_DB_CONFIG table created');

            // Insert default configuration
            await pool.request().query(`
                INSERT INTO APP_DB_CONFIG (
                    Modo,
                    DirectServer,
                    DirectDatabase,
                    DirectUser,
                    DirectPassword,
                    UsuarioModificacion
                )
                VALUES (
                    'direct',
                    '10.29.1.14',
                    'RP_BI_RESUMENES',
                    'sa',
                    'masterkey',
                    'system'
                );
            `);

            console.log('✅ Default DB configuration inserted');
        } else {
            console.log('✅ APP_DB_CONFIG table already exists');
        }
    } catch (err) {
        console.error('❌ Error ensuring DB config table:', err.message);
        // Don't throw - allow server to continue even if this fails
    }
}

module.exports = {
    ensureDBConfigTable
};
