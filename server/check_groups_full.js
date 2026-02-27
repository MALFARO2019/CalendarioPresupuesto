const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');

(async () => {
    const pool = await poolPromise;

    console.log('=== Simulating Groups Insert ===');
    try {
        const query = `
            IF OBJECT_ID('tempdb..#GrupoMiembros') IS NOT NULL DROP TABLE #GrupoMiembros;
            CREATE TABLE #GrupoMiembros(IDGRUPO INT NOT NULL, CodAlmacen NVARCHAR(10) NOT NULL, PRIMARY KEY(IDGRUPO,CodAlmacen));

            INSERT INTO #GrupoMiembros(IDGRUPO,CodAlmacen)
            SELECT cab.IDGRUPO, LEFT(LTRIM(RTRIM(lin.CODALMACEN)) COLLATE DATABASE_DEFAULT, 10)
            FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
            JOIN ROSTIPOLLOS_P.dbo.GRUPOSALMACENLIN lin WITH (NOLOCK) ON lin.IDGRUPO = cab.IDGRUPO
            WHERE cab.CODVISIBLE = 20;

            SELECT 'After INSERT #GrupoMiembros' as Step, COUNT(*) as Cnt FROM #GrupoMiembros;

            IF OBJECT_ID('tempdb..#GrpInfo') IS NOT NULL DROP TABLE #GrpInfo;
            CREATE TABLE #GrpInfo(
                IDGRUPO INT NOT NULL PRIMARY KEY, CodGrupo NVARCHAR(10) NOT NULL,
                NombreGrupo NVARCHAR(200) NOT NULL, IdLocalGrupo INT NOT NULL, SerieNum VARCHAR(2) NOT NULL
            );

            INSERT INTO #GrpInfo(IDGRUPO, CodGrupo, NombreGrupo, IdLocalGrupo, SerieNum)
            SELECT cab.IDGRUPO, N'G'+RIGHT(N'0'+CAST(cab.IDGRUPO-3000 AS NVARCHAR(2)),2), LTRIM(RTRIM(cab.DESCRIPCION)),
                cab.IDGRUPO, CAST(cab.IDGRUPO-3000 AS VARCHAR(2))
            FROM ROSTIPOLLOS_P.dbo.GRUPOSALMACENCAB cab WITH (NOLOCK)
            WHERE cab.CODVISIBLE = 20;

            SELECT 'After INSERT #GrpInfo' as Step, COUNT(*) as Cnt FROM #GrpInfo;

            -- Simulate the JOIN with RSM_ALCANCE_DIARIO
            SELECT COUNT(*) as Cnt_Groups_Insert
            FROM RSM_ALCANCE_DIARIO r
            JOIN #GrupoMiembros gm ON gm.CodAlmacen COLLATE DATABASE_DEFAULT = r.CodAlmacen COLLATE DATABASE_DEFAULT
            JOIN #GrpInfo g ON g.IDGRUPO=gm.IDGRUPO
            WHERE r.NombrePresupuesto='Producción' AND LEFT(r.CodAlmacen,1)<>'G' AND r.Tipo IN ('Ventas','Transacciones');

            DROP TABLE #GrupoMiembros;
            DROP TABLE #GrpInfo;
        `;
        const res = await pool.request().query(query);
        res.recordsets.forEach((rs, i) => {
            console.log(`\nResultset ${i}:`);
            console.table(rs);
        });

    } catch (e) {
        console.log('ERROR:', e.message);
    }

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
