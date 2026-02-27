const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { poolPromise, sql } = require('./db');
const { getAlcanceTableNameForUser } = require('./alcanceConfig');

(async () => {
    const pool = await poolPromise;
    const alcanceTable = 'RSM_ALCANCE_DIARIO';
    const local = 'Corporativo';

    const idGrupoQuery = `
        SELECT GA.IDGRUPO
        FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
        WHERE GA.CODVISIBLE = 20 AND GA.DESCRIPCION = @groupName
    `;
    const idGrupoResult = await pool.request().input('groupName', sql.NVarChar, local).query(idGrupoQuery);
    const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);

    // Simulate query
    const memberCodesQuery = `
        SELECT DISTINCT GL.CODALMACEN
        FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
        WHERE GL.IDGRUPO IN (${idGrupos.join(', ')})
    `;
    const memberCodesResult = await pool.request().query(memberCodesQuery);
    const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN.trim());
    console.log('Member Codes:', memberCodes);

    let memberLocals = [];
    if (memberCodes.length > 0) {
        const localsQuery = `
            SELECT DISTINCT Local
            FROM ${alcanceTable}
            WHERE Año = 2026
            AND CODALMACEN IN (${memberCodes.map((_, i) => `'${memberCodes[i]}'`).join(', ')})
            AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
        `;
        const localsResult = await pool.request().query(localsQuery);
        memberLocals = localsResult.recordset.map(r => r.Local);
        console.log('Member Locals:', memberLocals);
    }

    const localsStr = memberLocals.map(l => `'${l}'`).join(',');

    const sumQuery = `
        SELECT 
            SUM(Monto) as Presupuesto,
            COUNT(*) as Filas
        FROM RSM_ALCANCE_DIARIO
        WHERE Fecha >= '2026-01-01' AND Fecha <= '2026-12-31'
            AND Tipo = 'Ventas'
            AND Canal = 'Todos'
            AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            AND Local IN (${localsStr})
            AND NombrePresupuesto = 'Producción'
    `;
    const sumRes = await pool.request().query(sumQuery);
    console.log('Sum Result:');
    console.table(sumRes.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
