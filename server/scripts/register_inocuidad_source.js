// register_inocuidad_source.js — Register Frm_10_EvaluacionDeInocuidad as a FormsSources entry
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getFormsPool, sql } = require('../formsDb');

async function run() {
    const pool = await getFormsPool();

    // Check if already registered
    const existing = await pool.request()
        .query(`SELECT SourceID, Alias, TableName FROM FormsSources WHERE TableName = 'Frm_10_EvaluacionDeInocuidad'`);

    if (existing.recordset.length > 0) {
        console.log('✅ Already registered:', existing.recordset[0]);
        process.exit(0);
    }

    // Get record count
    const countResult = await pool.request()
        .query(`SELECT COUNT(*) as total FROM Frm_10_EvaluacionDeInocuidad`);
    const totalRecords = countResult.recordset[0].total;

    // Insert source record
    const result = await pool.request()
        .input('alias', sql.NVarChar, 'Evaluación de Inocuidad')
        .input('tableName', sql.NVarChar, 'Frm_10_EvaluacionDeInocuidad')
        .input('total', sql.Int, totalRecords)
        .query(`
            INSERT INTO FormsSources (Alias, ExcelUrl, OwnerEmail, TableName, TotalRespuestas, Activo)
            VALUES (@alias, 'manual://inocuidad', 'system', @tableName, @total, 1);
            SELECT SCOPE_IDENTITY() AS SourceID;
        `);

    const sourceId = result.recordset[0].SourceID;
    console.log(`✅ Registered Frm_10_EvaluacionDeInocuidad as SourceID ${sourceId} with ${totalRecords} records`);
    process.exit(0);
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
