const { sql, poolPromise } = require('./db');

// ==========================================
// EVENTOS (DIM_EVENTOS)
// ==========================================

/**
 * Get all events from DIM_EVENTOS
 */
async function getAllEventos() {
    const pool = await poolPromise;
    const result = await pool.request()
        .query('SELECT * FROM DIM_EVENTOS ORDER BY IDEVENTO');
    return result.recordset;
}

/**
 * Create a new event
 */
async function createEvento(evento, esFeriado, usarEnPresupuesto, esInterno) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('evento', sql.NVarChar(200), evento)
        .input('esFeriado', sql.NVarChar(1), esFeriado)
        .input('usarEnPresupuesto', sql.NVarChar(1), usarEnPresupuesto)
        .input('esInterno', sql.NVarChar(1), esInterno)
        .query(`
            INSERT INTO DIM_EVENTOS (EVENTO, ESFERIADO, USARENPRESUPUESTO, ESINTERNO)
            VALUES (@evento, @esFeriado, @usarEnPresupuesto, @esInterno);
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
                USUARIO_MODIFICACION,
                FECHA_MODIFICACION
            FROM DIM_EVENTOS_FECHAS
            WHERE IDEVENTO = @idEvento
            ORDER BY FECHA
        `);
    return result.recordset;
}

/**
 * Create a new event date
 */
async function createEventoFecha(idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, usuario) {
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('fecha', sql.Date, fecha)
        .input('fechaEfectiva', sql.Date, fechaEfectiva)
        .input('canal', sql.NChar(100), canal)
        .input('grupoAlmacen', sql.Int, grupoAlmacen)
        .input('usuario', sql.NVarChar(200), usuario)
        .input('fechaModificacion', sql.DateTime, new Date())
        .query(`
            INSERT INTO DIM_EVENTOS_FECHAS 
            (IDEVENTO, FECHA, FECHA_EFECTIVA, Canal, GrupoAlmacen, USUARIO_MODIFICACION, FECHA_MODIFICACION)
            VALUES (@idEvento, @fecha, @fechaEfectiva, @canal, @grupoAlmacen, @usuario, @fechaModificacion)
        `);
}

/**
 * Update an existing event date
 * Note: Since DIM_EVENTOS_FECHAS doesn't have a primary key, we identify records by all fields
 */
async function updateEventoFecha(idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, usuario) {
    const pool = await poolPromise;
    await pool.request()
        .input('idEvento', sql.Int, idEvento)
        .input('oldFecha', sql.Date, oldFecha)
        .input('newFecha', sql.Date, newFecha)
        .input('fechaEfectiva', sql.Date, fechaEfectiva)
        .input('canal', sql.NChar(100), canal)
        .input('grupoAlmacen', sql.Int, grupoAlmacen)
        .input('usuario', sql.NVarChar(200), usuario)
        .input('fechaModificacion', sql.DateTime, new Date())
        .query(`
            UPDATE DIM_EVENTOS_FECHAS
            SET FECHA = @newFecha,
                FECHA_EFECTIVA = @fechaEfectiva,
                Canal = @canal,
                GrupoAlmacen = @grupoAlmacen,
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

module.exports = {
    getAllEventos,
    createEvento,
    updateEvento,
    deleteEvento,
    getEventoFechas,
    createEventoFecha,
    updateEventoFecha,
    deleteEventoFecha
};
