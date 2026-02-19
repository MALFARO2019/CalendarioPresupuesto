require('dotenv').config({ override: true });
const { getFormsPool, sql } = require('./formsDb');

const CORRECT_CONFIG = {
    TENANT_ID: '70df046e-e545-44c7-ae8c-21c53272ee6e',
    CLIENT_ID: '44490c35-76d8-451c-a10f-05c526df8e38',
    CLIENT_SECRET: 'q2l8Q~F6ul3dMZHQUmmF5FCPa5eIHzEWOU5pIaZI',
    SYNC_ENABLED: 'false',
    SYNC_INTERVAL_HOURS: '6',
};

async function fixFormsConfig() {
    console.log('🔍 Connecting to WindowsFormsData...');
    const pool = await getFormsPool();

    // Show current state
    console.log('\n📋 Current FormsConfig:');
    const current = await pool.request().query('SELECT ConfigKey, LEFT(ConfigValue, 40) as Val, LEN(ConfigValue) as Len FROM FormsConfig ORDER BY ConfigKey');
    current.recordset.forEach(r => {
        console.log(`  ${r.ConfigKey}: "${r.Val}" (${r.Len} chars)`);
    });

    // Fix each key using MERGE
    console.log('\n🔧 Fixing config values...');
    for (const [key, value] of Object.entries(CORRECT_CONFIG)) {
        await pool.request()
            .input('key', sql.NVarChar, key)
            .input('value', sql.NVarChar, value)
            .query(`
                MERGE FormsConfig AS target
                USING (SELECT @key AS ConfigKey) AS source
                ON target.ConfigKey = source.ConfigKey
                WHEN MATCHED THEN
                    UPDATE SET ConfigValue = @value, UpdatedAt = GETDATE(), UpdatedBy = 'fix_script'
                WHEN NOT MATCHED THEN
                    INSERT (ConfigKey, ConfigValue, UpdatedBy)
                    VALUES (@key, @value, 'fix_script');
            `);
        console.log(`  ✅ ${key}: set (${value.length} chars)`);
    }

    // Verify
    console.log('\n✅ Verification after fix:');
    const after = await pool.request().query('SELECT ConfigKey, LEFT(ConfigValue, 40) as Val, LEN(ConfigValue) as Len FROM FormsConfig ORDER BY ConfigKey');
    after.recordset.forEach(r => {
        console.log(`  ${r.ConfigKey}: "${r.Val}" (${r.Len} chars)`);
    });

    process.exit(0);
}

fixFormsConfig().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
