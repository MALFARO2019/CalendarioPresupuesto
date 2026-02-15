const sql = require('mssql');
require('dotenv').config();

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

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Connected to SQL Server:', process.env.DB_SERVER);
        console.log('   Database:', process.env.DB_DATABASE);
        return pool;
    })
    .catch(err => {
        console.error('❌ Database Connection Failed!');
        console.error('   Server:', process.env.DB_SERVER);
        console.error('   Error:', err.message);
        process.exit(1);
    });

module.exports = {
    sql, poolPromise
};
