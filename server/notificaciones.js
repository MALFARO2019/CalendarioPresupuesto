// =============================================
// MÓDULO DE NOTIFICACIONES — Lógica de BD
// =============================================
const { sql, poolPromise } = require('./db');

// ─── Helper: pool principal ───────────────────
async function pool() { return poolPromise; }

// ─── Clasificaciones ──────────────────────────

async function getClasificaciones() {
    const p = await pool();
    const r = await p.request().query(
        'SELECT Id, Nombre, Color, Activo, Orden FROM APP_Clasificaciones_Notif WHERE Activo=1 ORDER BY Orden'
    );
    return r.recordset;
}

// ─── CRUD Notificaciones Admin ────────────────

async function getNotificaciones(soloActivas = false) {
    const p = await pool();
    const q = `
        SELECT n.*, c.Nombre AS ClasificacionNombre, c.Color AS ClasificacionColor
        FROM APP_Notificaciones n
        JOIN APP_Clasificaciones_Notif c ON c.Id = n.ClasificacionId
        ${soloActivas ? 'WHERE n.Activo = 1' : ''}
        ORDER BY n.FechaCreacion DESC
    `;
    const r = await p.request().query(q);
    return r.recordset;
}

async function getNotificacionById(id) {
    const p = await pool();
    const r = await p.request()
        .input('id', sql.Int, id)
        .query('SELECT n.*, c.Nombre AS ClasificacionNombre, c.Color AS ClasificacionColor FROM APP_Notificaciones n JOIN APP_Clasificaciones_Notif c ON c.Id=n.ClasificacionId WHERE n.Id=@id');
    return r.recordset[0] || null;
}

async function saveNotificacion(data, usuario) {
    const p = await pool();
    const {
        id, titulo, texto, imagenUrl, clasificacionId,
        nRepeticiones, requiereComentario, requiereCodigoEmpleado,
        comunicarConFlamia, activo
    } = data;

    if (id) {
        await p.request()
            .input('id', sql.Int, id)
            .input('titulo', sql.NVarChar(200), titulo)
            .input('texto', sql.NVarChar(sql.MAX), texto)
            .input('imagenUrl', sql.NVarChar(500), imagenUrl || null)
            .input('clasificacionId', sql.Int, clasificacionId)
            .input('nRepeticiones', sql.Int, nRepeticiones || 1)
            .input('requiereComentario', sql.NVarChar(20), requiereComentario || 'none')
            .input('requiereCodigoEmpleado', sql.Bit, requiereCodigoEmpleado ? 1 : 0)
            .input('comunicarConFlamia', sql.Bit, comunicarConFlamia ? 1 : 0)
            .input('activo', sql.Bit, activo !== false ? 1 : 0)
            .input('usuario', sql.NVarChar(200), usuario)
            .query(`UPDATE APP_Notificaciones SET
                Titulo=@titulo, Texto=@texto, ImagenUrl=@imagenUrl,
                ClasificacionId=@clasificacionId, NRepeticiones=@nRepeticiones,
                RequiereComentario=@requiereComentario, RequiereCodigoEmpleado=@requiereCodigoEmpleado,
                ComunicarConFlamia=@comunicarConFlamia, Activo=@activo,
                FechaModificacion=GETDATE(), ModificadoPor=@usuario
                WHERE Id=@id`);
        return id;
    } else {
        const r = await p.request()
            .input('titulo', sql.NVarChar(200), titulo)
            .input('texto', sql.NVarChar(sql.MAX), texto)
            .input('imagenUrl', sql.NVarChar(500), imagenUrl || null)
            .input('clasificacionId', sql.Int, clasificacionId)
            .input('nRepeticiones', sql.Int, nRepeticiones || 1)
            .input('requiereComentario', sql.NVarChar(20), requiereComentario || 'none')
            .input('requiereCodigoEmpleado', sql.Bit, requiereCodigoEmpleado ? 1 : 0)
            .input('comunicarConFlamia', sql.Bit, comunicarConFlamia ? 1 : 0)
            .input('usuario', sql.NVarChar(200), usuario)
            .query(`INSERT INTO APP_Notificaciones
                (Titulo, Texto, ImagenUrl, ClasificacionId, NRepeticiones,
                 RequiereComentario, RequiereCodigoEmpleado, ComunicarConFlamia, CreadoPor)
                OUTPUT INSERTED.Id
                VALUES (@titulo, @texto, @imagenUrl, @clasificacionId, @nRepeticiones,
                        @requiereComentario, @requiereCodigoEmpleado, @comunicarConFlamia, @usuario)`);
        return r.recordset[0].Id;
    }
}

