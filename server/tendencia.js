const { sql, poolPromise } = require('./db');

/**
 * GET /api/tendencia
 * 
 * Calculations match SummaryCard logic:
 * - PRESUPUESTO = SUM(Monto) for all days in year (annual total budget)
 * - P. ACUMULADO = SUM(Monto) for days WHERE MontoReal > 0 (budget for days with actual data)
 * - REAL = SUM(MontoReal) for days WHERE MontoReal > 0
 * - AÑO ANTERIOR = SUM(MontoAnterior or MontoAnteriorAjustado) for days WHERE MontoReal > 0
 * 
 * % Ppto = Real / P. Acumulado
 * % Ant  = Real / Año Anterior
 */
async function getTendenciaData(req, res) {
    console.log('📊 getTendenciaData called');
    console.log('   Query params:', req.query);
    try {
        const { startDate, endDate, kpi = 'Ventas', channel = 'Total', local, yearType = 'anterior' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const pool = await poolPromise;
        const dbCanal = channel === 'Total' ? 'Todos' : channel;
        // Use DAILY fields (not accumulated) since we SUM them ourselves
        const anteriorField = yearType === 'ajustado' ? 'MontoAnteriorAjustado' : 'MontoAnterior';

        // If a group is selected, find member stores
        let memberLocals = null;
        if (local) {
            const idGrupoQuery = `
                SELECT GA.IDGRUPO
                FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
                WHERE GA.CODVISIBLE = 20 AND GA.DESCRIPCION = @groupName
            `;
            const idGrupoRequest = pool.request();
            idGrupoRequest.input('groupName', sql.NVarChar, local);
            const idGrupoResult = await idGrupoRequest.query(idGrupoQuery);

            if (idGrupoResult.recordset.length > 0) {
                const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);
                const memberCodesQuery = `
                    SELECT DISTINCT GL.CODALMACEN
                    FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
                    WHERE GL.IDGRUPO IN (${idGrupos.map((_, i) => `@idgrupo${i}`).join(', ')})
                `;
                const memberCodesRequest = pool.request();
                idGrupos.forEach((id, i) => memberCodesRequest.input(`idgrupo${i}`, sql.Int, id));
                const memberCodesResult = await memberCodesRequest.query(memberCodesQuery);
                const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN);

                if (memberCodes.length > 0) {
                    const localsQuery = `
                        SELECT DISTINCT Local
                        FROM RSM_ALCANCE_DIARIO
                        WHERE Año = YEAR(@endDate)
                        AND CODALMACEN IN (${memberCodes.map((_, i) => `@mcode${i}`).join(', ')})
                        AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                    `;
                    const localsRequest = pool.request();
                    localsRequest.input('endDate', sql.Date, endDate);
                    memberCodes.forEach((code, i) => localsRequest.input(`mcode${i}`, sql.NVarChar, code));
                    const localsResult = await localsRequest.query(localsQuery);
                    memberLocals = localsResult.recordset.map(r => r.Local);
                    console.log(`🏪 Group "${local}" members (${memberLocals.length}):`, memberLocals);
                }
            }
        }

        // Build local filter
        let localFilter = '';
        const localParams = {};
        if (memberLocals && memberLocals.length > 0) {
            const ph = memberLocals.map((_, i) => `@ml${i}`).join(', ');
            localFilter = `AND Local IN (${ph})`;
            memberLocals.forEach((name, i) => { localParams[`ml${i}`] = name; });
        } else if (local) {
            localFilter = 'AND Local = @local';
            localParams['local'] = local;
        }

        const query = `
            -- Annual budget total (SUM of Monto for all days in year)
            WITH AnnualBudget AS (
                SELECT Local, SUM(Monto) as PresupuestoAnual
                FROM RSM_ALCANCE_DIARIO
                WHERE Año = YEAR(@endDate) AND Tipo = @kpi AND Canal = @canal
                    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                    ${localFilter}
                GROUP BY Local
            ),
            -- Period data: only days with actual real data (MontoReal > 0)
            -- P. Acumulado = SUM(Monto) for days with real data
            -- Real = SUM(MontoReal)
            -- Año Anterior = SUM(MontoAnterior or Ajustado) for days with real data
            PeriodData AS (
                SELECT 
                    Local,
                    SUM(Monto) as PresupuestoAcum,
                    SUM(MontoReal) as RealAcum,
                    SUM(${anteriorField}) as AnteriorAcum
                FROM RSM_ALCANCE_DIARIO
                WHERE Fecha BETWEEN @startDate AND @endDate
                    AND Año = YEAR(@endDate) AND Tipo = @kpi AND Canal = @canal
                    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                    AND MontoReal > 0
                    ${localFilter}
                GROUP BY Local
            )
            SELECT 
                ab.Local,
                ab.PresupuestoAnual,
                ISNULL(pd.PresupuestoAcum, 0) as PresupuestoAcum,
                ISNULL(pd.RealAcum, 0) as RealAcum,
                ISNULL(pd.AnteriorAcum, 0) as AnteriorAcum
            FROM AnnualBudget ab
            LEFT JOIN PeriodData pd ON ab.Local = pd.Local
            ORDER BY ab.Local
        `;

        const request = pool.request();
        request.input('startDate', sql.Date, startDate);
        request.input('endDate', sql.Date, endDate);
        request.input('kpi', sql.VarChar, kpi);
        request.input('canal', sql.VarChar, dbCanal);
        Object.entries(localParams).forEach(([key, value]) => {
            request.input(key, sql.NVarChar, value);
        });

        const result = await request.query(query);
        console.log(`📊 Tendencia returned ${result.recordset.length} records`);
        if (result.recordset.length > 0) {
            console.log('   Sample:', JSON.stringify(result.recordset[0]));
        }

        const evaluacion = [];
        const resumen = { totalPresupuesto: 0, totalPresupuestoAcum: 0, totalReal: 0, totalAnterior: 0 };

        result.recordset.forEach(row => {
            const presupuesto = row.PresupuestoAnual || 0;
            const presupuestoAcum = row.PresupuestoAcum || 0;
            const real = row.RealAcum || 0;
            const anterior = row.AnteriorAcum || 0;

            const pctPresupuesto = presupuestoAcum > 0 ? (real / presupuestoAcum) : 0;
            const pctAnterior = anterior > 0 ? (real / anterior) : 0;

            evaluacion.push({ local: row.Local, presupuesto, presupuestoAcum, real, anterior, pctPresupuesto, pctAnterior });

            resumen.totalPresupuesto += presupuesto;
            resumen.totalPresupuestoAcum += presupuestoAcum;
            resumen.totalReal += real;
            resumen.totalAnterior += anterior;
        });

        resumen.pctPresupuesto = resumen.totalPresupuestoAcum > 0 ? (resumen.totalReal / resumen.totalPresupuestoAcum) : 0;
        resumen.pctAnterior = resumen.totalAnterior > 0 ? (resumen.totalReal / resumen.totalAnterior) : 0;

        res.json({
            evaluacion: evaluacion.sort((a, b) => a.local.localeCompare(b.local)),
            resumen,
            parameters: { startDate, endDate, kpi, channel, local: local || 'all', yearType, isGroup: memberLocals !== null }
        });

    } catch (error) {
        console.error('Error in getTendenciaData:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getTendenciaData };
