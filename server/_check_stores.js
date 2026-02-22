const { sql, poolPromise } = require('./db');
(async () => {
    try {
        const p = await poolPromise;
        const stores = await p.request().query(`
            SELECT DISTINCT
                RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS AS CODALMACEN,
                COALESCE(
                    n.NOMBRE_OPERACIONES,
                    n.NOMBRE_CONTA,
                    n.NOMBRE_INOCUIDAD,
                    n.NOMBRE_JUSTO,
                    d.NOMBREALMACEN COLLATE Modern_Spanish_CI_AS,
                    RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
                ) AS NOMBRE
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
            INNER JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA ON GL.IDGRUPO = GA.IDGRUPO
            LEFT JOIN DIM_NOMBRES_ALMACEN n ON RTRIM(n.CODALMACEN) = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            LEFT JOIN DIM_ALMACEN d ON RTRIM(d.CODALMACEN) COLLATE Modern_Spanish_CI_AS = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            WHERE GA.CODVISIBLE = 20
            ORDER BY CODALMACEN
        `);
        console.log('Stores from CODVISIBLE=20:', stores.recordset.length);
        stores.recordset.forEach(s => console.log('  ' + s.CODALMACEN + ' - ' + s.NOMBRE));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit();
})();