async function deleteNotificacion(id) {
    const p = await pool();
    await p.request().input('id', sql.Int, id)
        .query('UPDATE APP_Notificaciones SET Activo=0 WHERE Id=@id');
}

// ─── Notificaciones Pendientes para usuario ───
async function getNotificacionesPendientes(usuarioId) {
    const p = await pool();

    // Notificaciones admin activas que el usuario no ha visto el nRepeticiones veces
    const r = await p.request()
        .input('uid', sql.Int, usuarioId)
        .query(`
            SELECT n.Id, n.Titulo, n.Texto, n.ImagenUrl, n.NRepeticiones,
                   n.RequiereComentario, n.RequiereCodigoEmpleado,
                   c.Nombre AS ClasificacionNombre, c.Color AS ClasificacionColor,
                   ISNULL(l.VistasCount, 0) AS VistasCount
            FROM APP_Notificaciones n
            JOIN APP_Clasificaciones_Notif c ON c.Id = n.ClasificacionId
            OUTER APPLY (
                SELECT COUNT(*) AS VistasCount
                FROM APP_Notif_Log
                WHERE NotifId = n.Id AND UsuarioId = @uid AND Tipo = 'admin'
            ) l
            WHERE n.Activo = 1
              AND ISNULL(l.VistasCount, 0) < n.NRepeticiones
            ORDER BY n.FechaCreacion DESC
        `);
    return r.recordset;
}

// ─── Revisar Notificación ─────────────────────
async function revisarNotificacion(usuarioId, notifId, comentario, codigoEmpleado, ip) {
    const p = await pool();
    // Contar repeticiones previas
    const countR = await p.request()
        .input('uid', sql.Int, usuarioId)
        .input('nid', sql.Int, notifId)
        .query('SELECT COUNT(*) AS cnt FROM APP_Notif_Log WHERE UsuarioId=@uid AND NotifId=@nid AND Tipo=\'admin\'');
    const numRep = (countR.recordset[0]?.cnt || 0) + 1;

    await p.request()
        .input('uid', sql.Int, usuarioId)
        .input('nid', sql.Int, notifId)
        .input('rep', sql.Int, numRep)
        .input('comentario', sql.NVarChar(sql.MAX), comentario || null)
        .input('codigo', sql.NVarChar(50), codigoEmpleado || null)
        .input('ip', sql.NVarChar(50), ip || null)
        .query(`INSERT INTO APP_Notif_Log
            (UsuarioId, NotifId, Tipo, NumRepeticion, Comentario, CodigoEmpleado, IP)
            VALUES (@uid, @nid, 'admin', @rep, @comentario, @codigo, @ip)`);
}

// ─── CRUD Notificaciones de Versión ──────────

async function getNotificacionesVersiones(versionId = null) {
    const p = await pool();
    const req = p.request();
    let where = 'WHERE 1=1';
    if (versionId) {
        req.input('vid', sql.NVarChar(50), versionId);
        where += ' AND v.VersionId = @vid';
    }
    const r = await req.query(`
        SELECT v.*
        FROM APP_Notif_Versiones v
        ${where}
        ORDER BY v.VersionId DESC, v.Orden ASC
    `);
    return r.recordset;
}

async function getVersionesDisponibles() {
    const p = await pool();
    const r = await p.request().query(
        'SELECT DISTINCT VersionId FROM APP_Notif_Versiones ORDER BY VersionId DESC'
    );
    return r.recordset.map(x => x.VersionId);
}

