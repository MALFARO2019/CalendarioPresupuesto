const { poolPromise, sql } = require('./db');

async function verifyAlajuelaFebruary() {
    try {
        console.log('\n🔍 ========== VERIFICANDO DATOS DE ALAJUELA - FEBRERO ==========\n');

        const pool = await poolPromise;

        // Query: Datos de Alajuela en febrero
        console.log('📊 Resumen de febrero - Alajuela:\n');
        const query = `
            SELECT 
                COUNT(DISTINCT Dia) as TotalDias,
                COUNT(DISTINCT CASE WHEN MontoReal > 0 THEN Dia END) as DiasConDatos,
                SUM(Monto) as PresupuestoTotal,
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) as PresupuestoConDatos,
                SUM(MontoReal) as RealTotal,
                SUM(MontoAnterior) as AnteriorTotal,
                MIN(Dia) as PrimerDia,
                MAX(Dia) as UltimoDia
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 
                AND Mes = 2
                AND Canal = 'Todos'
                AND Tipo = 'Ventas'
                AND Local = 'Alajuela'
        `;

        const result = await pool.request().query(query);
        const data = result.recordset[0];

        console.log(`   Total días con registros: ${data.TotalDias} días`);
        console.log(`   Días con datos reales: ${data.DiasConDatos} días`);
        console.log(`   Rango de días: ${data.PrimerDia} a ${data.UltimoDia}`);
        console.log(`   Presupuesto Total (P. MES): ₡${data.PresupuestoTotal?.toLocaleString() || 0}`);
        console.log(`   Presupuesto Con Datos (P. ACUM): ₡${data.PresupuestoConDatos?.toLocaleString() || 0}`);
        console.log(`   Real Total: ₡${data.RealTotal?.toLocaleString() || 0}`);
        console.log(`   Año Anterior Total: ₡${data.AnteriorTotal?.toLocaleString() || 0}`);

        console.log('\n💡 Análisis:');
        const expectedPMes = 57770160.8;
        const actualPMes = data.PresupuestoTotal || 0;
        const diff = Math.abs(expectedPMes - actualPMes);

        if (diff < 100) {
            console.log(`   ✅ Presupuesto Total coincide con el esperado: ₡${expectedPMes.toLocaleString()}`);
        } else {
            console.log(`   ❌ Presupuesto Total NO coincide:`);
            console.log(`      Esperado: ₡${expectedPMes.toLocaleString()}`);
            console.log(`      Real: ₡${actualPMes.toLocaleString()}`);
            console.log(`      Diferencia: ₡${diff.toLocaleString()}`);
        }

        if (data.TotalDias < 28) {
            console.log(`   ⚠️  Solo hay ${data.TotalDias} días en la BD (deberían ser 28)`);
        }

        console.log('\n====================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

verifyAlajuelaFebruary();
