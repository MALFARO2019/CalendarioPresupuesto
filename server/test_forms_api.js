require('dotenv').config({ override: true });
const { getFormsPool } = require('./formsDb');

async function run() {
    const pool = await getFormsPool();

    const cnt = await pool.request().query('SELECT COUNT(*) as cnt FROM FormResponses');
    console.log('Total FormResponses:', cnt.recordset[0].cnt);

    const sample = await pool.request().query(`
        SELECT TOP 5 
            ResponseID, 
            RespondentEmail, 
            RespondentName, 
            CONVERT(VARCHAR, SubmittedAt, 120) as SubmittedAt,
            LEFT(Answers, 300) as AnswersPreview
        FROM FormResponses 
        ORDER BY SubmittedAt DESC
    `);
    console.log('\nLatest 5 responses:');
    sample.recordset.forEach(r => {
        console.log(`  [${r.ResponseID}] ${r.RespondentName} <${r.RespondentEmail}> @ ${r.SubmittedAt}`);
        // Show first answer with content
        try {
            const answers = JSON.parse(r.AnswersPreview + '...'); // may be truncated
        } catch (e) { }
    });

    // Check if answers have notes/comments
    const withNotes = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM FormResponses 
        WHERE Answers LIKE '%Comentarios%' OR Answers LIKE '%Observaciones%'
    `);
    console.log('\nResponses with comments/notes:', withNotes.recordset[0].cnt);

    process.exit(0);
}
run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
