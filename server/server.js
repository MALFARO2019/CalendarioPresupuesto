const express = require('express');
const path = require('path');
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
    deleteUser,
    getAllProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    assignProfileToUsers,
    syncProfilePermissions,
    logLoginEvent,
    getLoginAudit
} = require('./auth');
const { sendPasswordEmail, sendReportEmail, verifyEmailService } = require('./emailService');
const { getTendenciaData, getResumenCanal, getResumenGrupos } = require('./tendencia');
const { getRangosData, getRangosResumenCanal } = require('./rangos');
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
const invgateDb = require('./invgateDb');
const invgateService = require('./services/invgateService');
const invgateSyncService = require('./services/invgateSyncService');
const invgateCron = require('./jobs/invgateCron');
const formsCron = require('./jobs/formsCron');
const registerFormsEndpoints = require('./forms_endpoints');
const registerInocuidadEndpoints = require('./inocuidad_endpoints');
const personalModule = require('./personal');
const { ensureUberEatsTables } = require('./uberEatsDb');
const uberEatsCron = require('./jobs/uberEatsCron');
const presupuestoCron = require('./jobs/presupuestoCron');
const registerUberEatsEndpoints = require('./uberEats_endpoints');
const registerInvgateEndpoints = require('./invgate_endpoints');
const spEventsService = require('./services/sharepointEventsService');
const { ensureKpiAdminTables } = require('./kpiAdminDb');
const { registerKpiAdminEndpoints } = require('./kpiAdmin_endpoints');
const deployModule = require('./deploy');
const { getAlcanceTableName, invalidateAlcanceTableCache } = require('./alcanceConfig');
const registerModeloPresupuestoEndpoints = require('./modeloPresupuesto_endpoints');
const registerStoreAliasEndpoints = require('./storeAlias_endpoints');
const { ensureStoreAliasTable } = require('./services/storeAliasService');
const { ensureGruposAlmacenTables } = require('./gruposAlmacenDb');
const registerGruposAlmacenEndpoints = require('./gruposAlmacen_endpoints');

const app = express();
const port = process.env.PORT || 80;

app.use(cors());
app.use(express.json());

// Initialize security tables and DB config table on startup
(async () => {
    await ensureSecurityTables();
    await ensureDBConfigTable();
    await personalModule.ensurePersonalTable();
    // Start Forms cron job
    try { await formsCron.start(); } catch (e) { console.error('Forms cron error:', e.message); }
    // Initialize Uber Eats DB and cron
    try { await ensureUberEatsTables(); } catch (e) { console.error('UberEats DB error:', e.message); }
    // KPI Admin tables
    try { await ensureKpiAdminTables(); } catch (e) { console.error('KPI Admin DB error:', e.message); }
    try { await ensureStoreAliasTable(); } catch (e) { console.error('StoreAlias DB error:', e.message); }
    try { await ensureGruposAlmacenTables(); } catch (e) { console.error('GruposAlmacen DB error:', e.message); }
    try { await uberEatsCron.start(); } catch (e) { console.error('UberEats cron error:', e.message); }
    // Start budget recalculation cron job
    try { await presupuestoCron.start(); } catch (e) { console.error('Budget cron error:', e.message); }
    // SharePoint Eventos Rosti: initial sync + periodic refresh (every 60 min)
    try {
        await spEventsService.syncEventos();
        setInterval(async () => {
            try { await spEventsService.syncEventos(); }
            catch (e) { console.error('SP Events periodic sync error:', e.message); }
        }, 60 * 60 * 1000);
    } catch (e) { console.error('SP Events initial sync error:', e.message); }
})();

// ==========================================
// KPI ADMIN ENDPOINTS
// ==========================================
registerKpiAdminEndpoints(app, authMiddleware);

// ==========================================
// UBER EATS ENDPOINTS
// ==========================================
registerUberEatsEndpoints(app, authMiddleware);

// ==========================================
// INVGATE ENDPOINTS
// ==========================================
registerInvgateEndpoints(app, authMiddleware);

// ==========================================
// MODELO PRESUPUESTO ENDPOINTS
// ==========================================
registerModeloPresupuestoEndpoints(app, authMiddleware);

// ==========================================
// STORE ALIAS ENDPOINTS
// ==========================================
registerStoreAliasEndpoints(app, authMiddleware);

// ==========================================
// GRUPOS ALMACEN ENDPOINTS
// ==========================================
registerGruposAlmacenEndpoints(app, authMiddleware);

// ==========================================
// DEPLOY MANAGEMENT ENDPOINTS
// ==========================================

