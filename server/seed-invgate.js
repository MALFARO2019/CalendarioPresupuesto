// Script para insertar credenciales InvGate directamente en la BD
// Evita problemas con caracteres especiales en sqlcmd
require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'KPIsRosti_InvGate',
    options: { encrypt: true, trustServerCertificate: true }
};

const credentials = [
    { key: 'CLIENT_ID', value: process.env.INVGATE_CLIENT_ID },
    { key: 'CLIENT_SECRET', value: process.env.INVGATE_CLIENT_SECRET },
    { key: 'TOKEN_URL', value: process.env.INVGATE_TOKEN_URL },
    { key: 'API_BASE_URL', value: process.env.INVGATE_API_BASE_URL },
    { key: 'SYNC_ENABLED', value: process.env.INVGATE_SYNC_ENABLED || 'true' },
    { key: 'SYNC_INTERVAL_HOURS', value: process.env.INVGATE_SYNC_INTERVAL || '1' },
];

async function run() {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a KPIsRosti_InvGate');

    for (const { key, value } of credentials) {
        const r = pool.request();
        r.input('k', sql.NVarChar(100), key);
        r.input('v', sql.NVarChar(sql.MAX), value);
        await r.query(`
            IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey=@k)
                UPDATE InvgateConfig SET ConfigValue=@v WHERE ConfigKey=@k
            ELSE
                INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES (@k, @v)
        `);
        console.log(`  ✅ ${key}: [${value.length} chars]`);
    }

    // Verificar
    const result = await pool.request().query(
        "SELECT ConfigKey, LEFT(ConfigValue,50) as Val, LEN(ConfigValue) as Len FROM InvgateConfig ORDER BY ConfigKey"
    );
    console.log('\n📋 Estado final:');
    result.recordset.forEach(r => console.log(`  ${r.ConfigKey}: "${r.Val}" (${r.Len} chars)`));

    await pool.close();
    console.log('\n✅ Listo!');
}

run().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
