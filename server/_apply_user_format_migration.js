require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function migrate() {
    try {
        const pool = await sql.connect(config);
        const query = `
            IF COL_LENGTH('APP_USUARIOS', 'PctDisplayMode') IS NULL
            BEGIN
                ALTER TABLE APP_USUARIOS ADD PctDisplayMode VARCHAR(20) DEFAULT 'base100';
                PRINT 'Columna PctDisplayMode agregada';
            END

            IF COL_LENGTH('APP_USUARIOS', 'PctDecimals') IS NULL
            BEGIN
                ALTER TABLE APP_USUARIOS ADD PctDecimals INT DEFAULT 1;
                PRINT 'Columna PctDecimals agregada';
            END

            IF COL_LENGTH('APP_USUARIOS', 'ValueDisplayMode') IS NULL
            BEGIN
                ALTER TABLE APP_USUARIOS ADD ValueDisplayMode VARCHAR(20) DEFAULT 'completo';
                PRINT 'Columna ValueDisplayMode agregada';
            END

            IF COL_LENGTH('APP_USUARIOS', 'ValueDecimals') IS NULL
            BEGIN
                ALTER TABLE APP_USUARIOS ADD ValueDecimals INT DEFAULT 0;
                PRINT 'Columna ValueDecimals agregada';
            END
        `;

        await pool.request().query(query);
        console.log('Migración completada.');
        process.exit(0);
    } catch (err) {
        console.error('Error durante la migración:', err);
        process.exit(1);
    }
}

migrate();
