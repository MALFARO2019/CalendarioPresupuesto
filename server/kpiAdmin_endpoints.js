/**
 * kpiAdmin_endpoints.js
 * Endpoints CRUD para el Sistema de Administración de KPIs y Grupos.
 * Registro: registerKpiAdminEndpoints(app, authMiddleware)
 */
const { poolPromise, sql } = require('./db');

function isAdmin(req, res) {
    if (!req.user?.esAdmin) {
        res.status(403).json({ error: 'Se requiere rol de administrador' });
        return false;
    }
    return true;
}

function registerKpiAdminEndpoints(app, authMiddleware) {

    // ==========================================
    // MÓDULOS
    // ==========================================

    // GET /api/kpi-admin/modulos
    app.get('/api/kpi-admin/modulos', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT m.*, 
                    (SELECT COUNT(*) FROM kpi_definitions WHERE modulo_id = m.id) as total_kpis,
                    (SELECT COUNT(*) FROM kpi_grupos WHERE modulo_id = m.id) as total_grupos
                FROM kpi_modulos m
                ORDER BY m.nombre
            `);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting KPI modules:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/kpi-admin/modulos
    app.post('/api/kpi-admin/modulos', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { nombre, descripcion, icono } = req.body;
            if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
            const pool = await poolPromise;
            const result = await pool.request()
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .input('icono', sql.NVarChar, icono || '📊')
                .query(`
                    INSERT INTO kpi_modulos (nombre, descripcion, icono)
                    OUTPUT INSERTED.*
                    VALUES (@nombre, @descripcion, @icono)
                `);
            res.status(201).json(result.recordset[0]);
        } catch (err) {
            console.error('Error creating KPI module:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/modulos/:id
    app.put('/api/kpi-admin/modulos/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { nombre, descripcion, icono, activo } = req.body;
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .input('icono', sql.NVarChar, icono || '📊')
                .input('activo', sql.Bit, activo !== undefined ? activo : 1)
                .query(`
                    UPDATE kpi_modulos 
                    SET nombre=@nombre, descripcion=@descripcion, icono=@icono, activo=@activo
                    OUTPUT INSERTED.*
                    WHERE id=@id
                `);
            if (!result.recordset.length) return res.status(404).json({ error: 'Módulo no encontrado' });
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error updating KPI module:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/kpi-admin/modulos/:id
    app.delete('/api/kpi-admin/modulos/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('DELETE FROM kpi_modulos WHERE id=@id');
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting KPI module:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // KPI DEFINITIONS
    // ==========================================

    // GET /api/kpi-admin/kpis?moduloId=X
    app.get('/api/kpi-admin/kpis', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const { moduloId } = req.query;
            let query = `
                SELECT k.*, m.nombre as modulo_nombre, m.icono as modulo_icono
                FROM kpi_definitions k
                JOIN kpi_modulos m ON m.id = k.modulo_id
                WHERE 1=1
            `;
            const request = pool.request();
            if (moduloId) {
                query += ' AND k.modulo_id = @moduloId';
                request.input('moduloId', sql.Int, parseInt(moduloId));
            }
            query += ' ORDER BY m.nombre, k.nombre';
            const result = await request.query(query);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting KPI definitions:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/kpi-admin/kpis
    app.post('/api/kpi-admin/kpis', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { modulo_id, nombre, descripcion, sql_query, unidad, tipo_vista } = req.body;
            if (!modulo_id || !nombre) return res.status(400).json({ error: 'modulo_id y nombre son requeridos' });
            const pool = await poolPromise;
            const result = await pool.request()
                .input('modulo_id', sql.Int, modulo_id)
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .input('sql_query', sql.NVarChar, sql_query || null)
                .input('unidad', sql.NVarChar, unidad || '%')
                .input('tipo_vista', sql.NVarChar, tipo_vista || 'ambas')
                .query(`
                    INSERT INTO kpi_definitions (modulo_id, nombre, descripcion, sql_query, unidad, tipo_vista)
                    OUTPUT INSERTED.*
                    VALUES (@modulo_id, @nombre, @descripcion, @sql_query, @unidad, @tipo_vista)
                `);
            res.status(201).json(result.recordset[0]);
        } catch (err) {
            console.error('Error creating KPI definition:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/kpis/:id
    app.put('/api/kpi-admin/kpis/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { modulo_id, nombre, descripcion, sql_query, unidad, tipo_vista, activo } = req.body;
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .input('modulo_id', sql.Int, modulo_id)
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .input('sql_query', sql.NVarChar, sql_query || null)
                .input('unidad', sql.NVarChar, unidad || '%')
                .input('tipo_vista', sql.NVarChar, tipo_vista || 'ambas')
                .input('activo', sql.Bit, activo !== undefined ? activo : 1)
                .query(`
                    UPDATE kpi_definitions 
                    SET modulo_id=@modulo_id, nombre=@nombre, descripcion=@descripcion,
                        sql_query=@sql_query, unidad=@unidad, tipo_vista=@tipo_vista, activo=@activo
                    OUTPUT INSERTED.*
                    WHERE id=@id
                `);
            if (!result.recordset.length) return res.status(404).json({ error: 'KPI no encontrado' });
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error updating KPI definition:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/kpi-admin/kpis/:id
    app.delete('/api/kpi-admin/kpis/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('DELETE FROM kpi_definitions WHERE id=@id');
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting KPI definition:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/kpi-admin/kpis/preview - Probar query SQL de un KPI
    app.post('/api/kpi-admin/kpis/preview', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { sql_query, fecha_inicio, fecha_fin, local_grupo } = req.body;
            if (!sql_query) return res.status(400).json({ error: 'sql_query requerido' });

            // Replace params
            let q = sql_query
                .replace(/\{fecha_inicio\}/gi, `'${fecha_inicio || new Date().toISOString().slice(0, 10)}'`)
                .replace(/\{fecha_fin\}/gi, `'${fecha_fin || new Date().toISOString().slice(0, 10)}'`)
                .replace(/\{local_grupo\}/gi, `'${local_grupo || 'Todos'}'`);

            // Safety: only SELECT
            const trimmed = q.trim().toUpperCase();
            if (!trimmed.startsWith('SELECT')) {
                return res.status(400).json({ error: 'Solo se permiten queries SELECT' });
            }

            // Limit rows
            if (!trimmed.includes('TOP ') && !trimmed.includes('FETCH NEXT')) {
                q = q.replace(/SELECT/i, 'SELECT TOP 10');
            }

            const pool = await poolPromise;
            const result = await pool.request().query(q);
            res.json({ rows: result.recordset, rowCount: result.recordset.length });
        } catch (err) {
            console.error('Error previewing KPI query:', err);
            res.status(400).json({ error: err.message });
        }
    });

    // ==========================================
    // GRUPOS
    // ==========================================

    // GET /api/kpi-admin/grupos?moduloId=X
    app.get('/api/kpi-admin/grupos', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const { moduloId } = req.query;
            let query = `
                SELECT g.*, m.nombre as modulo_nombre, m.icono as modulo_icono,
                    (SELECT COUNT(*) FROM kpi_grupo_kpis WHERE grupo_id = g.id) as total_kpis,
                    (SELECT SUM(peso) FROM kpi_grupo_kpis WHERE grupo_id = g.id) as suma_pesos
                FROM kpi_grupos g
                JOIN kpi_modulos m ON m.id = g.modulo_id
                WHERE 1=1
            `;
            const request = pool.request();
            if (moduloId) {
                query += ' AND g.modulo_id = @moduloId';
                request.input('moduloId', sql.Int, parseInt(moduloId));
            }
            query += ' ORDER BY m.nombre, g.nombre';
            const result = await request.query(query);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting KPI groups:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/kpi-admin/grupos
    app.post('/api/kpi-admin/grupos', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { modulo_id, nombre, descripcion } = req.body;
            if (!modulo_id || !nombre) return res.status(400).json({ error: 'modulo_id y nombre son requeridos' });
            const pool = await poolPromise;
            const result = await pool.request()
                .input('modulo_id', sql.Int, modulo_id)
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .query(`
                    INSERT INTO kpi_grupos (modulo_id, nombre, descripcion)
                    OUTPUT INSERTED.*
                    VALUES (@modulo_id, @nombre, @descripcion)
                `);
            res.status(201).json(result.recordset[0]);
        } catch (err) {
            console.error('Error creating KPI group:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/grupos/:id
    app.put('/api/kpi-admin/grupos/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { modulo_id, nombre, descripcion, activo } = req.body;
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .input('modulo_id', sql.Int, modulo_id)
                .input('nombre', sql.NVarChar, nombre)
                .input('descripcion', sql.NVarChar, descripcion || null)
                .input('activo', sql.Bit, activo !== undefined ? activo : 1)
                .query(`
                    UPDATE kpi_grupos 
                    SET modulo_id=@modulo_id, nombre=@nombre, descripcion=@descripcion, activo=@activo
                    OUTPUT INSERTED.*
                    WHERE id=@id
                `);
            if (!result.recordset.length) return res.status(404).json({ error: 'Grupo no encontrado' });
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error updating KPI group:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/kpi-admin/grupos/:id
    app.delete('/api/kpi-admin/grupos/:id', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.Int, parseInt(req.params.id))
                .query('DELETE FROM kpi_grupos WHERE id=@id');
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting KPI group:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/kpi-admin/grupos/:id/kpis - KPIs de un grupo con sus pesos
    app.get('/api/kpi-admin/grupos/:id/kpis', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('grupo_id', sql.Int, parseInt(req.params.id))
                .query(`
                    SELECT gk.*, k.nombre as kpi_nombre, k.unidad, k.descripcion as kpi_descripcion
                    FROM kpi_grupo_kpis gk
                    JOIN kpi_definitions k ON k.id = gk.kpi_id
                    WHERE gk.grupo_id = @grupo_id
                    ORDER BY gk.orden, k.nombre
                `);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting group KPIs:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/grupos/:id/kpis - Reemplaza la lista de KPIs del grupo
    // Body: { kpis: [{kpi_id, peso, orden}] }
    app.put('/api/kpi-admin/grupos/:id/kpis', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const grupoId = parseInt(req.params.id);
            const { kpis } = req.body; // [{kpi_id, peso, orden}]
            if (!Array.isArray(kpis)) return res.status(400).json({ error: 'kpis debe ser un array' });

            const sumaPesos = kpis.reduce((s, k) => s + (parseFloat(k.peso) || 0), 0);
            if (kpis.length > 0 && Math.abs(sumaPesos - 100) > 0.1) {
                return res.status(400).json({ error: `Los pesos deben sumar 100 (actualmente: ${sumaPesos.toFixed(1)})` });
            }

            const pool = await poolPromise;
            const transaction = pool.transaction();
            await transaction.begin();
            try {
                await transaction.request()
                    .input('grupo_id', sql.Int, grupoId)
                    .query('DELETE FROM kpi_grupo_kpis WHERE grupo_id = @grupo_id');

                for (let i = 0; i < kpis.length; i++) {
                    const k = kpis[i];
                    await transaction.request()
                        .input('grupo_id', sql.Int, grupoId)
                        .input('kpi_id', sql.Int, k.kpi_id)
                        .input('peso', sql.Decimal(5, 2), parseFloat(k.peso) || 0)
                        .input('orden', sql.Int, k.orden ?? i)
                        .query('INSERT INTO kpi_grupo_kpis (grupo_id, kpi_id, peso, orden) VALUES (@grupo_id, @kpi_id, @peso, @orden)');
                }
                await transaction.commit();
                res.json({ success: true, kpis });
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        } catch (err) {
            console.error('Error updating group KPIs:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // CONFIGURACIONES (Metas y Umbrales)
    // ==========================================

    // GET /api/kpi-admin/configuraciones?kpiId=X
    app.get('/api/kpi-admin/configuraciones', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const { kpiId } = req.query;
            let query = `
                SELECT c.*, k.nombre as kpi_nombre, k.unidad
                FROM kpi_configuraciones c
                JOIN kpi_definitions k ON k.id = c.kpi_id
                WHERE 1=1
            `;
            const request = pool.request();
            if (kpiId) {
                query += ' AND c.kpi_id = @kpiId';
                request.input('kpiId', sql.Int, parseInt(kpiId));
            }
            query += ' ORDER BY k.nombre, c.local_grupo';
            const result = await request.query(query);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting KPI configs:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/configuraciones - Upsert configuración
    // Body: { kpi_id, local_grupo, meta_default, meta_enero...meta_diciembre, umbral_rojo, umbral_amarillo }
    app.put('/api/kpi-admin/configuraciones', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const {
                kpi_id, local_grupo = 'Todos',
                meta_default, meta_enero, meta_febrero, meta_marzo, meta_abril, meta_mayo, meta_junio,
                meta_julio, meta_agosto, meta_setiembre, meta_octubre, meta_noviembre, meta_diciembre,
                umbral_rojo = 75, umbral_amarillo = 90
            } = req.body;

            if (!kpi_id) return res.status(400).json({ error: 'kpi_id requerido' });

            const pool = await poolPromise;
            const r = pool.request()
                .input('kpi_id', sql.Int, kpi_id)
                .input('local_grupo', sql.NVarChar, local_grupo)
                .input('meta_default', sql.Decimal(15, 4), meta_default ?? null)
                .input('meta_enero', sql.Decimal(15, 4), meta_enero ?? null)
                .input('meta_febrero', sql.Decimal(15, 4), meta_febrero ?? null)
                .input('meta_marzo', sql.Decimal(15, 4), meta_marzo ?? null)
                .input('meta_abril', sql.Decimal(15, 4), meta_abril ?? null)
                .input('meta_mayo', sql.Decimal(15, 4), meta_mayo ?? null)
                .input('meta_junio', sql.Decimal(15, 4), meta_junio ?? null)
                .input('meta_julio', sql.Decimal(15, 4), meta_julio ?? null)
                .input('meta_agosto', sql.Decimal(15, 4), meta_agosto ?? null)
                .input('meta_setiembre', sql.Decimal(15, 4), meta_setiembre ?? null)
                .input('meta_octubre', sql.Decimal(15, 4), meta_octubre ?? null)
                .input('meta_noviembre', sql.Decimal(15, 4), meta_noviembre ?? null)
                .input('meta_diciembre', sql.Decimal(15, 4), meta_diciembre ?? null)
                .input('umbral_rojo', sql.Decimal(5, 2), umbral_rojo)
                .input('umbral_amarillo', sql.Decimal(5, 2), umbral_amarillo);

            await r.query(`
                MERGE kpi_configuraciones AS target
                USING (SELECT @kpi_id AS kpi_id, @local_grupo AS local_grupo) AS source
                ON target.kpi_id = source.kpi_id AND target.local_grupo = source.local_grupo
                WHEN MATCHED THEN UPDATE SET
                    meta_default=@meta_default, meta_enero=@meta_enero, meta_febrero=@meta_febrero,
                    meta_marzo=@meta_marzo, meta_abril=@meta_abril, meta_mayo=@meta_mayo,
                    meta_junio=@meta_junio, meta_julio=@meta_julio, meta_agosto=@meta_agosto,
                    meta_setiembre=@meta_setiembre, meta_octubre=@meta_octubre, meta_noviembre=@meta_noviembre,
                    meta_diciembre=@meta_diciembre, umbral_rojo=@umbral_rojo, umbral_amarillo=@umbral_amarillo
                WHEN NOT MATCHED THEN INSERT 
                    (kpi_id, local_grupo, meta_default, meta_enero, meta_febrero, meta_marzo, meta_abril,
                     meta_mayo, meta_junio, meta_julio, meta_agosto, meta_setiembre, meta_octubre,
                     meta_noviembre, meta_diciembre, umbral_rojo, umbral_amarillo)
                VALUES (@kpi_id, @local_grupo, @meta_default, @meta_enero, @meta_febrero, @meta_marzo,
                        @meta_abril, @meta_mayo, @meta_junio, @meta_julio, @meta_agosto, @meta_setiembre,
                        @meta_octubre, @meta_noviembre, @meta_diciembre, @umbral_rojo, @umbral_amarillo);
            `);
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving KPI config:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/kpi-admin/configuraciones/:kpiId/:localGrupo
    app.delete('/api/kpi-admin/configuraciones/:kpiId/:localGrupo', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('kpi_id', sql.Int, parseInt(req.params.kpiId))
                .input('local_grupo', sql.NVarChar, req.params.localGrupo)
                .query('DELETE FROM kpi_configuraciones WHERE kpi_id=@kpi_id AND local_grupo=@local_grupo');
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting KPI config:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // ASIGNACIONES DE GERENTES
    // ==========================================

    // GET /api/kpi-admin/asignaciones?grupoId=X
    app.get('/api/kpi-admin/asignaciones', authMiddleware, async (req, res) => {
        try {
            const pool = await poolPromise;
            const { grupoId } = req.query;
            let query = `
                SELECT a.*, g.nombre as grupo_nombre
                FROM kpi_grupo_asignaciones a
                JOIN kpi_grupos g ON g.id = a.grupo_id
                WHERE 1=1
            `;
            const request = pool.request();
            if (grupoId) {
                query += ' AND a.grupo_id = @grupoId';
                request.input('grupoId', sql.Int, parseInt(grupoId));
            }
            query += ' ORDER BY g.nombre, a.local_grupo';
            const result = await request.query(query);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error getting KPI assignments:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/kpi-admin/asignaciones - Upsert asignación de gerente
    app.put('/api/kpi-admin/asignaciones', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const { grupo_id, local_grupo, gerente, activo = true } = req.body;
            if (!grupo_id || !local_grupo) return res.status(400).json({ error: 'grupo_id y local_grupo requeridos' });

            const pool = await poolPromise;
            await pool.request()
                .input('grupo_id', sql.Int, grupo_id)
                .input('local_grupo', sql.NVarChar, local_grupo)
                .input('gerente', sql.NVarChar, gerente || null)
                .input('activo', sql.Bit, activo ? 1 : 0)
                .query(`
                    MERGE kpi_grupo_asignaciones AS target
                    USING (SELECT @grupo_id AS grupo_id, @local_grupo AS local_grupo) AS source
                    ON target.grupo_id = source.grupo_id AND target.local_grupo = source.local_grupo
                    WHEN MATCHED THEN UPDATE SET gerente=@gerente, activo=@activo
                    WHEN NOT MATCHED THEN INSERT (grupo_id, local_grupo, gerente, activo) 
                        VALUES (@grupo_id, @local_grupo, @gerente, @activo);
                `);
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving KPI assignment:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/kpi-admin/asignaciones/:grupoId/:localGrupo
    app.delete('/api/kpi-admin/asignaciones/:grupoId/:localGrupo', authMiddleware, async (req, res) => {
        if (!isAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('grupo_id', sql.Int, parseInt(req.params.grupoId))
                .input('local_grupo', sql.NVarChar, req.params.localGrupo)
                .query('DELETE FROM kpi_grupo_asignaciones WHERE grupo_id=@grupo_id AND local_grupo=@local_grupo');
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting KPI assignment:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // VISTA GERENCIAL
    // ==========================================

    /**
     * GET /api/kpi-admin/vista-gerencial
     * ?grupoId=1&fechaInicio=2026-01-01&fechaFin=2026-02-28
     * &comparaInicio=2025-01-01&comparaFin=2025-02-28 (opcional)
     * 
     * Para cada local del grupo, ejecuta los KPIs y calcula la Nota General.
     * Si el KPI no tiene sql_query, retorna null (placeholder manual).
     */
    app.get('/api/kpi-admin/vista-gerencial', authMiddleware, async (req, res) => {
        try {
            const { grupoId, fechaInicio, fechaFin, comparaInicio, comparaFin } = req.query;
            if (!grupoId) return res.status(400).json({ error: 'grupoId requerido' });

            const pool = await poolPromise;

            // 1. Obtener KPIs del grupo con sus pesos
            const grupoKpis = await pool.request()
                .input('grupo_id', sql.Int, parseInt(grupoId))
                .query(`
                    SELECT gk.kpi_id, gk.peso, gk.orden,
                           k.nombre, k.sql_query, k.unidad
                    FROM kpi_grupo_kpis gk
                    JOIN kpi_definitions k ON k.id = gk.kpi_id
                    WHERE gk.grupo_id = @grupo_id
                    ORDER BY gk.orden, k.nombre
                `);

            // 2. Obtener locales/gerentes del grupo
            const asignaciones = await pool.request()
                .input('grupo_id', sql.Int, parseInt(grupoId))
                .query(`
                    SELECT local_grupo, gerente
                    FROM kpi_grupo_asignaciones
                    WHERE grupo_id = @grupo_id AND activo = 1
                    ORDER BY local_grupo
                `);

            // 3. Obtener configuraciones (metas y umbrales)
            const configs = await pool.request()
                .input('grupo_id', sql.Int, parseInt(grupoId))
                .query(`
                    SELECT c.kpi_id, c.local_grupo, c.meta_default,
                           c.meta_enero, c.meta_febrero, c.meta_marzo, c.meta_abril,
                           c.meta_mayo, c.meta_junio, c.meta_julio, c.meta_agosto,
                           c.meta_setiembre, c.meta_octubre, c.meta_noviembre, c.meta_diciembre,
                           c.umbral_rojo, c.umbral_amarillo
                    FROM kpi_configuraciones c
                    JOIN kpi_grupo_kpis gk ON gk.kpi_id = c.kpi_id
                    WHERE gk.grupo_id = @grupo_id
                `);

            // Map de configs: kpiId -> localGrupo -> config
            const configMap = {};
            configs.recordset.forEach(c => {
                if (!configMap[c.kpi_id]) configMap[c.kpi_id] = {};
                configMap[c.kpi_id][c.local_grupo] = c;
            });

            const mesInicio = fechaInicio ? new Date(fechaInicio).getMonth() + 1 : new Date().getMonth() + 1;
            const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

            function getMeta(kpiId, localGrupo, mes) {
                const localConfig = configMap[kpiId]?.[localGrupo];
                const globalConfig = configMap[kpiId]?.['Todos'];
                const cfg = localConfig || globalConfig;
                if (!cfg) return null;
                const mesMeta = cfg[`meta_${MESES[mes]}`];
                return mesMeta ?? cfg.meta_default ?? null;
            }

            function getUmbrales(kpiId, localGrupo) {
                const localConfig = configMap[kpiId]?.[localGrupo];
                const globalConfig = configMap[kpiId]?.['Todos'];
                const cfg = localConfig || globalConfig;
                return { rojo: cfg?.umbral_rojo ?? 75, amarillo: cfg?.umbral_amarillo ?? 90 };
            }

            function getColor(valorPct, umbrales) {
                if (valorPct === null) return 'gray';
                if (valorPct < umbrales.rojo) return 'red';
                if (valorPct < umbrales.amarillo) return 'yellow';
                return 'green';
            }

            // 4. Para cada local, ejecutar cada KPI
            const locales = asignaciones.recordset;
            const kpis = grupoKpis.recordset;

            const rows = [];
            for (const local of locales) {
                const kpiResults = [];
                let notaTotal = 0;
                let pesoUsado = 0;

                for (const kpi of kpis) {
                    let valor = null;
                    let valorCompa = null;
                    try {
                        if (kpi.sql_query) {
                            const q = kpi.sql_query
                                .replace(/\{fecha_inicio\}/gi, `'${fechaInicio}'`)
                                .replace(/\{fecha_fin\}/gi, `'${fechaFin}'`)
                                .replace(/\{local_grupo\}/gi, `'${local.local_grupo}'`);
                            const r = await pool.request().query(q);
                            if (r.recordset.length > 0) {
                                const row = r.recordset[0];
                                valor = Object.values(row)[0]; // first column = valor
                            }

                            if (comparaInicio && comparaFin) {
                                const qC = kpi.sql_query
                                    .replace(/\{fecha_inicio\}/gi, `'${comparaInicio}'`)
                                    .replace(/\{fecha_fin\}/gi, `'${comparaFin}'`)
                                    .replace(/\{local_grupo\}/gi, `'${local.local_grupo}'`);
                                const rC = await pool.request().query(qC);
                                if (rC.recordset.length > 0) {
                                    valorCompa = Object.values(rC.recordset[0])[0];
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`KPI query error for ${kpi.nombre}:`, e.message);
                    }

                    const meta = getMeta(kpi.kpi_id, local.local_grupo, mesInicio);
                    const umbrales = getUmbrales(kpi.kpi_id, local.local_grupo);
                    const pctVsMeta = (valor !== null && meta) ? (valor / meta) * 100 : null;
                    const delta = (valorCompa !== null && valor !== null) ? valor - valorCompa : null;
                    const deltaPct = (valorCompa && delta !== null) ? (delta / valorCompa) * 100 : null;

                    if (pctVsMeta !== null) {
                        notaTotal += (pctVsMeta / 100) * kpi.peso;
                        pesoUsado += kpi.peso;
                    }

                    kpiResults.push({
                        kpi_id: kpi.kpi_id,
                        nombre: kpi.nombre,
                        unidad: kpi.unidad,
                        peso: kpi.peso,
                        valor,
                        valorCompa,
                        meta,
                        pctVsMeta,
                        delta,
                        deltaPct,
                        color: getColor(pctVsMeta, umbrales),
                        umbrales
                    });
                }

                const nota = pesoUsado > 0 ? (notaTotal / pesoUsado) * 100 : null;

                rows.push({
                    local_grupo: local.local_grupo,
                    gerente: local.gerente,
                    kpis: kpiResults,
                    nota: nota !== null ? Math.round(nota) : null
                });
            }

            res.json({
                grupo_id: parseInt(grupoId),
                periodo: { inicio: fechaInicio, fin: fechaFin },
                comparacion: comparaInicio ? { inicio: comparaInicio, fin: comparaFin } : null,
                kpi_headers: kpis.map(k => ({ id: k.kpi_id, nombre: k.nombre, unidad: k.unidad, peso: k.peso })),
                rows
            });
        } catch (err) {
            console.error('Error in vista-gerencial:', err);
            res.status(500).json({ error: err.message });
        }
    });

    console.log('✅ KPI Admin endpoints registered');
}

module.exports = { registerKpiAdminEndpoints };
