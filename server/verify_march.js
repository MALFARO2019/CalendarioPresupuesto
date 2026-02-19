const { poolPromise, sql } = require('./db');

async function verifyMarchData() {
    try {
        console.log('\n🔍 ========== VERIFICANDO DATOS DE MARZO ==========\n');

        const pool = await poolPromise;

        // Query: Datos de marzo
        console.log('📊 Resumen de marzo:\n');
        const query = `
            SELECT 
                COUNT(DISTINCT Dia) as TotalDias,
                COUNT(DISTINCT CASE WHEN MontoReal > 0 THEN Dia END) as DiasConDatos,
                SUM(Monto) as PresupuestoTotal,
                SUM(MontoReal) as RealTotal,
                SUM(MontoAnterior) as AnteriorTotal,
                MIN(Dia) as PrimerDia,
                MAX(Dia) as UltimoDia
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026 
                AND Mes = 3
                AND Canal = 'Todos'
                AND Tipo = 'Ventas'
                AND Local = 'Corporativo'
        `;

        const result = await pool.request().query(query);
        const data = result.recordset[0];

        console.log(`   Total días con registros: ${data.TotalDias} días`);
        console.log(`   Días con datos reales: ${data.DiasConDatos} días`);
        console.log(`   Rango de días: ${data.PrimerDia} a ${data.UltimoDia}`);
        console.log(`   Presupuesto Total: ₡${data.PresupuestoTotal?.toLocaleString() || 0}`);
        console.log(`   Real Total: ₡${data.RealTotal?.toLocaleString() || 0}`);
        console.log(`   Año Anterior Total: ₡${data.AnteriorTotal?.toLocaleString() || 0}`);

        console.log('\n💡 Análisis:');
        if (data.TotalDias === 0) {
            console.log('   ❌ No hay datos de marzo en la base de datos');
        } else if (data.TotalDias < 31) {
            console.log(`   ⚠️  Solo hay ${data.TotalDias} días de marzo (debería haber 31)`);
        } else {
            console.log('   ✅ Hay 31 días de marzo en la base de datos');
        }

        console.log('\n====================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

verifyMarchData();
