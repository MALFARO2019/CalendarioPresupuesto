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

                    // DETAILED LOGGING FOR CORPORATIVO
                    if (local === 'Corporativo' && kpi === 'Ventas') {
                        console.log('\n🏢🏢🏢 CORPORATIVO GROUP RESOLUTION 🏢🏢🏢');
                        console.log(`   IDGRUPOs found: ${idGrupos.join(', ')}`);
                        console.log(`   Member stores (CODALMACEN) count: ${memberCodes.length}`);
                        console.log(`   Member locales count: ${memberLocals.length}`);
                        console.log(`   First 5 locales: ${memberLocals.slice(0, 5).join(', ')}`);
                        console.log(`   EXPECTED: 41 stores for correct calculation`);
                        console.log('🏢🏢🏢\n');
                    }
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
        let canalSubFilter = '';
        const canalParams = {};
        if (useMultiChannel) {
            const canalPlaceholders = userAllowedCanales.map((_, i) => `@ch${i}`).join(', ');
            canalFilter = `Canal IN (${canalPlaceholders})`;
            canalSubFilter = `Canal IN (${userAllowedCanales.map((_, i) => `@ch${i}`).join(', ')})`;
            userAllowedCanales.forEach((ch, i) => { canalParams[`ch${i}`] = ch; });
        } else {
            canalFilter = `Canal = @canal`;
            canalSubFilter = `Canal = @canal`;
            canalParams['canal'] = dbCanal;
        }

        // EMERGENCY SIMPLIFIED QUERY - No CTEs, direct aggregation
        const query = `
            SELECT 
                r.Local,
                -- Period budget (sum of ALL days in the selected date range for this Local)
                SUM(r.Monto) as PresupuestoPeriodo,
                -- Period budget (sum of days WITH sales only)
                SUM(CASE WHEN r.MontoReal > 0 THEN r.Monto ELSE 0 END) as PresupuestoAcum,
                -- Period real (sum of actual sales)
                SUM(r.MontoReal) as RealAcum,
                -- Period anterior (sum of previous year for days WITH sales)
                SUM(CASE WHEN r.MontoReal > 0 THEN r.${anteriorField} ELSE 0 END) as AnteriorAcum
            FROM RSM_ALCANCE_DIARIO r
            WHERE r.Fecha BETWEEN @startDate AND @endDate
                AND r.Año = YEAR(@endDate)
                AND r.Tipo = @kpi
                AND r.${canalFilter}
                AND SUBSTRING(r.CODALMACEN, 1, 1) != 'G'
                ${localFilter}
            GROUP BY r.Local
            ORDER BY r.Local
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

        // 🚨 CRITICAL DEBUG: Print EVERYTHING
        console.log('\n🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
        console.log('🚨 EXECUTING TENDENCIA QUERY - SIMPLIFIED V3');
        console.log('🚨 Parameters:');
        console.log(`   startDate: ${startDate}`);
        console.log(`   endDate: ${endDate}`);
        console.log(`   kpi: ${kpi}`);
        console.log(`   canal: ${dbCanal}`);
        console.log(`   local: ${local}`);
        console.log(`   localFilter: ${localFilter}`);
        if (memberLocals && memberLocals.length > 0) {
            console.log(`   memberLocals count: ${memberLocals.length}`);
            console.log(`   First 5 members: ${memberLocals.slice(0, 5).join(', ')}`);
        }
        console.log('\n🚨 QUERY:');
        console.log(query);
        console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n');

        const result = await request.query(query);
        console.log(`📊 Tendencia returned ${result.recordset.length} records`);

        // DETAILED DEBUG: Log first 5 results to see what's happening
        console.log('\n🔍🔍🔍 DEBUGGING PER-RESTAURANT VALUES 🔍🔍🔍');
        console.log(`   Total records returned: ${result.recordset.length}`);
        if (result.recordset.length > 0) {
            console.log('   First 5 restaurants:');
            result.recordset.slice(0, 5).forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.Local}:`);
                console.log(`      PresupuestoAnual: ${r.PresupuestoAnual}`);
                console.log(`      PresupuestoAcum: ${r.PresupuestoAcum}`);
                console.log(`      RealAcum: ${r.RealAcum}`);
                console.log(`      AnteriorAcum: ${r.AnteriorAcum}`);
            });

            // Check if all values are the same
            const firstReal = result.recordset[0].RealAcum;
            const allSameReal = result.recordset.every(r => r.RealAcum === firstReal);
            if (allSameReal) {
                console.log('   ⚠️⚠️⚠️ WARNING: ALL RESTAURANTS HAVE SAME RealAcum VALUE! ⚠️⚠️⚠️');
                console.log(`   This suggests the query is NOT grouping by Local correctly`);
            } else {
                console.log('   ✅ Values vary by restaurant (good!)');
            }
        }
        console.log('🔍🔍🔍\n');

        const evaluacion = [];
        const resumen = { totalPresupuesto: 0, totalPresupuestoAcum: 0, totalReal: 0, totalAnterior: 0 };

        result.recordset.forEach(row => {
            const presupuesto = row.PresupuestoPeriodo || 0;
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


        console.log(`⚡ About to check debug condition: local='${local}', memberLocals?.length=${memberLocals?.length}, kpi='${kpi}'`);

        // SPECIAL DEBUG FOR CORPORATIVO + VENTAS - Show raw totals
        if ((local === 'Corporativo' || memberLocals?.length === 41) && kpi === 'Ventas') {
            console.log('🔥🔥🔥 RESUMEN TOTALS (Before pct calc) - Corporativo Ventas 🔥🔥🔥');
            console.log(`   resumen.totalReal: ${resumen.totalReal}`);
            console.log(`   resumen.totalPresupuestoAcum: ${resumen.totalPresupuestoAcum}`);
            console.log(`   resumen.totalPresupuesto (Annual): ${resumen.totalPresupuesto}`);
            console.log(`   Number of locales aggregated: ${result.recordset.length}`);
            console.log(`   Expected Real: ₡1,898,584,984`);
            console.log(`   Expected P.Acum: ₡2,094,959,645`);
            console.log(`   Expected %: 90.6%`);
        }

        // SPECIAL DEBUG FOR CORPORATIVO + VENTAS
        if ((local === 'Corporativo' || memberLocals?.length === 41) && kpi === 'Ventas') {
            console.log('🔥🔥🔥 DEBUGGING CORPORATIVO VENTAS (RESUMEN) 🔥🔥🔥');
            console.log(`   totalReal: ${resumen.totalReal}`);
            console.log(`   totalPresupuestoAcum: ${resumen.totalPresupuestoAcum}`);
            console.log(`   Calculation: ${resumen.totalReal} / ${resumen.totalPresupuestoAcum}`);
            console.log(`   Result: ${resumen.totalReal / resumen.totalPresupuestoAcum}`);
            console.log(`   Expected: 0.906 (90.6%)`);
            console.log(`   Actual pctPresupuesto will be: ${resumen.totalPresupuestoAcum > 0 ? (resumen.totalReal / resumen.totalPresupuestoAcum) : 0}`);
        }

        resumen.pctPresupuesto = resumen.totalPresupuestoAcum > 0 ? (resumen.totalReal / resumen.totalPresupuestoAcum) : 0;
        resumen.pctAnterior = resumen.totalAnterior > 0 ? (resumen.totalReal / resumen.totalAnterior) : 0;

        console.log('\n✅ Returning data with VERSION_QUERY_SIMPLIFIED_V3');
        console.log(`   Evaluacion records: ${evaluacion.length}`);
        console.log(`   Resumen total real: ${resumen.totalReal}\n`);

        // Build canal filter for secondary queries
        let canalFilter2 = '';
        if (useMultiChannel) {
            canalFilter2 = `Canal IN (${userAllowedCanales.map((_, i) => `@ch2_${i}`).join(', ')})`;
        } else {
            canalFilter2 = `Canal = @canal2`;
        }

        // NOTE: TQP is NOT summed from DB — it must be calculated as Ventas/Transacciones
        // We only fetch Ventas and Transacciones here, then derive TQP in JS.
        // PresupuestoPeriodo = SUM(Monto) for ALL days in the selected date range (period budget)
        const multiKpiQuery = `
            SELECT 
                Tipo,
                SUM(Monto) as PresupuestoPeriodo,
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoAcum,
                SUM(MontoReal) as RealAcum,
                SUM(CASE WHEN MontoReal > 0 THEN ${anteriorField} ELSE 0 END) as AnteriorAcum
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha BETWEEN @startDate2 AND @endDate2
                AND Año = YEAR(@endDate2) AND ${canalFilter2}
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                AND Tipo IN ('Ventas', 'Transacciones')
                ${localFilter.replace(/@ml/g, '@ml2_').replace(/@local/g, '@local2')}
            GROUP BY Tipo
        `;
        const multiReq = pool.request();
        multiReq.input('startDate2', sql.Date, startDate);
        multiReq.input('endDate2', sql.Date, endDate);
        if (useMultiChannel) {
            userAllowedCanales.forEach((ch, i) => multiReq.input(`ch2_${i}`, sql.NVarChar, ch));
        } else {
            multiReq.input('canal2', sql.VarChar, dbCanal);
        }
        // Re-bind local params with different names
        if (memberLocals && memberLocals.length > 0) {
            memberLocals.forEach((name, i) => multiReq.input(`ml2_${i}`, sql.NVarChar, name));
        } else if (local) {
            multiReq.input('local2', sql.NVarChar, local);
        }
        const multiResult = await multiReq.query(multiKpiQuery);

        console.log(`\n💫 MultiKPI Query returned ${multiResult.recordset.length} KPI types`);
        multiResult.recordset.forEach(r => {
            console.log(`   ${r.Tipo}: PresupuestoAnual=${r.PresupuestoAnual}, RealAcum=${r.RealAcum}`);
        });

        const resumenMultiKpi = {};
        multiResult.recordset.forEach(row => {
            const pPeriodo = row.PresupuestoPeriodo || 0;
            const pAcum = row.PresupuestoAcum || 0;
            const real = row.RealAcum || 0;
            const ant = row.AnteriorAcum || 0;
            const pctPpto = pAcum > 0 ? (real / pAcum) : 0;
            resumenMultiKpi[row.Tipo] = {
                totalPresupuesto: pPeriodo,
                totalPresupuestoAcum: pAcum,
                totalReal: real,
                totalAnterior: ant,
                pctPresupuesto: pctPpto,
                pctAnterior: ant > 0 ? (real / ant) : 0
            };
        });

        // Calculate TQP (Tiquete Promedio) = Ventas / Transacciones — cannot be summed from DB
        const mkVentas = resumenMultiKpi['Ventas'];
        const mkTrans = resumenMultiKpi['Transacciones'];
        if (mkVentas && mkTrans) {
            const tqpReal = mkTrans.totalReal > 0 ? mkVentas.totalReal / mkTrans.totalReal : 0;
            // Period-based TQP budget = Ventas period budget / Transacciones period budget
            const tqpPptoPeriodo = mkTrans.totalPresupuesto > 0 ? mkVentas.totalPresupuesto / mkTrans.totalPresupuesto : 0;
            const tqpPptoAcum = mkTrans.totalPresupuestoAcum > 0 ? mkVentas.totalPresupuestoAcum / mkTrans.totalPresupuestoAcum : 0;
            const tqpAnterior = mkTrans.totalAnterior > 0 ? mkVentas.totalAnterior / mkTrans.totalAnterior : 0;
            resumenMultiKpi['TQP'] = {
                totalPresupuesto: tqpPptoPeriodo,
                totalPresupuestoAcum: tqpPptoAcum,
                totalReal: tqpReal,
                totalAnterior: tqpAnterior,
                pctPresupuesto: tqpPptoAcum > 0 ? (tqpReal / tqpPptoAcum) : 0,
                pctAnterior: tqpAnterior > 0 ? (tqpReal / tqpAnterior) : 0
            };
        }
        console.log('📊 Multi-KPI summary keys:', Object.keys(resumenMultiKpi), 'rows:', multiResult.recordset.length);

        // TREND CALCULATION: Fetch previous period data to calculate trends
        let trendPresupuesto = null;
        let trendAnterior = null;
        const resumenMultiKpiWithTrends = {};

        // Check if comparativePeriod parameter exists (default to 'Month')
        const comparativePeriod = req.query.comparativePeriod || 'Month';

        // Calculate previous period dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        let prevStart, prevEnd;

        if (comparativePeriod === 'Week') {
            prevStart = new Date(start);
            prevStart.setDate(prevStart.getDate() - 7);
            prevEnd = new Date(end);
            prevEnd.setDate(prevEnd.getDate() - 7);
        } else if (comparativePeriod === 'Month') {
            prevStart = new Date(start);
            prevStart.setMonth(prevStart.getMonth() - 1);
            prevEnd = new Date(end);
            prevEnd.setMonth(prevEnd.getMonth() - 1);
        } else {  // Year
            prevStart = new Date(start);
            prevStart.setFullYear(prevStart.getFullYear() - 1);
            prevEnd = new Date(end);
            prevEnd.setFullYear(prevEnd.getFullYear() - 1);
        }

        const formatDate = (d) => d.toISOString().split('T')[0];
        const prevStartDate = formatDate(prevStart);
        const prevEndDate = formatDate(prevEnd);

        // Build canal filter for previous period query
        let canalFilter3 = '';
        if (useMultiChannel) {
            canalFilter3 = `Canal IN (${userAllowedCanales.map((_, i) => `@ch3_${i}`).join(', ')})`;
        } else {
            canalFilter3 = `Canal = @canal3`;
        }

        // Fetch previous period multi-KPI data (only Ventas & Transacciones; TQP derived in JS)
        const prevMultiKpiQuery = `
            SELECT 
                Tipo,
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoAcum,
                SUM(MontoReal) as RealAcum,
                SUM(CASE WHEN MontoReal > 0 THEN ${anteriorField} ELSE 0 END) as AnteriorAcum
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha BETWEEN @prevStartDate AND @prevEndDate
                AND Año = YEAR(@prevEndDate) AND ${canalFilter3}
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                AND Tipo IN ('Ventas', 'Transacciones')
                ${localFilter.replace(/@ml/g, '@ml3_').replace(/@local/g, '@local3')}
            GROUP BY Tipo
        `;
        const prevMultiReq = pool.request();
        prevMultiReq.input('prevStartDate', sql.Date, prevStartDate);
        prevMultiReq.input('prevEndDate', sql.Date, prevEndDate);
        if (useMultiChannel) {
            userAllowedCanales.forEach((ch, i) => prevMultiReq.input(`ch3_${i}`, sql.NVarChar, ch));
        } else {
            prevMultiReq.input('canal3', sql.VarChar, dbCanal);
        }
        if (memberLocals && memberLocals.length > 0) {
            memberLocals.forEach((name, i) => prevMultiReq.input(`ml3_${i}`, sql.NVarChar, name));
        } else if (local) {
            prevMultiReq.input('local3', sql.NVarChar, local);
        }
        const prevMultiResult = await prevMultiReq.query(prevMultiKpiQuery);

        // Build previous period KPI map
        const prevKpiMap = {};
        prevMultiResult.recordset.forEach(row => {
            const pAcum = row.PresupuestoAcum || 0;
            const real = row.RealAcum || 0;
            const ant = row.AnteriorAcum || 0;
            prevKpiMap[row.Tipo] = {
                totalPresupuestoAcum: pAcum,
                totalReal: real,
                totalAnterior: ant,
                pctPresupuesto: pAcum > 0 ? (real / pAcum) : 0,
                pctAnterior: ant > 0 ? (real / ant) : 0
            };
        });

        // Derive previous TQP from previous Ventas / Transacciones
        const pvVentas = prevKpiMap['Ventas'];
        const pvTrans = prevKpiMap['Transacciones'];
        if (pvVentas && pvTrans) {
            const pvTqpReal = pvTrans.totalReal > 0 ? pvVentas.totalReal / pvTrans.totalReal : 0;
            const pvTqpPptoAcum = pvTrans.totalPresupuestoAcum > 0 ? pvVentas.totalPresupuestoAcum / pvTrans.totalPresupuestoAcum : 0;
            const pvTqpAnterior = pvTrans.totalAnterior > 0 ? pvVentas.totalAnterior / pvTrans.totalAnterior : 0;
            prevKpiMap['TQP'] = {
                pctPresupuesto: pvTqpPptoAcum > 0 ? (pvTqpReal / pvTqpPptoAcum) : 0,
                pctAnterior: pvTqpAnterior > 0 ? (pvTqpReal / pvTqpAnterior) : 0
            };
        }

        // Calculate trends for each KPI
        Object.keys(resumenMultiKpi).forEach(kpi => {
            const current = resumenMultiKpi[kpi];
            const prev = prevKpiMap[kpi];

            let trendPpto = null;
            let trendAnt = null;

            if (prev) {
                // Trend for Presupuesto
                const diffPpto = current.pctPresupuesto - prev.pctPresupuesto;
                const pctChangePpto = prev.pctPresupuesto !== 0 ? (diffPpto / prev.pctPresupuesto) * 100 : 0;
                trendPpto = {
                    direction: diffPpto > 0.001 ? 'up' : diffPpto < -0.001 ? 'down' : 'neutral',
                    percentage: pctChangePpto,
                    previousValue: prev.pctPresupuesto
                };

                // Trend for Anterior
                const diffAnt = current.pctAnterior - prev.pctAnterior;
                const pctChangeAnt = prev.pctAnterior !== 0 ? (diffAnt / prev.pctAnterior) * 100 : 0;
                trendAnt = {
                    direction: diffAnt > 0.001 ? 'up' : diffAnt < -0.001 ? 'down' : 'neutral',
                    percentage: pctChangeAnt,
                    previousValue: prev.pctAnterior
                };
            }

            resumenMultiKpiWithTrends[kpi] = {
                ...current,
                trendPresupuesto: trendPpto,
                trendAnterior: trendAnt
            };
        });

        // Calculate trends for main resumen (using primary KPI data)
        if (prevKpiMap[kpi]) {
            const currentPctPpto = resumen.pctPresupuesto;
            const currentPctAnt = resumen.pctAnterior;
            const prevPctPpto = prevKpiMap[kpi].pctPresupuesto;
            const prevPctAnt = prevKpiMap[kpi].pctAnterior;

            const diffPpto = currentPctPpto - prevPctPpto;
            const pctChangePpto = prevPctPpto !== 0 ? (diffPpto / prevPctPpto) * 100 : 0;
            trendPresupuesto = {
                direction: diffPpto > 0.001 ? 'up' : diffPpto < -0.001 ? 'down' : 'neutral',
                percentage: pctChangePpto,
                previousValue: prevPctPpto
            };

            const diffAnt = currentPctAnt - prevPctAnt;
            const pctChangeAnt = prevPctAnt !== 0 ? (diffAnt / prevPctAnt) * 100 : 0;
            trendAnterior = {
                direction: diffAnt > 0.001 ? 'up' : diffAnt < -0.001 ? 'down' : 'neutral',
                percentage: pctChangeAnt,
                previousValue: prevPctAnt
            };
        }

        console.log('\n🎯 FINAL DATA BEING SENT TO FRONTEND:');
        console.log(`   Total evaluacion records: ${evaluacion.length}`);
        console.log('   First 3 records:');
        evaluacion.slice(0, 3).forEach((e, i) => {
            console.log(`   ${i + 1}. ${e.local}: real=${e.real}, presupuestoAcum=${e.presupuestoAcum}`);
        });
        console.log('🎯\n');

        res.json({
            evaluacion: evaluacion.sort((a, b) => a.local.localeCompare(b.local)),
            resumen: {
                ...resumen,
                trendPresupuesto,
                trendAnterior
            },
            resumenMultiKpi: resumenMultiKpiWithTrends,
            parameters: { startDate, endDate, kpi, channel, local: local || 'all', yearType, isGroup: memberLocals !== null, comparativePeriod }
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

/**
 * GET /api/tendencia/resumen-grupos
 * 
 * Returns aggregated KPI data per group.
 * Receives: startDate, endDate, kpi, groups (comma-separated), yearType, channel
 * For each group, resolves member stores and sums their data.
 */
async function getResumenGrupos(req, res) {
    console.log('📊 getResumenGrupos called');
    console.log('   Query params:', req.query);
    try {
        const { startDate, endDate, kpi = 'Ventas', groups: groupsParam, yearType = 'anterior', channel = 'Total' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }
        if (!groupsParam) {
            return res.json({ grupos: [] });
        }

        const pool = await poolPromise;
        const dbCanal = channel === 'Total' ? 'Todos' : channel;
        const anteriorField = yearType === 'ajustado' ? 'MontoAnteriorAjustado' : 'MontoAnterior';

        // For users with limited channels
        const userAllowedCanales = req.user?.allowedCanales || [];
        const allCanales = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];
        const hasLimitedChannels = userAllowedCanales.length > 0 && userAllowedCanales.length < allCanales.length;
        const useMultiChannel = dbCanal === 'Todos' && hasLimitedChannels;

        const groupNames = groupsParam.split(',').map(g => g.trim()).filter(Boolean);

        // Resolve member stores for each group in parallel
        const groupData = await Promise.all(groupNames.map(async (groupName) => {
            try {
                // Step 1: Get IDGRUPO
                const idGrupoResult = await pool.request()
                    .input('gname', sql.NVarChar, groupName)
                    .query(`SELECT GA.IDGRUPO FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA WHERE GA.CODVISIBLE = 20 AND GA.DESCRIPCION = @gname`);

                if (idGrupoResult.recordset.length === 0) {
                    console.log(`⚠️ No group found for: "${groupName}"`);
                    return { grupo: groupName, presupuestoAcum: 0, real: 0, anterior: 0, pctPresupuesto: 0, pctAnterior: 0, memberCount: 0 };
                }

                const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);

                // Step 2: Get member CODALMACEN
                const memberCodesReq = pool.request();
                idGrupos.forEach((id, i) => memberCodesReq.input(`idgrupo${i}`, sql.Int, id));
                const memberCodesResult = await memberCodesReq.query(
                    `SELECT DISTINCT GL.CODALMACEN FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL WHERE GL.IDGRUPO IN (${idGrupos.map((_, i) => `@idgrupo${i}`).join(', ')})`
                );
                const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN);

                if (memberCodes.length === 0) {
                    return { grupo: groupName, presupuestoAcum: 0, real: 0, anterior: 0, pctPresupuesto: 0, pctAnterior: 0, memberCount: 0 };
                }

                // Step 3: Get Local names
                const localsReq = pool.request();
                localsReq.input('endDate_l', sql.Date, endDate);
                memberCodes.forEach((code, i) => localsReq.input(`mcode${i}`, sql.NVarChar, code));
                const localsResult = await localsReq.query(
                    `SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE Año = YEAR(@endDate_l) AND CODALMACEN IN (${memberCodes.map((_, i) => `@mcode${i}`).join(', ')}) AND SUBSTRING(CODALMACEN, 1, 1) != 'G'`
                );
                const memberLocals = localsResult.recordset.map(r => r.Local);

                if (memberLocals.length === 0) {
                    return { grupo: groupName, presupuestoAcum: 0, real: 0, anterior: 0, pctPresupuesto: 0, pctAnterior: 0, memberCount: 0 };
                }

                // Step 4: Aggregate data for this group
                const localPh = memberLocals.map((_, i) => `@ml${i}`).join(', ');
                let canalFilter;
                if (useMultiChannel) {
                    canalFilter = `Canal IN (${userAllowedCanales.map((_, i) => `@ch${i}`).join(', ')})`;
                } else {
                    canalFilter = `Canal = @canal`;
                }

                const aggReq = pool.request();
                aggReq.input('startDate_a', sql.Date, startDate);
                aggReq.input('endDate_a', sql.Date, endDate);
                aggReq.input('kpi_a', sql.VarChar, kpi);
                if (useMultiChannel) {
                    userAllowedCanales.forEach((ch, i) => aggReq.input(`ch${i}`, sql.NVarChar, ch));
                } else {
                    aggReq.input('canal', sql.NVarChar, dbCanal);
                }
                memberLocals.forEach((name, i) => aggReq.input(`ml${i}`, sql.NVarChar, name));

                const aggResult = await aggReq.query(`
                    SELECT
                        SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoAcum,
                        SUM(MontoReal) as RealAcum,
                        SUM(CASE WHEN MontoReal > 0 THEN ${anteriorField} ELSE 0 END) as AnteriorAcum
                    FROM RSM_ALCANCE_DIARIO
                    WHERE Fecha BETWEEN @startDate_a AND @endDate_a
                        AND Año = YEAR(@endDate_a)
                        AND Tipo = @kpi_a
                        AND ${canalFilter}
                        AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                        AND Local IN (${localPh})
                `);

                const row = aggResult.recordset[0];
                const presupuestoAcum = row?.PresupuestoAcum || 0;
                const real = row?.RealAcum || 0;
                const anterior = row?.AnteriorAcum || 0;

                return {
                    grupo: groupName,
                    presupuestoAcum,
                    real,
                    anterior,
                    pctPresupuesto: presupuestoAcum > 0 ? (real / presupuestoAcum) : 0,
                    pctAnterior: anterior > 0 ? (real / anterior) : 0,
                    memberCount: memberLocals.length
                };
            } catch (err) {
                console.error(`Error processing group "${groupName}":`, err.message);
                return { grupo: groupName, presupuestoAcum: 0, real: 0, anterior: 0, pctPresupuesto: 0, pctAnterior: 0, memberCount: 0, error: err.message };
            }
        }));

        console.log(`✅ getResumenGrupos: returning data for ${groupData.length} groups`);
        res.json({ grupos: groupData });

    } catch (error) {
        console.error('Error in getResumenGrupos:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getTendenciaData, getResumenCanal, getResumenGrupos };
