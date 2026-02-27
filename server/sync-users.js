const { poolPromise } = require('./db');

async function syncAllUsers() {
    try {
        console.log("Starting sync...");
        const pool = await poolPromise;
        const result = await pool.request().query(`
            UPDATE APP_USUARIOS
            SET AccesoTendencia = p.AccesoTendencia, AccesoTactica = p.AccesoTactica, AccesoEventos = p.AccesoEventos,
                AccesoPresupuesto = p.AccesoPresupuesto, AccesoPresupuestoMensual = p.AccesoPresupuestoMensual,
                AccesoPresupuestoAnual = p.AccesoPresupuestoAnual, AccesoPresupuestoRangos = p.AccesoPresupuestoRangos,
                AccesoTiempos = p.AccesoTiempos, AccesoEvaluaciones = p.AccesoEvaluaciones, AccesoInventarios = p.AccesoInventarios,
                AccesoPersonal = p.AccesoPersonal, EsAdmin = p.EsAdmin, accesoModeloPresupuesto = p.accesoModeloPresupuesto,
                verConfigModelo = p.verConfigModelo, verConsolidadoMensual = p.verConsolidadoMensual, verAjustePresupuesto = p.verAjustePresupuesto,
                verVersiones = p.verVersiones, verBitacora = p.verBitacora, verReferencias = p.verReferencias,
                editarConsolidado = p.editarConsolidado, ejecutarRecalculo = p.ejecutarRecalculo, ajustarCurva = p.ajustarCurva,
                aprobarAjustes = p.aprobarAjustes, restaurarVersiones = p.restaurarVersiones, AccesoAsignaciones = p.AccesoAsignaciones,
                AccesoGruposAlmacen = p.AccesoGruposAlmacen, AccesoReportes = p.AccesoReportes
            FROM APP_USUARIOS u
            INNER JOIN APP_PERFILES p ON u.PerfilId = p.Id
            WHERE u.PerfilId IS NOT NULL
        `);
        console.log(`Sync completed! Rows affected: ${result.rowsAffected}`);
        process.exit(0);
    } catch (err) {
        console.error("Error syncing:", err);
        process.exit(1);
    }
}

syncAllUsers();
