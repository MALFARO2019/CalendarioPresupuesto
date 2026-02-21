const { sql, poolPromise } = require('./db');
const { getAlcanceTableName } = require('./alcanceConfig');

/**
 * GET /api/rangos
 * 
 * Flexible date range query with dynamic grouping
 * Supports: day, week, month, quarter, semester, year grouping
 */
async function getRangosData(req, res) {
    console.log('📊 getRangosData called');
    console.log('   Query params:', req.query);

    try {
        const {
            startDate,
            endDate,
            groupBy = 'month',  // day, week, month, quarter, semester, year
            kpi = 'Ventas',
            canal = 'Todos',
            local,
            yearType = 'anterior'
        } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const pool = await poolPromise;
        const alcanceTable = await getAlcanceTableName(pool);
        const dbCanal = canal === 'Total' ? 'Todos' : canal;
        const anteriorField = yearType === 'ajustado' ? 'MontoAnteriorAjustado' : 'MontoAnterior';

        // For users with limited channels, "Todos" should sum only their allowed channels
        const userAllowedCanales = req.user?.allowedCanales || [];
        const allCanales = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];
        const hasLimitedChannels = userAllowedCanales.length > 0 && userAllowedCanales.length < allCanales.length;
        const useMultiChannel = dbCanal === 'Todos' && hasLimitedChannels;

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
                        FROM ${alcanceTable}
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

        // Build canal filter
        let canalFilter = '';
        const canalParams = {};
        if (useMultiChannel) {
            const canalPlaceholders = userAllowedCanales.map((_, i) => `@ch${i}`).join(', ');
            canalFilter = `Canal IN (${canalPlaceholders})`;
            userAllowedCanales.forEach((ch, i) => { canalParams[`ch${i}`] = ch; });
        } else {
            canalFilter = `Canal = @canal`;
            canalParams['canal'] = canal;
        }

        // Determine SQL grouping expression based on groupBy parameter
        let groupExpression = '';
        let labelExpression = '';

        switch (groupBy.toLowerCase()) {
            case 'day':
                groupExpression = 'Fecha';
                labelExpression = 'CONVERT(VARCHAR(10), Fecha, 120)'; // YYYY-MM-DD
                break;
            case 'week':
                // Group by ISO week number
                groupExpression = 'DATEPART(YEAR, Fecha), DATEPART(WEEK, Fecha)';
                labelExpression = `CONCAT('Semana ', DATEPART(WEEK, Fecha), ' - ', DATEPART(YEAR, Fecha))`;
                break;
            case 'month':
                groupExpression = 'YEAR(Fecha), MONTH(Fecha)';
                labelExpression = `CONCAT(
                    CASE MONTH(Fecha)
                        WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                        WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                        WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                        WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                    END, ' ', YEAR(Fecha)
                )`;
                break;
            case 'quarter':
                groupExpression = 'YEAR(Fecha), DATEPART(QUARTER, Fecha)';
                labelExpression = `CONCAT('Q', DATEPART(QUARTER, Fecha), ' ', YEAR(Fecha))`;
                break;
            case 'semester':
                // Group by semester (1-6 = S1, 7-12 = S2)
                groupExpression = 'YEAR(Fecha), CASE WHEN MONTH(Fecha) <= 6 THEN 1 ELSE 2 END';
                labelExpression = `CONCAT('S', CASE WHEN MONTH(Fecha) <= 6 THEN '1' ELSE '2' END, ' ', YEAR(Fecha))`;
                break;
            case 'year':
                groupExpression = 'YEAR(Fecha)';
                labelExpression = 'CAST(YEAR(Fecha) AS VARCHAR)';
                break;
            default:
                return res.status(400).json({ error: 'Invalid groupBy parameter. Use: day, week, month, quarter, semester, or year' });
        }

        // Build the main query with dynamic grouping
        const query = `
            SELECT 
                ${labelExpression} as periodo,
                MIN(Fecha) as periodoInicio,
                MAX(Fecha) as periodoFin,
                SUM(Monto) as presupuesto,
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as presupuestoConDatos,
                SUM(MontoReal) as real,
                SUM(CASE WHEN MontoReal > 0 THEN MontoAnterior ELSE 0 END) as anterior,
                SUM(CASE WHEN MontoReal > 0 THEN ISNULL(MontoAnteriorAjustado, 0) ELSE 0 END) as anteriorAjustado,
                CASE 
                    WHEN SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) > 0 
                    THEN SUM(MontoReal) / SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END)
                    ELSE 0 
                END as pctAlcance,
                CASE 
                    WHEN SUM(CASE WHEN MontoReal > 0 THEN MontoAnterior ELSE 0 END) > 0 
                    THEN SUM(MontoReal) / SUM(CASE WHEN MontoReal > 0 THEN MontoAnterior ELSE 0 END)
                    ELSE 0 
                END as pctAnterior,
                CASE 
                    WHEN SUM(CASE WHEN MontoReal > 0 THEN ISNULL(MontoAnteriorAjustado, 0) ELSE 0 END) > 0 
                    THEN SUM(MontoReal) / SUM(CASE WHEN MontoReal > 0 THEN ISNULL(MontoAnteriorAjustado, 0) ELSE 0 END)
                    ELSE 0 
                END as pctAnteriorAjustado
            FROM ${alcanceTable}
            WHERE Fecha BETWEEN @startDate AND @endDate
                AND Tipo = @kpi
                AND ${canalFilter}
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                ${localFilter}
            GROUP BY ${groupExpression}
            ORDER BY MIN(Fecha)
        `;

        const request = pool.request();
        request.input('startDate', sql.Date, startDate);
        request.input('endDate', sql.Date, endDate);
        request.input('kpi', sql.VarChar, kpi);

        Object.entries(canalParams).forEach(([key, value]) => {
            request.input(key, sql.NVarChar, value);
        });
        Object.entries(localParams).forEach(([key, value]) => {
            request.input(key, sql.NVarChar, value);
        });

        console.log(`\n📊 Executing Rangos query with groupBy='${groupBy}'`);
        const result = await request.query(query);
        console.log(`✅ Rangos returned ${result.recordset.length} periods\n`);

        // Calculate totals
        const totals = {
            presupuesto: 0,
            presupuestoConDatos: 0,
            real: 0,
            anterior: 0,
            anteriorAjustado: 0
        };

        result.recordset.forEach(row => {
            totals.presupuesto += row.presupuesto || 0;
            totals.presupuestoConDatos += row.presupuestoConDatos || 0;
            totals.real += row.real || 0;
            totals.anterior += row.anterior || 0;
            totals.anteriorAjustado += row.anteriorAjustado || 0;
        });

        totals.pctAlcance = totals.presupuestoConDatos > 0 ? totals.real / totals.presupuestoConDatos : 0;
        totals.pctAnterior = totals.anterior > 0 ? totals.real / totals.anterior : 0;
        totals.pctAnteriorAjustado = totals.anteriorAjustado > 0 ? totals.real / totals.anteriorAjustado : 0;

        // Calculate multi-KPI summaries (Ventas, Transacciones, TQP)
        const resumenMultiKpi = {};
        const kpisToSummarize = ['Ventas', 'Transacciones', 'TQP'];

        for (const tipoKpi of kpisToSummarize) {
            const summaryQuery = `
                SELECT 
                    SUM(Monto) as presupuesto,
                    SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as presupuestoConDatos,
                    SUM(MontoReal) as real,
                    SUM(CASE WHEN MontoReal > 0 THEN ${yearType === 'ajustado' ? 'ISNULL(MontoAnteriorAjustado, 0)' : 'MontoAnterior'} ELSE 0 END) as anterior
                FROM ${alcanceTable}
                WHERE Fecha BETWEEN @startDate AND @endDate
                    AND Tipo = @tipoKpi
                    AND ${canalFilter}
                    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                    ${localFilter}
            `;

            const summaryRequest = pool.request();
            summaryRequest.input('startDate', sql.Date, startDate);
            summaryRequest.input('endDate', sql.Date, endDate);
            summaryRequest.input('tipoKpi', sql.VarChar, tipoKpi);

            // Add canal params
            Object.entries(canalParams).forEach(([key, value]) => {
                summaryRequest.input(key, sql.NVarChar, value);
            });

            // Add local params
            Object.entries(localParams).forEach(([key, value]) => {
                summaryRequest.input(key, sql.NVarChar, value);
            });

            const summaryResult = await summaryRequest.query(summaryQuery);
            const row = summaryResult.recordset[0];

            resumenMultiKpi[tipoKpi] = {
                totalPresupuesto: row.presupuesto || 0,
                totalPresupuestoAcum: row.presupuestoConDatos || 0,
                totalReal: row.real || 0,
                totalAnterior: row.anterior || 0,
                pctPresupuesto: row.presupuestoConDatos > 0 ? row.real / row.presupuestoConDatos : 0,
                pctAnterior: row.anterior > 0 ? row.real / row.anterior : 0
            };
        }

        res.json({
            periods: result.recordset,
            totals,
            resumenMultiKpi,
            parameters: { startDate, endDate, groupBy, kpi, canal, local: local || 'all', yearType }
        });

    } catch (error) {
        console.error('Error in getRangosData:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/rangos/resumen-canal
 * 
 * Aggregates rangos data by Canal (sales channel)
 * Returns per-channel: real, presupuesto, anterior, pctPresupuesto, pctCrecimiento, contribucion
 */
async function getRangosResumenCanal(req, res) {
    console.log('📊 getRangosResumenCanal called');
    console.log('   Query params:', req.query);
    try {
        const { startDate, endDate, kpi = 'Ventas', canal = 'Todos', local, yearType = 'anterior' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const pool = await poolPromise;
        const alcanceTable = await getAlcanceTableName(pool);
        const anteriorField = yearType === 'ajustado' ? 'ISNULL(MontoAnteriorAjustado, 0)' : 'MontoAnterior';

        // Build local filter
        let localFilter = '';
        if (local) {
            localFilter = 'AND Local = @local';
        }

        // Query grouped by Canal - no canal filter since we want ALL channels
        const query = `
            SELECT 
                Canal,
                SUM(Monto) as Presupuesto,
                SUM(MontoReal) as Real,
                SUM(${anteriorField}) as Anterior
            FROM ${alcanceTable}
            WHERE Fecha BETWEEN @startDate AND @endDate
                AND Tipo = @kpi
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
        if (local) request.input('local', sql.NVarChar, local);

        const result = await request.query(query);
        console.log(`📊 RangosResumenCanal returned ${result.recordset.length} channels`);

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
        console.error('Error in getRangosResumenCanal:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getRangosData, getRangosResumenCanal };