async function saveNotificacionVersion(data, usuario) {
    const p = await pool();
    const { id, versionId, titulo, texto, tipo, orden, activo, fechaPublicacion } = data;

    if (id) {
        await p.request()
            .input('id', sql.Int, id)
            .input('versionId', sql.NVarChar(50), versionId)
            .input('titulo', sql.NVarChar(200), titulo)
            .input('texto', sql.NVarChar(sql.MAX), texto)
            .input('tipo', sql.NVarChar(50), tipo || 'mejora')
            .input('orden', sql.Int, orden || 0)
            .input('activo', sql.Bit, activo !== false ? 1 : 0)
            .input('fechaPublicacion', sql.DateTime, fechaPublicacion ? new Date(fechaPublicacion) : null)
            .query(`UPDATE APP_Notif_Versiones SET
                VersionId=@versionId, Titulo=@titulo, Texto=@texto, Tipo=@tipo,
                Orden=@orden, Activo=@activo, FechaPublicacion=@fechaPublicacion
                WHERE Id=@id`);
        return id;
    } else {
        const r = await p.request()
            .input('versionId', sql.NVarChar(50), versionId)
            .input('titulo', sql.NVarChar(200), titulo)
            .input('texto', sql.NVarChar(sql.MAX), texto)
            .input('tipo', sql.NVarChar(50), tipo || 'mejora')
            .input('orden', sql.Int, orden || 0)
            .input('fechaPublicacion', sql.DateTime, fechaPublicacion ? new Date(fechaPublicacion) : null)
            .input('usuario', sql.NVarChar(200), usuario)
            .query(`INSERT INTO APP_Notif_Versiones (VersionId, Titulo, Texto, Tipo, Orden, FechaPublicacion, CreadoPor)
                OUTPUT INSERTED.Id
                VALUES (@versionId, @titulo, @texto, @tipo, @orden, @fechaPublicacion, @usuario)`);
        return r.recordset[0].Id;
    }
}

async function deleteNotificacionVersion(id) {
    const p = await pool();
    await p.request().input('id', sql.Int, id)
        .query('DELETE FROM APP_Notif_Versiones WHERE Id=@id');
}

// ─── Ruta: versiones futuras ──────────────────
// versionActual: e.g. "v1.3"  — retorna notifs de versiones superiores
async function getRuta(versionActual) {
    const p = await pool();
    const r = await p.request()
        .input('va', sql.NVarChar(50), versionActual || 'v0.0')
        .query(`
            SELECT v.*
            FROM APP_Notif_Versiones v
            WHERE v.Activo = 1
              AND v.VersionId > @va
            ORDER BY v.VersionId ASC, v.Orden ASC
        `);
    return r.recordset;
}

// ─── Notificaciones de versión pendientes ─────
async function getVersionesPendientes(usuarioId, versionActual) {
    const p = await pool();
    // Versiones que el usuario no ha leído aún (ordenadas, versiones <= actual)
    const r = await p.request()
        .input('uid', sql.Int, usuarioId)
        .input('va', sql.NVarChar(50), versionActual || 'v99.99')
        .query(`
            SELECT DISTINCT v.VersionId, COUNT(v.Id) AS TotalNotif
            FROM APP_Notif_Versiones v
            WHERE v.Activo = 1
              AND v.VersionId <= @va
              AND NOT EXISTS (
                SELECT 1 FROM APP_Notif_Log l
                WHERE l.UsuarioId=@uid AND l.NotifVersionId=v.Id AND l.Tipo='version'
              )
            GROUP BY v.VersionId
            ORDER BY v.VersionId DESC
        `);
    return r.recordset;
}

