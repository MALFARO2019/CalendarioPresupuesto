/**
 * CORRECCIÓN: El pico debe estar en 15/08/2026 (el feriado mismo)
 * 
 * Cambios:
 *  1. Eliminar IDEVENTO=34 (era 14/08/2026 → erróneo)
 *  2. Crear nuevo evento: 15/08/2026 → 15/08/2025 (feriado mismo año anterior)
 *  3. Mantener IDEVENTO=35 (21/08/2026 → 22/08/2025, viernes normal, correcto)
 */
const sql = require('mssql');

const config = {
    server: '10.29.1.14',
    database: 'RP_BI_RESUMENES',
    user: 'sa',
    password: 'masterkey',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000
};

async function main() {
    const pool = await sql.connect(config);
    const tx = pool.transaction();
    await tx.begin();
    try {
        // 1. Eliminar evento 34 (incorrecto — apuntaba al 14/08)
        console.log('→ Eliminando IDEVENTO=34 (14/08/2026, incorrecto)...');
        await new sql.Request(tx).query(
            'DELETE FROM DIM_EVENTOS_FECHAS WHERE IDEVENTO = 34'
        );
        await new sql.Request(tx).query(
            'DELETE FROM DIM_EVENTOS WHERE IDEVENTO = 34'
        );
        console.log('  ✅ Evento 34 eliminado');

        // 2. Crear evento correcto: 15/08/2026 → 15/08/2025 (el feriado mismo)
        const ordenRes = await new sql.Request(tx).query(
            'SELECT ISNULL(MAX(ORDEN), 0) + 1 AS next FROM DIM_EVENTOS'
        );
        const nextOrden = ordenRes.recordset[0].next;

        console.log('\n→ Insertando evento correcto: 15/08/2026 → 15/08/2025...');
        const ins = await new sql.Request(tx).query(`
            INSERT INTO DIM_EVENTOS (EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO, ORDEN)
            VALUES (N'Feriado 15 Agosto (Asunción) - 2025 y 2026', 'S', 'S', 'N', ${nextOrden});
            SELECT SCOPE_IDENTITY() AS newId;
        `);
        const newId = ins.recordset[0].newId;
        console.log(`  ✅ IDEVENTO creado: ${newId}`);

        // Registro base (2025) — datos históricos fuente de los pesos
        await new sql.Request(tx).input('id', sql.Int, newId).query(`
            INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
            VALUES (@id, NULL, '2025-08-15', NULL, NULL)
        `);
        // Registro target (2026) — día que recibe el override de pesos
        await new sql.Request(tx).input('id', sql.Int, newId).query(`
            INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
            VALUES (@id, NULL, '2026-08-15', NULL, NULL)
        `);
        console.log('  ✅ DIM_EVENTOS_FECHAS: 2025-08-15 y 2026-08-15 insertados');

        // 3. Confirmar estado del evento 35 (debe seguir activo)
        const ev35 = await new sql.Request(tx).query(
            'SELECT IDEVENTO, EVENTO FROM DIM_EVENTOS WHERE IDEVENTO = 35'
        );
        console.log('\n→ Verificando IDEVENTO=35 (21/08/2026 → 22/08/2025):');
        if (ev35.recordset.length > 0) {
            console.log('  ✅ Activo:', ev35.recordset[0].EVENTO);
        } else {
            console.log('  ⚠️  No encontrado, verificar manualmente');
        }

        await tx.commit();

        console.log('\n============================================================');
        console.log('Estado final de eventos agosto 2026:');
        console.log(`  IDEVENTO ${newId}: 15/08/2026 → 15/08/2025 (feriado, ₡73M) ✅ PICO`);
        console.log('  IDEVENTO 35: 21/08/2026 → 22/08/2025 (viernes normal) ✅ NORMALIZADO');
        console.log('  IDEVENTO 34: ELIMINADO ✅');
        console.log('============================================================');
        console.log('\n⏳ Listo para recalcular el presupuesto');

    } catch (err) {
        await tx.rollback();
        console.error('❌ Rollback ejecutado:', err.message);
        throw err;
    } finally {
        await pool.close();
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
