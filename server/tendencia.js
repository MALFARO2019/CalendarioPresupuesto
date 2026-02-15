const { sql, poolPromise } = require('./db');

/**
 * GET /api/tendencia
 * Returns performance trend data for all stores and groups
 * 
 * Query params:
 * - startDate: YYYY-MM-DD
 * - endDate: YYYY-MM-DD
 * - kpi: Ventas | Transacciones | TQP
 * - channel: Total | Salón | Llevar | UberEats
 */
async function getTendenciaData(req, res) {
    console.log('📊 getTendenciaData called');
    console.log('   Query params:', req.query);
    try {
        const { startDate, endDate, kpi = 'Ventas', channel = 'Total' } = req.query;

        if (!startDate || !endDate) {
            console.log('❌ Missing required params');
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        console.log('🔌 Connecting to database...');
        const pool = await poolPromise;
        console.log('✅ Database connected');

        // Get current year data (2026)
        const currentYearQuery = `
            SELECT 
                CODALMACEN,
                CODAGRUPACION,
                CANAL,
                SUM(Monto) as Monto2026,
                SUM(MontoReal) as Real2026,
                COUNT(*) as DaysWithData
            FROM RSM_ALCANCE_DIARIO
            WHERE FECHA BETWEEN @startDate AND @endDate
                AND AÑO = YEAR(@endDate)
                AND KPI = @kpi
                ${channel !== 'Total' ? 'AND CANAL = @channel' : ''}
            GROUP BY CODALMACEN, CODAGRUPACION, CANAL
        `;

        // Get previous year data (2025) - same date range
        const previousYearQuery = `
            SELECT 
                CODALMACEN,
                CODAGRUPACION,
                CANAL,
                SUM(Monto) as Monto2025,
                SUM(MontoReal) as Real2025
            FROM RSM_ALCANCE_DIARIO
            WHERE FECHA BETWEEN DATEADD(year, -1, @startDate) AND DATEADD(year, -1, @endDate)
                AND AÑO = YEAR(@endDate) - 1
                AND KPI = @kpi
                ${channel !== 'Total' ? 'AND CANAL = @channel' : ''}
            GROUP BY CODALMACEN, CODAGRUPACION, CANAL
        `;

        // Create separate requests for each query
        const currentRequest = pool.request();
        currentRequest.input('startDate', sql.Date, startDate);
        currentRequest.input('endDate', sql.Date, endDate);
        currentRequest.input('kpi', sql.VarChar, kpi);
        if (channel !== 'Total') {
            currentRequest.input('channel', sql.VarChar, channel);
        }

        const previousRequest = pool.request();
        previousRequest.input('startDate', sql.Date, startDate);
        previousRequest.input('endDate', sql.Date, endDate);
        previousRequest.input('kpi', sql.VarChar, kpi);
        if (channel !== 'Total') {
            previousRequest.input('channel', sql.VarChar, channel);
        }

        const [currentResult, previousResult] = await Promise.all([
            currentRequest.query(currentYearQuery),
            previousRequest.query(previousYearQuery)
        ]);

        // Merge results by CODALMACEN and CANAL
        const dataMap = new Map();

        currentResult.recordset.forEach(row => {
            const key = `${row.CODALMACEN}_${row.CANAL}`;
            dataMap.set(key, {
                codAlmacen: row.CODALMACEN,
                codAgrupacion: row.CODAGRUPACION,
                canal: row.CANAL,
                real2026: row.Real2026 || 0,
                presupuesto2026: row.Monto2026 || 0,
                real2025: 0,
                daysWithData: row.DaysWithData || 0
            });
        });

        previousResult.recordset.forEach(row => {
            const key = `${row.CODALMACEN}_${row.CANAL}`;
            const existing = dataMap.get(key);
            if (existing) {
                existing.real2025 = row.Real2025 || 0;
            } else {
                dataMap.set(key, {
                    codAlmacen: row.CODALMACEN,
                    codAgrupacion: row.CODAGRUPACION,
                    canal: row.CANAL,
                    real2026: 0,
                    presupuesto2026: 0,
                    real2025: row.Real2025 || 0,
                    daysWithData: 0
                });
            }
        });

        // Calculate percentages and aggregate
        const evaluacion = [];
        const resumen = {
            totalReal2025: 0,
            totalReal2026: 0,
            totalPresupuesto2026: 0
        };

        dataMap.forEach(data => {
            const pctVs2025 = data.real2025 > 0
                ? ((data.real2026 - data.real2025) / data.real2025)
                : 0;
            const pctVsPresupuesto = data.presupuesto2026 > 0
                ? ((data.real2026 - data.presupuesto2026) / data.presupuesto2026)
                : 0;

            evaluacion.push({
                codAlmacen: data.codAlmacen,
                codAgrupacion: data.codAgrupacion,
                canal: data.canal,
                real2025: data.real2025,
                real2026: data.real2026,
                presupuesto2026: data.presupuesto2026,
                pctVs2025,
                pctVsPresupuesto,
                daysWithData: data.daysWithData
            });

            resumen.totalReal2025 += data.real2025;
            resumen.totalReal2026 += data.real2026;
            resumen.totalPresupuesto2026 += data.presupuesto2026;
        });

        resumen.pctVs2025 = resumen.totalReal2025 > 0
            ? ((resumen.totalReal2026 - resumen.totalReal2025) / resumen.totalReal2025)
            : 0;
        resumen.pctVsPresupuesto = resumen.totalPresupuesto2026 > 0
            ? ((resumen.totalReal2026 - resumen.totalPresupuesto2026) / resumen.totalPresupuesto2026)
            : 0;

        res.json({
            evaluacion: evaluacion.sort((a, b) => a.codAlmacen.localeCompare(b.codAlmacen)),
            resumen,
            parameters: {
                startDate,
                endDate,
                kpi,
                channel
            }
        });

    } catch (error) {
        console.error('Error in getTendenciaData:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getTendenciaData };
