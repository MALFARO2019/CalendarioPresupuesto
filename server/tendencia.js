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

        // Multi-KPI summary: get totals for all three KPIs (Ventas, Transacciones, TQP)
        const multiKpiQuery = `
            SELECT 
                Tipo,
                SUM(Monto) as PresupuestoAcum,
                SUM(MontoReal) as RealAcum,
                SUM(${anteriorField}) as AnteriorAcum
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha BETWEEN @startDate2 AND @endDate2
                AND Año = YEAR(@endDate2) AND Canal = @canal2
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                ${localFilter.replace(/@ml/g, '@ml2_').replace(/@local/g, '@local2')}
            GROUP BY Tipo
        `;
        const multiReq = pool.request();
        multiReq.input('startDate2', sql.Date, startDate);
        multiReq.input('endDate2', sql.Date, endDate);
        multiReq.input('canal2', sql.VarChar, dbCanal);
        // Re-bind local params with different names
        if (memberLocals && memberLocals.length > 0) {
            memberLocals.forEach((name, i) => multiReq.input(`ml2_${i}`, sql.NVarChar, name));
        } else if (local) {
            multiReq.input('local2', sql.NVarChar, local);
        }
        const multiResult = await multiReq.query(multiKpiQuery);

        const resumenMultiKpi = {};
        multiResult.recordset.forEach(row => {
            const pAcum = row.PresupuestoAcum || 0;
            const real = row.RealAcum || 0;
            const ant = row.AnteriorAcum || 0;
            resumenMultiKpi[row.Tipo] = {
                totalPresupuestoAcum: pAcum,
                totalReal: real,
                totalAnterior: ant,
                pctPresupuesto: pAcum > 0 ? (real / pAcum) : 0,
                pctAnterior: ant > 0 ? (real / ant) : 0
            };
        });
        console.log('📊 Multi-KPI summary keys:', Object.keys(resumenMultiKpi), 'rows:', multiResult.recordset.length);

        res.json({
            evaluacion: evaluacion.sort((a, b) => a.local.localeCompare(b.local)),
            resumen,
            resumenMultiKpi,
            parameters: { startDate, endDate, kpi, channel, local: local || 'all', yearType, isGroup: memberLocals !== null }
        });

    } catch (error) {
        console.error('Error in getTendenciaData:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/tendencia/resumen-canal
 * 
 * Aggregates data by Canal (sales channel) instead of by Local.
 * Returns per-channel: real, presupuesto, anterior, pctPresupuesto, pctCrecimiento, contribucion
 */
async function getResumenCanal(req, res) {
    console.log('📊 getResumenCanal called');
    console.log('   Query params:', req.query);
    try {
        const { startDate, endDate, kpi = 'Ventas', local, yearType = 'anterior' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const pool = await poolPromise;
        const anteriorField = yearType === 'ajustado' ? 'MontoAnteriorAjustado' : 'MontoAnterior';

        // If a group is selected, find member stores (same logic as getTendenciaData)
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

        // Query grouped by Canal - no canal filter since we want ALL channels
        const query = `
            SELECT 
                Canal,
                SUM(Monto) as Presupuesto,
                SUM(MontoReal) as Real,
                SUM(${anteriorField}) as Anterior
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha BETWEEN @startDate AND @endDate
                AND Año = YEAR(@endDate) AND Tipo = @kpi
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                AND MontoReal > 0
                AND Canal != 'Todos'
                ${localFilter}
            GROUP BY Canal
            ORDER BY SUM(MontoReal) DESC
        `;

        const request = pool.request();
        request.input('startDate', sql.Date, startDate);
        request.input('endDate', sql.Date, endDate);
        request.input('kpi', sql.VarChar, kpi);
        Object.entries(localParams).forEach(([key, value]) => {
            request.input(key, sql.NVarChar, value);
        });

        const result = await request.query(query);
        console.log(`📊 ResumenCanal returned ${result.recordset.length} channels`);

        // Compute totals first
        let totalReal = 0;
        let totalPresupuesto = 0;
        let totalAnterior = 0;

        result.recordset.forEach(row => {
            totalReal += (row.Real || 0);
            totalPresupuesto += (row.Presupuesto || 0);
            totalAnterior += (row.Anterior || 0);
        });

        // Build per-channel data
        const canales = result.recordset.map(row => {
            const real = row.Real || 0;
            const presupuesto = row.Presupuesto || 0;
            const anterior = row.Anterior || 0;

            return {
                canal: row.Canal,
                real,
                presupuesto,
                anterior,
                pctPresupuesto: presupuesto > 0 ? (real / presupuesto) : 0,
                pctCrecimiento: anterior > 0 ? ((real - anterior) / anterior) : 0,
                contribucion: totalReal > 0 ? (real / totalReal) : 0
            };
        });

        const totals = {
            real: totalReal,
            presupuesto: totalPresupuesto,
            anterior: totalAnterior,
            pctPresupuesto: totalPresupuesto > 0 ? (totalReal / totalPresupuesto) : 0,
            pctCrecimiento: totalAnterior > 0 ? ((totalReal - totalAnterior) / totalAnterior) : 0,
            contribucion: 1.0
        };

        res.json({ canales, totals });
    } catch (error) {
        console.error('Error in getResumenCanal:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getTendenciaData, getResumenCanal };
