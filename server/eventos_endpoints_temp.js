// ==========================================
// EVENTOS ENDPOINTS (protected by AccesoEventos permission)
// ==========================================

// GET /api/eventos - List all events
app.get('/api/eventos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const eventos = await getAllEventos();
        res.json(eventos);
    } catch (err) {
        console.error('Error in /api/eventos:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/eventos - Create new event
app.post('/api/eventos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const { evento, esFeriado, usarEnPresupuesto, esInterno } = req.body;
        const id = await createEvento(evento, esFeriado, usarEnPresupuesto, esInterno);
        res.json({ success: true, id });
    } catch (err) {
        console.error('Error creating evento:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/eventos/:id - Update event
app.put('/api/eventos/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const { evento, esFeriado, usarEnPresupuesto, esInterno } = req.body;
        await updateEvento(parseInt(req.params.id), evento, esFeriado, usarEnPresupuesto, esInterno);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating evento:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/eventos/:id - Delete event
app.delete('/api/eventos/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        await deleteEvento(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting evento:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/eventos/:id/fechas - Get dates for an event
app.get('/api/eventos/:id/fechas', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const fechas = await getEventoFechas(parseInt(req.params.id));
        res.json(fechas);
    } catch (err) {
        console.error('Error getting evento fechas:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/eventos-fechas - Create event date
app.post('/api/eventos-fechas', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const { idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen, usuario } = req.body;
        await createEventoFecha(idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen || null, usuario);
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating evento fecha:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/eventos-fechas - Update event date
app.put('/api/eventos-fechas', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const { idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen, usuario } = req.body;
        await updateEventoFecha(idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, codAlmacen || null, usuario);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating evento fecha:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/eventos-fechas - Delete event date
app.delete('/api/eventos-fechas', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos) {
            return res.status(403).json({ error: 'No tiene permisos para gestionar eventos' });
        }
        const { idEvento, fecha } = req.query;
        await deleteEventoFecha(parseInt(idEvento), fecha);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting evento fecha:', err);
        res.status(500).json({ error: err.message });
    }
});
