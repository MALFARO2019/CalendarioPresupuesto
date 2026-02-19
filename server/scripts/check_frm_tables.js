require('dotenv').config();
const sql = require('mssql');
const cfg = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: 'WindowsFormsData', options: { encrypt: true, trustServerCertificate: true } };
sql.connect(cfg).then(async p => {
    const s = await p.request().query('SELECT SourceID, Alias, Activo, DriveId, TableName FROM FormsSources ORDER BY SourceID');
    console.log('=== FormsSources ===');
    s.recordset.forEach(x => console.log(`ID:${x.SourceID} Activo:${x.Activo} DriveId:${x.DriveId ? 'SI' : 'NO'} Table:${x.TableName || '(none)'} | ${x.Alias}`));
    const t = await p.request().query("SELECT name FROM sys.tables WHERE name LIKE 'Frm_%' ORDER BY name");
    console.log('\n=== Frm_ tables ===');
    console.log(t.recordset.length > 0 ? t.recordset.map(r => r.name).join(', ') : '(ninguna)');
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