async function marcarVersionLeida(usuarioId, versionId, ip) {
    const p = await pool();
    // Marcar todas las notifs de esa versión como leídas
    const verR = await p.request()
        .input('vid', sql.NVarChar(50), versionId)
        .query('SELECT Id FROM APP_Notif_Versiones WHERE VersionId=@vid AND Activo=1');

    for (const row of verR.recordset) {
        // Solo insertar si no existe
        const exists = await p.request()
            .input('uid', sql.Int, usuarioId)
            .input('nid', sql.Int, row.Id)
            .query('SELECT 1 AS e FROM APP_Notif_Log WHERE UsuarioId=@uid AND NotifVersionId=@nid AND Tipo=\'version\'');
        if (!exists.recordset.length) {
            await p.request()
                .input('uid', sql.Int, usuarioId)
                .input('nid', sql.Int, row.Id)
                .input('ip', sql.NVarChar(50), ip || null)
                .query(`INSERT INTO APP_Notif_Log (UsuarioId, NotifVersionId, Tipo, NumRepeticion, IP)
                    VALUES (@uid, @nid, 'version', 1, @ip)`);
        }
    }
}

// ─── Reportes ─────────────────────────────────
async function getReporteLineal(filtros = {}) {
    const p = await pool();
    const req = p.request();
    let where = 'WHERE 1=1';
    if (filtros.desde) { req.input('desde', sql.Date, new Date(filtros.desde)); where += ' AND l.FechaVista >= @desde'; }
    if (filtros.hasta) { req.input('hasta', sql.Date, new Date(filtros.hasta)); where += ' AND l.FechaVista <= DATEADD(day,1,@hasta)'; }
    if (filtros.notifId) { req.input('nid', sql.Int, filtros.notifId); where += ' AND l.NotifId = @nid'; }
    if (filtros.usuarioId) { req.input('uid', sql.Int, filtros.usuarioId); where += ' AND l.UsuarioId = @uid'; }

    const r = await req.query(`
        SELECT l.Id, l.FechaVista, l.NumRepeticion, l.Comentario, l.CodigoEmpleado,
               u.Email AS Usuario, u.Nombre AS NombreUsuario,
               ISNULL(n.Titulo, nv.Titulo) AS NotifTitulo,
               l.Tipo
        FROM APP_Notif_Log l
        LEFT JOIN APP_USUARIOS u ON u.Id = l.UsuarioId
        LEFT JOIN APP_Notificaciones n ON n.Id = l.NotifId
        LEFT JOIN APP_Notif_Versiones nv ON nv.Id = l.NotifVersionId
        ${where}
        ORDER BY l.FechaVista DESC
    `);
    return r.recordset;
}

async function getReporteAgrupado(filtros = {}) {
    const p = await pool();
    const req = p.request();
    let where = 'WHERE 1=1';
    if (filtros.desde) { req.input('desde', sql.Date, new Date(filtros.desde)); where += ' AND l.FechaVista >= @desde'; }
    if (filtros.hasta) { req.input('hasta', sql.Date, new Date(filtros.hasta)); where += ' AND l.FechaVista <= DATEADD(day,1,@hasta)'; }

    const r = await req.query(`
        SELECT u.Email AS Usuario, u.Nombre AS NombreUsuario,
               YEAR(l.FechaVista) AS Ano, MONTH(l.FechaVista) AS Mes,
               COUNT(*) AS TotalVistas,
               COUNT(DISTINCT l.NotifId) AS NotifDistintas
        FROM APP_Notif_Log l
        LEFT JOIN APP_USUARIOS u ON u.Id = l.UsuarioId
        ${where}
        GROUP BY u.Email, u.Nombre, YEAR(l.FechaVista), MONTH(l.FechaVista)
        ORDER BY Ano DESC, Mes DESC, TotalVistas DESC
    `);
    return r.recordset;
}

module.exports = {
    getClasificaciones,
    getNotificaciones,
    getNotificacionById,
    saveNotificacion,
    deleteNotificacion,
    getNotificacionesPendientes,
    revisarNotificacion,
    getNotificacionesVersiones,
    getVersionesDisponibles,
    saveNotificacionVersion,
    deleteNotificacionVersion,
    getRuta,
    getVersionesPendientes,
    marcarVersionLeida,
    getReporteLineal,
    getReporteAgrupado,
};