// GET deploy log (changelog)
app.get('/api/deploy/log', authMiddleware, (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        res.json(deployModule.getDeployLog());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST new deploy log entry
app.post('/api/deploy/log', authMiddleware, (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        const { version, notes, servers } = req.body;
        if (!version) return res.status(400).json({ error: 'Versión es requerida' });
        const entry = deployModule.addDeployEntry(version, notes || '', servers || [], req.user.email || 'admin');
        res.json({ success: true, entry });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST deploy to server
app.post('/api/deploy/publish', authMiddleware, async (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        const { serverIp, user, password, appDir, version, notes } = req.body;
        if (!serverIp || !user || !password || !appDir) {
            return res.status(400).json({ error: 'Faltan parámetros: serverIp, user, password, appDir' });
        }

        // Version downgrade validation
        if (version && serverIp) {
            const serverInfo = deployModule.getServerVersion(serverIp);
            if (serverInfo && serverInfo.version) {
                const cmp = deployModule.compareVersions(version, serverInfo.version);
                if (cmp < 0) {
                    return res.status(400).json({
                        error: `No se puede desplegar ${version} porque el servidor ${serverIp} ya tiene ${serverInfo.version}. Solo se permiten versiones iguales o superiores.`
                    });
                }
            }
        }

        // Create log entry
        const entry = deployModule.addDeployEntry(
            version || 'sin versión',
            notes || '',
            [serverIp],
            req.user.email || 'admin',
            'deploying'
        );

        // Execute deploy
        const result = await deployModule.deployToServer(serverIp, user, password, appDir, version);

        // Update log entry with result
        deployModule.updateDeployEntry(entry.id, {
            status: result.success ? 'success' : 'error',
            steps: result.steps
        });

        res.json({ success: result.success, steps: result.steps, entryId: entry.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET version deployed on a specific server
app.get('/api/deploy/server-version', authMiddleware, (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        const { ip } = req.query;
        if (!ip) return res.status(400).json({ error: 'Falta parámetro: ip' });
        const info = deployModule.getServerVersion(ip);
        res.json(info || { version: null, date: null, deployedBy: null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all server versions
app.get('/api/deploy/server-versions', authMiddleware, (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        res.json(deployModule.getAllServerVersions());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET server setup guide
app.get('/api/deploy/setup-guide', authMiddleware, (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        res.json(deployModule.getServerSetupGuide());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST run remote setup commands on target server
app.post('/api/deploy/setup-remote', authMiddleware, async (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        const { serverIp, user, password } = req.body;
        if (!serverIp || !user || !password) {
            return res.status(400).json({ error: 'Faltan parámetros: serverIp, user, password' });
        }
        const result = await deployModule.runRemoteSetupCommands(serverIp, user, password);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST run local setup commands
app.post('/api/deploy/setup-local', authMiddleware, async (req, res) => {
    if (!req.user.esAdmin) return res.status(403).json({ error: 'Solo administradores' });
    try {
        const { serverIp } = req.body;
        if (!serverIp) {
            return res.status(400).json({ error: 'Falta parámetro: serverIp' });
        }
        const result = await deployModule.runLocalSetupCommands(serverIp);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// TEST ENDPOINT
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

app.get('/api/version-check', (req, res) => {
    res.json({
        version: deployModule.getCurrentVersion(),
        timestamp: new Date().toISOString(),
        env: 'production',
        db: dbManager.activeMode
    });
});

// ==========================================
// MICROSOFT FORMS ENDPOINTS
// ==========================================
registerFormsEndpoints(app, authMiddleware);

// ==========================================
// INOCUIDAD ENDPOINTS
// ==========================================
registerInocuidadEndpoints(app, authMiddleware);

// ==========================================
// PERSONAL ENDPOINTS
// ==========================================

// GET /api/personal - Returns active users (replaces old DIM_PERSONAL list)
app.get('/api/personal', authMiddleware, async (req, res) => {
    try { res.json(await personalModule.getAllPersonal()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Asignaciones
app.get('/api/personal/asignaciones', authMiddleware, async (req, res) => {
    try {
        const { usuarioId, month, year } = req.query;
        res.json(await personalModule.getAsignaciones(
            usuarioId ? parseInt(usuarioId) : null,
            month,
            year
        ));
    }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/personal/asignaciones', authMiddleware, async (req, res) => {
    try {
        const { usuarioId, local, perfil, fechaInicio, fechaFin, notas } = req.body;
        if (!usuarioId || !local || !perfil || !fechaInicio) return res.status(400).json({ error: 'usuarioId, local, perfil y fechaInicio son requeridos' });
        res.status(201).json(await personalModule.createAsignacion(usuarioId, local, perfil, fechaInicio, fechaFin, notas));
    } catch (e) { console.error('❌ Error creating asignacion:', e.message); res.status(400).json({ error: e.message }); }
});

app.put('/api/personal/asignaciones/:id', authMiddleware, async (req, res) => {
    try {
        const { local, perfil, fechaInicio, fechaFin, notas } = req.body;
        res.json(await personalModule.updateAsignacion(parseInt(req.params.id), local, perfil, fechaInicio, fechaFin, notas));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/personal/asignaciones/:id', authMiddleware, async (req, res) => {
    try { await personalModule.deleteAsignacion(parseInt(req.params.id)); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Cobertura
app.get('/api/personal/locales-sin-cobertura', authMiddleware, async (req, res) => {
    try {
        const { perfil, month, year } = req.query;
        res.json(await personalModule.getLocalesSinCobertura(perfil || null, month, year));
    }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Almacenes individuales (sin grupos)
app.get('/api/personal/stores', authMiddleware, async (req, res) => {
    try { res.json(await personalModule.getAllStores()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Personal por local: retorna todos los asignados activos con su perfil
app.get('/api/personal/admin-por-local', authMiddleware, async (req, res) => {
    try {
        const { local, vista } = req.query;
        if (!local) return res.json([]);
        const personal = await personalModule.getPersonalPorLocal(local, vista || null);
        res.json(personal);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cargos (Perfiles)
app.get('/api/personal/cargos', authMiddleware, async (req, res) => {
    try { res.json(await personalModule.getAllCargos()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/personal/cargos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const { nombre } = req.body;
        await personalModule.createCargo(nombre);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/personal/cargos/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const { reassignTo } = req.body;
        await personalModule.deleteCargo(parseInt(req.params.id), reassignTo);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/personal/cargos/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        await personalModule.updateCargo(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

        // Timeout to avoid hanging when DB is unreachable
        const loginPromise = loginUser(email.trim().toLowerCase(), clave.trim(), req.ip, req.headers['user-agent']);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DB_TIMEOUT')), 10000)
        );

        let result;
        try {
            result = await Promise.race([loginPromise, timeoutPromise]);
        } catch (timeoutErr) {
            if (timeoutErr.message === 'DB_TIMEOUT') {
                return res.status(503).json({ error: 'No se pudo conectar a la base de datos. Verifique la conexión VPN o use Acceso Administrador.' });
            }
            throw timeoutErr;
        }

        if (!result.success) {
            return res.status(401).json({ error: result.message });
        }
        res.json(result);
    } catch (err) {
        console.error('Error in /api/auth/login:', err);
        res.status(500).json({ error: 'No se pudo conectar a la base de datos. Verifique la conexión VPN o use Acceso Administrador.' });
    }
});

// POST /api/auth/admin-login - Login with admin password only (no DB required)
app.post('/api/auth/admin-login', (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Clave de administrador es requerida' });
        }
        if (!verifyAdminPassword(password)) {
            return res.status(401).json({ error: 'Clave de administrador incorrecta' });
        }

        // Generate JWT with offline admin identity (no DB lookup)
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            {
                userId: 0,
                email: 'admin@offline',
                nombre: 'Administrador',
                allowedStores: [],
                allowedCanales: [],
                accesoTendencia: false,
                accesoTactica: false,
                accesoEventos: true,
                accesoPresupuesto: false,
                accesoPresupuestoMensual: false,
                accesoPresupuestoAnual: false,
                accesoPresupuestoRangos: false,
                accesoTiempos: false,
                accesoEvaluaciones: false,
                accesoInventarios: false,
                accesoPersonal: false,
                // Modelo Presupuesto
                accesoModeloPresupuesto: true,
                verConfigModelo: true,
                verConsolidadoMensual: true,
                verAjustePresupuesto: true,
                verVersiones: true,
                verBitacora: true,
                verReferencias: true,
                editarConsolidado: true,
                ejecutarRecalculo: true,
                ajustarCurva: true,
                restaurarVersiones: true,
                esAdmin: true,
                esProtegido: false,
                offlineAdmin: true
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('🔐 Offline admin login successful');
        logLoginEvent('admin@offline', 'Administrador', true, 'Admin login (offline)', req.ip, req.headers['user-agent']);
        res.json({
            success: true,
            token,
            user: {
                id: 0,
                email: 'admin@offline',
                nombre: 'Administrador',
                esAdmin: true,
                offlineAdmin: true,
                accesoTendencia: false,
                accesoTactica: false,
                accesoEventos: true,
                accesoPresupuesto: false,
                accesoPresupuestoMensual: false,
                accesoPresupuestoAnual: false,
                accesoPresupuestoRangos: false,
                accesoTiempos: false,
                accesoEvaluaciones: false,
                accesoInventarios: false,
                accesoPersonal: false,
                // Modelo Presupuesto
                accesoModeloPresupuesto: true,
                verConfigModelo: true,
                verConsolidadoMensual: true,
                verAjustePresupuesto: true,
                verVersiones: true,
                verBitacora: true,
                verReferencias: true,
                editarConsolidado: true,
                ejecutarRecalculo: true,
                ajustarCurva: true,
                restaurarVersiones: true,
                esProtegido: false,
                allowedStores: [],
                allowedCanales: []
            }
        });
    } catch (err) {
        logLoginEvent('admin@offline', null, false, 'Error: ' + err.message, req.ip, req.headers['user-agent']);
        console.error('Error in /api/auth/admin-login:', err);
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

// GET /api/admin/login-log - Get login audit log (admin only)
app.get('/api/admin/login-log', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { desde, hasta, email } = req.query;
        const records = await getLoginAudit(desde || null, hasta || null, email || null);
        res.json(records);
    } catch (err) {
        console.error('Error in /api/admin/login-log:', err);
        res.status(500).json({ error: err.message });
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
        const { email, nombre, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, perfilId, accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones, cedula, telefono } = req.body;
        const modeloPresupuestoPerms = { accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones };
        const result = await createUser(email.trim().toLowerCase(), nombre, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, modeloPresupuestoPerms, perfilId || null, cedula, telefono);
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
        const { email, nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, permitirEnvioClave, perfilId, accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones, cedula, telefono } = req.body;
        await updateUser(parseInt(req.params.id), email.trim().toLowerCase(), nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, permitirEnvioClave, perfilId, accesoModeloPresupuesto, verConfigModelo, verConsolidadoMensual, verAjustePresupuesto, verVersiones, verBitacora, verReferencias, editarConsolidado, ejecutarRecalculo, ajustarCurva, restaurarVersiones, cedula, telefono);
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
// PERFILES ENDPOINTS (admin only)
// ==========================================

// GET /api/admin/profiles - List all profiles
app.get('/api/admin/profiles', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const profiles = await getAllProfiles();
        res.json(profiles);
    } catch (err) {
        console.error('Error in /api/admin/profiles:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/profiles - Create a new profile
app.post('/api/admin/profiles', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { nombre, descripcion, permisos } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre del perfil es requerido' });
        }

        const profileId = await createProfile(nombre, descripcion, permisos, req.user.email);
        res.json({ success: true, profileId });
    } catch (err) {
        console.error('Error creating profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/profiles/:id - Update a profile
app.put('/api/admin/profiles/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { nombre, descripcion, permisos } = req.body;
        await updateProfile(parseInt(req.params.id), nombre, descripcion, permisos);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/profiles/:id - Delete a profile
app.delete('/api/admin/profiles/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        await deleteProfile(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/profiles/:id/assign - Assign profile to multiple users
app.post('/api/admin/profiles/:id/assign', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const { userIds, syncPermissions = true } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'Se requiere un array de IDs de usuarios' });
        }

        await assignProfileToUsers(parseInt(req.params.id), userIds, syncPermissions);
        res.json({ success: true, assigned: userIds.length });
    } catch (err) {
        console.error('Error assigning profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/profiles/:id/sync - Sync profile permissions to all assigned users
app.post('/api/admin/profiles/:id/sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }
        const updatedCount = await syncProfilePermissions(parseInt(req.params.id));
        res.json({ success: true, updatedCount });
    } catch (err) {
        console.error('Error syncing profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DB CONFIG ENDPOINTS (admin only)
// ==========================================

// GET /api/admin/db-config - Get current DB configuration
app.get('/api/admin/db-config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { getDBConfig } = require('./dbConfig');
        const { dbManager } = require('./dbConnectionManager');

        let config = null;
        try {
            config = await getDBConfig();
        } catch (dbErr) {
            console.warn('⚠️ Could not load DB config from DB, using env defaults:', dbErr.message);
        }

        res.json({
            currentMode: dbManager.activeMode || 'primary',
            primaryHealthy: dbManager.primaryHealthy,
            config: config || {
                Modo: 'direct',
                DirectServer: process.env.DB_SERVER || '',
                DirectDatabase: process.env.DB_DATABASE || '',
                DirectUser: process.env.DB_USER || '',
            }
        });
    } catch (err) {
        console.error('Error in GET /api/admin/db-config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/db-config - Save DB configuration
app.post('/api/admin/db-config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { saveDBConfig } = require('./dbConfig');
        await saveDBConfig(req.body, req.user.email);
        res.json({ success: true, message: 'Configuración guardada. Reinicie el servidor para aplicar cambios.' });
    } catch (err) {
        console.error('Error in POST /api/admin/db-config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/test-db-connection - Test a DB connection without saving
app.post('/api/admin/test-db-connection', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const mssql = require('mssql');
        const b = req.body;
        const mode = b.mode || b.Modo || 'direct';

        // Build mssql config from a server string (handles server\instance)
        function buildCfg(srv, db, user, pwd, timeoutMs = 8000) {
            let host = srv, inst;
            if (srv && srv.includes('\\')) { [host, inst] = srv.split('\\'); }
            const cfg = {
                user: user || 'sa', password: pwd || '', server: host, database: db,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                connectionTimeout: timeoutMs
            };
            if (inst) cfg.options.instanceName = inst;
            return cfg;
        }

        // Try to connect; if hostname fails, retry with localhost (for local named instances)
        async function tryConnect(srv, db, user, pwd) {
            const errors = [];
            for (const serverAlias of [srv, ...(srv && !['localhost', '127.0.0.1', '.'].includes(srv.split('\\')[0].toLowerCase()) ? ['localhost\\' + (srv.includes('\\') ? srv.split('\\')[1] : '')] : [])]) {
                if (!serverAlias || serverAlias.endsWith('\\')) continue;
                try {
                    const cfg = buildCfg(serverAlias, db, user, pwd);
                    const p = await new mssql.ConnectionPool(cfg).connect();
                    await p.request().query('SELECT 1');
                    await p.close();
                    return serverAlias !== srv ? `Conexión exitosa (usando localhost como alias de ${srv})` : `Conexión exitosa: ${srv}`;
                } catch (e) {
                    errors.push(serverAlias + ': ' + e.message);
                }
            }
            throw new Error(errors[0] || 'No se pudo conectar');
        }

        if (mode === 'direct') {
            try {
                const msg = await tryConnect(b.server, b.database, b.user, b.password);
                res.json({ success: true, message: msg });
            } catch (e) {
                res.json({ success: false, message: e.message });
            }
        } else if (mode === 'hybrid') {
            try { await tryConnect(b.readServer, b.readDatabase, b.readUser, b.readPassword); }
            catch (e) { return res.json({ success: false, message: 'Error Lectura: ' + e.message }); }
            try { await tryConnect(b.writeServer, b.writeDatabase, b.writeUser, b.writePassword); }
            catch (e) { return res.json({ success: false, message: 'Error Escritura: ' + e.message }); }
            res.json({ success: true, message: 'Lectura OK | Escritura OK' });
        } else {
            res.status(400).json({ error: 'Modo desconocido: ' + mode });
        }
    } catch (err) {
        console.error('Error in POST /api/admin/test-db-connection:', err);
        res.status(500).json({ error: err.message });
    }
});


// GET /api/admin/db-status - Get current database status
app.get('/api/admin/db-status', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { dbManager } = require('./dbConnectionManager');
        res.json(dbManager.getCurrentStatus());
    } catch (err) {
        console.error('Error in GET /api/admin/db-status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/db-config/auxiliary - Get auxiliary DB config
app.get('/api/admin/db-config/auxiliary', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { dbManager } = require('./dbConnectionManager');
        const { decryptPassword } = require('./dbConfig');
        const pool = dbManager.getActivePool();
        if (!pool) return res.json({});

        const result = await pool.request().query(`
            SELECT Clave, Valor 
            FROM APP_CONFIGURACION 
            WHERE Clave IN ('DB_AUX_SERVER', 'DB_AUX_DATABASE', 'DB_AUX_USERNAME', 'DB_AUX_PASSWORD', 'DB_AUX_PORT')
        `);
        const config = {};
        result.recordset.forEach(row => {
            const key = row.Clave.replace('DB_AUX_', '').toLowerCase();
            if (key === 'username') config['username'] = row.Valor;
            else if (key === 'password') {
                try { config['password'] = row.Valor ? decryptPassword(row.Valor) : ''; } catch { config['password'] = row.Valor || ''; }
            } else config[key] = row.Valor;
        });
        res.json(config);
    } catch (err) {
        console.error('Error in GET /api/admin/db-config/auxiliary:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/db-config/auxiliary - Save auxiliary DB config
app.post('/api/admin/db-config/auxiliary', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { server, database, username, password, port } = req.body;
        if (!server || !database) return res.status(400).json({ error: 'Server y Database son requeridos' });

        // Build mssql config honoring optional explicit port
        function buildAuxCfg(srv, db, user, pwd, explicitPort) {
            let host = srv, inst;
            if (srv.includes('\\')) { [host, inst] = srv.split('\\'); }
            const cfg = {
                user: user || 'sa', password: pwd || '', server: host, database: db,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                connectionTimeout: 8000
            };
            if (explicitPort) cfg.port = parseInt(explicitPort, 10);
            else if (inst) cfg.options.instanceName = inst; // use Browser only when no explicit port
            return cfg;
        }

        const mssql = require('mssql');

        // Test connection — warn but don't block saving
        let connectionWarning = null;
        try {
            const testCfg = buildAuxCfg(server, database, username, password, port);
            const testPool = await new mssql.ConnectionPool(testCfg).connect();
            await testPool.close();
        } catch (testErr) {
            connectionWarning = 'Conexión no verificada: ' + testErr.message;
            console.warn('⚠️ Aux DB connection test failed (saving anyway):', testErr.message);
        }

        const { dbManager } = require('./dbConnectionManager');
        const pool = dbManager.getActivePool();
        if (!pool) return res.status(503).json({ error: 'No hay conexión activa a la BD principal' });

        const usuario = req.user.email;
        const portVal = port ? String(port) : '';
        await pool.request()
            .input('usuario', sql.NVarChar, usuario)
            .input('server', sql.NVarChar, server)
            .input('database', sql.NVarChar, database)
            .input('username', sql.NVarChar, username || 'sa')
            .input('password', sql.NVarChar, password || '')
            .input('port', sql.NVarChar, portVal)
            .query(`
                MERGE APP_CONFIGURACION AS target USING (SELECT 'DB_AUX_SERVER' AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @server, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_SERVER', @server, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target USING (SELECT 'DB_AUX_DATABASE' AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @database, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_DATABASE', @database, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target USING (SELECT 'DB_AUX_USERNAME' AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @username, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_USERNAME', @username, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target USING (SELECT 'DB_AUX_PASSWORD' AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @password, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_PASSWORD', @password, GETDATE(), @usuario);

                MERGE APP_CONFIGURACION AS target USING (SELECT 'DB_AUX_PORT' AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @port, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES ('DB_AUX_PORT', @port, GETDATE(), @usuario);
            `);

        await dbManager.loadAuxiliaryConfig();
        console.log(`✅ Auxiliary DB config saved by ${usuario}`);
        res.json({
            success: true,
            message: connectionWarning
                ? 'Configuración guardada (advertencia: ' + connectionWarning + ')'
                : 'Configuración guardada y conexión verificada',
            warning: connectionWarning
        });
    } catch (err) {
        console.error('Error in POST /api/admin/db-config/auxiliary:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/db-config/test-auxiliary - Test auxiliary DB connection
app.post('/api/admin/db-config/test-auxiliary', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { server, database, username, password, port } = req.body;
        if (!server) return res.status(400).json({ error: 'Server es requerido' });

        const mssql = require('mssql');

        function buildCfg(srv, db, user, pwd, explicitPort) {
            let host = srv, inst;
            if (srv.includes('\\')) { [host, inst] = srv.split('\\'); }
            const cfg = {
                user: user || 'sa', password: pwd || '', server: host, database: db,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                connectionTimeout: 8000
            };
            if (explicitPort) cfg.port = parseInt(explicitPort, 10);
            else if (inst) cfg.options.instanceName = inst;
            return cfg;
        }

        // If explicit port provided, try only that — no fallback needed
        if (port) {
            try {
                const cfg = buildCfg(server, database, username, password, port);
                const testPool = await new mssql.ConnectionPool(cfg).connect();
                await testPool.request().query('SELECT 1 AS Test');
                await testPool.close();
                return res.json({ success: true, message: `Conexión exitosa: ${cfg.server}:${port}` });
            } catch (e) {
                return res.json({ success: false, message: e.message });
            }
        }

        // No explicit port — try Browser then direct port fallbacks
        const attempts = [
            () => buildCfg(server, database, username, password, null),          // instanceName (Browser)
            ...(server.includes('\\') && !['localhost', '127.0.0.1', '.'].includes(server.split('\\')[0].toLowerCase())
                ? [() => buildCfg('localhost\\' + server.split('\\')[1], database, username, password, null)]   // localhost + Browser
                : [])
        ];

        let lastErr = null;
        for (const cfgFn of attempts) {
            try {
                const cfg = cfgFn();
                const testPool = await new mssql.ConnectionPool(cfg).connect();
                await testPool.request().query('SELECT 1 AS Test');
                await testPool.close();
                const label = `${cfg.server}\\${cfg.options.instanceName || ''}`.replace(/\\$/, '');
                return res.json({ success: true, message: `Conexión exitosa: ${label}` });
            } catch (e) {
                lastErr = e;
            }
        }
        res.json({
            success: false,
            message: (lastErr?.message || 'No se pudo conectar') + ' — Tip: intenta especificar el puerto directamente (ej. 1433 o el puerto dinámico que muestra SQL Server Config Manager)'
        });
    } catch (err) {
        console.error('Error in POST /api/admin/db-config/test-auxiliary:', err);
        res.status(500).json({ error: err.message });
    }
});


// POST /api/admin/db-sync - Sync data from primary to auxiliary DB
app.post('/api/admin/db-sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { dbManager } = require('./dbConnectionManager');

        await dbManager.loadAuxiliaryConfig();
        if (!dbManager.auxiliaryConfig) {
            return res.status(400).json({ error: 'No hay configuración de BD auxiliar. Configure primero la BD auxiliar.' });
        }

        const mssql = require('mssql');
        const testResult = await dbManager.testConnection(dbManager.auxiliaryConfig);
        if (!testResult.success) {
            return res.status(400).json({ error: 'No se puede conectar a la BD auxiliar: ' + testResult.message });
        }

        console.log('🔄 Starting database synchronization...');
        const primaryPool = dbManager.getActivePool();
        const auxPool = await new mssql.ConnectionPool(dbManager.auxiliaryConfig).connect();
        const syncStats = {};

        try {
            // 1. Sync RSM_ALCANCE_DIARIO (current year only)
            const currentYear = new Date().getFullYear();
            console.log(`📊 Syncing RSM_ALCANCE_DIARIO (year >= ${currentYear})...`);
            const alcanceData = await primaryPool.request().query(`SELECT * FROM RSM_ALCANCE_DIARIO WHERE Año >= ${currentYear}`);

            await auxPool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RSM_ALCANCE_DIARIO' AND xtype='U')
                CREATE TABLE RSM_ALCANCE_DIARIO (
                    Fecha DATE, Año INT, Mes INT, Dia INT, Local NVARCHAR(255),
                    CODALMACEN NVARCHAR(50), Canal NVARCHAR(50), Tipo NVARCHAR(50),
                    MontoReal DECIMAL(18,2), Monto DECIMAL(18,2), Monto_Acumulado DECIMAL(18,2),
                    MontoAnterior DECIMAL(18,2), MontoAnterior_Acumulado DECIMAL(18,2),
                    MontoAnteriorAjustado DECIMAL(18,2), MontoAnteriorAjustado_Acumulado DECIMAL(18,2)
                )
            `);

            if (alcanceData.recordset.length > 0) {
                await auxPool.request().query(`DELETE FROM RSM_ALCANCE_DIARIO WHERE Año >= ${currentYear}`);
                for (let i = 0; i < alcanceData.recordset.length; i += 500) {
                    const batch = alcanceData.recordset.slice(i, i + 500);
                    const values = batch.map((_, idx) => `(@F${i + idx},@A${i + idx},@M${i + idx},@D${i + idx},@L${i + idx},@C${i + idx},@Ca${i + idx},@T${i + idx},@MR${i + idx},@Mo${i + idx},@MA${i + idx},@MAn${i + idx},@MAna${i + idx},@MAj${i + idx},@MAja${i + idx})`).join(',');
                    const request = auxPool.request();
                    batch.forEach((row, idx) => {
                        const o = i + idx;
                        request.input(`F${o}`, mssql.Date, row.Fecha);
                        request.input(`A${o}`, mssql.Int, row.Año);
                        request.input(`M${o}`, mssql.Int, row.Mes);
                        request.input(`D${o}`, mssql.Int, row.Dia);
                        request.input(`L${o}`, mssql.NVarChar, row.Local);
                        request.input(`C${o}`, mssql.NVarChar, row.CODALMACEN);
                        request.input(`Ca${o}`, mssql.NVarChar, row.Canal);
                        request.input(`T${o}`, mssql.NVarChar, row.Tipo);
                        request.input(`MR${o}`, mssql.Decimal(18, 2), row.MontoReal);
                        request.input(`Mo${o}`, mssql.Decimal(18, 2), row.Monto);
                        request.input(`MA${o}`, mssql.Decimal(18, 2), row.Monto_Acumulado);
                        request.input(`MAn${o}`, mssql.Decimal(18, 2), row.MontoAnterior);
                        request.input(`MAna${o}`, mssql.Decimal(18, 2), row.MontoAnterior_Acumulado);
                        request.input(`MAj${o}`, mssql.Decimal(18, 2), row.MontoAnteriorAjustado);
                        request.input(`MAja${o}`, mssql.Decimal(18, 2), row.MontoAnteriorAjustado_Acumulado);
                    });
                    await request.query(`INSERT INTO RSM_ALCANCE_DIARIO VALUES ${values}`);
                }
            }
            syncStats.RSM_ALCANCE_DIARIO = alcanceData.recordset.length;

            // 2. Sync APP_USUARIOS
            console.log('👥 Syncing APP_USUARIOS...');
            const usuariosData = await primaryPool.request().query(`SELECT * FROM APP_USUARIOS`);
            await auxPool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_USUARIOS' AND xtype='U')
                CREATE TABLE APP_USUARIOS (
                    Id INT IDENTITY(1,1) PRIMARY KEY, Email NVARCHAR(255) UNIQUE NOT NULL,
                    Nombre NVARCHAR(255) NOT NULL, Clave NVARCHAR(10) NOT NULL,
                    Activo BIT DEFAULT 1, AccesoTendencia BIT DEFAULT 0, AccesoTactica BIT DEFAULT 0,
                    AccesoEventos BIT DEFAULT 0, AccesoPresupuesto BIT DEFAULT 1,
                    AccesoTiempos BIT DEFAULT 0, AccesoEvaluaciones BIT DEFAULT 0,
                    AccesoInventarios BIT DEFAULT 0, EsAdmin BIT DEFAULT 0, EsProtegido BIT DEFAULT 0,
                    DashboardLocales NVARCHAR(MAX), ComparativePeriod VARCHAR(20) DEFAULT 'Month'
                )
            `);
            if (usuariosData.recordset.length > 0) {
                await auxPool.request().query(`DELETE FROM APP_USUARIOS`);
                for (const user of usuariosData.recordset) {
                    await auxPool.request()
                        .input('Email', mssql.NVarChar, user.Email)
                        .input('Nombre', mssql.NVarChar, user.Nombre)
                        .input('Clave', mssql.NVarChar, user.Clave)
                        .input('Activo', mssql.Bit, user.Activo)
                        .input('EsAdmin', mssql.Bit, user.EsAdmin)
                        .input('AccesoPresupuesto', mssql.Bit, user.AccesoPresupuesto)
                        .input('AccesoTendencia', mssql.Bit, user.AccesoTendencia)
                        .input('EsProtegido', mssql.Bit, user.EsProtegido)
                        .query(`INSERT INTO APP_USUARIOS (Email,Nombre,Clave,Activo,EsAdmin,AccesoPresupuesto,AccesoTendencia,EsProtegido)
                                VALUES (@Email,@Nombre,@Clave,@Activo,@EsAdmin,@AccesoPresupuesto,@AccesoTendencia,@EsProtegido)`);
                }
            }
            syncStats.APP_USUARIOS = usuariosData.recordset.length;

            await auxPool.close();
            console.log('✅ Database synchronization completed');
            res.json({ success: true, message: 'Sincronización completada', stats: syncStats });
        } catch (syncErr) {
            await auxPool.close();
            throw syncErr;
        }
    } catch (err) {
        console.error('Error in POST /api/admin/db-sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ADMIN CONFIG ENDPOINTS (admin only)
// ==========================================

// GET /api/admin/config/:key
app.get('/api/admin/config/:key', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const pool = await poolPromise;
        const result = await pool.request()
            .input('clave', sql.NVarChar, req.params.key)
            .query(`SELECT Clave, Valor, FechaModificacion, UsuarioModificacion FROM APP_CONFIGURACION WHERE Clave = @clave`);
        if (result.recordset.length === 0) return res.json({ Clave: req.params.key, Valor: '', FechaModificacion: null, UsuarioModificacion: null });
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error in GET /api/admin/config:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/config/:key
app.put('/api/admin/config/:key', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const pool = await poolPromise;
        const { valor } = req.body;
        await pool.request()
            .input('clave', sql.NVarChar, req.params.key)
            .input('valor', sql.NVarChar, valor)
            .input('usuario', sql.NVarChar, req.user.email)
            .query(`
                MERGE APP_CONFIGURACION AS target USING (SELECT @clave AS Clave) AS source ON target.Clave = source.Clave
                WHEN MATCHED THEN UPDATE SET Valor = @valor, FechaModificacion = GETDATE(), UsuarioModificacion = @usuario
                WHEN NOT MATCHED THEN INSERT (Clave, Valor, FechaModificacion, UsuarioModificacion) VALUES (@clave, @valor, GETDATE(), @usuario);
            `);
        // Invalidate alcance table cache if this key was changed
        if (req.params.key === 'ALCANCE_TABLE_NAME') invalidateAlcanceTableCache();
        res.json({ success: true });
    } catch (err) {
        console.error('Error in PUT /api/admin/config:', err);
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
        const alcanceTable = await getAlcanceTableName(pool);
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
                    FROM ${alcanceTable}
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
                SUM(CASE WHEN MontoReal > 0 THEN Monto ELSE 0 END) AS MontoDiasConDatos,
                SUM(Monto_Acumulado) AS Monto_Acumulado, 
                SUM(MontoAnterior) AS MontoAnterior, 
                SUM(CASE WHEN MontoReal > 0 THEN MontoAnterior ELSE 0 END) AS AnteriorDiasConDatos,
                SUM(MontoAnterior_Acumulado) AS MontoAnterior_Acumulado, 
                SUM(MontoAnteriorAjustado) AS MontoAnteriorAjustado, 
                SUM(CASE WHEN MontoReal > 0 THEN MontoAnteriorAjustado ELSE 0 END) AS AnteriorAjustadoDiasConDatos,
                SUM(MontoAnteriorAjustado_Acumulado) AS MontoAnteriorAjustado_Acumulado
            FROM ${alcanceTable} 
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

// GET /api/comparable-days?year=2026&month=2&local=...&canal=Todos&tipo=Ventas
// Returns daily-level data with comparable year fields for the Comparable Days table
app.get('/api/comparable-days', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const alcanceTable = await getAlcanceTableName(pool);
        const year = parseInt(req.query.year) || 2026;
        const month = parseInt(req.query.month);
        const local = req.query.local;
        let canal = req.query.canal || 'Todos';
        const tipo = req.query.tipo || 'Ventas';

        if (!local) return res.status(400).json({ error: 'El parámetro local es requerido' });
        if (!month) return res.status(400).json({ error: 'El parámetro month es requerido' });

        console.log(`📊 /api/comparable-days: year=${year}, month=${month}, local=${local}, canal=${canal}, tipo=${tipo}`);

        // Check user permissions for requested store
        const userStores = req.user.allowedStores || [];
        if (userStores.length > 0 && !userStores.includes(local)) {
            return res.status(403).json({ error: 'No tiene acceso a este local' });
        }

        // For users with limited channels
        const userAllowedCanales = req.user.allowedCanales || [];
        const allCanales = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];
        const hasLimitedChannels = userAllowedCanales.length > 0 && userAllowedCanales.length < allCanales.length;
        const useMultiChannel = canal === 'Todos' && hasLimitedChannels;

        // Detect if local is a group
        let memberLocals = null;
        const idGrupoResult = await pool.request()
            .input('groupName', sql.NVarChar, local)
            .query(`
                SELECT GA.IDGRUPO
                FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
                WHERE GA.CODVISIBLE = 20 AND GA.DESCRIPCION = @groupName
            `);

        if (idGrupoResult.recordset.length > 0) {
            const idGrupos = idGrupoResult.recordset.map(r => r.IDGRUPO);
            const memberCodesRequest = pool.request();
            idGrupos.forEach((id, i) => memberCodesRequest.input(`idgrupo${i}`, sql.Int, id));
            const memberCodesResult = await memberCodesRequest.query(`
                SELECT DISTINCT GL.CODALMACEN
                FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
                WHERE GL.IDGRUPO IN (${idGrupos.map((_, i) => `@idgrupo${i}`).join(', ')})
            `);
            const memberCodes = memberCodesResult.recordset.map(r => r.CODALMACEN);

            if (memberCodes.length > 0) {
                const localsRequest = pool.request();
                localsRequest.input('year', sql.Int, year);
                memberCodes.forEach((code, i) => localsRequest.input(`mcode${i}`, sql.NVarChar, code));
                const localsResult = await localsRequest.query(`
                    SELECT DISTINCT Local FROM ${alcanceTable}
                    WHERE Año = @year AND CODALMACEN IN (${memberCodes.map((_, i) => `@mcode${i}`).join(', ')})
                    AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
                `);
                memberLocals = localsResult.recordset.map(r => r.Local);
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

        // Build canal filter
        let canalFilter = '';
        const canalParams = {};
        if (useMultiChannel) {
            const canalPlaceholders = userAllowedCanales.map((_, i) => `@ch${i}`).join(', ');
            canalFilter = `Canal IN (${canalPlaceholders})`;
            userAllowedCanales.forEach((ch, i) => { canalParams[`ch${i}`] = ch; });
        } else {
            canalFilter = `Canal = @canal`;
            canalParams['canal'] = canal;
        }

        const query = `
            SELECT 
                Fecha,
                Dia,
                idDia,
                Serie,
                SUM(MontoReal) AS MontoReal,
                SUM(Monto) AS Monto,
                SUM(MontoAnterior) AS MontoAnterior,
                SUM(MontoAnteriorAjustado) AS MontoAnteriorAjustado,
                MIN(FechaAnterior) AS FechaAnterior,
                MIN(FechaAnteriorAjustada) AS FechaAnteriorAjustada
            FROM ${alcanceTable}
            WHERE Año = @year AND Mes = @month AND ${localFilter} AND ${canalFilter} AND Tipo = @tipo
                AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            GROUP BY Fecha, Dia, idDia, Serie
            ORDER BY Dia
        `;

        const request = pool.request()
            .input('year', sql.Int, year)
            .input('month', sql.Int, month)
            .input('tipo', sql.NVarChar, tipo);

        Object.entries(canalParams).forEach(([key, val]) => {
            request.input(key, sql.NVarChar, val);
        });
        Object.entries(localParams).forEach(([key, val]) => {
            request.input(key, sql.NVarChar, val);
        });

        const result = await request.query(query);
        console.log(`📊 Comparable days for ${local} (${canal}/${tipo}) month ${month}: ${result.recordset.length} rows`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error in /api/comparable-days:', err);
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
        const alcanceTable = await getAlcanceTableName(pool);
        let localsQuery = `SELECT DISTINCT Local FROM ${alcanceTable} WHERE Año = 2026`;

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
        const alcanceTable = await getAlcanceTableName(pool);
        const query = `SELECT DISTINCT Local FROM ${alcanceTable} WHERE Año = 2026 ORDER BY Local`;
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
        const alcanceTable = await getAlcanceTableName(pool);
        let groupsQuery = `
            SELECT DISTINCT Local
            FROM ${alcanceTable} 
            WHERE Año = 2026 
            AND Canal = 'Todos' 
            AND Tipo = 'Ventas' 
            AND Mes = @month
            AND SUBSTRING(CODALMACEN, 1, 1) = 'G'
        `;

        // Query to get all locals
        let allLocalsQuery = `SELECT DISTINCT Local FROM ${alcanceTable} WHERE Año = 2026`;

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
        // The Local name in the alcance table matches DESCRIPCION in GRUPOSALMACENCAB
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

        // Step 3: Map member CODALMACEN to Local names via alcance table
        const alcanceTable = await getAlcanceTableName(pool);
        const storesQuery = `
            SELECT DISTINCT Local
            FROM ${alcanceTable}
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
        const alcanceTable = await getAlcanceTableName(pool);
        const result = await pool.request()
            .query(`SELECT DISTINCT Local FROM ${alcanceTable} WHERE Año = 2026 ORDER BY Local`);
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
        const alcanceTable = await getAlcanceTableName(pool);
        const result = await pool.request()
            .query(`SELECT TOP 1 * FROM ${alcanceTable} WHERE Año = 2026`);

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

        const alcanceTable = await getAlcanceTableName(pool);
        const result = await pool.request()
            .input('year', sql.Int, year)
            .query(`SELECT MAX(Fecha) as FechaLimite FROM ${alcanceTable} WHERE MontoReal > 0 AND Año = @year`);

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
// RANGOS ENDPOINT
// ==========================================

app.get('/api/rangos', authMiddleware, getRangosData);
app.get('/api/rangos/resumen-canal', authMiddleware, getRangosResumenCanal);

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



// GET /api/tendencia/resumen-grupos - Aggregated data per group
app.get('/api/tendencia/resumen-grupos', authMiddleware, getResumenGrupos);

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

// GET /api/eventos/por-mes?year=2026&month=2 - Get events with dates for a given month
// Available to all authenticated users (no accesoEventos required)
app.get('/api/eventos/por-mes', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

        const result = await pool.request()
            .input('year', sql.Int, year)
            .input('month', sql.Int, month)
            .query(`
                SELECT 
                    e.IDEVENTO,
                    e.EVENTO,
                    e.ESFERIADO,
                    e.USARENPRESUPUESTO,
                    e.ESINTERNO,
                    f.FECHA,
                    f.FECHA_EFECTIVA,
                    f.Canal,
                    f.GrupoAlmacen
                FROM DIM_EVENTOS e
                INNER JOIN DIM_EVENTOS_FECHAS f ON e.IDEVENTO = f.IDEVENTO
                WHERE YEAR(f.FECHA) = @year AND MONTH(f.FECHA) = @month
                ORDER BY f.FECHA, e.EVENTO
            `);

        // Group by date for easy frontend consumption
        const byDate = {};
        result.recordset.forEach(row => {
            const dateKey = row.FECHA instanceof Date
                ? row.FECHA.toISOString().split('T')[0]
                : String(row.FECHA).split('T')[0];
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push({
                id: row.IDEVENTO,
                evento: row.EVENTO,
                esFeriado: row.ESFERIADO === 'S',
                usarEnPresupuesto: row.USARENPRESUPUESTO === 'S',
                esInterno: row.ESINTERNO === 'S',
                canal: row.Canal,
                grupoAlmacen: row.GrupoAlmacen
            });
        });

        res.json({ year, month, byDate });
    } catch (err) {
        console.error('Error in /api/eventos/por-mes:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CONTROL DE PERSONAL (endpoints defined earlier in file, using APP_USUARIOS)
// ==========================================


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
        // Invalidate alcance table cache if this key was changed
        if (req.params.key === 'ALCANCE_TABLE_NAME') invalidateAlcanceTableCache();
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

// POST /api/tactica - Generate T&E (Táctica y Estrategia) AI analysis

app.post('/api/tactica', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        if (!data || !data.monthlyData || !data.annualTotals) {
            return res.status(400).json({ error: 'Datos mensuales y totales anuales son requeridos' });
        }
        console.log(` T&E requested for ${data.storeName} (${data.kpi}) by ${req.user?.email}`);

        // Read per-KPI prompt/model, falling back to global config
        let customPrompt = null;
        let customModel = null;
        try {
            const pool = await poolPromise;
            const kpiKey = data.kpi ? data.kpi.toUpperCase().replace(/\s+/g, '_') : null;

            // Try per-KPI prompt first (e.g. TACTICA_PROMPT_VENTAS)
            if (kpiKey) {
                const kpiPromptResult = await pool.request()
                    .input('clave', sql.NVarChar, `TACTICA_PROMPT_${kpiKey}`)
                    .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
                if (kpiPromptResult.recordset.length > 0 && kpiPromptResult.recordset[0].Valor) {
                    customPrompt = kpiPromptResult.recordset[0].Valor;
                    console.log(` Using per-KPI prompt for ${kpiKey}`);
                }

                // Try per-KPI model (e.g. TACTICA_MODEL_VENTAS)
                const kpiModelResult = await pool.request()
                    .input('clave', sql.NVarChar, `TACTICA_MODEL_${kpiKey}`)
                    .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
                if (kpiModelResult.recordset.length > 0 && kpiModelResult.recordset[0].Valor) {
                    customModel = kpiModelResult.recordset[0].Valor;
                }
            }

            // Fall back to global prompt if no per-KPI prompt
            if (!customPrompt) {
                const globalPromptResult = await pool.request()
                    .input('clave', sql.NVarChar, 'TACTICA_PROMPT')
                    .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
                if (globalPromptResult.recordset.length > 0 && globalPromptResult.recordset[0].Valor) {
                    customPrompt = globalPromptResult.recordset[0].Valor;
                    console.log(' Using global prompt (fallback)');
                }
            }

            // Fall back to global model if no per-KPI model
            if (!customModel) {
                const globalModelResult = await pool.request()
                    .input('clave', sql.NVarChar, 'TACTICA_MODEL')
                    .query('SELECT Valor FROM APP_CONFIGURACION WHERE Clave = @clave');
                if (globalModelResult.recordset.length > 0 && globalModelResult.recordset[0].Valor) {
                    customModel = globalModelResult.recordset[0].Valor;
                }
            }
        } catch (configErr) {
            console.warn(' Could not read custom prompt/model, using defaults:', configErr.message);
        }

        const analysis = await generateTacticaAnalysis(data, customPrompt, customModel);
        res.json({ analysis });
    } catch (err) {
        console.error('Error in /api/tactica:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// EVENTOS ENDPOINTS
// ==========================================

// GET /api/eventos - List all events (requires accesoEventos or esAdmin)
app.get('/api/eventos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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
        if (!req.user.accesoEventos && !req.user.esAdmin) {
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

// GET /api/eventos/por-mes?year=2026&month=2 - Read-only: events grouped by date for a month (any authenticated user)
app.get('/api/eventos/por-mes', authMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('year', sql.Int, year)
            .input('month', sql.Int, month)
            .query(`
                SELECT 
                    EF.FECHA,
                    E.IDEVENTO,
                    E.EVENTO,
                    E.ESFERIADO,
                    E.ESINTERNO,
                    E.USARENPRESUPUESTO
                FROM DIM_EVENTOS_FECHAS EF
                INNER JOIN DIM_EVENTOS E ON E.IDEVENTO = EF.IDEVENTO
                WHERE YEAR(EF.FECHA) = @year AND MONTH(EF.FECHA) = @month
                ORDER BY EF.FECHA
            `);

        // Group by date string YYYY-MM-DD
        const byDate = {};
        for (const row of result.recordset) {
            const dateStr = (row.FECHA instanceof Date ? row.FECHA : new Date(row.FECHA))
                .toISOString().substring(0, 10);
            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push({
                id: row.IDEVENTO,
                evento: row.EVENTO,
                esFeriado: row.ESFERIADO === 'S' || row.ESFERIADO === true || row.ESFERIADO === 1,
                esInterno: row.ESINTERNO === 'S' || row.ESINTERNO === true || row.ESINTERNO === 1,
                usarEnPresupuesto: row.USARENPRESUPUESTO === 'S' || row.USARENPRESUPUESTO === true || row.USARENPRESUPUESTO === 1
            });
        }
        res.json({ byDate });
    } catch (err) {
        console.error('Error in /api/eventos/por-mes:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/eventos/por-año?year=2026 - Read-only: all events for a year grouped by date (any authenticated user)
app.get('/api/eventos/por-ano', authMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const pool = await poolPromise;

        const result = await pool.request()
            .input('year', sql.Int, year)
            .query(`
                SELECT 
                    EF.FECHA,
                    E.IDEVENTO,
                    E.EVENTO,
                    E.ESFERIADO,
                    E.ESINTERNO,
                    E.USARENPRESUPUESTO
                FROM DIM_EVENTOS_FECHAS EF
                INNER JOIN DIM_EVENTOS E ON E.IDEVENTO = EF.IDEVENTO
                WHERE YEAR(EF.FECHA) = @year
                ORDER BY EF.FECHA
            `);

        const byDate = {};
        for (const row of result.recordset) {
            const dateStr = (row.FECHA instanceof Date ? row.FECHA : new Date(row.FECHA))
                .toISOString().substring(0, 10);
            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push({
                id: row.IDEVENTO,
                evento: row.EVENTO,
                esFeriado: row.ESFERIADO === 'S' || row.ESFERIADO === true || row.ESFERIADO === 1,
                esInterno: row.ESINTERNO === 'S' || row.ESINTERNO === true || row.ESINTERNO === 1,
                usarEnPresupuesto: row.USARENPRESUPUESTO === 'S' || row.USARENPRESUPUESTO === true || row.USARENPRESUPUESTO === 1
            });
        }
        res.json({ byDate });
    } catch (err) {
        console.error('Error in /api/eventos/por-ano:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/eventos-ajuste/all - All adjustment events (USARENPRESUPUESTO='S') across all years, no year filter
app.get('/api/eventos-ajuste/all', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT 
                    EF.FECHA,
                    E.IDEVENTO,
                    E.EVENTO,
                    E.ESFERIADO,
                    E.ESINTERNO,
                    E.USARENPRESUPUESTO
                FROM DIM_EVENTOS_FECHAS EF
                INNER JOIN DIM_EVENTOS E ON E.IDEVENTO = EF.IDEVENTO
                WHERE E.USARENPRESUPUESTO = 'S'
                ORDER BY EF.FECHA
            `);

        const byDate = {};
        for (const row of result.recordset) {
            const dateStr = (row.FECHA instanceof Date ? row.FECHA : new Date(row.FECHA))
                .toISOString().substring(0, 10);
            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push({
                id: row.IDEVENTO,
                evento: row.EVENTO,
                esFeriado: row.ESFERIADO === 'S' || row.ESFERIADO === true || row.ESFERIADO === 1,
                esInterno: row.ESINTERNO === 'S' || row.ESINTERNO === true || row.ESINTERNO === 1,
                usarEnPresupuesto: true
            });
        }
        res.json({ byDate });
    } catch (err) {
        console.error('Error in /api/eventos-ajuste/all:', err);
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


// ==========================================
// INVGATE INTEGRATION ENDPOINTS (admin only)
// ==========================================
const { getInvgatePool, sql: invgateSql } = invgateDb;


// Initialize InvGate cron job on server startup
(async () => {
    try {
        await invgateService.initialize();
        await invgateCron.start();
    } catch (err) {
        console.error('⚠️ Failed to start InvGate cron:', err.message);
    }
})();

// POST /api/invgate/config - Update InvGate configuration
app.post('/api/invgate/config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const { clientId, clientSecret, tokenUrl, apiBaseUrl, syncIntervalHours, syncEnabled, oauthScopes } = req.body;
        const pool = await getInvgatePool();

        const upsert = async (key, value) => {
            if (value === undefined) return;
            const existing = await pool.request()
                .input('key', invgateSql.NVarChar, key)
                .query(`SELECT COUNT(*) as cnt FROM InvgateConfig WHERE ConfigKey = @key`);
            if (existing.recordset[0].cnt > 0) {
                await pool.request()
                    .input('value', invgateSql.NVarChar(4000), value)
                    .input('key', invgateSql.NVarChar, key)
                    .query(`UPDATE InvgateConfig SET ConfigValue = @value, UpdatedAt = GETDATE() WHERE ConfigKey = @key`);
            } else {
                await pool.request()
                    .input('key', invgateSql.NVarChar, key)
                    .input('value', invgateSql.NVarChar(4000), value)
                    .query(`INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES (@key, @value)`);
            }
        };

        await upsert('CLIENT_ID', clientId);
        if (clientSecret) await upsert('CLIENT_SECRET', clientSecret);
        await upsert('TOKEN_URL', tokenUrl);
        await upsert('API_BASE_URL', apiBaseUrl);
        await upsert('SYNC_INTERVAL_HOURS', syncIntervalHours !== undefined ? String(syncIntervalHours) : undefined);
        await upsert('SYNC_ENABLED', syncEnabled !== undefined ? (syncEnabled ? 'true' : 'false') : undefined);
        if (oauthScopes !== undefined) await upsert('OAUTH_SCOPES', oauthScopes);

        // Reinitialize service and restart cron if config changed
        await invgateService.initialize();
        await invgateCron.restart();

        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (err) {
        console.error('Error updating InvGate config:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/config - Get current InvGate configuration
app.get('/api/invgate/config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const pool = await getInvgatePool();
        const result = await pool.request().query(`
            SELECT ConfigKey, ConfigValue 
            FROM InvgateConfig 
            WHERE ConfigKey IN ('CLIENT_ID', 'CLIENT_SECRET', 'TOKEN_URL', 'API_BASE_URL', 'SYNC_INTERVAL_HOURS', 'SYNC_ENABLED', 'LAST_SYNC_DATE', 'OAUTH_SCOPES')
        `);

        const raw = {};
        result.recordset.forEach(row => { raw[row.ConfigKey] = row.ConfigValue; });

        res.json({
            clientId: raw.CLIENT_ID || '',
            clientSecret: raw.CLIENT_SECRET || '',  // visible
            tokenUrl: raw.TOKEN_URL || '',
            apiBaseUrl: raw.API_BASE_URL || '',
            sync_interval_hours: raw.SYNC_INTERVAL_HOURS || '1',
            sync_enabled: raw.SYNC_ENABLED || 'true',
            last_sync_date: raw.LAST_SYNC_DATE || null,
            oauthScopes: raw.OAUTH_SCOPES || ''
        });
    } catch (err) {
        console.error('Error getting InvGate config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/invgate/sync - Trigger manual synchronization
app.post('/api/invgate/sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const { syncType = 'incremental' } = req.body;
        const initiatedBy = req.user.email || 'MANUAL';

        console.log(`🔄 Manual sync requested by ${initiatedBy}, type: ${syncType}`);

        // Start sync asynchronously
        const syncPromise = syncType === 'full'
            ? invgateSyncService.fullSync(initiatedBy)
            : invgateSyncService.incrementalSync(initiatedBy);

        // Return immediately - sync will continue in background
        res.json({
            success: true,
            message: 'Sincronización iniciada',
            syncType
        });

        // Wait for sync to complete in background
        syncPromise.catch(err => {
            console.error('Background sync failed:', err);
        });

    } catch (err) {
        console.error('Error starting InvGate sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/sync-status - Get synchronization status
app.get('/api/invgate/sync-status', authMiddleware, async (req, res) => {
    try {
        const lastSync = await invgateSyncService.getLastSyncStatus();
        const cronStatus = invgateCron.getStatus();

        res.json({
            lastSync,
            cronJob: cronStatus
        });
    } catch (err) {
        console.error('Error getting sync status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/sync-logs - Get synchronization logs
app.get('/api/invgate/sync-logs', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const limit = parseInt(req.query.limit) || 50;
        const logs = await invgateSyncService.getSyncLogs(limit);

        res.json(logs);
    } catch (err) {
        console.error('Error getting sync logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── InvGate Views Management ─────────────────────────────────────
// NOTE: All view endpoints now live exclusively in invgate_endpoints.js
// (GET/POST/DELETE /api/invgate/views, toggle, preview, sync, mappings)

// GET /api/invgate/tickets - Get tickets with filters and pagination
app.get('/api/invgate/tickets', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();

        const {
            page = 1,
            pageSize = 50,
            estado,
            prioridad,
            categoria,
            fechaDesde,
            fechaHasta,
            busqueda
        } = req.query;

        // Build WHERE clause dynamically
        const conditions = [];
        const params = {};

        if (estado) {
            conditions.push('Estado = @estado');
            params.estado = estado;
        }

        if (prioridad) {
            conditions.push('Prioridad = @prioridad');
            params.prioridad = prioridad;
        }

        if (categoria) {
            conditions.push('Categoria = @categoria');
            params.categoria = categoria;
        }

        if (fechaDesde) {
            conditions.push('FechaCreacion >= @fechaDesde');
            params.fechaDesde = fechaDesde;
        }

        if (fechaHasta) {
            conditions.push('FechaCreacion <= @fechaHasta');
            params.fechaHasta = fechaHasta;
        }

        if (busqueda) {
            conditions.push('(Titulo LIKE @busqueda OR NumeroTicket LIKE @busqueda OR Descripcion LIKE @busqueda)');
            params.busqueda = `%${busqueda}%`;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as Total FROM InvgateTickets ${whereClause}`;
        const countRequest = pool.request();
        Object.entries(params).forEach(([key, val]) => {
            countRequest.input(key, invgateSql.NVarChar, val);
        });
        const countResult = await countRequest.query(countQuery);
        const total = countResult.recordset[0].Total;

        // Get paginated data
        const offset = (page - 1) * pageSize;
        const dataQuery = `
            SELECT *
            FROM InvgateTickets
            ${whereClause}
            ORDER BY FechaCreacion DESC
            OFFSET @offset ROWS
            FETCH NEXT @pageSize ROWS ONLY
        `;

        const dataRequest = pool.request();
        Object.entries(params).forEach(([key, val]) => {
            dataRequest.input(key, invgateSql.NVarChar, val);
        });
        dataRequest.input('offset', invgateSql.Int, offset);
        dataRequest.input('pageSize', invgateSql.Int, parseInt(pageSize));

        const dataResult = await dataRequest.query(dataQuery);

        res.json({
            tickets: dataResult.recordset,
            pagination: {
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (err) {
        console.error('Error getting tickets:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/tickets/:id - Get single ticket by ID
app.get('/api/invgate/tickets/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();
        const result = await pool.request()
            .input('ticketId', invgateSql.NVarChar, req.params.id)
            .query('SELECT * FROM InvgateTickets WHERE TicketID = @ticketId');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error getting ticket:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/summary - Get summary statistics
app.get('/api/invgate/reports/summary', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();
        const result = await pool.request().query('SELECT * FROM vw_InvgateMetricasResumen');

        res.json(result.recordset[0] || {});
    } catch (err) {
        console.error('Error getting summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-status - Get ticket counts by status
app.get('/api/invgate/reports/by-status', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();
        const result = await pool.request().query(`
            SELECT Estado, COUNT(*) as Cantidad
            FROM InvgateTickets
            GROUP BY Estado
            ORDER BY Cantidad DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting tickets by status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-category - Get ticket counts by category
app.get('/api/invgate/reports/by-category', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();
        const result = await pool.request().query(`
            SELECT Categoria, COUNT(*) as Cantidad
            FROM InvgateTickets
            GROUP BY Categoria
            ORDER BY Cantidad DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting tickets by category:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-priority - Get ticket counts by priority
app.get('/api/invgate/reports/by-priority', authMiddleware, async (req, res) => {
    try {
        const pool = await getInvgatePool();
        const result = await pool.request().query(`
            SELECT Prioridad, COUNT(*) as Cantidad
            FROM InvgateTickets
            GROUP BY Prioridad
            ORDER BY 
                CASE Prioridad 
                    WHEN 'Urgente' THEN 1
                    WHEN 'Alta' THEN 2
                    WHEN 'Media' THEN 3
                    WHEN 'Baja' THEN 4
                    ELSE 5
                END
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting tickets by priority:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/invgate/test-connection - Test API connection
app.post('/api/invgate/test-connection', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const result = await invgateService.testConnection();
        res.json(result);
    } catch (err) {
        console.error('Error testing connection:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// PERSONAL MODULE ENDPOINTS
// ==========================================

// Ensure Personal tables exist
(async () => {
    try {
        const pool = await poolPromise;

        // TABLE: APP_PERSONAL_CARGOS (Catalog of job titles)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_PERSONAL_CARGOS' AND xtype='U')
            BEGIN
                CREATE TABLE APP_PERSONAL_CARGOS (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    NOMBRE NVARCHAR(100) NOT NULL UNIQUE,
                    ACTIVO BIT DEFAULT 1
                );
                
                -- Seed default values
                INSERT INTO APP_PERSONAL_CARGOS (NOMBRE) VALUES 
                ('Administrador'), ('Mercadeo'), ('Supervisor'), ('Auditor'), 
                ('Encargado'), ('Entrenador'), ('Cajero'), ('Salonero'), 
                ('Cocinero'), ('Motorizado'), ('Miscelaneo');
            END
        `);

        // TABLE: APP_PERSONAL (Staff members)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_PERSONAL' AND xtype='U')
            BEGIN
                CREATE TABLE APP_PERSONAL (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    NOMBRE NVARCHAR(200) NOT NULL,
                    CORREO NVARCHAR(200),
                    CEDULA NVARCHAR(50),
                    TELEFONO NVARCHAR(50),
                    ACTIVO BIT DEFAULT 1,
                    FECHA_CREACION DATETIME DEFAULT GETDATE()
                );
            END
        `);

        // TABLE: APP_PERSONAL_ASIGNACIONES (Assignments)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_PERSONAL_ASIGNACIONES' AND xtype='U')
            BEGIN
                CREATE TABLE APP_PERSONAL_ASIGNACIONES (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    PERSONAL_ID INT NOT NULL,
                    LOCAL NVARCHAR(100) NOT NULL,
                    PERFIL NVARCHAR(100) NOT NULL, -- Storing name for simplicity, or could be FK to APP_PERSONAL_CARGOS
                    FECHA_INICIO DATE NOT NULL,
                    FECHA_FIN DATE,
                    NOTAS NVARCHAR(MAX),
                    ACTIVO BIT DEFAULT 1,
                    FECHA_CREACION DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_Asignacion_Personal FOREIGN KEY (PERSONAL_ID) REFERENCES APP_PERSONAL(ID)
                );
            END
        `);

        console.log('✅ Personal module tables checked/created');
    } catch (err) {
        console.error('❌ Error initializing Personal tables:', err);
    }
})();

// --- CARGOS (PROFILES) ENDPOINTS ---

// GET /api/personal/cargos - List active cargos
app.get('/api/personal/cargos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM APP_PERSONAL_CARGOS WHERE ACTIVO = 1 ORDER BY NOMBRE');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/personal/cargos - Create new cargo
app.post('/api/personal/cargos', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const { nombre } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .query('INSERT INTO APP_PERSONAL_CARGOS (NOMBRE) VALUES (@nombre)');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/personal/cargos/:id - Delete (deactivate) cargo, optionally creating a migration for existing assignments
app.delete('/api/personal/cargos/:id', authMiddleware, async (req, res) => {
    try {
        if (!req.user.accesoPersonal && !req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const id = parseInt(req.params.id);
        const { reassignTo } = req.body; // Name of the target profile to reassign to

        const pool = await poolPromise;

        // Get name of cargo to be deleted
        const cargoResult = await pool.request().input('id', sql.Int, id).query('SELECT NOMBRE FROM APP_PERSONAL_CARGOS WHERE ID = @id');
        if (cargoResult.recordset.length === 0) return res.status(404).json({ error: 'Cargo no encontrado' });
        const oldName = cargoResult.recordset[0].NOMBRE;

        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);

            // Reassign if requested
            if (reassignTo) {
                await request
                    .input('oldDetails', sql.NVarChar, oldName)
                    .input('newDetails', sql.NVarChar, reassignTo)
                    .query('UPDATE APP_PERSONAL_ASIGNACIONES SET PERFIL = @newDetails WHERE PERFIL = @oldDetails');
            }

            // Deactivate cargo
            await request.input('idCargo', sql.Int, id).query('UPDATE APP_PERSONAL_CARGOS SET ACTIVO = 0 WHERE ID = @idCargo');

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




// ==========================================
// MICROSOFT FORMS ENDPOINTS (admin only)
// ==========================================

const formsService = require('./services/formsService');
const formsSyncService = require('./services/formsSyncService');


// POST /api/forms/config - Update Forms configuration
app.post('/api/forms/config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const { tenantId, clientId, clientSecret, syncEnabled, syncInterval, formIds } = req.body;
        const updatedBy = req.user.email;

        if (tenantId !== undefined) await formsService.updateConfig('TENANT_ID', tenantId, updatedBy);
        if (clientId !== undefined) await formsService.updateConfig('CLIENT_ID', clientId, updatedBy);
        if (clientSecret !== undefined) await formsService.updateConfig('CLIENT_SECRET', clientSecret, updatedBy);
        if (syncEnabled !== undefined) await formsService.updateConfig('SYNC_ENABLED', syncEnabled.toString(), updatedBy);
        if (syncInterval !== undefined) await formsService.updateConfig('SYNC_INTERVAL_HOURS', syncInterval.toString(), updatedBy);
        if (formIds !== undefined) await formsService.updateConfig('FORM_IDS', JSON.stringify(formIds), updatedBy);

        // Restart cron if sync settings changed
        if (syncEnabled !== undefined || syncInterval !== undefined) {
            await formsCron.restart();
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating Forms config:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/config - Get Forms configuration
app.get('/api/forms/config', async (req, res) => {
    try {
        const config = {
            tenantId: await formsService.getConfig('TENANT_ID') || '',
            clientId: await formsService.getConfig('CLIENT_ID') || '',
            clientSecret: await formsService.getConfig('CLIENT_SECRET') || '',
            syncEnabled: (await formsService.getConfig('SYNC_ENABLED')) === 'true',
            syncInterval: parseInt(await formsService.getConfig('SYNC_INTERVAL_HOURS')) || 1,
            formIds: JSON.parse(await formsService.getConfig('FORM_IDS') || '[]'),
            lastSyncDate: await formsService.getConfig('LAST_SYNC_DATE') || null
        };
        res.json(config);
    } catch (err) {
        console.error('❌ Error getting Forms config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/forms/sync - Trigger manual synchronization
app.post('/api/forms/sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const { type = 'INCREMENTAL' } = req.body;
        const result = await formsCron.triggerManualSync(type, req.user.email);

        res.json(result);
    } catch (err) {
        console.error('Error triggering Forms sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/sync-status - Get latest sync status
app.get('/api/forms/sync-status', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const status = await formsSyncService.getLatestSyncStatus();
        const cronStatus = await formsCron.getStatus();

        res.json({
            lastSync: status,
            cronJob: cronStatus
        });
    } catch (err) {
        console.error('Error getting Forms sync status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/sync-logs - Get sync history with pagination
app.get('/api/forms/sync-logs', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const pageSize = parseInt(req.query.pageSize) || 20;
        const pageNumber = parseInt(req.query.page) || 1;

        const result = await formsSyncService.getSyncLogs(pageSize, pageNumber);
        res.json(result);
    } catch (err) {
        console.error('Error getting Forms sync logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/list - Get list of configured forms
app.get('/api/forms/list', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool } = require('./formsDb');
        const pool = await getFormsPool();

        const result = await pool.request().query(`
            SELECT DISTINCT FormID, FormTitle, 
                   COUNT(*) as TotalResponses,
                   MAX(SubmittedAt) as LatestResponse
            FROM FormResponses
            GROUP BY FormID, FormTitle
            ORDER BY FormTitle
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting Forms list:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/responses - Get responses with filters and pagination
app.get('/api/forms/responses', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool, sql } = require('./formsDb');
        const pool = await getFormsPool();

        const {
            formId,
            formTitle,
            email,
            startDate,
            endDate,
            page = 1,
            pageSize = 50
        } = req.query;

        let query = `
            WITH PagedResponses AS (
                SELECT *,
                       ROW_NUMBER() OVER (ORDER BY SubmittedAt DESC) AS RowNum,
                       COUNT(*) OVER () AS TotalRecords
                FROM FormResponses
                WHERE 1=1
        `;

        const params = [];
        if (formId) {
            query += ' AND FormID = @formId';
            params.push({ name: 'formId', type: sql.NVarChar, value: formId });
        }
        if (formTitle) {
            query += ' AND FormTitle = @formTitle';
            params.push({ name: 'formTitle', type: sql.NVarChar, value: formTitle });
        }
        if (email) {
            query += ' AND RespondentEmail LIKE @email';
            params.push({ name: 'email', type: sql.NVarChar, value: `%${email}%` });
        }
        if (startDate) {
            query += ' AND SubmittedAt >= @startDate';
            params.push({ name: 'startDate', type: sql.DateTime, value: startDate });
        }
        if (endDate) {
            query += ' AND SubmittedAt <= @endDate';
            params.push({ name: 'endDate', type: sql.DateTime, value: endDate });
        }

        query += `)
            SELECT *, 
                   CEILING(CAST(TotalRecords AS FLOAT) / @pageSize) AS TotalPages
            FROM PagedResponses
            WHERE RowNum BETWEEN ((@page - 1) * @pageSize + 1) AND (@page * @pageSize)
        `;

        const request = pool.request();
        request.input('page', sql.Int, parseInt(page));
        request.input('pageSize', sql.Int, parseInt(pageSize));
        params.forEach(p => request.input(p.name, p.type, p.value));

        const result = await request.query(query);
        res.json({
            responses: result.recordset,
            total: result.recordset.length > 0 ? result.recordset[0].TotalRecords : 0,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: result.recordset.length > 0 ? result.recordset[0].TotalPages : 0
        });
    } catch (err) {
        console.error('Error getting Forms responses:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/responses/:id - Get single response details
app.get('/api/forms/responses/:id', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool, sql } = require('./formsDb');
        const pool = await getFormsPool();

        const result = await pool.request()
            .input('id', sql.NVarChar, req.params.id)
            .query('SELECT * FROM FormResponses WHERE ResponseID = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Respuesta no encontrada' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error getting response:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/reports/summary - Get summary statistics
app.get('/api/forms/reports/summary', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool } = require('./formsDb');
        const pool = await getFormsPool();

        const totalForms = await pool.request().query(
            'SELECT COUNT(DISTINCT FormID) as total FROM FormResponses'
        );

        const totalResponses = await pool.request().query(
            'SELECT COUNT(*) as total FROM FormResponses'
        );

        const thisWeek = await pool.request().query(`
            SELECT COUNT(*) as total FROM FormResponses
            WHERE SubmittedAt >= DATEADD(DAY, -7, GETDATE())
        `);

        const lastSync = await formsSyncService.getLatestSyncStatus();

        res.json({
            totalForms: totalForms.recordset[0].total,
            totalResponses: totalResponses.recordset[0].total,
            responsesThisWeek: thisWeek.recordset[0].total,
            lastSync: lastSync ? lastSync.FechaSync : null
        });
    } catch (err) {
        console.error('Error getting Forms summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/reports/by-form - Statistics per form
app.get('/api/forms/reports/by-form', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool } = require('./formsDb');
        const pool = await getFormsPool();

        const result = await pool.request().query(`
            SELECT 
                FormID,
                FormTitle,
                COUNT(*) as TotalResponses,
                MIN(SubmittedAt) as FirstResponse,
                MAX(SubmittedAt) as LatestResponse
            FROM FormResponses
            GROUP BY FormID, FormTitle
            ORDER BY TotalResponses DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting Forms stats by form:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forms/reports/by-date - Responses grouped by date
app.get('/api/forms/reports/by-date', authMiddleware, async (req, res) => {
    try {
        const { getFormsPool, sql } = require('./formsDb');
        const pool = await getFormsPool();

        const { days = 30 } = req.query;

        const result = await pool.request()
            .input('days', sql.Int, parseInt(days))
            .query(`
                SELECT 
                    CAST(SubmittedAt AS DATE) as Fecha,
                    COUNT(*) as TotalResponses
                FROM FormResponses
                WHERE SubmittedAt >= DATEADD(DAY, -@days, GETDATE())
                GROUP BY CAST(SubmittedAt AS DATE)
                ORDER BY Fecha
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting Forms stats by date:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/forms/test-connection - Test Microsoft Graph API connection
app.post('/api/forms/test-connection', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'No tiene permisos de administrador' });
        }

        const result = await formsService.testConnection();
        res.json(result);
    } catch (err) {
        console.error('Error testing Forms connection:', err);
        res.status(500).json({ error: err.message });
    }
});



// Start Forms cron job on server startup
(async () => {
    try {
        await formsCron.start();
    } catch (error) {
        console.error('Error starting Forms cron:', error.message);
    }
})();

// ==========================================
// INVGATE ENDPOINTS
// ==========================================

// POST /api/invgate/config - Save InvGate OAuth 2.0 configuration
app.post('/api/invgate/config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { clientId, clientSecret, tokenUrl, apiBaseUrl, syncIntervalHours, syncEnabled } = req.body;
        const updatedBy = req.user.email || 'admin';

        console.log('💾 Saving InvGate config:', {
            clientId: clientId ? clientId.substring(0, 8) + '...' : 'empty',
            clientSecret: clientSecret ? `[${clientSecret.length} chars]` : 'empty',
            tokenUrl, apiBaseUrl, syncIntervalHours, syncEnabled
        });

        const pool = await invgateDb.getInvgatePool();

        const upsert = async (key, value) => {
            if (value === undefined || value === null || value === '') return;
            const safeVal = value.toString().replace(/'/g, "''");
            const safeKey = key.replace(/'/g, "''");
            console.log(`  💾 Upserting ${key}: [${value.toString().length} chars]`);
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey='${safeKey}')
                    UPDATE InvgateConfig SET ConfigValue='${safeVal}' WHERE ConfigKey='${safeKey}'
                ELSE
                    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('${safeKey}', '${safeVal}')
            `);
        };

        if (clientId) await upsert('CLIENT_ID', clientId);
        if (clientSecret && clientSecret.trim()) await upsert('CLIENT_SECRET', clientSecret);
        if (tokenUrl) await upsert('TOKEN_URL', tokenUrl);
        if (apiBaseUrl) await upsert('API_BASE_URL', apiBaseUrl);
        if (syncIntervalHours !== undefined) await upsert('SYNC_INTERVAL_HOURS', syncIntervalHours.toString());
        if (syncEnabled !== undefined) {
            await upsert('SYNC_ENABLED', syncEnabled.toString());
            try { if (syncEnabled) await invgateCron.restart(); else await invgateCron.stop(); } catch (e) { }
        }

        // Reset service so it re-initializes with new credentials
        invgateService.initialized = false;
        invgateService.accessToken = null;

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving InvGate config:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/debug - Ver contenido de InvgateConfig
app.get('/api/invgate/debug', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query('SELECT ConfigKey, LEFT(ConfigValue, 20) as ConfigValuePreview, LEN(ConfigValue) as ValueLen FROM InvgateConfig ORDER BY ConfigKey');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/config - Get InvGate OAuth 2.0 configuration
app.get('/api/invgate/config', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT ConfigKey, ConfigValue FROM InvgateConfig`);
        const configMap = {};
        result.recordset.forEach(row => { configMap[row.ConfigKey] = row.ConfigValue; });
        const response = {
            clientId: configMap['CLIENT_ID'] || '',
            clientSecret: configMap['CLIENT_SECRET'] || '',
            tokenUrl: configMap['TOKEN_URL'] || 'https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token',
            apiBaseUrl: configMap['API_BASE_URL'] || 'https://rostipollos.cloud.invgate.net/api/v2',
            sync_interval_hours: configMap['SYNC_INTERVAL_HOURS'] || '1',
            sync_enabled: configMap['SYNC_ENABLED'] || 'false',
            last_sync_date: configMap['LAST_SYNC_DATE'] || null
        };
        console.log('📤 GET /invgate/config response:', {
            clientId: response.clientId ? response.clientId.substring(0, 8) + '...' : 'EMPTY',
            clientSecret: response.clientSecret ? `[${response.clientSecret.length} chars]` : 'EMPTY',
            tokenUrl: response.tokenUrl ? 'set' : 'EMPTY'
        });
        res.json(response);
    } catch (err) {
        console.error('Error getting InvGate config:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/invgate/test-connection - Test InvGate API connection
app.post('/api/invgate/test-connection', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const result = await invgateService.testConnection();
        res.json(result);
    } catch (err) {
        console.error('Error testing InvGate connection:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/invgate/sync - Trigger manual sync
app.post('/api/invgate/sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const { syncType = 'incremental' } = req.body;
        const initiatedBy = req.user.email || 'admin';
        res.json({ success: true, message: 'Sincronización iniciada en segundo plano' });
        // Run sync in background
        if (syncType === 'full') {
            invgateSyncService.fullSync(initiatedBy).catch(err => console.error('Sync error:', err));
        } else {
            invgateSyncService.incrementalSync(initiatedBy).catch(err => console.error('Sync error:', err));
        }
    } catch (err) {
        console.error('Error triggering InvGate sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/sync-status - Get sync status
app.get('/api/invgate/sync-status', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT TOP 1 * FROM InvgateSyncLog ORDER BY FechaSync DESC`);
        const cronStatus = invgateCron.getStatus ? invgateCron.getStatus() : { isActive: false, isRunning: false, schedule: null };
        res.json({ lastSync: result.recordset[0] || null, cronJob: cronStatus });
    } catch (err) {
        console.error('Error getting InvGate sync status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/sync-logs - Get sync history
app.get('/api/invgate/sync-logs', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No tiene permisos de administrador' });
        const limit = parseInt(req.query.limit) || 20;
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT TOP ${limit} * FROM InvgateSyncLog ORDER BY FechaSync DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting InvGate sync logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/tickets - List tickets with filters
app.get('/api/invgate/tickets', authMiddleware, async (req, res) => {
    try {
        const { status, category, priority, page = 1, pageSize = 50 } = req.query;
        const pool = await invgateDb.getInvgatePool();
        let where = [];
        if (status) where.push(`Estado = '${status}'`);
        if (category) where.push(`Categoria = '${category}'`);
        if (priority) where.push(`Prioridad = '${priority}'`);
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const result = await pool.request().query(`SELECT * FROM InvgateTickets ${whereClause} ORDER BY FechaCreacion DESC OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`);
        const countResult = await pool.request().query(`SELECT COUNT(*) as total FROM InvgateTickets ${whereClause}`);
        res.json({ tickets: result.recordset, total: countResult.recordset[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } catch (err) {
        console.error('Error getting InvGate tickets:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/tickets/:id - Get single ticket
app.get('/api/invgate/tickets/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT * FROM InvgateTickets WHERE TicketID = ${req.params.id}`);
        if (!result.recordset.length) return res.status(404).json({ error: 'Ticket no encontrado' });
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error getting InvGate ticket:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/summary - Summary stats
app.get('/api/invgate/reports/summary', authMiddleware, async (req, res) => {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT COUNT(*) as total, SUM(CASE WHEN Estado='Abierto' THEN 1 ELSE 0 END) as abiertos, SUM(CASE WHEN Estado='Cerrado' THEN 1 ELSE 0 END) as cerrados, SUM(CASE WHEN Estado='En Progreso' THEN 1 ELSE 0 END) as enProgreso FROM InvgateTickets`);
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error getting InvGate summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-status - Tickets by status
app.get('/api/invgate/reports/by-status', authMiddleware, async (req, res) => {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT Estado, COUNT(*) as total FROM InvgateTickets GROUP BY Estado ORDER BY total DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting InvGate by-status:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-category - Tickets by category
app.get('/api/invgate/reports/by-category', authMiddleware, async (req, res) => {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT Categoria, COUNT(*) as total FROM InvgateTickets GROUP BY Categoria ORDER BY total DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting InvGate by-category:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/reports/by-priority - Tickets by priority
app.get('/api/invgate/reports/by-priority', authMiddleware, async (req, res) => {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request().query(`SELECT Prioridad, COUNT(*) as total FROM InvgateTickets GROUP BY Prioridad ORDER BY total DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error getting InvGate by-priority:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/helpdesks - List all helpdesks from InvGate API + local config
app.get('/api/invgate/helpdesks', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });

        // Get local config (these are the helpdesks already known to us)
        const localConfigs = await invgateSyncService.getHelpdeskConfigs();
        const localMap = {};
        localConfigs.forEach(h => { localMap[h.HelpdeskID] = h; });

        // Try fetching from InvGate API — if it fails, fall back to local only
        let apiHelpdesks = [];
        let apiError = null;
        try {
            apiHelpdesks = await invgateService.getHelpdesks();
        } catch (apiErr) {
            apiError = apiErr.message;
            console.warn('⚠️ Could not fetch helpdesks from InvGate API:', apiErr.message);
        }

        // Merge: API items override local with current names
        const merged = [];
        const seenIds = new Set();

        for (const h of apiHelpdesks) {
            const id = h.id;
            seenIds.add(id);
            merged.push({
                id,
                name: h.name || h.nombre || `Helpdesk ${id}`,
                syncEnabled: localMap[id] ? !!localMap[id].SyncEnabled : false,
                totalTickets: localMap[id] ? (localMap[id].TotalTickets || 0) : 0
            });
        }

        // Add any local helpdesks not returned by API
        for (const local of localConfigs) {
            if (!seenIds.has(local.HelpdeskID)) {
                merged.push({
                    id: local.HelpdeskID,
                    name: local.Nombre || `Helpdesk ${local.HelpdeskID}`,
                    syncEnabled: !!local.SyncEnabled,
                    totalTickets: local.TotalTickets || 0
                });
            }
        }

        res.json({ helpdesks: merged, apiError });
    } catch (err) {
        console.error('Error getting InvGate helpdesks:', err);
        res.status(500).json({ error: err.message });
    }
});


// PUT /api/invgate/helpdesks/:id/toggle - Enable/disable helpdesk for sync
app.put('/api/invgate/helpdesks/:id/toggle', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const helpdeskId = parseInt(req.params.id);
        const { enabled, name } = req.body;
        const pool = await invgateDb.getInvgatePool();
        // Ensure helpdesk exists in local table first
        await pool.request()
            .input('id', sql.Int, helpdeskId)
            .input('nombre', sql.NVarChar, name || `Helpdesk ${helpdeskId}`)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM InvgateHelpdesks WHERE HelpdeskID = @id)
                    INSERT INTO InvgateHelpdesks (HelpdeskID, Nombre, SyncEnabled) VALUES (@id, @nombre, 0)
            `);
        await invgateSyncService.toggleHelpdesk(helpdeskId, enabled);
        res.json({ success: true, helpdeskId, enabled });
    } catch (err) {
        console.error('Error toggling InvGate helpdesk:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invgate/custom-fields?helpdeskId=X - Get custom field definitions
app.get('/api/invgate/custom-fields', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const helpdeskId = req.query.helpdeskId ? parseInt(req.query.helpdeskId) : null;
        const defs = await invgateSyncService.getCustomFieldDefs(helpdeskId);
        res.json(defs);
    } catch (err) {
        console.error('Error getting InvGate custom fields:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/invgate/custom-fields - Save custom field definitions
app.put('/api/invgate/custom-fields', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const { defs } = req.body; // [{fieldId, helpdeskId, fieldName, fieldType, showInDashboard, displayOrder}]
        if (!Array.isArray(defs)) return res.status(400).json({ error: 'defs debe ser un array' });
        const result = await invgateSyncService.saveCustomFieldDefs(defs);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error saving InvGate custom fields:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/invgate/detect-fields/:helpdeskId - Auto-detect custom fields from API
app.post('/api/invgate/detect-fields/:helpdeskId', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) return res.status(403).json({ error: 'No autorizado' });
        const helpdeskId = parseInt(req.params.helpdeskId);
        const detected = await invgateService.detectCustomFields(helpdeskId);
        res.json(detected);
    } catch (err) {
        console.error('Error detecting InvGate custom fields:', err);
        res.status(500).json({ error: err.message });
    }
});

// Start InvGate cron job on server startup
(async () => {
    try {
        await invgateCron.start();
    } catch (error) {
        console.error('Error starting InvGate cron:', error.message);
    }
})();




// ==========================================
// SHAREPOINT EVENTOS ROSTI ENDPOINTS
// ==========================================

// GET /api/sp-eventos/por-mes?year=2026&month=2 - Cached SP events for a month
app.get('/api/sp-eventos/por-mes', authMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const byDate = await spEventsService.getEventosPorMes(year, month);
        res.json({ byDate });
    } catch (err) {
        console.error('Error in /api/sp-eventos/por-mes:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sp-eventos/por-ano?year=2026 - Cached SP events for a year
app.get('/api/sp-eventos/por-ano', authMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const byDate = await spEventsService.getEventosPorAno(year);
        res.json({ byDate });
    } catch (err) {
        console.error('Error in /api/sp-eventos/por-ano:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sp-eventos/sync - Force sync from SharePoint (admin only)
app.post('/api/sp-eventos/sync', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'Solo administradores pueden forzar sincronización' });
        }
        const result = await spEventsService.syncEventos();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error in /api/sp-eventos/sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sp-eventos/debug-fields - Show SP list field names (admin only)
app.get('/api/sp-eventos/debug-fields', authMiddleware, async (req, res) => {
    try {
        if (!req.user.esAdmin) {
            return res.status(403).json({ error: 'Solo administradores' });
        }
        const result = await spEventsService.debugListFields();
        res.json(result);
    } catch (err) {
        console.error('Error in /api/sp-eventos/debug-fields:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SERVE FRONTEND STATIC FILES
// ==========================================
const distPath = path.join(__dirname, '../web-app/dist');

// Serve static assets WITH cache (JS/CSS have hashes in filenames)
app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            // NEVER cache HTML - forces browser to always get latest
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// SPA fallback - todas las rutas no-API devuelven index.html (SIN CACHE)
app.get(/(.*)/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
});

// ==========================================
// CRASH PROTECTION
// ==========================================

// Express error-catching middleware (must be last middleware)
app.use((err, req, res, next) => {
    console.error('❌ [Express Error]', new Date().toISOString(), err.stack || err.message || err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Global crash handlers — prevent process from dying
process.on('uncaughtException', (err) => {
    console.error('🔥 [UNCAUGHT EXCEPTION]', new Date().toISOString());
    console.error(err.stack || err.message || err);
    // Do NOT exit — keep the server alive
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [UNHANDLED REJECTION]', new Date().toISOString());
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    // Do NOT exit — keep the server alive
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`🌐 Frontend served from: ${distPath}`);
    const dbStatus = dbManager.getCurrentStatus();
    console.log(`📊 Database mode: ${dbStatus.activeMode}`);
    console.log(`🛡️ Crash protection: ACTIVE`);
});
