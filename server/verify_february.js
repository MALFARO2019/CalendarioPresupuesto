const { poolPromise, sql } = require('./db');

async function verifyFebruaryData() {
    try {
        console.log('\n🔍 ========== VERIFICANDO DATOS DE FEBRERO ==========\n');

        const pool = await poolPromise;

        // Query 1: Días individuales de febrero
        console.log('📊 Días individuales de febrero con presupuesto:\n');
        const query1 = `
            SELECT 
                Dia,
                COUNT(*) as NumRegistros,
                SUM(CASE WHEN MontoReal > 0 THEN 1 ELSE 0 END) as DiasConDatosReales,
                SUM(Monto) as TotalMonto,
                SUM(MontoReal) as TotalMontoReal
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 
                AND Mes = 2
                AND Canal = 'Todos'
                AND Tipo = 'Ventas'
                AND Local = 'Corporativo'
            GROUP BY Dia
            ORDER BY Dia
        `;

        const result1 = await pool.request().query(query1);

        result1.recordset.forEach(row => {
            const hasData = row.DiasConDatosReales > 0 ? '✓' : '✗';
            console.log(`   Día ${String(row.Dia).padStart(2, '0')}: ${hasData} | Presupuesto: ₡${row.TotalMonto.toLocaleString()} | Real: ₡${row.TotalMontoReal.toLocaleString()}`);
        });

        // Query 2: Totales
        console.log('\n📈 Totales de febrero:\n');
        const query2 = `
            SELECT 
                COUNT(DISTINCT Dia) as TotalDiasConPresupuesto,
                COUNT(DISTINCT CASE WHEN MontoReal > 0 THEN Dia END) as TotalDiasConDatosReales,
                SUM(Monto) as PresupuestoTotal,
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoAcumulado,
                SUM(MontoReal) as RealTotal
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 
                AND Mes = 2
                AND Canal = 'Todos'
                AND Tipo = 'Ventas'
                AND Local = 'Corporativo'
        `;

        const result2 = await pool.request().query(query2);
        const totals = result2.recordset[0];

        console.log(`   Total días con presupuesto: ${totals.TotalDiasConPresupuesto} días`);
        console.log(`   Total días con datos reales: ${totals.TotalDiasConDatosReales} días`);
        console.log(`   Presupuesto Total (P. Mes): ₡${totals.PresupuestoTotal.toLocaleString()}`);
        console.log(`   Presupuesto Acumulado (P. Acum): ₡${totals.PresupuestoAcumulado.toLocaleString()}`);
        console.log(`   Real Total: ₡${totals.RealTotal.toLocaleString()}`);

        console.log('\n💡 Análisis:');
        if (totals.TotalDiasConPresupuesto === 29) {
            console.log('   ✅ La base de datos tiene los 29 días de febrero con presupuesto');
            console.log('   ✅ P. Mes debería ser diferente de P. Acum');
        } else {
            console.log(`   ❌ La base de datos solo tiene ${totals.TotalDiasConPresupuesto} días de febrero`);
            console.log('   ❌ P. Mes será igual a P. Acum porque faltan días con presupuesto');
            console.log(`   📌 Faltan ${29 - totals.TotalDiasConPresupuesto} días en la base de datos`);
        }

        if (totals.PresupuestoTotal === totals.PresupuestoAcumulado) {
            console.log('   ⚠️  Presupuesto Total = Presupuesto Acumulado (problema confirmado)');
        } else {
            console.log('   ✅ Presupuesto Total ≠ Presupuesto Acumulado (valores correctos)');
        }

        console.log('\n====================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

verifyFebruaryData();
