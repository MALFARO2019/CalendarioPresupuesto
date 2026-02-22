// ==========================================
// MODELO PRESUPUESTO — REST Endpoints
// ==========================================
// Protected by accesoModeloPresupuesto + per-view permissions
// ==========================================

const modeloPresupuesto = require('./modeloPresupuesto');

/**
 * Register all Modelo Presupuesto endpoints
 * @param {import('express').Application} app 
 * @param {Function} authMiddleware 
 */
function registerModeloPresupuestoEndpoints(app, authMiddleware) {

    // ------------------------------------------
    // Helper: Check base module access
    // ------------------------------------------
    function requireModuleAccess(req, res) {
        if (!req.user.accesoModeloPresupuesto) {
            res.status(403).json({ error: 'No tiene acceso al módulo Modelo de Presupuesto' });
            return false;
        }
        return true;
    }

    // ------------------------------------------
    // CONFIG
    // ------------------------------------------

    // GET /api/modelo-presupuesto/config — returns ALL configs
    app.get('/api/modelo-presupuesto/config', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verConfigModelo) {
                return res.status(403).json({ error: 'No tiene permiso para ver la configuración' });
            }
            const configs = await modeloPresupuesto.getAllConfigs();
            res.json(configs);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/config:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/modelo-presupuesto/config/:id — update existing
    app.put('/api/modelo-presupuesto/config/:id', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verConfigModelo) {
                return res.status(403).json({ error: 'No tiene permiso para editar la configuración' });
            }
            const id = await modeloPresupuesto.saveConfig(parseInt(req.params.id), req.body);
            res.json({ success: true, id });
        } catch (err) {
            console.error('Error PUT /api/modelo-presupuesto/config:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/modelo-presupuesto/config (without id — create new)
    app.put('/api/modelo-presupuesto/config', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verConfigModelo) {
                return res.status(403).json({ error: 'No tiene permiso para editar la configuración' });
            }
            const newId = await modeloPresupuesto.saveConfig(null, req.body);
            res.json({ success: true, id: newId });
        } catch (err) {
            console.error('Error PUT /api/modelo-presupuesto/config (create):', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/modelo-presupuesto/config/:id
    app.delete('/api/modelo-presupuesto/config/:id', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verConfigModelo) {
                return res.status(403).json({ error: 'No tiene permiso para eliminar configuraciones' });
            }
            await modeloPresupuesto.deleteConfig(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            console.error('Error DELETE /api/modelo-presupuesto/config:', err);
            res.status(500).json({ error: err.message });
        }
    });


    // POST /api/modelo-presupuesto/calcular
    app.post('/api/modelo-presupuesto/calcular', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.ejecutarRecalculo) {
                return res.status(403).json({ error: 'No tiene permiso para ejecutar recálculos' });
            }
            const { codAlmacen, mes } = req.body;
            const result = await modeloPresupuesto.ejecutarCalculo(
                req.user.email || req.user.nombre, codAlmacen, mes
            );
            res.json({ success: true, result });
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/calcular:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/validacion
    app.get('/api/modelo-presupuesto/validacion', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            const { nombrePresupuesto } = req.query;
            const result = await modeloPresupuesto.getValidacion(nombrePresupuesto);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/validacion:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ------------------------------------------
    // CONSOLIDADO MENSUAL
    // ------------------------------------------

    // GET /api/modelo-presupuesto/consolidado
    app.get('/api/modelo-presupuesto/consolidado', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verConsolidadoMensual) {
                return res.status(403).json({ error: 'No tiene permiso para ver el consolidado' });
            }
            const { ano, codAlmacen, tipo } = req.query;
            const result = await modeloPresupuesto.getConsolidadoMensual(
                parseInt(ano), codAlmacen || null, tipo || null
            );
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/consolidado:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/modelo-presupuesto/consolidado
    app.put('/api/modelo-presupuesto/consolidado', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.editarConsolidado) {
                return res.status(403).json({ error: 'No tiene permiso para editar el consolidado' });
            }
            const { rows } = req.body;
            const usuario = req.user.email || req.user.nombre;
            const result = await modeloPresupuesto.saveConsolidadoMensual(rows, usuario);
            res.json(result);
        } catch (err) {
            console.error('Error PUT /api/modelo-presupuesto/consolidado:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/consolidado/inicializar
    app.post('/api/modelo-presupuesto/consolidado/inicializar', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.editarConsolidado && !req.user.esAdmin) {
                return res.status(403).json({ error: 'No tiene permiso para inicializar años' });
            }
            const { ano } = req.body;
            if (!ano || ano < 2020 || ano > 2050) {
                return res.status(400).json({ error: 'Año inválido' });
            }
            const result = await modeloPresupuesto.initializeYear(ano);
            res.json(result);
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/consolidado/inicializar:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/calcular
    app.post('/api/modelo-presupuesto/calcular', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.ejecutarRecalculo && !req.user.esAdmin) {
                return res.status(403).json({ error: 'No tiene permiso para ejecutar recálculo' });
            }
            const usuario = req.user.email || req.user.nombre;
            const { codAlmacen, mes, nombrePresupuesto } = req.body;
            const result = await modeloPresupuesto.ejecutarCalculo(usuario, codAlmacen || null, mes || null, nombrePresupuesto || null);
            // SP returns a recordset with TotalRegistros
            const totalRegistros = result.recordset?.[0]?.TotalRegistros || 0;
            res.json({ success: true, totalRegistros });
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/calcular:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/validacion
    app.get('/api/modelo-presupuesto/validacion', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            const { nombrePresupuesto } = req.query;
            if (!nombrePresupuesto) return res.status(400).json({ error: 'nombrePresupuesto es requerido' });
            const result = await modeloPresupuesto.getValidacion(nombrePresupuesto);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/validacion:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/ajustes
    app.get('/api/modelo-presupuesto/ajustes', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verAjustePresupuesto) {
                return res.status(403).json({ error: 'No tiene permiso para ver ajustes' });
            }
            const { nombrePresupuesto } = req.query;
            const result = await modeloPresupuesto.getAjustes(nombrePresupuesto);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/ajustes:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/datos-ajuste — chart data
    app.get('/api/modelo-presupuesto/datos-ajuste', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verAjustePresupuesto) {
                return res.status(403).json({ error: 'No tiene permiso para ver datos de ajuste' });
            }
            const { nombrePresupuesto, codAlmacen, mes, canal, tipo } = req.query;
            const result = await modeloPresupuesto.getDatosAjuste(
                nombrePresupuesto, codAlmacen, parseInt(mes), canal, tipo
            );
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/datos-ajuste:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/ajustes/preview
    app.post('/api/modelo-presupuesto/ajustes/preview', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.ajustarCurva) {
                return res.status(403).json({ error: 'No tiene permiso para ajustar la curva' });
            }
            const result = await modeloPresupuesto.previewAjuste(req.body);
            res.json(result);
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/ajustes/preview:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/ajustes/aplicar
    app.post('/api/modelo-presupuesto/ajustes/aplicar', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.ajustarCurva) {
                return res.status(403).json({ error: 'No tiene permiso para ajustar la curva' });
            }
            req.body.usuario = req.user.email || req.user.nombre;
            const result = await modeloPresupuesto.aplicarAjuste(req.body);
            res.json({ success: true, result });
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/ajustes/aplicar:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/modelo-presupuesto/ajustes/:id/desactivar
    app.put('/api/modelo-presupuesto/ajustes/:id/desactivar', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            const usuario = req.user.email || req.user.nombre;
            await modeloPresupuesto.desactivarAjuste(parseInt(req.params.id), usuario);
            res.json({ success: true });
        } catch (err) {
            console.error('Error PUT /api/modelo-presupuesto/ajustes/desactivar:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ------------------------------------------
    // VERSIONES
    // ------------------------------------------

    // GET /api/modelo-presupuesto/versiones
    app.get('/api/modelo-presupuesto/versiones', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verVersiones) {
                return res.status(403).json({ error: 'No tiene permiso para ver versiones' });
            }
            const { nombrePresupuesto } = req.query;
            const result = await modeloPresupuesto.getVersiones(nombrePresupuesto);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/versiones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/versiones/:id/restaurar
    app.post('/api/modelo-presupuesto/versiones/:id/restaurar', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.restaurarVersiones) {
                return res.status(403).json({ error: 'No tiene permiso para restaurar versiones' });
            }
            const usuario = req.user.email || req.user.nombre;
            const result = await modeloPresupuesto.restaurarVersion(
                parseInt(req.params.id), usuario
            );
            res.json({ success: true, result });
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/versiones/restaurar:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/modelo-presupuesto/versiones/:id
    app.delete('/api/modelo-presupuesto/versiones/:id', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.restaurarVersiones) {
                return res.status(403).json({ error: 'No tiene permiso para eliminar versiones' });
            }
            const usuario = req.user.email || req.user.nombre;
            const result = await modeloPresupuesto.eliminarVersion(
                parseInt(req.params.id), usuario
            );
            res.json({ success: true, result });
        } catch (err) {
            console.error('Error DELETE /api/modelo-presupuesto/versiones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ------------------------------------------
    // BITÁCORA
    // ------------------------------------------

    // GET /api/modelo-presupuesto/bitacora
    app.get('/api/modelo-presupuesto/bitacora', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verBitacora) {
                return res.status(403).json({ error: 'No tiene permiso para ver la bitácora' });
            }
            const filtros = {};
            if (req.query.nombrePresupuesto) filtros.nombrePresupuesto = req.query.nombrePresupuesto;
            if (req.query.usuario) filtros.usuario = req.query.usuario;
            if (req.query.mes) filtros.mes = parseInt(req.query.mes);
            if (req.query.codAlmacen) filtros.codAlmacen = req.query.codAlmacen;
            if (req.query.accion) filtros.accion = req.query.accion;
            if (req.query.desde) filtros.desde = req.query.desde;
            if (req.query.hasta) filtros.hasta = req.query.hasta;
            const result = await modeloPresupuesto.getBitacora(filtros);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/bitacora:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ------------------------------------------
    // REFERENCIAS (MAPEO DE LOCALES)
    // ------------------------------------------

    // GET /api/modelo-presupuesto/referencias
    app.get('/api/modelo-presupuesto/referencias', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verReferencias) {
                return res.status(403).json({ error: 'No tiene permiso para ver referencias' });
            }
            const { nombrePresupuesto, ano } = req.query;
            const result = await modeloPresupuesto.getReferencias(nombrePresupuesto, ano ? parseInt(ano) : null);
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/referencias:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/modelo-presupuesto/referencias
    app.post('/api/modelo-presupuesto/referencias', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verReferencias) {
                return res.status(403).json({ error: 'No tiene permiso para gestionar referencias' });
            }
            req.body.usuario = req.user.email || req.user.nombre;
            const id = await modeloPresupuesto.saveReferencia(req.body);
            res.json({ success: true, id });
        } catch (err) {
            console.error('Error POST /api/modelo-presupuesto/referencias:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/modelo-presupuesto/referencias/:id
    app.put('/api/modelo-presupuesto/referencias/:id', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verReferencias) {
                return res.status(403).json({ error: 'No tiene permiso para gestionar referencias' });
            }
            req.body.id = parseInt(req.params.id);
            req.body.usuario = req.user.email || req.user.nombre;
            const id = await modeloPresupuesto.saveReferencia(req.body);
            res.json({ success: true, id });
        } catch (err) {
            console.error('Error PUT /api/modelo-presupuesto/referencias:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/modelo-presupuesto/referencias/:id
    app.delete('/api/modelo-presupuesto/referencias/:id', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verReferencias) {
                return res.status(403).json({ error: 'No tiene permiso para gestionar referencias' });
            }
            await modeloPresupuesto.deleteReferencia(parseInt(req.params.id));
            res.json({ success: true });
        } catch (err) {
            console.error('Error DELETE /api/modelo-presupuesto/referencias:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/resumen-mensual — monthly totals from budget table (for AjusteChart)
    app.get('/api/modelo-presupuesto/resumen-mensual', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            if (!req.user.verAjustePresupuesto) {
                return res.status(403).json({ error: 'No tiene permiso para ver datos de ajuste' });
            }
            const { nombrePresupuesto, codAlmacen, tipo } = req.query;
            const result = await modeloPresupuesto.getResumenMensualPresupuesto(
                nombrePresupuesto, codAlmacen || null, tipo || null
            );
            res.json(result);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/resumen-mensual:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/modelo-presupuesto/stores  (codes + names for dropdowns)
    app.get('/api/modelo-presupuesto/stores', authMiddleware, async (req, res) => {
        try {
            if (!requireModuleAccess(req, res)) return;
            const stores = await modeloPresupuesto.getStoresWithNames();
            res.json(stores);
        } catch (err) {
            console.error('Error GET /api/modelo-presupuesto/stores:', err);
            res.status(500).json({ error: err.message });
        }
    });

    console.log('📊 Modelo Presupuesto endpoints registered');
}

module.exports = registerModeloPresupuestoEndpoints;
