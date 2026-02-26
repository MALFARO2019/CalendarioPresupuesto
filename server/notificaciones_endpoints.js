// =============================================
// MÓDULO DE NOTIFICACIONES — Endpoints REST
// =============================================

const notificaciones = require('./notificaciones');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer config — guarda en public/uploads/notificaciones/
const uploadDir = path.join(__dirname, 'public', 'uploads', 'notificaciones');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `notif_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB máx
    fileFilter: (_req, file, cb) => {
        const ok = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
        cb(null, ok);
    }
});


function registerNotificacionesEndpoints(app, authMiddleware) {

    // ── Helper permisos ──────────────────────────────────────
    function requireAcceso(req, res) {
        if (!req.user.esAdmin && !req.user.accesoNotificaciones) {
            res.status(403).json({ error: 'No tiene acceso al módulo de Notificaciones' });
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────
    // CLASIFICACIONES
    // GET /api/notificaciones/clasificaciones
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones/clasificaciones', authMiddleware, async (req, res) => {
        try {
            const data = await notificaciones.getClasificaciones();
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones/clasificaciones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // NOTIFICACIONES PENDIENTES (campana) + versiones sin leer
    // GET /api/notificaciones/pendientes?versionActual=v1.3
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones/pendientes', authMiddleware, async (req, res) => {
        try {
            const usuarioId = req.user.id;
            const versionActual = req.query.versionActual || null;

            const [admin, versiones] = await Promise.all([
                notificaciones.getNotificacionesPendientes(usuarioId),
                versionActual ? notificaciones.getVersionesPendientes(usuarioId, versionActual) : Promise.resolve([])
            ]);

            res.json({ admin, versiones, total: admin.length + versiones.length });
        } catch (err) {
            console.error('GET /api/notificaciones/pendientes:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // REVISAR NOTIFICACIÓN ADMIN
    // POST /api/notificaciones/:id/revisar
    // ─────────────────────────────────────────────────────────
    app.post('/api/notificaciones/:id/revisar', authMiddleware, async (req, res) => {
        try {
            const { comentario, codigoEmpleado } = req.body;
            const ip = req.ip || req.connection?.remoteAddress;
            await notificaciones.revisarNotificacion(
                req.user.id, parseInt(req.params.id), comentario, codigoEmpleado, ip
            );
            res.json({ success: true });
        } catch (err) {
            console.error('POST /api/notificaciones/:id/revisar:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // MARCAR VERSIÓN LEÍDA
    // POST /api/notificaciones/versiones/:versionId/leer
    // ─────────────────────────────────────────────────────────
    app.post('/api/notificaciones/versiones/:versionId/leer', authMiddleware, async (req, res) => {
        try {
            const ip = req.ip || req.connection?.remoteAddress;
            await notificaciones.marcarVersionLeida(req.user.id, req.params.versionId, ip);
            res.json({ success: true });
        } catch (err) {
            console.error('POST /api/notificaciones/versiones/:versionId/leer:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // CRUD NOTIFICACIONES ADMIN
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones', authMiddleware, async (req, res) => {
        try {
            if (!requireAcceso(req, res)) return;
            const data = await notificaciones.getNotificaciones();
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/notificaciones', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.crearNotificaciones) {
                return res.status(403).json({ error: 'No tiene permiso para crear notificaciones' });
            }
            const usuario = req.user.email || req.user.nombre;
            const id = await notificaciones.saveNotificacion(req.body, usuario);
            res.json({ success: true, id });
        } catch (err) {
            console.error('POST /api/notificaciones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.put('/api/notificaciones/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.crearNotificaciones) {
                return res.status(403).json({ error: 'No tiene permiso para editar notificaciones' });
            }
            const usuario = req.user.email || req.user.nombre;
            await notificaciones.saveNotificacion({ ...req.body, id: parseInt(req.params.id) }, usuario);
            res.json({ success: true });
        } catch (err) {
            console.error('PUT /api/notificaciones/:id:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/notificaciones/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) {
                return res.status(403).json({ error: 'Solo administradores pueden eliminar notificaciones' });
            }
            await notificaciones.deleteNotificacion(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            console.error('DELETE /api/notificaciones/:id:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // CRUD NOTIFICACIONES DE VERSIÓN
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones/versiones', authMiddleware, async (req, res) => {
        try {
            const { versionId } = req.query;
            const data = await notificaciones.getNotificacionesVersiones(versionId || null);
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones/versiones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/notificaciones/versiones-disponibles', authMiddleware, async (req, res) => {
        try {
            const data = await notificaciones.getVersionesDisponibles();
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones/versiones-disponibles:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/notificaciones/versiones', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
            const usuario = req.user.email || req.user.nombre;
            const id = await notificaciones.saveNotificacionVersion(req.body, usuario);
            res.json({ success: true, id });
        } catch (err) {
            console.error('POST /api/notificaciones/versiones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.put('/api/notificaciones/versiones/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
            const usuario = req.user.email || req.user.nombre;
            await notificaciones.saveNotificacionVersion({ ...req.body, id: parseInt(req.params.id) }, usuario);
            res.json({ success: true });
        } catch (err) {
            console.error('PUT /api/notificaciones/versiones/:id:', err);
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/notificaciones/versiones/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
            await notificaciones.deleteNotificacionVersion(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            console.error('DELETE /api/notificaciones/versiones/:id:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // RUTA — notificaciones de versiones futuras
    // GET /api/notificaciones/ruta?versionActual=v1.3
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones/ruta', authMiddleware, async (req, res) => {
        try {
            const { versionActual } = req.query;
            const data = await notificaciones.getRuta(versionActual);
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones/ruta:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // REPORTES
    // GET /api/notificaciones/reportes?tipo=lineal|agrupado&desde=&hasta=
    // ─────────────────────────────────────────────────────────
    app.get('/api/notificaciones/reportes', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoNotificaciones) {
                return res.status(403).json({ error: 'Sin acceso a reportes de notificaciones' });
            }
            const { tipo, desde, hasta, notifId, usuarioId } = req.query;
            const filtros = { desde, hasta, notifId: notifId ? parseInt(notifId) : null, usuarioId: usuarioId ? parseInt(usuarioId) : null };

            let data;
            if (tipo === 'agrupado') {
                data = await notificaciones.getReporteAgrupado(filtros);
            } else {
                data = await notificaciones.getReporteLineal(filtros);
            }
            res.json(data);
        } catch (err) {
            console.error('GET /api/notificaciones/reportes:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────
    // UPLOAD IMAGEN
    // POST /api/notificaciones/upload-imagen
    // ─────────────────────────────────────────────────────────
    app.post('/api/notificaciones/upload-imagen', authMiddleware, upload.single('imagen'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
        const url = `/uploads/notificaciones/${req.file.filename}`;
        res.json({ success: true, url });
    });

    console.log('🔔 Notificaciones endpoints registered');

}

module.exports = registerNotificacionesEndpoints;
