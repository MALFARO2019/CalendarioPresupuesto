require('dotenv').config();
(async () => {
    const { getInvgatePool } = require('./invgateDb');
    const p = await getInvgatePool();
    const r = await p.request().query("SELECT OBJECT_ID('InvgateView_25','U') AS tid");
    console.log('Table exists:', !!r.recordset[0]?.tid);
    if (r.recordset[0]?.tid) {
        const c = await p.request().query('SELECT COUNT(*) AS cnt FROM InvgateView_25');
        console.log('Rows:', c.recordset[0].cnt);
        const cols = await p.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='InvgateView_25'");
        console.log('Columns:', cols.recordset.map(c => c.COLUMN_NAME));
    }
    process.exit(0);
})();
