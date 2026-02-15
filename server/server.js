const express = require('express');
const cors = require('cors');
const { sql, poolPromise } = require('./db');
const {
    ensureSecurityTables,
    loginUser,
    authMiddleware,
    verifyTokenValid,
    verifyAdminPassword,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser
} = require('./auth');
const { sendPasswordEmail, sendReportEmail, verifyEmailService } = require('./emailService');
const { getTendenciaData, getResumenCanal } = require('./tendencia');
const { generateTacticaAnalysis } = require('./tacticaAI');
const {
    getAllEventos,
    createEvento,
    updateEvento,
    deleteEvento,
    getEventoFechas,
    createEventoFecha,
    updateEventoFecha,
    deleteEventoFecha
} = require('./eventos');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize security tables on startup
ensureSecurityTables();

// ==========================================
// AUTH ENDPOINTS (public)
// ==========================================

// POST /api/auth/login - Login with email + PIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, clave } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email es requerido' });
        }
        if (!clave) {
            return res.status(400).json({ error: 'Clave es requerida' });
        }
        const result = await loginUser(email.trim().toLowerCase(), clave.trim());
        if (!result.success) {
            return res.status(401).json({ error: result.message });
        }
        res.json(result);
    } catch (err) {
        console.error('Error in /api/auth/login:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/verify - Verify JWT token is still valid (checks PIN hasn't changed)
app.post('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
        const isValid = await verifyTokenValid(req.user);
        if (!isValid) {
            return res.status(401).json({ error: 'Sesión inválida. La clave fue cambiada o el usuario fue eliminado.' });
        }
        res.json({ valid: true, user: req.user });
    } catch (err) {
        res.status(401).json({ error: 'Error verificando sesión' });
    }
});

// POST /api/auth/send-password - Send password to user's email
app.post('/api/auth/send-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email es requerido' });
        }

        // Get user from database
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.NVarChar, email.trim().toLowerCase())
            .query('SELECT Email, Nombre, Clave FROM APP_USUARIOS WHERE Email = @email AND Activo = 1');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = result.recordset[0];

        // Send email
        const emailSent = await sendPasswordEmail(user.Email, user.Clave, user.Nombre);

        if (emailSent) {
            res.json({ success: true, message: 'Clave enviada al correo' });
        } else {
            res.status(500).json({ error: 'Error al enviar el correo. Intenta de nuevo.' });
        }
    } catch (err) {
        console.error('Error in /api/auth/send-password:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ADMIN ENDPOINTS (protected by admin password)
// ==========================================

// POST /api/admin/verify - Verify admin password
app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    if (verifyAdminPassword(password)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Clave incorrecta' });
    }
});

