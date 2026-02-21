// ==========================================
// STORE ALIAS ENDPOINTS (admin only)
// ==========================================

module.exports = function registerStoreAliasEndpoints(app, authMiddleware) {

    const storeAliasService = require('./services/storeAliasService');

    // GET /api/admin/store-aliases — list all aliases
    app.get('/api/admin/store-aliases', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { fuente, search } = req.query;
            const aliases = await storeAliasService.getAllAliases(fuente || null, search || null);
            res.json(aliases);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/admin/store-aliases/stats — stats summary
    app.get('/api/admin/store-aliases/stats', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const stats = await storeAliasService.getStats();
            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/admin/store-aliases/stores — CODALMACEN list for combos
    app.get('/api/admin/store-aliases/stores', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const stores = await storeAliasService.getStoreList();
            res.json(stores);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/admin/store-aliases/fuentes — distinct fuentes
    app.get('/api/admin/store-aliases/fuentes', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const fuentes = await storeAliasService.getFuentes();
            res.json(fuentes);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/store-aliases — add a new alias
    app.post('/api/admin/store-aliases', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { alias, codAlmacen, fuente } = req.body;
            if (!alias || !codAlmacen) {
                return res.status(400).json({ error: 'Alias y CodAlmacen son requeridos' });
            }
            const result = await storeAliasService.addAlias(alias, codAlmacen, fuente || null);
            res.json(result);
        } catch (err) {
            if (err.message.includes('duplicate') || err.message.includes('UNIQUE') || err.message.includes('UQ_StoreAlias')) {
                return res.status(409).json({ error: 'Este alias ya existe para esa fuente' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/admin/store-aliases/:id — update alias
    app.put('/api/admin/store-aliases/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { alias, codAlmacen, fuente } = req.body;
            if (!alias || !codAlmacen) {
                return res.status(400).json({ error: 'Alias y CodAlmacen son requeridos' });
            }
            const result = await storeAliasService.updateAlias(
                parseInt(req.params.id), alias, codAlmacen, fuente || null
            );
            if (!result) return res.status(404).json({ error: 'Alias no encontrado' });
            res.json(result);
        } catch (err) {
            if (err.message.includes('duplicate') || err.message.includes('UNIQUE') || err.message.includes('UQ_StoreAlias')) {
                return res.status(409).json({ error: 'Este alias ya existe para esa fuente' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/admin/store-aliases/:id — delete alias
    app.delete('/api/admin/store-aliases/:id', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            await storeAliasService.deleteAlias(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/store-aliases/seed — seed from DIM_NOMBRES_ALMACEN
    app.post('/api/admin/store-aliases/seed', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const result = await storeAliasService.seedFromDimNombres();
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/store-aliases/resolve — test resolution
    app.post('/api/admin/store-aliases/resolve', authMiddleware, async (req, res) => {
        try {
            if (!req.user.esAdmin) return res.status(403).json({ error: 'Sin permisos' });
            const { nombre, fuente } = req.body;
            if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
            const codAlmacen = await storeAliasService.resolveAlias(nombre, fuente || null);
            res.json({ nombre, fuente: fuente || null, codAlmacen });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

}; // end registerStoreAliasEndpoints
