const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== PRUEBA DE #GrpInfo EXACTA ===');
    const q = `
        SELECT cab.IDGRUPO,
                CodGrupo = N'G' + CASE WHEN cab.IDGRUPO >= 3000 AND (cab.IDGRUPO - 3000) <= 99 
                            THEN RIGHT(N'0' + CAST(cab.IDGRUPO - 3000 AS NVARCHAR(2)), 2)
                            ELSE CAST(cab.IDGRUPO AS NVARCHAR(9)) END,
                NombreGrupo = LTRIM(RTRIM(cab.DESCRIPCION)),
                IdLocalGrupo = cab.IDGRUPO,
                SerieNum = CASE WHEN cab.IDGRUPO >= 3000 AND (cab.IDGRUPO - 3000) <= 99 
                     THEN CAST(cab.IDGRUPO - 3000 AS VARCHAR(2))
                     ELSE CAST(cab.IDGRUPO % 100 AS VARCHAR(2)) END
        FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
        WHERE cab.CODVISIBLE = 20;
    `;
    const result = await pool.request().query(q);
    console.table(result.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