// GET /api/admin/users - List all users (admin only)
app.get('/api/admin/users', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const users = await getAllUsers();
        res.json(users);
    } catch (err) {
        console.error('Error in /api/admin/users:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users - Create a user (admin only)
app.post('/api/admin/users', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { email, nombre, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin } = req.body;
        const result = await createUser(email.trim().toLowerCase(), nombre, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin);
        res.json({ success: true, userId: result.userId, clave: result.clave });
    } catch (err) {
        console.error('Error creating user:', err);
        if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
            res.status(400).json({ error: 'El email ya está registrado' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// PUT /api/admin/users/:id - Update a user (admin only)
app.put('/api/admin/users/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { email, nombre, activo, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin } = req.body;
        await updateUser(parseInt(req.params.id), email.trim().toLowerCase(), nombre, activo, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/users/:id - Delete a user (admin only)
app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        await deleteUser(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DATA ENDPOINTS (protected by auth)
// ==========================================

// GET /api/budget?year=2026&local=...&canal=Todos&tipo=Ventas
app.get('/api/budget', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const year = parseInt(req.query.year) || 2026;
        const local = req.query.local;
        const canal = req.query.canal || 'Todos';
        const tipo = req.query.tipo || 'Ventas';

        if (!local) {
            return res.status(400).json({ error: 'El parámetro local es requerido' });
        }

        // Check user permissions for requested store
        const userStores = req.user.allowedStores || [];
        if (userStores.length > 0 && !userStores.includes(local)) {
            return res.status(403).json({ error: 'No tiene acceso a este local' });
        }

        // Detect if local is a group (CODALMACEN starts with 'G')
        let memberLocals = null;
        const idGrupoQuery = `
            SELECT GA.IDGRUPO
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
            WHERE GA.CODVISIBLE = 20 AND GA.DESCRIPCION = @groupName
        `;
        const idGrupoRequest = pool.request();
        idGrupoRequest.input('groupName', sql.NVarChar, local);
        const idGrupoResult = await idGrupoRequest.query(idGrupoQuery);

        if (idGrupoResult.recordset.length > 0) {
            // It's a group - find member stores
            const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);
            const memberCodesQuery = `
                SELECT DISTINCT GL.CODALMACEN
                FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
                WHERE GL.IDGRUPO IN (${idGrupos.map((_, i) => `@idgrupo${i}`).join(', ')})
            `;
            const memberCodesRequest = pool.request();
            idGrupos.forEach((id, i) => memberCodesRequest.input(`idgrupo${i}`, sql.Int, id));
            const memberCodesResult = await memberCodesRequest.query(memberCodesQuery);
            const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN);

            if (memberCodes.length > 0) {
                const localsQuery = `
                    SELECT DISTINCT Local
                    FROM RSM_ALCANCE_DIARIO
                    WHERE Año = @year
                    AND CODALMACEN IN (${memberCodes.map((_, i) => `@mcode${i}`).join(', ')})
                    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                `;
                const localsRequest = pool.request();
                localsRequest.input('year', sql.Int, year);
                memberCodes.forEach((code, i) => localsRequest.input(`mcode${i}`, sql.NVarChar, code));
                const localsResult = await localsRequest.query(localsQuery);
                memberLocals = localsResult.recordset.map(r => r.Local);
                console.log(`🏪 Group "${local}" members (${memberLocals.length}):`, memberLocals);
            }
        }

        // Build local filter
        let localFilter = '';
        const localParams = {};
        if (memberLocals && memberLocals.length > 0) {
            const ph = memberLocals.map((_, i) => `@ml${i}`).join(', ');
            localFilter = `Local IN (${ph})`;
            memberLocals.forEach((name, i) => { localParams[`ml${i}`] = name; });
        } else {
            localFilter = 'Local = @local';
            localParams['local'] = local;
        }

        const query = `
            SELECT 
                Fecha, 
                Año, 
                Mes, 
                Dia, 
                '${local}' as Local, 
                Canal, 
                Tipo,
                SUM(MontoReal) AS MontoReal, 
                SUM(Monto) AS Monto, 
                SUM(Monto_Acumulado) AS Monto_Acumulado, 
                SUM(MontoAnterior) AS MontoAnterior, 
                SUM(MontoAnterior_Acumulado) AS MontoAnterior_Acumulado, 
                SUM(MontoAnteriorAjustado) AS MontoAnteriorAjustado, 
                SUM(MontoAnteriorAjustado_Acumulado) AS MontoAnteriorAjustado_Acumulado
            FROM RSM_ALCANCE_DIARIO 
            WHERE Año = @year AND ${localFilter} AND Canal = @canal AND Tipo = @tipo
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            GROUP BY Fecha, Año, Mes, Dia, Canal, Tipo
            ORDER BY Mes, Dia
        `;
        const request = pool.request()
            .input('year', sql.Int, year)
            .input('canal', sql.NVarChar, canal)
            .input('tipo', sql.NVarChar, tipo);

        // Add local filter params
        Object.entries(localParams).forEach(([key, val]) => {
            request.input(key, sql.NVarChar, val);
        });

        const result = await request.query(query);
        console.log(`📊 Budget data for ${local} (${canal}/${tipo}): ${result.recordset.length} records`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error in /api/budget:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stores - Return stores and groups user has access to
app.get('/api/stores', authMiddleware, async (req, res) => {
    console.log('📍 /api/stores called by user:', req.user?.email);
    try {
        const pool = await poolPromise;
        const userStores = req.user.allowedStores || [];

        // First, get oficial group names from GRUPOSALMACENCAB table
        const groupNamesQuery = `
            SELECT DISTINCT DESCRIPCION 
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB 
            WHERE CODVISIBLE = 20
        `;

        const groupNamesResult = await pool.request().query(groupNamesQuery);
        const officialGroupNames = new Set(groupNamesResult.recordset.map(r => r.DESCRIPCION));
        console.log('📋 Official group names from GRUPOSALMACENCAB:', Array.from(officialGroupNames));

        // Then get all locals from budget data
        let localsQuery = 'SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE Año = 2026';

        if (userStores.length > 0) {
            // User has specific store permissions
            const request = pool.request();
            const storeList = userStores.map((s, i) => `@store${i}`).join(', ');

            localsQuery += ` AND Local IN (${storeList})`;

            userStores.forEach((store, i) => {
                request.input(`store${i}`, sql.NVarChar, store);
            });

            localsQuery += ' ORDER BY Local';

            const result = await request.query(localsQuery);
            const allLocals = result.recordset.map(r => r.Local);

            // Separate based on official group names
            const groups = allLocals.filter(local => officialGroupNames.has(local));
            const individuals = allLocals.filter(local => !officialGroupNames.has(local));

            res.json({ groups, individuals });
        } else {
            // User has access to all stores
            localsQuery += ' ORDER BY Local';

            const result = await pool.request().query(localsQuery);
            const allLocals = result.recordset.map(r => r.Local);

            // Separate based on official group names
            const groups = allLocals.filter(local => officialGroupNames.has(local));
            const individuals = allLocals.filter(local => !officialGroupNames.has(local));

            res.json({ groups, individuals });
        }
    } catch (err) {
        console.error('Error in /api/stores:', err);
        res.status(500).json({ error: err.message });
    }
});

// TEST endpoint - remove after debugging
app.get('/api/test-stores', async (req, res) => {
    try {
        const pool = await poolPromise;
        const query = 'SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE Año = 2026 ORDER BY Local';
        const result = await pool.request().query(query);
        const allLocals = result.recordset.map(r => r.Local);

        const groups = allLocals.filter(local =>
            local.toLowerCase().startsWith('zona') ||
            local.toLowerCase().includes('corporativo') ||
            local.toLowerCase().includes('sss')
        );
        const individuals = allLocals.filter(local => !groups.includes(local));

        res.json({
            success: true,
            total: allLocals.length,
            groups: groups,
            individuals: individuals
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// NEW STORES endpoint with correct group detection
app.get('/api/stores-v2', authMiddleware, async (req, res) => {
    console.log('📍 /api/stores-v2 called by user:', req.user?.email);
    try {
        const pool = await poolPromise;
        const userStores = req.user.allowedStores || [];
        const currentMonth = new Date().getMonth() + 1; // 1-12

        // Query to get groups: Local with CODALMACEN starting with 'G'
        let groupsQuery = `
            SELECT DISTINCT Local
            FROM RSM_ALCANCE_DIARIO 
            WHERE Año = 2026 
            AND Canal = 'Todos' 
            AND Tipo = 'Ventas' 
            AND Mes = @month
            AND SUBSTRING(CODALMACEN, 1, 1) = 'G'
        `;

        // Query to get all locals
        let allLocalsQuery = `SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE Año = 2026`;

        if (userStores.length > 0) {
            // User has specific store permissions
            const request = pool.request();
            request.input('month', sql.Int, currentMonth);

            const storeList = userStores.map((s, i) => `@store${i}`).join(', ');
            groupsQuery += ` AND Local IN (${storeList})`;
            allLocalsQuery += ` AND Local IN (${storeList})`;

            userStores.forEach((store, i) => {
                request.input(`store${i}`, sql.NVarChar, store);
            });

            groupsQuery += ' ORDER BY Local';
            allLocalsQuery += ' ORDER BY Local';

            // Get groups
            const groupsResult = await request.query(groupsQuery);
            const groups = groupsResult.recordset.map(r => r.Local);

            // Get all locals
            const allRequest = pool.request();
            userStores.forEach((store, i) => {
                allRequest.input(`store${i}`, sql.NVarChar, store);
            });
            const allResult = await allRequest.query(allLocalsQuery);
            const allLocals = allResult.recordset.map(r => r.Local);

            // Individuals = all locals minus groups
            const groupSet = new Set(groups);
            const individuals = allLocals.filter(local => !groupSet.has(local));

            console.log(`✅ Found ${groups.length} groups and ${individuals.length} individuals`);
            res.json({ groups, individuals });
        } else {
            // User has access to all stores
            groupsQuery += ' ORDER BY Local';
            allLocalsQuery += ' ORDER BY Local';

            const groupsRequest = pool.request();
            groupsRequest.input('month', sql.Int, currentMonth);
            const groupsResult = await groupsRequest.query(groupsQuery);
            const groups = groupsResult.recordset.map(r => r.Local);

            const allResult = await pool.request().query(allLocalsQuery);
            const allLocals = allResult.recordset.map(r => r.Local);

            const groupSet = new Set(groups);
            const individuals = allLocals.filter(local => !groupSet.has(local));

            console.log(`✅ Found ${groups.length} groups and ${individuals.length} individuals (all access)`);
            res.json({ groups, individuals });
        }
    } catch (err) {
        console.error('❌ Error in /api/stores-v2:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/group-stores/:groupName - Get individual stores that belong to a group
app.get('/api/group-stores/:groupName', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const groupName = req.params.groupName;

        console.log(`🔍 Looking up group members for: "${groupName}"`);

        // Step 1: Find the IDGRUPO from GRUPOSALMACENCAB using the group name
        // The Local name in RSM_ALCANCE_DIARIO matches DESCRIPCION in GRUPOSALMACENCAB
        const idGrupoQuery = `
            SELECT GA.IDGRUPO, GA.DESCRIPCION
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
            WHERE GA.CODVISIBLE = 20
            AND GA.DESCRIPCION = @groupName
        `;

        const idGrupoRequest = pool.request();
        idGrupoRequest.input('groupName', sql.NVarChar, groupName);

        const idGrupoResult = await idGrupoRequest.query(idGrupoQuery);
        console.log(`📋 IDGRUPO results for "${groupName}":`, idGrupoResult.recordset);

        if (idGrupoResult.recordset.length === 0) {
            console.log(`⚠️ No IDGRUPO found for group name: "${groupName}"`);
            return res.json({ stores: [] });
        }

        const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);

        // Step 2: Get member store CODALMACEN from GRUPOSALMACENLIN
        const memberCodesQuery = `
            SELECT DISTINCT GL.CODALMACEN
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
            WHERE GL.IDGRUPO IN (${idGrupos.map((_, i) => `@idgrupo${i}`).join(', ')})
        `;

        const memberCodesRequest = pool.request();
        idGrupos.forEach((id, i) => {
            memberCodesRequest.input(`idgrupo${i}`, sql.Int, id);
        });

        const memberCodesResult = await memberCodesRequest.query(memberCodesQuery);
        const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN);

        console.log(`📋 Member CODALMACEN codes (${memberCodes.length}):`, memberCodes);

        if (memberCodes.length === 0) {
            return res.json({ stores: [] });
        }

        // Step 3: Map member CODALMACEN to Local names via RSM_ALCANCE_DIARIO
        const storesQuery = `
            SELECT DISTINCT Local
            FROM RSM_ALCANCE_DIARIO
            WHERE Año = 2026
            AND CODALMACEN IN (${memberCodes.map((_, i) => `@mcode${i}`).join(', ')})
            ORDER BY Local
        `;

        const storesRequest = pool.request();
        memberCodes.forEach((code, i) => {
            storesRequest.input(`mcode${i}`, sql.NVarChar, code);
        });

        const storesResult = await storesRequest.query(storesQuery);
        const stores = storesResult.recordset.map(r => r.Local);

        console.log(`🏪 Group "${groupName}" has ${stores.length} individual stores:`, stores);
        res.json({ stores });
    } catch (err) {
        console.error('❌ Error in /api/group-stores:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/all-stores - Return ALL stores (for admin panel)
app.get('/api/all-stores', authMiddleware, async (req, res) => {
    try {
        // No permission check needed - all authenticated users can see stores
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE AÑO = 2026 ORDER BY Local');
        const stores = result.recordset.map(r => r.Local);
        res.json(stores);
    } catch (err) {
        console.error('Error in /api/all-stores:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/columns - Debug endpoint
app.get('/api/columns', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query("SELECT TOP 1 * FROM RSM_ALCANCE_DIARIO WHERE AÑO = 2026");

        if (result.recordset.length > 0) {
            res.json({
                columns: Object.keys(result.recordset[0]),
                sample: result.recordset[0]
            });
        } else {
            res.json({ columns: [], sample: null });
        }
    } catch (err) {
        console.error('Error in /api/columns:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// TENDENCIA ALCANCE ENDPOINT
// ==========================================

app.get('/api/tendencia', authMiddleware, getTendenciaData);
app.get('/api/tendencia/resumen-canal', authMiddleware, getResumenCanal);

// ==========================================
// EVENTOS ENDPOINTS (protected by AccesoEventos permission)
//==========================================

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
        const { idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, usuario } = req.body;
        await createEventoFecha(idEvento, fecha, fechaEfectiva, canal, grupoAlmacen, usuario);
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
        const { idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, usuario } = req.body;
        await updateEventoFecha(idEvento, oldFecha, newFecha, fechaEfectiva, canal, grupoAlmacen, usuario);
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

// ==========================================
// REPORT EMAIL ENDPOINT
// ==========================================

// POST /api/send-report - Send report as HTML email
app.post('/api/send-report', authMiddleware, async (req, res) => {
    try {
        const { recipientEmail, reportTitle, reportData, htmlContent } = req.body;

        if (!recipientEmail) {
            return res.status(400).json({ error: 'Email del destinatario es requerido' });
        }
        if (!htmlContent) {
            return res.status(400).json({ error: 'Contenido HTML es requerido' });
        }

        const senderName = req.user?.nombre || req.user?.email || 'Usuario';
        const title = reportTitle || 'Reporte Calendario de Presupuesto';

        const success = await sendReportEmail(
            recipientEmail,
            senderName,
            title,
            reportData || {},
            htmlContent
        );

        if (success) {
            res.json({ success: true, message: 'Reporte enviado exitosamente' });
        } else {
            res.status(500).json({ error: 'Error al enviar el correo. Verifica la configuración de Database Mail.' });
        }
    } catch (err) {
        console.error('Error in /api/send-report:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CONFIG ENDPOINTS (admin only)
// ==========================================

// GET /api/admin/config/:key - Get a config value
app.get('/api/admin/config/:key', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const pool = await poolPromise;
        const result = await pool.request()
            .input('clave', sql.NVarChar, req.params.key)
            .query('SELECT Valor, FechaModificacion, UsuarioModificacion FROM APP_CONFIGURACION WHERE Clave = @clave');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error in GET /api/admin/config:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/config/:key - Save a config value
app.put('/api/admin/config/:key', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { valor } = req.body;
        if (!valor || !valor.trim()) {
            return res.status(400).json({ error: 'El valor es requerido' });
        }

        const pool = await poolPromise;
        const result = await pool.request()
            .input('clave', sql.NVarChar, req.params.key)
            .input('valor', sql.NVarChar, valor)
            .input('usuario', sql.NVarChar, req.user.email || 'admin')
            .query(`
                MERGE APP_CONFIGURACION AS target
                USING (SELECT @clave AS Clave) AS source
                ON target.Clave = source.Clave
                WHEN MATCHED THEN
                    UPDATE SET Valor = @valor, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN
                    INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES (@clave, @valor, GETDATE(), @usuario);
            `);

        console.log(`✅ Config '${req.params.key}' updated by ${req.user.email}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Error in PUT /api/admin/config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tactica - Generate AI tactical analysis
app.post('/api/tactica', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        if (!data || !data.monthlyData || !data.annualTotals) {
            return res.status(400).json({ error: 'Datos mensuales y totales anuales son requeridos' });
        }
        console.log(`🤖 Táctica requested for ${data.storeName} (${data.kpi}) by ${req.user?.email}`);

        // Read custom prompt from DB
        let customPrompt = null;
        try {
            const pool = await poolPromise;
            const configResult = await pool.request()
                .input('clave', sql.NVarChar, 'TACTICA_PROMPT')
                .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
            if (configResult.recordset.length > 0) {
                customPrompt = configResult.recordset[0].Valor;
            }
        } catch (configErr) {
            console.warn('⚠️ Could not read custom prompt, using default:', configErr.message);
        }

        const analysis = await generateTacticaAnalysis(data, customPrompt);
        res.json({ analysis });
    } catch (err) {
        console.error('Error in /api/tactica:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});

