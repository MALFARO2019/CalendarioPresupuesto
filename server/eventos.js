const { sql, poolPromise } = require('./db');

// ==========================================
// EVENTOS (DIM_EVENTOS)
// ==========================================

/**
 * Ensure ORDEN column exists in DIM_EVENTOS
 */
let _ordenReady = null;
async function ensureOrdenColumn() {
    try {
        const pool = await poolPromise;
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_EVENTOS') AND name = 'ORDEN')
            BEGIN
                ALTER TABLE DIM_EVENTOS ADD ORDEN INT NULL;
            END
        `);
        // Initialize ORDEN for rows that don't have it
        await pool.request().query(`
            UPDATE DIM_EVENTOS SET ORDEN = IDEVENTO WHERE ORDEN IS NULL
        `);
        console.log('✅ ORDEN column ready in DIM_EVENTOS');
    } catch (err) {
        console.warn('Warning: Could not ensure ORDEN column:', err.message);
    }
}

/**
 * Ensure CodAlmacen column exists in DIM_EVENTOS_FECHAS
 */
async function ensureCodAlmacenColumn() {
    try {
        const pool = await poolPromise;
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DIM_EVENTOS_FECHAS') AND name = 'CodAlmacen')
            BEGIN
                ALTER TABLE DIM_EVENTOS_FECHAS ADD CodAlmacen NVARCHAR(10) NULL;
            END
        `);
        console.log('✅ CodAlmacen column ready in DIM_EVENTOS_FECHAS');
    } catch (err) {
        console.warn('Warning: Could not ensure CodAlmacen column:', err.message);
    }
}

// Run on module load and store the promises
_ordenReady = ensureOrdenColumn();
let _codAlmacenReady = ensureCodAlmacenColumn();

/**
 * Get all events from DIM_EVENTOS ordered by ORDEN
 */
async function getAllEventos() {
    // Wait for ORDEN column migration to complete first
    if (_ordenReady) await _ordenReady;
    const pool = await poolPromise;
    try {
        const result = await pool.request()
            .query('SELECT * FROM DIM_EVENTOS ORDER BY ISNULL(ORDEN, 9999), IDEVENTO');
        return result.recordset;
    } catch (err) {
        // Fallback if ORDEN column doesn't exist
        console.warn('Falling back to ORDER BY IDEVENTO:', err.message);
        const result = await pool.request()
            .query('SELECT * FROM DIM_EVENTOS ORDER BY IDEVENTO');
        return result.recordset;
    }
}

/**
 * Create a new event
 */
async function createEvento(evento, esFeriado, usarEnPresupuesto, esInterno) {
    const pool = await poolPromise;
    // Get next ORDEN value
    const maxOrden = await pool.request()
        .query('SELECT ISNULL(MAX(ORDEN), 0) + 1 AS nextOrden FROM DIM_EVENTOS');
    const nextOrden = maxOrden.recordset[0].nextOrden;
    const result = await pool.request()
        .input('evento', sql.NVarChar(200), evento)
        .input('esFeriado', sql.NVarChar(1), esFeriado)
        .input('usarEnPresupuesto', sql.NVarChar(1), usarEnPresupuesto)
        .input('esInterno', sql.NVarChar(1), esInterno)
        .input('orden', sql.Int, nextOrden)
        .query(`
            INSERT INTO DIM_EVENTOS (EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO, ORDEN)
            VALUES (@evento, @esFeriado, @usarEnPresupuesto, @esInterno, @orden);
            SELECT SCOPE_IDENTITY() AS IDEVENTO;
        `);
    return result.recordset[0].IDEVENTO;
}

/**
 * Update an existing event
 */
async function updateEvento(id, evento, esFeriado, usarEnPresupuesto, esInterno) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('evento', sql.NVarChar(200), evento)
        .input('esFeriado', sql.NVarChar(1), esFeriado)
        .input('usarEnPresupuesto', sql.NVarChar(1), usarEnPresupuesto)
        .input('esInterno', sql.NVarChar(1), esInterno)
        .query(`
            UPDATE DIM_EVENTOS
            SET EVENTO = @evento,
                ESFERIADO = @esFeriado,
                USARENPRESUPUESTO = @usarEnPresupuesto,
                ESINTERNO = @esInterno
            WHERE IDEVENTO = @id
        `);
}

/**
 * Delete an event and all its associated dates
 */
