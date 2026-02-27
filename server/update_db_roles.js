const { sql, poolPromise } = require('./db');

async function run() {
    try {
        const pool = await poolPromise;
        const transaction = pool.transaction();
        await transaction.begin();
        console.log('🔄 Applying schema updates...');

        try {
            await transaction.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_USUARIOS]') AND name = 'aprobarAjustes')
                BEGIN
                    ALTER TABLE [dbo].[APP_USUARIOS] ADD [aprobarAjustes] BIT NOT NULL DEFAULT 0;
                END
            `);
            await transaction.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[APP_PERFILES]') AND name = 'aprobarAjustes')
                BEGIN
                    ALTER TABLE [dbo].[APP_PERFILES] ADD [aprobarAjustes] BIT NOT NULL DEFAULT 0;
                END
            `);
            await transaction.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_AJUSTES]') AND name = 'MotivoRechazo')
                BEGIN
                    ALTER TABLE [dbo].[MODELO_PRESUPUESTO_AJUSTES] ADD [MotivoRechazo] NVARCHAR(500) NULL;
                END
            `);
            await transaction.commit();
            console.log('🎉 Schema update successful!');
            process.exit(0);
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (e) {
        console.error('❌ Schema update failed:', e);
        process.exit(1);
    }
}
run();
