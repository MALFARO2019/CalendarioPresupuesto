require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_WForms',
    options: {
        trustServerCertificate: true,
        connectTimeout: 15000,
        requestTimeout: 15000
    }
};

(async () => {
    try {
        console.log('Connecting to', config.server, '...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Add TableName column if not exists
        const check = await pool.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM sys.columns 
                WHERE object_id = OBJECT_ID('FormsSources') AND name = 'TableName'
            )
            BEGIN
                ALTER TABLE FormsSources ADD TableName NVARCHAR(200) NULL;
                SELECT 'ADDED' AS Result
            END
            ELSE
                SELECT 'ALREADY_EXISTS' AS Result
        `);
        console.log('Result:', check.recordset[0].Result);

        // Show all columns
        const cols = await pool.request().query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'FormsSources' ORDER BY ORDINAL_POSITION
        `);
        console.log('FormsSources columns:', cols.recordset.map(r => r.COLUMN_NAME));

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
