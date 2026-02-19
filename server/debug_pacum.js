// TEMPORARY DEBUG SCRIPT
// Compare values between Anual and Tendencia

const { sql, poolPromise } = require('./db');

async function debugPAcum() {
    try {
        const pool = await poolPromise;
        const startDate = '2026-01-01';
        const endDate = '2026-02-15';

        console.log('\n🔍 ========== DEBUGGING P. ACUM DISCREPANCY ==========\n');

        // 1. Get data like /api/budget does (NO date filtering in SQL)
        const budgetQuery = `
            SELECT Fecha, Mes, Dia, MontoReal, Monto
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026
                AND Local IN (SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE CODALMACEN IN (
                    SELECT CODALMACEN FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN WHERE IDGRUPO = 1
                ))
                AND Tipo = 'Ventas'
                AND Canal = 'Todos'
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            ORDER BY Fecha
        `;

        const budgetResult = await pool.request().query(budgetQuery);
        console.log(`📊 /api/budget style: Total records = ${budgetResult.recordset.length}`);

        // Filter by date in JavaScript (like AnnualCalendar does)
        const filteredBudget = budgetResult.recordset.filter(d => d.Fecha <= endDate);
        console.log(`   After JS filter (≤${endDate}): ${filteredBudget.length} records`);

        // Calculate P. Acum (sum Monto WHERE MontoReal > 0)
        const pAcumBudget = filteredBudget
            .filter(d => d.MontoReal > 0)
            .reduce((sum, d) => sum + (d.Monto || 0), 0);
        console.log(`   P. Acum (Budget style) = ₡${pAcumBudget.toLocaleString()}`);
        console.log(`   Days with MontoReal > 0: ${filteredBudget.filter(d => d.MontoReal > 0).length}\n`);

        // 2. Get data like /api/tendencia does (WITH date filtering in SQL)
        const tendenciaQuery = `
            SELECT Fecha, SUM(Monto) as Monto, SUM(MontoReal) as MontoReal
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha BETWEEN @startDate AND @endDate
                AND Año = 2026
                AND Local IN (SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE CODALMACEN IN (
                    SELECT CODALMACEN FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN WHERE IDGRUPO = 1
                ))
                AND Tipo = 'Ventas'
                AND Canal = 'Todos'
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            GROUP BY Fecha
            ORDER BY Fecha
        `;

        const tendenciaResult = await pool.request()
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(tendenciaQuery);

        console.log(`📊 /api/tendencia style: Total records = ${tendenciaResult.recordset.length}`);

        // Calculate P. Acum (sum Monto WHERE MontoReal > 0)
        const pAcumTendencia = tendenciaResult.recordset
            .filter(d => d.MontoReal > 0)
            .reduce((sum, d) => sum + (d.Monto || 0), 0);
        console.log(`   P. Acum (Tendencia style) = ₡${pAcumTendencia.toLocaleString()}`);
        console.log(`   Days with MontoReal > 0: ${tendenciaResult.recordset.filter(d => d.MontoReal > 0).length}\n`);

        // 3. Show difference
        const diff = pAcumBudget - pAcumTendencia;
        const diffPct = (diff / pAcumTendencia) * 100;
        console.log(`\n💡 DIFFERENCE:`);
        console.log(`   Absolute: ₡${diff.toLocaleString()}`);
        console.log(`   Percentage: ${diffPct.toFixed(2)}%`);

        console.log('\n🔍 ========== END DEBUG ==========\n');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

debugPAcum();
