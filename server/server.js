const express = require('express');
const cors = require('cors');
const { sql, poolPromise, dbManager } = require('./db');
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
const { ensureDBConfigTable } = require('./ensureDBConfig');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize security tables and DB config table on startup
(async () => {
    await ensureSecurityTables();
    await ensureDBConfigTable();
})();

// TEST ENDPOINT
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});


// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// GET /api/db-mode - Public endpoint to get current DB connection mode
app.get('/api/db-mode', (req, res) => {
    const { dbManager } = require('./dbConnectionManager');
    res.json({ mode: dbManager.activeMode || 'primary' });
});

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
            .query('SELECT Email, Nombre, Clave, ISNULL(PermitirEnvioClave, 1) as PermitirEnvioClave FROM APP_USUARIOS WHERE Email = @email AND Activo = 1');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = result.recordset[0];

        // Check if user has permission to receive password by email
        if (!user.PermitirEnvioClave) {
            return res.status(403).json({ error: 'No tiene permiso para recibir clave por correo. Solicítela a TI mediante tiquete.' });
        }

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
        const { email, nombre, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoTiempos, accesoEvaluaciones, accesoInventarios, esAdmin } = req.body;
        const result = await createUser(email.trim().toLowerCase(), nombre, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoTiempos, accesoEvaluaciones, accesoInventarios, esAdmin);
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
        const { email, nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoTiempos, accesoEvaluaciones, accesoInventarios, esAdmin, permitirEnvioClave } = req.body;
        await updateUser(parseInt(req.params.id), email.trim().toLowerCase(), nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoTiempos, accesoEvaluaciones, accesoInventarios, esAdmin, permitirEnvioClave);
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
        let canal = req.query.canal || 'Todos';
        const tipo = req.query.tipo || 'Ventas';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        console.log(`🔍 /api/budget called with: year=${year}, local=${local}, canal=${canal}, tipo=${tipo}, startDate=${startDate}, endDate=${endDate}`);

        // For users with limited channels, "Todos" should sum only their allowed channels
        const userAllowedCanales = req.user.allowedCanales || [];
        const allCanales = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];
        const hasLimitedChannels = userAllowedCanales.length > 0 && userAllowedCanales.length < allCanales.length;
        const useMultiChannel = canal === 'Todos' && hasLimitedChannels;

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
                console.log(`ðŸª Group "${local}" members (${memberLocals.length}):`, memberLocals);
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

        // Build canal filter for the query
        let canalFilter = '';
        const canalParams = {};
        if (useMultiChannel) {
            // User has limited channels - sum individual channels instead of using 'Todos'
            const canalPlaceholders = userAllowedCanales.map((_, i) => `@ch${i}`).join(', ');
            canalFilter = `Canal IN (${canalPlaceholders})`;
            userAllowedCanales.forEach((ch, i) => { canalParams[`ch${i}`] = ch; });
        } else {
            canalFilter = `Canal = @canal`;
            canalParams['canal'] = canal;
        }

        // Date filter (optional - for consistency with /api/tendencia)
        let dateFilter = '';
        if (startDate && endDate) {
            dateFilter = 'AND Fecha BETWEEN @startDate AND @endDate';
        }

        const query = `
            SELECT 
                Fecha, 
                Año, 
                Mes, 
                Dia, 
                '${local}' as Local, 
                '${useMultiChannel ? 'Todos' : canal}' as Canal, 
                Tipo,
                SUM(MontoReal) AS MontoReal, 
                SUM(Monto) AS Monto, 
                SUM(Monto_Acumulado) AS Monto_Acumulado, 
                SUM(MontoAnterior) AS MontoAnterior, 
                SUM(MontoAnterior_Acumulado) AS MontoAnterior_Acumulado, 
                SUM(MontoAnteriorAjustado) AS MontoAnteriorAjustado, 
                SUM(MontoAnteriorAjustado_Acumulado) AS MontoAnteriorAjustado_Acumulado
            FROM RSM_ALCANCE_DIARIO 
            WHERE Año = @year AND ${localFilter} AND ${canalFilter} AND Tipo = @tipo
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                ${dateFilter}
            GROUP BY Fecha, Año, Mes, Dia, Tipo
            ORDER BY Mes, Dia
        `;
        const request = pool.request()
            .input('year', sql.Int, year)
            .input('tipo', sql.NVarChar, tipo);

        // Add date params if provided
        if (startDate && endDate) {
            request.input('startDate', sql.Date, startDate);
            request.input('endDate', sql.Date, endDate);
        }

        // Add canal filter params
        Object.entries(canalParams).forEach(([key, val]) => {
            request.input(key, sql.NVarChar, val);
        });

        // Add local filter params
        Object.entries(localParams).forEach(([key, val]) => {
            request.input(key, sql.NVarChar, val);
        });

        const result = await request.query(query);
        console.log(`📊 Budget data for ${local} (${canal}/${tipo}): ${result.recordset.length} records${useMultiChannel ? ' [MULTI-CHANNEL: ' + userAllowedCanales.join(',') + ']' : ''}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error in /api/budget:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stores - Return stores and groups user has access to
app.get('/api/stores', authMiddleware, async (req, res) => {
    console.log('ðŸ“ /api/stores called by user:', req.user?.email);
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
        console.log('ðŸ“‹ Official group names from GRUPOSALMACENCAB:', Array.from(officialGroupNames));

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
    console.log('ðŸ“ /api/stores-v2 called by user:', req.user?.email);
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

            console.log(`âœ… Found ${groups.length} groups and ${individuals.length} individuals`);
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

            console.log(`âœ… Found ${groups.length} groups and ${individuals.length} individuals (all access)`);
            res.json({ groups, individuals });
        }
    } catch (err) {
        console.error('âŒ Error in /api/stores-v2:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/group-stores/:groupName - Get individual stores that belong to a group
app.get('/api/group-stores/:groupName', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const groupName = req.params.groupName;

        console.log(`ðŸ” Looking up group members for: "${groupName}"`);

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
        console.log(`ðŸ“‹ IDGRUPO results for "${groupName}":`, idGrupoResult.recordset);

        if (idGrupoResult.recordset.length === 0) {
            console.log(`âš ï¸ No IDGRUPO found for group name: "${groupName}"`);
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

        console.log(`ðŸ“‹ Member CODALMACEN codes (${memberCodes.length}):`, memberCodes);

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

        console.log(`ðŸª Group "${groupName}" has ${stores.length} individual stores:`, stores);
        res.json({ stores });
    } catch (err) {
        console.error('âŒ Error in /api/group-stores:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/all-stores - Return ALL stores (for admin panel)
app.get('/api/all-stores', authMiddleware, async (req, res) => {
    try {
        // No permission check needed - all authenticated users can see stores
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT DISTINCT Local FROM RSM_ALCANCE_DIARIO WHERE Año = 2026 ORDER BY Local');
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
            .query("SELECT TOP 1 * FROM RSM_ALCANCE_DIARIO WHERE Año = 2026");

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

// GET /api/available-canales - Return allowed canales for current user
app.get('/api/available-canales', authMiddleware, async (req, res) => {
    try {
        const allowedCanales = req.user.allowedCanales || [];
        const allCanales = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];

        // If user has no canal restrictions, return all canales
        const canales = allowedCanales.length > 0 ? allowedCanales : allCanales;

        res.json({ canales });
    } catch (err) {
        console.error('Error in /api/available-canales:', err);
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// FECHA LIMITE ENDPOINT
// ==========================================

// GET /api/fecha-limite?year=2026 - Returns the last date with real data (MontoReal > 0)
// This date is used as the cutoff for all accumulated budget calculations
app.get('/api/fecha-limite', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const year = parseInt(req.query.year) || 2026;

        const result = await pool.request()
            .input('year', sql.Int, year)
            .query('SELECT MAX(Fecha) as FechaLimite FROM RSM_ALCANCE_DIARIO WHERE MontoReal > 0 AND Año = @year');

        const fechaLimite = result.recordset[0]?.FechaLimite;
        if (fechaLimite) {
            // Format as YYYY-MM-DD
            const d = new Date(fechaLimite);
            const formatted = d.toISOString().split('T')[0];
            console.log(`📅 Fecha limite for year ${year}: ${formatted}`);
            res.json({ fechaLimite: formatted });
        } else {
            res.json({ fechaLimite: null });
        }
    } catch (err) {
        console.error('Error in /api/fecha-limite:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// TENDENCIA ALCANCE ENDPOINT
// ==========================================

app.get('/api/tendencia', authMiddleware, getTendenciaData);
app.get('/api/tendencia/resumen-canal', authMiddleware, getResumenCanal);

// ==========================================
// DASHBOARD MULTI-KPI BATCH ENDPOINT (optimized with trends)
// ==========================================

// Helper function to calculate previous period dates
function getPreviousPeriodDates(startDate, endDate, comparativePeriod) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let prevStart, prevEnd;

    if (comparativePeriod === 'Week') {
        // Previous week: subtract 7 days
        prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        prevEnd = new Date(end);
        prevEnd.setDate(prevEnd.getDate() - 7);
    } else if (comparativePeriod === 'Month') {
        // Previous month: subtract 1 month
        prevStart = new Date(start);
        prevStart.setMonth(prevStart.getMonth() - 1);
        prevEnd = new Date(end);
        prevEnd.setMonth(prevEnd.getMonth() - 1);
    } else {  // Year
        // Previous year: subtract 1 year
        prevStart = new Date(start);
        prevStart.setFullYear(prevStart.getFullYear() - 1);
        prevEnd = new Date(end);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    }

    // Format as YYYY-MM-DD
    const formatDate = (d) => d.toISOString().split('T')[0];
    return {
        prevStartDate: formatDate(prevStart),
        prevEndDate: formatDate(prevEnd)
    };
}

// GET /api/dashboard/multi-kpi - Fetch all KPIs for multiple locales with trend data
app.get('/api/dashboard/multi-kpi', authMiddleware, async (req, res) => {
    try {
        const { locales, startDate, endDate, yearType = 'anterior', comparativePeriod = 'Month' } = req.query;

        if (!locales) {
            return res.status(400).json({ error: 'locales parameter is required' });
        }

        const localesArray = locales.split(',');
        const kpis = ['Ventas', 'Transacciones', 'TQP'];

        // Calculate previous period dates for trend comparison
        const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate, comparativePeriod);

        // Fetch data for all locales IN PARALLEL (major performance improvement)
        const results = await Promise.all(localesArray.map(async (local) => {
            // Fetch all KPIs for current and previous periods IN PARALLEL
            const kpiPromises = kpis.flatMap(kpi => [
                // Current period
                new Promise((resolve) => {
                    const mockReq = {
                        query: { startDate, endDate, kpi, channel: 'Total', yearType, local },
                        user: req.user
                    };
                    const mockRes = {
                        json: (data) => resolve({ kpi, period: 'current', data }),
                        status: () => mockRes,
                        send: () => { }
                    };
                    getTendenciaData(mockReq, mockRes);
                }),
                // Previous period
                new Promise((resolve) => {
                    const prevMockReq = {
                        query: { startDate: prevStartDate, endDate: prevEndDate, kpi, channel: 'Total', yearType, local },
                        user: req.user
                    };
                    const prevMockRes = {
                        json: (data) => resolve({ kpi, period: 'previous', data }),
                        status: () => prevMockRes,
                        send: () => { }
                    };
                    getTendenciaData(prevMockReq, prevMockRes);
                })
            ]);

            // Wait for all KPI data to load in parallel
            const allKpiData = await Promise.all(kpiPromises);

            // Organize data by KPI
            const kpiData = {};
            const prevKpiData = {};
            allKpiData.forEach(result => {
                if (result.period === 'current') {
                    kpiData[result.kpi] = result.data;
                } else {
                    prevKpiData[result.kpi] = result.data;
                }
            });

            // Extract pctPresupuesto and pctAnterior with trend data
            const stats = {};
            for (const kpi of kpis) {
                if (kpiData[kpi] && kpiData[kpi].resumen) {
                    const currentPctPpto = kpiData[kpi].resumen.pctPresupuesto;
                    const currentPctAnt = kpiData[kpi].resumen.pctAnterior;

                    // Calculate trends if previous period data is available
                    let trendPpto = null;
                    let trendAnt = null;

                    if (prevKpiData[kpi] && prevKpiData[kpi].resumen) {
                        const prevPctPpto = prevKpiData[kpi].resumen.pctPresupuesto;
                        const prevPctAnt = prevKpiData[kpi].resumen.pctAnterior;

                        // Calculate trend for Presupuesto
                        const diffPpto = currentPctPpto - prevPctPpto;
                        const pctChangePpto = prevPctPpto !== 0 ? (diffPpto / prevPctPpto) * 100 : 0;
                        trendPpto = {
                            direction: diffPpto > 0.001 ? 'up' : diffPpto < -0.001 ? 'down' : 'neutral',
                            percentage: pctChangePpto,
                            previousValue: prevPctPpto
                        };

                        // Calculate trend for Anterior
                        const diffAnt = currentPctAnt - prevPctAnt;
                        const pctChangeAnt = prevPctAnt !== 0 ? (diffAnt / prevPctAnt) * 100 : 0;
                        trendAnt = {
                            direction: diffAnt > 0.001 ? 'up' : diffAnt < -0.001 ? 'down' : 'neutral',
                            percentage: pctChangeAnt,
                            previousValue: prevPctAnt
                        };
                    }

                    stats[kpi] = {
                        pctPresupuesto: currentPctPpto,
                        pctAnterior: currentPctAnt,
                        trendPresupuesto: trendPpto,
                        trendAnterior: trendAnt
                    };
                }
            }

            return {
                local,
                stats
            };
        }));

        console.log('ðŸŽ¯ Dashboard multi-KPI results for', localesArray, ':');
        results.forEach(r => {
            console.log(`  ${r.local}:`, {
                Ventas_pctPpto: r.stats.Ventas?.pctPresupuesto,
                Trans_pctPpto: r.stats.Transacciones?.pctPresupuesto,
                TQP_pctPpto: r.stats.TQP?.pctPresupuesto
            });
        });

        res.json({ results });
    } catch (err) {
        console.error('Error in /api/dashboard/multi-kpi:', err);
        res.status(500).json({ error: err.message });
    }
});



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

        console.log(`âœ… Config '${req.params.key}' updated by ${req.user.email}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Error in PUT /api/admin/config:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DASHBOARD CONFIG ENDPOINTS (user-specific)
// ==========================================

// GET /api/user/dashboard-config - Get current user's dashboard preferences
app.get('/api/user/dashboard-config', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, req.user.userId)
            .query('SELECT DashboardLocales, ComparativePeriod FROM APP_USUARIOS WHERE Id = @userId');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const dashboardLocalesJson = result.recordset[0].DashboardLocales;
        const dashboardLocales = dashboardLocalesJson ? JSON.parse(dashboardLocalesJson) : [];
        const comparativePeriod = result.recordset[0].ComparativePeriod || 'Month';

        res.json({ dashboardLocales, comparativePeriod });
    } catch (err) {
        console.error('Error in GET /api/user/dashboard-config:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/user/dashboard-config - Save current user's dashboard preferences
app.put('/api/user/dashboard-config', authMiddleware, async (req, res) => {
    try {
        const { dashboardLocales, comparativePeriod } = req.body;

        // Validate dashboardLocales: must be array, max 5 items
        if (dashboardLocales !== undefined) {
            if (!Array.isArray(dashboardLocales)) {
                return res.status(400).json({ error: 'dashboardLocales debe ser un array' });
            }
            if (dashboardLocales.length > 5) {
                return res.status(400).json({ error: 'Máximo 5 locales permitidos' });
            }
        }

        // Validate comparativePeriod: must be 'Week', 'Month', or 'Year'
        if (comparativePeriod !== undefined) {
            if (!['Week', 'Month', 'Year'].includes(comparativePeriod)) {
                return res.status(400).json({ error: 'comparativePeriod debe ser Week, Month o Year' });
            }
        }

        const pool = await poolPromise;
        const updates = [];
        const inputs = { userId: req.user.userId };

        if (dashboardLocales !== undefined) {
            updates.push('DashboardLocales = @dashboardLocales');
            inputs.dashboardLocales = JSON.stringify(dashboardLocales);
        }
        if (comparativePeriod !== undefined) {
            updates.push('ComparativePeriod = @comparativePeriod');
            inputs.comparativePeriod = comparativePeriod;
        }

        if (updates.length > 0) {
            const request = pool.request();
            request.input('userId', sql.Int, inputs.userId);
            if (inputs.dashboardLocales) request.input('dashboardLocales', sql.NVarChar, inputs.dashboardLocales);
            if (inputs.comparativePeriod) request.input('comparativePeriod', sql.VarChar, inputs.comparativePeriod);

            await request.query(`UPDATE APP_USUARIOS SET ${updates.join(', ')} WHERE Id = @userId`);
        }

        console.log(`âœ… Dashboard config saved for user ${req.user.email}:`, { dashboardLocales, comparativePeriod });
        res.json({ success: true, dashboardLocales, comparativePeriod });
    } catch (err) {
        console.error('Error in PUT /api/user/dashboard-config:', err);
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
        console.log(`ðŸ¤– Táctica requested for ${data.storeName} (${data.kpi}) by ${req.user?.email}`);

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
            console.warn('âš ï¸ Could not read custom prompt, using default:', configErr.message);
        }

        const analysis = await generateTacticaAnalysis(data, customPrompt);
        res.json({ analysis });
    } catch (err) {
        console.error('Error in /api/tactica:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DATABASE CONFIGURATION ENDPOINTS (admin only)
// ==========================================

const { getDBConfig, saveDBConfig, testConnection } = require('./dbConfig');
const { getCurrentMode, MODES } = require('./db');

// GET /api/admin/db-config - Get current database configuration
app.get('/api/admin/db-config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const config = await getDBConfig();
        const currentMode = getCurrentMode();

        console.log('ðŸ“Š DB Config endpoint called:');
        console.log('   Config:', config);
        console.log('   CurrentMode:', currentMode);
        console.log('   MODES:', MODES);

        res.json({
            config,
            currentMode,
            availableModes: Object.values(MODES)
        });
    } catch (err) {
        console.error('Error in GET /api/admin/db-config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/test-db-connection - Test a database connection
app.post('/api/admin/test-db-connection', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const config = req.body;
        const result = await testConnection(config);

        res.json(result);
    } catch (err) {
        console.error('Error testing connection:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/db-config - Save database configuration
app.post('/api/admin/db-config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const config = req.body;
        const username = req.user.email || req.user.nombre || 'admin';

        // Test connection first
        const testResult = await testConnection(config);
        if (!testResult.success) {
            return res.status(400).json({
                error: 'Conexión fallida',
                message: testResult.message
            });
        }

        // Save configuration
        await saveDBConfig(config, username);

        res.json({
            success: true,
            message: 'Configuración guardada. Reinicie el servidor para aplicar los cambios.',
            requiresRestart: true
        });
    } catch (err) {
        console.error('Error saving DB config:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// AUXILIARY DATABASE ROUTES (admin only)
// ==========================================
const dbAuxiliaryRoutes = require('./dbAuxiliaryRoutes');
app.use('/api/admin', authMiddleware, (req, res, next) => {
    if (!req.user.esAdmin) {
        return res.status(403).json({ error: 'No tiene permisos de administrador' });
    }
    next();
}, dbAuxiliaryRoutes);

app.listen(port, () => {
    console.log(`ðŸš€ Server running at http://localhost:${port}`);
    const dbStatus = dbManager.getCurrentStatus();
    console.log(`ðŸ“Š Database mode: ${dbStatus.activeMode}`);
});