async function deleteEvento(id) {
    const pool = await poolPromise;
    const transaction = pool.transaction();

    try {
        await transaction.begin();

        // First delete all associated dates
        await transaction.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM DIM_EVENTOS_FECHAS WHERE IDEVENTO = @id');

        // Then delete the event
        await transaction.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM DIM_EVENTOS WHERE IDEVENTO = @id');

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

// ==========================================
// EVENTOS FECHAS (DIM_EVENTOS_FECHAS)
// ==========================================

/**
 * Get all dates for a specific event
 */
async function getEventoFechas(idEvento) {
    if (_codAlmacenReady) await _codAlmacenReady;
    const pool = await poolPromise;
    const result = await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .query(`
            SELECT 
                ROW_NUMBER() OVER (ORDER BY FECHA) AS ID,
                IDEVENTO,
                FECHA,
                FECHA_EFECTIVA,
                Canal,
                GrupoAlmacen,
                CodAlmacen,
                UsuarioCrea,
                USUARIO_MODIFICACION,
                FECHA_MODIFICACION,
                Estado,
                UsuarioAprueba,
                MotivoRechazo
            FROM DIM_EVENTOS_FECHAS
            WHERE IDEVENTO = @idEvento
            ORDER BY FECHA
        `);
    return result.recordset;
}

/**
 * Create a new event date
 */
async function createEventoFecha(idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen, usuario, estado = 'Pendiente', usuarioAprueba = null) {
    if (_codAlmacenReady) await _codAlmacenReady;
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('fecha', sql.Date, fecha)
        .input('fechaEfectiva', sql.Date, fechaEfectiva)
        .input('canal', sql.NChar(100), canal)
        .input('grupoAlmacen', sql.Int, grupoAlmacen)
        .input('codAlmacen', sql.NVarChar(10), codAlmacen || null)
        .input('usuarioCrea', sql.NVarChar(200), usuario)
        .input('usuario', sql.NVarChar(200), usuario)
        .input('fechaModificacion', sql.DateTime, new Date())
        .input('estado', sql.VarChar(20), estado)
        .input('usuarioAprueba', sql.NVarChar(200), usuarioAprueba)
        .query(`
            INSERT INTO DIM_EVENTOS_FECHAS 
            (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen, CodAlmacen, UsuarioCrea, USUARIO_MODIFICACION, FECHA_MODIFICACION, Estado, UsuarioAprueba)
            VALUES (@idEvento, @fecha, @fechaEfectiva, @canal, @grupoAlmacen, @codAlmacen, @usuarioCrea, @usuario, @fechaModificacion, @estado, @usuarioAprueba)
        `);
}

/**
 * Update an existing event date
 * Note: Since DIM_EVENTOS_FECHAS doesn't have a primary key, we identify records by all fields
 */
async function updateEventoFecha(idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen, usuario) {
    if (_codAlmacenReady) await _codAlmacenReady;
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('oldFecha', sql.Date, oldFecha)
        .input('newFecha', sql.Date, newFecha)
        .input('fechaEfectiva', sql.Date, fechaEfectiva)
        .input('canal', sql.NChar(100), canal)
        .input('grupoAlmacen', sql.Int, grupoAlmacen)
        .input('codAlmacen', sql.NVarChar(10), codAlmacen || null)
        .input('usuario', sql.NVarChar(200), usuario)
        .input('fechaModificacion', sql.DateTime, new Date())
        .query(`
            UPDATE DIM_EVENTOS_FECHAS
            SET FECHA = @newFecha,
                FECHA_EFECTIVA = @fechaEfectiva,
                Canal = @canal,
                GrupoAlmacen = @grupoAlmacen,
                CodAlmacen = @codAlmacen,
                USUARIO_MODIFICACION = @usuario,
                FECHA_MODIFICACION = @fechaModificacion
            WHERE IDEVENTO = @idEvento AND FECHA = @oldFecha
        `);
}

/**
 * Delete an event date
 */
async function deleteEventoFecha(idEvento, fecha) {
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('fecha', sql.Date, fecha)
        .query('DELETE FROM DIM_EVENTOS_FECHAS WHERE IDEVENTO = @idEvento AND FECHA = @fecha');
}

/**
 * Reorder events - receives array of { id, orden }
 */
async function reorderEventos(items) {
    const pool = await poolPromise;
    const transaction = pool.transaction();
    try {
        await transaction.begin();
        for (const item of items) {
            await transaction.request()
                .input(`id_${item.id}`, sql.Int, item.id)
                .input(`orden_${item.id}`, sql.Int, item.orden)
                .query(`UPDATE DIM_EVENTOS SET ORDEN = @orden_${item.id} WHERE IDEVENTO = @id_${item.id}`);
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

/**
 * Change event state (Aprobado/Rechazado)
 */
async function cambiarEstadoEventoFecha(idEvento, fechaStr, estado, motivoRechazo, usuarioAprueba) {
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('fecha', sql.Date, fechaStr)
        .input('estado', sql.VarChar(20), estado)
        .input('motivoRechazo', sql.NVarChar(sql.MAX), motivoRechazo || null)
        .input('usuarioAprueba', sql.NVarChar(200), usuarioAprueba || null)
        .query(`
            UPDATE DIM_EVENTOS_FECHAS
            SET Estado = @estado,
                MotivoRechazo = @motivoRechazo,
                UsuarioAprueba = @usuarioAprueba
            WHERE IDEVENTO = @idEvento AND FECHA = @fecha
        `);
}

module.exports = {
    getAllEventos,
    createEvento,
    updateEvento,
    deleteEvento,
    getEventoFechas,
    createEventoFecha,
    updateEventoFecha,
    deleteEventoFecha,
    reorderEventos,
    cambiarEstadoEventoFecha
};
