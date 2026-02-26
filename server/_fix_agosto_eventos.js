/**
 * FIX: Registro de eventos agosto 2026 en DIM_EVENTOS_FECHAS
 * 
 * Problema: El SP usa occurrence-based mapping que mapea
 *   - 14/08/2026 (2do viernes Aug26) → 08/08/2025 (2do viernes Aug25, normal ₡39M)
 *   - 21/08/2026 (3er viernes Aug26) → 15/08/2025 (3er viernes Aug25, FERIADO ₡73M)
 *
 * El Año Anterior Ajustado (nearest-weekday) mapea:
 *   - 14/08/2026 → 15/08/2025 (feriado, alta venta ₡73M) ← pico en AñoAntAjust
 *   - 21/08/2026 → 22/08/2025 (viernes normal ₡38M)
 *
 * Fix: registrar eventos de override para que los pesos del budget
 *      coincidan con el Año Anterior Ajustado:
 *   - Evento A: 14/08/2026 usa pesos de 15/08/2025 (feriado = pico correcto)
 *   - Evento B: 21/08/2026 usa pesos de 22/08/2025 (viernes normal correcto)
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

    // ── Limpiar posibles inserciones previas de este fix ──────────────────
    console.log('Verificando si ya existen eventos de fix-agosto...');
    const exist = await pool.request().query(`
        SELECT IDEVENTO, EVENTO FROM DIM_EVENTOS
        WHERE EVENTO LIKE '%Viernes 15-Ago-2025 a 14-Ago-2026%'
           OR EVENTO LIKE '%Viernes 22-Ago-2025 a 21-Ago-2026%'
    `);
    if (exist.recordset.length > 0) {
        console.log('⚠️  Los eventos ya existen. Abortando para no duplicar:');
        exist.recordset.forEach(r => console.log('  ', r));
        await pool.close();
        return;
    }

    const tx = pool.transaction();
    await tx.begin();
    try {
        // ── Obtener próximo ORDEN ─────────────────────────────────────────
        const ordenRes = await new sql.Request(tx)
            .query('SELECT ISNULL(MAX(ORDEN), 0) + 1 AS next FROM DIM_EVENTOS');
        let nextOrden = ordenRes.recordset[0].next;

        // ═══════════════════════════════════════════════════════════════════
        // EVENTO A: 14/08/2026 → pesos de 15/08/2025 (feriado, ventas altas)
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n→ Insertando Evento A (14-Ago-2026 usa base 15-Ago-2025)...');
        const insEvA = await new sql.Request(tx).query(`
            INSERT INTO DIM_EVENTOS (EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO, ORDEN)
            VALUES (N'Viernes 15-Ago-2025 a 14-Ago-2026 (feriado vispera)', 'S', 'S', 'N', ${nextOrden});
            SELECT SCOPE_IDENTITY() AS newId;
        `);
        const idEvA = insEvA.recordset[0].newId;
        console.log(`  ✅ IDEVENTO creado: ${idEvA}`);

        // Par 2025 (base year — datos fuente de pesos)
        await new sql.Request(tx)
            .input('id', sql.Int, idEvA)
            .query(`INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
                    VALUES (@id, NULL, '2025-08-15', NULL, NULL)`);
        // Par 2026 (target — día que se sobreescribe)
        await new sql.Request(tx)
            .input('id', sql.Int, idEvA)
            .query(`INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
                    VALUES (@id, NULL, '2026-08-14', NULL, NULL)`);
        console.log('  ✅ DIM_EVENTOS_FECHAS: 2025-08-15 y 2026-08-14 insertados');

        // ═══════════════════════════════════════════════════════════════════
        // EVENTO B: 21/08/2026 → pesos de 22/08/2025 (viernes normal)
        // ═══════════════════════════════════════════════════════════════════
        nextOrden++;
        console.log('\n→ Insertando Evento B (21-Ago-2026 usa base 22-Ago-2025)...');
        const insEvB = await new sql.Request(tx).query(`
            INSERT INTO DIM_EVENTOS (EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO, ORDEN)
            VALUES (N'Viernes 22-Ago-2025 a 21-Ago-2026 (ajuste semana feriado)', 'N', 'S', 'N', ${nextOrden});
            SELECT SCOPE_IDENTITY() AS newId;
        `);
        const idEvB = insEvB.recordset[0].newId;
        console.log(`  ✅ IDEVENTO creado: ${idEvB}`);

        // Par 2025 (base year)
        await new sql.Request(tx)
            .input('id', sql.Int, idEvB)
            .query(`INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
                    VALUES (@id, NULL, '2025-08-22', NULL, NULL)`);
        // Par 2026 (target)
        await new sql.Request(tx)
            .input('id', sql.Int, idEvB)
            .query(`INSERT INTO DIM_EVENTOS_FECHAS (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen)
                    VALUES (@id, NULL, '2026-08-21', NULL, NULL)`);
        console.log('  ✅ DIM_EVENTOS_FECHAS: 2025-08-22 y 2026-08-21 insertados');

        await tx.commit();
        console.log('\n✅ Eventos insertados correctamente. Listo para recalcular.');
        console.log('\n============================================================');
        console.log('EFECTO ESPERADO después de recalcular:');
        console.log('  14/08/2026 → Presupuesto reflejará el pico del feriado');
        console.log('               (base: 15/08/2025 = ₡73M en vez de ₡39M)');
        console.log('  21/08/2026 → Presupuesto usará un viernes normal');
        console.log('               (base: 22/08/2025 = ₡38M en vez de 15/08/2025 feriado)');
        console.log('============================================================');

    } catch (err) {
        await tx.rollback();
        console.error('❌ Error, rollback ejecutado:', err.message);
        throw err;
    } finally {
        await pool.close();
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
