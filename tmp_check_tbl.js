require('dotenv').config({ path: './server/.env' });
const { poolPromise, sql } = require('./server/db');

async function checkDim() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'DIM_NOMBRES_ALMACEN'
        `);
        console.log("TABLE INFO:", res.recordset);

        const cols = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'DIM_NOMBRES_ALMACEN'
        `);
        console.log("COLUMNS:", cols.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDim();
