// ==========================================
// GRUPOS ALMACEN ENDPOINTS (admin only)
// ==========================================

module.exports = function registerGruposAlmacenEndpoints(app, authMiddleware) {

    const db = require('./gruposAlmacenDb');

    // GET /api/admin/grupos-almacen — list all groups with member count
    app.get('/api/admin/grupos-almacen', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen && !req.user.accesoEventos) return res.status(403).json({ error: 'Sin permisos' });
            const grupos = await db.getGrupos();
            res.json(grupos);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/admin/grupos-almacen/stores — available stores for selects
    app.get('/api/admin/grupos-almacen/stores', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen && !req.user.accesoEventos) return res.status(403).json({ error: 'Sin permisos' });
            const stores = await db.getAvailableStores();
            res.json(stores);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/admin/grupos-almacen/:id — group detail with lines
    app.get('/api/admin/grupos-almacen/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            const grupo = await db.getGrupoById(parseInt(req.params.id));
            if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });
            res.json(grupo);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/grupos-almacen — create a new group
    app.post('/api/admin/grupos-almacen', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            const { descripcion, codvisible } = req.body;
            if (!descripcion) return res.status(400).json({ error: 'Descripción es requerida' });
            const grupo = await db.createGrupo(descripcion, codvisible || 20);
            res.json(grupo);
        } catch (err) {
            if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
                return res.status(409).json({ error: 'Ya existe un grupo con esa descripción' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/admin/grupos-almacen/:id — update group
    app.put('/api/admin/grupos-almacen/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            const { descripcion, codvisible, activo } = req.body;
            if (!descripcion) return res.status(400).json({ error: 'Descripción es requerida' });
            const grupo = await db.updateGrupo(
                parseInt(req.params.id),
                descripcion,
                codvisible ?? 20,
                activo !== undefined ? activo : true
            );
            if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });
            res.json(grupo);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/admin/grupos-almacen/:id — delete group and its lines
    app.delete('/api/admin/grupos-almacen/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            await db.deleteGrupo(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/grupos-almacen/:id/lineas — add store to group
    app.post('/api/admin/grupos-almacen/:id/lineas', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            const { codalmacen } = req.body;
            if (!codalmacen) return res.status(400).json({ error: 'CODALMACEN es requerido' });
            const linea = await db.addLinea(parseInt(req.params.id), codalmacen);
            res.json(linea);
        } catch (err) {
            if (err.message.includes('UNIQUE') || err.message.includes('UQ_GrupoAlmacenLin')) {
                return res.status(409).json({ error: 'Este almacén ya pertenece al grupo' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/admin/grupos-almacen/lineas/:lineaId — remove store from group
    app.delete('/api/admin/grupos-almacen/lineas/:lineaId', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            await db.removeLinea(parseInt(req.params.lineaId));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/grupos-almacen/import — import from ROSTIPOLLOS_P
    app.post('/api/admin/grupos-almacen/import', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin && !req.user.accesoGruposAlmacen) return res.status(403).json({ error: 'Sin permisos' });
            const result = await db.importFromRostipollos();
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

}; // end registerGruposAlmacenEndpoints
