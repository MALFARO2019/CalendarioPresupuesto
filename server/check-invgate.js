require('dotenv').config();
const sql = require('mssql');
const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_InvGate',
    options: { encrypt: true, trustServerCertificate: true }
};
sql.connect(cfg).then(pool =>
    pool.request().query('SELECT ConfigKey, LEN(ConfigValue) as Len, LEFT(ConfigValue,40) as Preview FROM InvgateConfig ORDER BY ConfigKey')
        .then(r => {
            r.recordset.forEach(x => console.log(x.ConfigKey + ': ' + x.Len + ' chars | ' + x.Preview));
            sql.close();
        })
).catch(e => { console.error(e.message); process.exit(1); });
