const invgateService = require('./invgateService');
const { getInvgatePool, sql } = require('../invgateDb');

/**
 * InvGate Sync Service (V1 API)
 * Fetches incidents per helpdesk using /incidents/by.helpdesk
 * Handles custom fields via EAV pattern
 */
class InvGateSyncService {

    constructor() {
        this._tablesEnsured = false;
    }

    // ================================================================
    // AUTO-MIGRATION — Create tables if they don't exist
    // ================================================================
    async ensureTables() {
        if (this._tablesEnsured) return;
        try {
            const pool = await getInvgatePool();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateHelpdesks')
                    CREATE TABLE InvgateHelpdesks (
                        HelpdeskID   INT          PRIMARY KEY,
                        Nombre       NVARCHAR(200) NULL,
                        SyncEnabled  BIT          NOT NULL DEFAULT 0,
                        TotalTickets INT          NOT NULL DEFAULT 0,
                        UltimaSync   DATETIME     DEFAULT GETDATE()
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('InvgateHelpdesks') AND name = 'SyncEnabled')
                    ALTER TABLE InvgateHelpdesks ADD SyncEnabled BIT NOT NULL DEFAULT 0;

                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('InvgateHelpdesks') AND name = 'TotalTickets')
                    ALTER TABLE InvgateHelpdesks ADD TotalTickets INT NOT NULL DEFAULT 0;

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateCustomFieldDefs')
                    CREATE TABLE InvgateCustomFieldDefs (
                        FieldID         INT          NOT NULL,
                        HelpdeskID      INT          NOT NULL,
                        FieldName       NVARCHAR(200) NOT NULL,
                        FieldType       NVARCHAR(50)  DEFAULT 'text',
                        ShowInDashboard BIT           DEFAULT 1,
                        DisplayOrder    INT           DEFAULT 0,
                        UpdatedAt       DATETIME      DEFAULT GETDATE(),
                        PRIMARY KEY (FieldID, HelpdeskID)
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('InvgateCustomFieldDefs') AND name = 'HelpdeskID')
                    ALTER TABLE InvgateCustomFieldDefs ADD HelpdeskID INT NOT NULL DEFAULT 0;

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateTicketCustomFields')
                    CREATE TABLE InvgateTicketCustomFields (
                        ID            INT IDENTITY(1,1) PRIMARY KEY,
                        TicketID      INT           NOT NULL,
                        FieldID       INT           NOT NULL,
                        FieldValue    NVARCHAR(MAX) NULL,
                        FieldValueRaw NVARCHAR(MAX) NULL,
                        CONSTRAINT UQ_TicketField UNIQUE (TicketID, FieldID)
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateViews')
                    CREATE TABLE InvgateViews (
                        ViewID        INT           PRIMARY KEY,
                        Nombre        NVARCHAR(200) NOT NULL,
                        SyncEnabled   BIT           NOT NULL DEFAULT 0,
                        TotalTickets  INT           NOT NULL DEFAULT 0,
                        ColumnsJSON   NVARCHAR(MAX) NULL,
                        UltimaSync    DATETIME      NULL,
                        CreatedAt     DATETIME      DEFAULT GETDATE()
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvgateViewData')
                    CREATE TABLE InvgateViewData (
                        ID            INT IDENTITY(1,1) PRIMARY KEY,
                        ViewID        INT           NOT NULL,
                        TicketID      NVARCHAR(50)  NOT NULL,
                        ColumnName    NVARCHAR(200) NOT NULL,
                        ColumnValue   NVARCHAR(MAX) NULL,
                        SyncedAt      DATETIME      DEFAULT GETDATE(),
                        CONSTRAINT UQ_ViewTicketCol UNIQUE (ViewID, TicketID, ColumnName)
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ViewData_ViewID')
                    CREATE INDEX IX_ViewData_ViewID ON InvgateViewData(ViewID);
            `);
            this._tablesEnsured = true;
            console.log('✅ InvGate tables verified/created');
        } catch (e) {
            console.warn('⚠️ ensureTables warning:', e.message);
        }
    }

    // ================================================================
    // HELPERS — Unix timestamp to Date
    // ================================================================
    _unixToDate(val) {
        if (!val) return null;
        if (typeof val === 'number' && val > 1000000000 && val < 9999999999) {
            return new Date(val * 1000);
        }
        // If it's already a string date
        if (typeof val === 'string') return new Date(val);
        return null;
    }

    // ================================================================
    // SYNC LOOKUP TABLES (helpdesks, categories)
    // ================================================================
    async syncLookupTables() {
        try {
            const pool = await getInvgatePool();

            // Sync Helpdesks
            const helpdesks = await invgateService.getHelpdesks();
            for (const hd of helpdesks) {
                await pool.request()
                    .input('id', sql.Int, hd.id)
                    .input('nombre', sql.NVarChar, hd.name || hd.nombre || '')
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM InvgateHelpdesks WHERE HelpdeskID = @id)
                            INSERT INTO InvgateHelpdesks (HelpdeskID, Nombre, SyncEnabled)
                            VALUES (@id, @nombre, 0)
                        ELSE
                            UPDATE InvgateHelpdesks SET Nombre = @nombre WHERE HelpdeskID = @id
                    `);
            }
            console.log(`  📂 Synced ${helpdesks.length} helpdesks`);

            // Sync Categories
            const categories = await invgateService.getCategories();
            for (const cat of categories) {
                await pool.request()
                    .input('id', sql.Int, cat.id)
                    .input('nombre', sql.NVarChar, cat.name || '')
                    .input('parentId', sql.Int, cat.parent_id || null)
                    .query(`
                        MERGE InvgateCategories AS target
                        USING (SELECT @id AS id, @nombre AS nombre, @parentId AS parentId) AS src
                        ON target.CategoryID = src.id
                        WHEN MATCHED THEN UPDATE SET Nombre = src.nombre, ParentCategoryID = src.parentId
                        WHEN NOT MATCHED THEN INSERT (CategoryID, Nombre, ParentCategoryID) VALUES (src.id, src.nombre, src.parentId);
                    `);
            }
            console.log(`  📂 Synced ${categories.length} categories`);
        } catch (err) {
            // Tables may not exist if migration hasn't been run — log but don't fail the sync
            console.warn('  ⚠️ Could not sync lookup tables (migration needed?):', err.message);
        }
    }

    // ================================================================
    // FULL SYNC
    // ================================================================
    async fullSync(initiatedBy = 'SYSTEM') {
        const startTime = Date.now();
        let totalProcessed = 0, totalNew = 0, totalUpdated = 0;
        const errors = [];

        try {
            console.log('🔄 Starting FULL synchronization with InvGate...');
            await this.ensureTables();

            // Step 1: sync lookup tables
            await this.syncLookupTables();

            // Step 2: Sync data from enabled VIEWS (primary method)
            const viewResult = await this.syncViewData();
            totalProcessed += viewResult.totalProcessed;
            totalNew += viewResult.totalNew;
            totalUpdated += viewResult.totalUpdated;
            if (viewResult.errors.length > 0) errors.push(...viewResult.errors);

            // Step 3: Also sync from enabled helpdesks (legacy/complementary)
            try {
                const tickets = await invgateService.getAllIncidents();
                console.log(`  📊 Processing ${tickets.length} helpdesk incidents...`);
                for (const ticket of tickets) {
                    try {
                        const result = await this.syncTicket(ticket);
                        totalProcessed++;
                        if (result.isNew) totalNew++; else totalUpdated++;
                    } catch (err) {
                        errors.push({ ticketId: ticket.id || 'unknown', error: err.message });
                    }
                }
            } catch (hdErr) {
                console.warn('  ⚠️ Helpdesk sync skipped:', hdErr.message);
            }

            const duration = Date.now() - startTime;
            const status = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';

            await this.logSync({ tipoSync: 'FULL', registrosProcesados: totalProcessed, registrosNuevos: totalNew, registrosActualizados: totalUpdated, estado: status, mensajeError: errors.length > 0 ? JSON.stringify(errors.slice(0, 5)) : null, tiempoEjecucionMs: duration, iniciadoPor: initiatedBy });
            if (status !== 'ERROR') await this.updateLastSyncDate();

            console.log(`✅ FULL sync done: ${totalProcessed} (${totalNew} new, ${totalUpdated} updated) in ${duration}ms`);
            return { success: true, totalProcessed, totalNew, totalUpdated, errors, duration };

        } catch (err) {
            console.error('❌ FULL sync failed:', err);
            const duration = Date.now() - startTime;
            await this.logSync({ tipoSync: 'FULL', registrosProcesados: totalProcessed, registrosNuevos: totalNew, registrosActualizados: totalUpdated, estado: 'ERROR', mensajeError: err.message, tiempoEjecucionMs: duration, iniciadoPor: initiatedBy });
            throw err;
        }
    }

    // ================================================================
    // SYNC VIEW DATA — create a dedicated table per view
    // Table name: InvgateView_{viewId} (e.g. InvgateView_25)
    // ================================================================
    async syncViewData() {
        let totalProcessed = 0, totalNew = 0, totalUpdated = 0;
        const errors = [];
        try {
            const views = await this.getViewConfigs();
            const enabledViews = views.filter(v => v.syncEnabled);
            if (enabledViews.length === 0) {
                console.log('  ℹ️ No enabled views to sync');
                return { totalProcessed, totalNew, totalUpdated, errors };
            }

            const pool = await getInvgatePool();

            for (const view of enabledViews) {
                try {
                    console.log(`  👁️ Syncing view "${view.nombre}" (ID: ${view.viewId})...`);
                    const tickets = await invgateService.getAllIncidentsByView(view.viewId);
                    console.log(`    📊 Got ${tickets.length} tickets from view ${view.viewId}`);

                    if (tickets.length === 0) {
                        console.log(`    ⚠️ No tickets, skipping table creation`);
                        await this.updateViewSyncMeta(view.viewId, 0);
                        continue;
                    }

                    const tableName = this._viewTableName(view.viewId);

                    // Detect all columns from all tickets
                    const columnSet = new Set();
                    for (const ticket of tickets) {
                        for (const key of Object.keys(ticket)) {
                            columnSet.add(key);
                        }
                    }
                    const columns = Array.from(columnSet);
                    const safeColumns = columns.map(c => this._safeColumnName(c));

                    // Drop and recreate table
                    await pool.request().query(`
                        IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE [${tableName}];
                    `);

                    // Build CREATE TABLE with all columns as NVARCHAR(MAX)
                    const colDefs = safeColumns.map(c => `[${c}] NVARCHAR(MAX) NULL`).join(',\n                        ');
                    await pool.request().query(`
                        CREATE TABLE [${tableName}] (
                            [_RowId] INT IDENTITY(1,1) PRIMARY KEY,
                            [_SyncedAt] DATETIME DEFAULT GETDATE(),
                            ${colDefs}
                        )
                    `);
                    console.log(`    🏗️ Created table [${tableName}] with ${safeColumns.length} columns`);

                    // Insert all tickets
                    let insertedCount = 0;
                    for (const ticket of tickets) {
                        try {
                            const req = pool.request();
                            const colNames = [];
                            const paramNames = [];
                            let paramIdx = 0;

                            for (let i = 0; i < columns.length; i++) {
                                const rawValue = ticket[columns[i]];
                                const valueStr = rawValue === null || rawValue === undefined ? null
                                    : typeof rawValue === 'object' ? JSON.stringify(rawValue)
                                        : String(rawValue);
                                const paramName = `p${paramIdx++}`;
                                colNames.push(`[${safeColumns[i]}]`);
                                paramNames.push(`@${paramName}`);
                                req.input(paramName, sql.NVarChar(sql.MAX), valueStr);
                            }

                            await req.query(`
                                INSERT INTO [${tableName}] (${colNames.join(', ')})
                                VALUES (${paramNames.join(', ')})
                            `);
                            insertedCount++;
                        } catch (insertErr) {
                            // Log but don't fail the whole sync
                            if (insertedCount === 0) console.error(`    ⚠️ Insert error:`, insertErr.message);
                        }
                    }

                    totalProcessed += insertedCount;
                    totalNew += insertedCount;

                    // Update columns in InvgateViews config
                    await pool.request()
                        .input('viewId', sql.Int, view.viewId)
                        .input('cols', sql.NVarChar(sql.MAX), JSON.stringify(safeColumns))
                        .query('UPDATE InvgateViews SET ColumnsJSON = @cols WHERE ViewID = @viewId');

                    await this.updateViewSyncMeta(view.viewId, insertedCount);
                    console.log(`    ✅ View "${view.nombre}": ${insertedCount} rows inserted into [${tableName}]`);
                } catch (viewErr) {
                    console.error(`  ❌ View ${view.viewId} sync error:`, viewErr.message);
                    errors.push({ viewId: view.viewId, error: viewErr.message });
                }
            }
        } catch (err) {
            console.error('❌ syncViewData error:', err.message);
            errors.push({ error: err.message });
        }
        return { totalProcessed, totalNew, totalUpdated, errors };
    }

    /** Sanitize column name for SQL — remove special chars, limit length */
    _safeColumnName(name) {
        // Replace anything that's not alphanumeric or underscore
        let safe = String(name).replace(/[^a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        if (!safe) safe = 'Col';
        if (/^\d/.test(safe)) safe = 'C_' + safe; // Can't start with number
        return safe.substring(0, 128); // SQL Server max identifier length
    }

    /** Get table name for a view */
    _viewTableName(viewId) {
        return `InvgateView_${parseInt(viewId)}`;
    }

    // ================================================================
    // SYNC SINGLE VIEW — sync one specific view by ID
    // Used by the per-view sync buttons in the admin UI
    // ================================================================
    async syncSingleViewData(viewId, syncType = 'full') {
        const startTime = Date.now();
        let totalProcessed = 0, totalNew = 0;

        try {
            await this.ensureTables();

            // Get view config
            const views = await this.getViewConfigs();
            const view = views.find(v => v.viewId === viewId);
            if (!view) {
                throw new Error(`Vista ${viewId} no encontrada en la configuración`);
            }

            console.log(`🔄 Syncing single view "${view.nombre}" (ID: ${viewId}, type: ${syncType})...`);

            const pool = await getInvgatePool();
            const tickets = await invgateService.getAllIncidentsByView(viewId);
            console.log(`  📊 Got ${tickets.length} tickets from view ${viewId}`);

            if (tickets.length === 0) {
                await this.updateViewSyncMeta(viewId, 0);
                const duration = Date.now() - startTime;
                return { success: true, viewId, totalProcessed: 0, totalNew: 0, duration, message: 'No tickets found in view' };
            }

            const tableName = this._viewTableName(viewId);

            // Detect all columns from all tickets
            const columnSet = new Set();
            for (const ticket of tickets) {
                for (const key of Object.keys(ticket)) {
                    columnSet.add(key);
                }
            }
            const columns = Array.from(columnSet);
            const safeColumns = columns.map(c => this._safeColumnName(c));

            // Drop and recreate table (full sync behavior)
            await pool.request().query(`
                IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE [${tableName}];
            `);

            // Build CREATE TABLE with all columns as NVARCHAR(MAX)
            const colDefs = safeColumns.map(c => `[${c}] NVARCHAR(MAX) NULL`).join(',\n                        ');
            await pool.request().query(`
                CREATE TABLE [${tableName}] (
                    [_RowId] INT IDENTITY(1,1) PRIMARY KEY,
                    [_SyncedAt] DATETIME DEFAULT GETDATE(),
                    ${colDefs}
                )
            `);
            console.log(`  🏗️ Created table [${tableName}] with ${safeColumns.length} columns`);

            // Insert all tickets
            let insertedCount = 0;
            for (const ticket of tickets) {
                try {
                    const req = pool.request();
                    const colNames = [];
                    const paramNames = [];
                    let paramIdx = 0;

                    for (let i = 0; i < columns.length; i++) {
                        const rawValue = ticket[columns[i]];
                        const valueStr = rawValue === null || rawValue === undefined ? null
                            : typeof rawValue === 'object' ? JSON.stringify(rawValue)
                                : String(rawValue);
                        const paramName = `p${paramIdx++}`;
                        colNames.push(`[${safeColumns[i]}]`);
                        paramNames.push(`@${paramName}`);
                        req.input(paramName, sql.NVarChar(sql.MAX), valueStr);
                    }

                    await req.query(`
                        INSERT INTO [${tableName}] (${colNames.join(', ')})
                        VALUES (${paramNames.join(', ')})
                    `);
                    insertedCount++;
                } catch (insertErr) {
                    if (insertedCount === 0) console.error(`  ⚠️ Insert error:`, insertErr.message);
                }
            }

            totalProcessed = insertedCount;
            totalNew = insertedCount;

            // Update columns in InvgateViews config
            await pool.request()
                .input('viewId', sql.Int, viewId)
                .input('cols', sql.NVarChar(sql.MAX), JSON.stringify(safeColumns))
                .query('UPDATE InvgateViews SET ColumnsJSON = @cols WHERE ViewID = @viewId');

            await this.updateViewSyncMeta(viewId, insertedCount);

            const duration = Date.now() - startTime;
            console.log(`✅ View "${view.nombre}": ${insertedCount} rows synced into [${tableName}] in ${duration}ms`);

            // Log the sync
            await this.logSync({
                tipoSync: `VIEW_${syncType.toUpperCase()}`,
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: 0,
                estado: 'SUCCESS',
                mensajeError: null,
                tiempoEjecucionMs: duration,
                iniciadoPor: 'MANUAL'
            });

            return { success: true, viewId, totalProcessed, totalNew, duration, tableName };

        } catch (err) {
            const duration = Date.now() - startTime;
            console.error(`❌ Single view sync failed for ${viewId}:`, err.message);

            await this.logSync({
                tipoSync: `VIEW_${(syncType || 'full').toUpperCase()}`,
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: 0,
                estado: 'ERROR',
                mensajeError: err.message,
                tiempoEjecucionMs: duration,
                iniciadoPor: 'MANUAL'
            });

            throw err;
        }
    }

    // ================================================================
    // INCREMENTAL SYNC — same as full for v1 (no filter by date in API)
    // We re-sync all enabled helpdesks but upsert, so unchanged tickets just update
    // ================================================================
    async incrementalSync(initiatedBy = 'SYSTEM') {
        // V1 API does not support updated_since filter → fall back to fullSync
        console.log('ℹ️ InvGate v1 API: incremental = full (upsert all, no date filter)');
        return this.fullSync(initiatedBy);
    }

    // ================================================================
    // SYNC SINGLE TICKET (upsert + custom fields)
    // ================================================================
    async syncTicket(ticketData) {
        const pool = await getInvgatePool();
        const ticket = this.transformTicketData(ticketData);

        // Check existence
        const existing = await pool.request()
            .input('ticketId', sql.NVarChar, ticket.TicketID)
            .query('SELECT TicketID FROM InvgateTickets WHERE TicketID = @ticketId');
        const isNew = existing.recordset.length === 0;

        const req = pool.request()
            .input('ticketId', sql.NVarChar, ticket.TicketID)
            .input('titulo', sql.NVarChar(sql.MAX), ticket.Titulo)
            .input('descripcion', sql.NVarChar(sql.MAX), ticket.Descripcion)
            .input('estado', sql.NVarChar(100), ticket.Estado)
            .input('prioridad', sql.NVarChar(100), ticket.Prioridad)
            .input('categoria', sql.NVarChar(255), ticket.Categoria)
            .input('subcategoria', sql.NVarChar(255), ticket.Subcategoria)
            .input('tipo', sql.NVarChar(100), ticket.Tipo)
            .input('asignadoA', sql.NVarChar(255), ticket.AsignadoA)
            .input('grupoAsignado', sql.NVarChar(255), ticket.GrupoAsignado)
            .input('solicitadoPor', sql.NVarChar(255), ticket.SolicitadoPor)
            .input('emailSolicitante', sql.NVarChar(255), ticket.EmailSolicitante)
            .input('fechaCreacion', sql.DateTime, ticket.FechaCreacion)
            .input('fechaActualizacion', sql.DateTime, ticket.FechaActualizacion)
            .input('fechaCierre', sql.DateTime, ticket.FechaCierre)
            .input('tiempoRespuesta', sql.Int, ticket.TiempoRespuesta)
            .input('tiempoResolucion', sql.Int, ticket.TiempoResolucion)
            .input('tiempoEnEspera', sql.Int, ticket.TiempoEnEspera)
            .input('numeroComentarios', sql.Int, ticket.NumeroComentarios)
            .input('datosJSON', sql.NVarChar(sql.MAX), ticket.DatosJSON)
            // New v1 fields
            .input('helpdeskId', sql.Int, ticket.HelpdeskID)
            .input('helpdeskNombre', sql.NVarChar(255), ticket.HelpdeskNombre)
            .input('statusId', sql.Int, ticket.StatusID)
            .input('priorityId', sql.Int, ticket.PriorityID)
            .input('categoryId', sql.Int, ticket.CategoryID)
            .input('userId', sql.Int, ticket.UserID)
            .input('assignedId', sql.Int, ticket.AssignedID)
            .input('slaResolucion', sql.Int, ticket.SLAResolucion)
            .input('slaPrimeraRespuesta', sql.Int, ticket.SLAPrimeraRespuesta)
            .input('calificacion', sql.Int, ticket.Calificacion)
            .input('fechaResolucion', sql.DateTime, ticket.FechaResolucion);

        if (isNew) {
            await req.query(`
                INSERT INTO InvgateTickets (
                    TicketID, Titulo, Descripcion, Estado, Prioridad, Categoria, Subcategoria,
                    Tipo, AsignadoA, GrupoAsignado, SolicitadoPor, EmailSolicitante,
                    FechaCreacion, FechaActualizacion, FechaCierre,
                    TiempoRespuesta, TiempoResolucion, TiempoEnEspera,
                    NumeroComentarios, DatosJSON,
                    HelpdeskID, HelpdeskNombre, StatusID, PriorityID, CategoryID,
                    UserID, AssignedID, SLAResolucion, SLAPrimeraRespuesta,
                    Calificacion, FechaResolucion
                ) VALUES (
                    @ticketId, @titulo, @descripcion, @estado, @prioridad, @categoria, @subcategoria,
                    @tipo, @asignadoA, @grupoAsignado, @solicitadoPor, @emailSolicitante,
                    @fechaCreacion, @fechaActualizacion, @fechaCierre,
                    @tiempoRespuesta, @tiempoResolucion, @tiempoEnEspera,
                    @numeroComentarios, @datosJSON,
                    @helpdeskId, @helpdeskNombre, @statusId, @priorityId, @categoryId,
                    @userId, @assignedId, @slaResolucion, @slaPrimeraRespuesta,
                    @calificacion, @fechaResolucion
                )
            `);
        } else {
            await req.query(`
                UPDATE InvgateTickets SET
                    Titulo = @titulo, Descripcion = @descripcion, Estado = @estado,
                    Prioridad = @prioridad, Categoria = @categoria, Subcategoria = @subcategoria,
                    Tipo = @tipo, AsignadoA = @asignadoA, GrupoAsignado = @grupoAsignado,
                    SolicitadoPor = @solicitadoPor, EmailSolicitante = @emailSolicitante,
                    FechaCreacion = @fechaCreacion, FechaActualizacion = @fechaActualizacion,
                    FechaCierre = @fechaCierre, TiempoRespuesta = @tiempoRespuesta,
                    TiempoResolucion = @tiempoResolucion, TiempoEnEspera = @tiempoEnEspera,
                    NumeroComentarios = @numeroComentarios, DatosJSON = @datosJSON,
                    HelpdeskID = @helpdeskId, HelpdeskNombre = @helpdeskNombre,
                    StatusID = @statusId, PriorityID = @priorityId, CategoryID = @categoryId,
                    UserID = @userId, AssignedID = @assignedId,
                    SLAResolucion = @slaResolucion, SLAPrimeraRespuesta = @slaPrimeraRespuesta,
                    Calificacion = @calificacion, FechaResolucion = @fechaResolucion,
                    UltimaSync = GETDATE(), UpdatedAt = GETDATE()
                WHERE TicketID = @ticketId
            `);
        }

        // Sync custom fields (EAV)
        await this.syncCustomFields(pool, ticket.TicketID, ticketData.custom_fields || {});

        return { isNew, ticketId: ticket.TicketID };
    }

    // ================================================================
    // TRANSFORM TICKET — V1 API field mapping
    // V1 dates: Unix seconds; IDs are numeric
    // ================================================================
    transformTicketData(t) {
        // Resolve assigned user name
        const assigned = t.assigned_to || t.assigned || null;

        return {
            TicketID: String(t.id || ''),
            Titulo: t.subject || t.title || '',
            Descripcion: t.description || t.body || '',
            Estado: t.status_id !== undefined ? String(t.status_id) : (t.status || ''),
            Prioridad: t.priority_id !== undefined ? String(t.priority_id) : (t.priority || ''),
            Categoria: t.category_id !== undefined ? String(t.category_id) : (t.category || ''),
            Subcategoria: t.subcategory_id !== undefined ? String(t.subcategory_id) : '',
            Tipo: t.type_id !== undefined ? String(t.type_id) : (t.type || ''),
            AsignadoA: typeof assigned === 'object' ? (assigned?.name || '') : String(assigned || ''),
            GrupoAsignado: t.assigned_group || t.team || '',
            SolicitadoPor: t.user_id !== undefined ? String(t.user_id) : (t.requester || ''),
            EmailSolicitante: t.requester_email || '',
            FechaCreacion: this._unixToDate(t.created_at),
            FechaActualizacion: this._unixToDate(t.updated_at),
            FechaCierre: this._unixToDate(t.closed_at),
            FechaResolucion: this._unixToDate(t.resolution_date || t.resolved_at),
            TiempoRespuesta: t.first_response_time || t.response_time || null,
            TiempoResolucion: t.resolution_time || null,
            TiempoEnEspera: t.waiting_time || null,
            NumeroComentarios: t.comments_count || t.replies || 0,
            DatosJSON: JSON.stringify(t),
            // V1-specific
            HelpdeskID: t._helpdeskId || t.helpdesk_id || null,
            HelpdeskNombre: t._helpdeskName || '',
            StatusID: t.status_id || null,
            PriorityID: t.priority_id || null,
            CategoryID: t.category_id || null,
            UserID: t.user_id || null,
            AssignedID: typeof t.assigned_to === 'object' ? (t.assigned_to?.id || null) : (t.assigned_to || null),
            SLAResolucion: t.sla_resolution || t.sla?.resolution || null,
            SLAPrimeraRespuesta: t.sla_first_response || t.sla?.first_response || null,
            Calificacion: t.rating || t.calificacion || null
        };
    }

    // ================================================================
    // SYNC CUSTOM FIELDS (EAV)
    // custom_fields: { "29": "value" } or { "29": {"hash": "label"} }
    // ================================================================
    async syncCustomFields(pool, ticketId, customFields) {
        if (!customFields || Object.keys(customFields).length === 0) return;

        for (const [fieldIdStr, rawValue] of Object.entries(customFields)) {
            const fieldId = parseInt(fieldIdStr);
            if (isNaN(fieldId)) continue;

            // Extract display value
            let displayValue = '';
            let rawStr = '';

            if (rawValue === null || rawValue === undefined) continue;

            if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
                // Dropdown: { "hashOrId": "Display Name" }
                const vals = Object.values(rawValue);
                displayValue = vals.join(', ');
            } else if (typeof rawValue === 'number' && rawValue > 1000000000 && rawValue < 9999999999) {
                // Unix timestamp (date field)
                displayValue = new Date(rawValue * 1000).toISOString().split('T')[0];
            } else {
                displayValue = String(rawValue);
            }
            rawStr = JSON.stringify(rawValue);

            try {
                await pool.request()
                    .input('ticketId', sql.NVarChar, ticketId)
                    .input('fieldId', sql.Int, fieldId)
                    .input('val', sql.NVarChar(sql.MAX), displayValue)
                    .input('raw', sql.NVarChar(sql.MAX), rawStr)
                    .query(`
                        MERGE InvgateTicketCustomFields AS target
                        USING (SELECT @ticketId AS tid, @fieldId AS fid) AS src
                        ON target.TicketID = src.tid AND target.FieldID = src.fid
                        WHEN MATCHED THEN UPDATE SET FieldValue = @val, FieldValueRaw = @raw
                        WHEN NOT MATCHED THEN INSERT (TicketID, FieldID, FieldValue, FieldValueRaw) VALUES (@ticketId, @fieldId, @val, @raw);
                    `);
            } catch (cfErr) {
                // Custom field tables may not exist yet — skip silently
            }
        }
    }

    // ================================================================
    // HELPDESK MANAGEMENT (for Admin UI)
    // ================================================================
    async getHelpdeskConfigs() {
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(`
                SELECT HelpdeskID, Nombre, SyncEnabled,
                    (SELECT COUNT(*) FROM InvgateTickets WHERE HelpdeskID = h.HelpdeskID) AS TotalTickets
                FROM InvgateHelpdesks h
                ORDER BY Nombre
            `);
            return result.recordset;
        } catch (err) {
            // Table doesn't exist yet
            return [];
        }
    }

    async toggleHelpdesk(helpdeskId, enabled) {
        const pool = await getInvgatePool();
        await pool.request()
            .input('id', sql.Int, helpdeskId)
            .input('enabled', sql.Bit, enabled ? 1 : 0)
            .query('UPDATE InvgateHelpdesks SET SyncEnabled = @enabled WHERE HelpdeskID = @id');
        return { helpdeskId, enabled };
    }

    // ================================================================
    // CUSTOM FIELD DEFINITIONS (for Admin UI)
    // ================================================================
    async getCustomFieldDefs(helpdeskId = null) {
        try {
            const pool = await getInvgatePool();
            const req = pool.request();
            let query = `SELECT * FROM InvgateCustomFieldDefs`;
            if (helpdeskId) {
                req.input('hid', sql.Int, helpdeskId);
                query += ` WHERE HelpdeskID = @hid`;
            }
            query += ` ORDER BY HelpdeskID, DisplayOrder, FieldID`;
            const result = await req.query(query);
            return result.recordset;
        } catch (err) {
            return [];
        }
    }

    async saveCustomFieldDefs(defs) {
        // defs: [{fieldId, helpdeskId, fieldName, fieldType, showInDashboard, displayOrder}]
        const pool = await getInvgatePool();
        for (const def of defs) {
            await pool.request()
                .input('fieldId', sql.Int, def.fieldId)
                .input('helpdeskId', sql.Int, def.helpdeskId)
                .input('fieldName', sql.NVarChar(200), def.fieldName || `Campo ${def.fieldId}`)
                .input('fieldType', sql.NVarChar(50), def.fieldType || 'text')
                .input('showInDashboard', sql.Bit, def.showInDashboard ? 1 : 0)
                .input('displayOrder', sql.Int, def.displayOrder || 0)
                .query(`
                    MERGE InvgateCustomFieldDefs AS target
                    USING (SELECT @fieldId AS fid, @helpdeskId AS hid) AS src
                    ON target.FieldID = src.fid AND target.HelpdeskID = src.hid
                    WHEN MATCHED THEN UPDATE SET
                        FieldName = @fieldName, FieldType = @fieldType,
                        ShowInDashboard = @showInDashboard, DisplayOrder = @displayOrder
                    WHEN NOT MATCHED THEN INSERT (FieldID, HelpdeskID, FieldName, FieldType, ShowInDashboard, DisplayOrder)
                        VALUES (@fieldId, @helpdeskId, @fieldName, @fieldType, @showInDashboard, @displayOrder);
                `);
        }
        return { saved: defs.length };
    }

    // ================================================================
    // LOG / STATUS / CONFIG UTILITIES
    // ================================================================
    async logSync(logData) {
        try {
            const pool = await getInvgatePool();
            await pool.request()
                .input('tipoSync', sql.NVarChar, logData.tipoSync)
                .input('registrosProcesados', sql.Int, logData.registrosProcesados)
                .input('registrosNuevos', sql.Int, logData.registrosNuevos)
                .input('registrosActualizados', sql.Int, logData.registrosActualizados)
                .input('estado', sql.NVarChar, logData.estado)
                .input('mensajeError', sql.NVarChar, logData.mensajeError)
                .input('tiempoEjecucionMs', sql.Int, logData.tiempoEjecucionMs)
                .input('iniciadoPor', sql.NVarChar, logData.iniciadoPor)
                .query(`
                    INSERT INTO InvgateSyncLog (
                        TipoSync, RegistrosProcesados, RegistrosNuevos, RegistrosActualizados,
                        Estado, MensajeError, TiempoEjecucionMs, IniciadoPor
                    ) VALUES (
                        @tipoSync, @registrosProcesados, @registrosNuevos, @registrosActualizados,
                        @estado, @mensajeError, @tiempoEjecucionMs, @iniciadoPor
                    )
                `);
        } catch (err) {
            console.error('Failed to log sync:', err.message);
        }
    }

    async updateLastSyncDate() {
        try {
            const pool = await getInvgatePool();
            const now = new Date().toISOString();
            await pool.request()
                .input('value', sql.NVarChar, now)
                .query(`UPDATE InvgateConfig SET ConfigValue = @value, UpdatedAt = GETDATE() WHERE ConfigKey = 'LAST_SYNC_DATE'`);
        } catch (e) { /* ignore */ }
    }

    async getSyncLogs(limit = 50) {
        const pool = await getInvgatePool();
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query('SELECT TOP (@limit) * FROM InvgateSyncLog ORDER BY FechaSync DESC');
        return result.recordset;
    }

    async getLastSyncStatus() {
        const pool = await getInvgatePool();
        const result = await pool.request()
            .query('SELECT TOP 1 * FROM InvgateSyncLog ORDER BY FechaSync DESC');
        return result.recordset.length > 0 ? result.recordset[0] : null;
    }

    // ─── Helpdesk configuration helpers ───────────────────────────

    /** Returns all rows from InvgateHelpdesks (local config) */
    async getHelpdeskConfigs() {
        await this.ensureTables();
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(
                'SELECT HelpdeskID, Nombre, SyncEnabled, TotalTickets FROM InvgateHelpdesks'
            );
            return result.recordset;
        } catch (e) {
            console.warn('InvgateHelpdesks query error:', e.message);
            return [];
        }
    }

    /** Enable or disable a helpdesk for sync */
    async toggleHelpdesk(helpdeskId, enabled) {
        await this.ensureTables();
        const pool = await getInvgatePool();
        await pool.request()
            .input('id', sql.Int, helpdeskId)
            .input('enabled', sql.Bit, enabled ? 1 : 0)
            .query('UPDATE InvgateHelpdesks SET SyncEnabled = @enabled WHERE HelpdeskID = @id');
    }

    // ─── Custom field definition helpers ──────────────────────────

    /** Get custom field definitions, optionally filtered by helpdeskId */
    async getCustomFieldDefs(helpdeskId = null) {
        await this.ensureTables();
        try {
            const pool = await getInvgatePool();
            let q = 'SELECT * FROM InvgateCustomFieldDefs';
            const req = pool.request();
            if (helpdeskId !== null) {
                q += ' WHERE HelpdeskID = @helpdeskId';
                req.input('helpdeskId', sql.Int, helpdeskId);
            }
            q += ' ORDER BY DisplayOrder ASC, FieldID ASC';
            const result = await req.query(q);
            return result.recordset;
        } catch (e) {
            console.warn('InvgateCustomFieldDefs query error:', e.message);
            return [];
        }
    }

    /** Upsert an array of custom field definitions */
    async saveCustomFieldDefs(defs) {
        await this.ensureTables();
        const pool = await getInvgatePool();
        let saved = 0;
        for (const d of defs) {
            if (!d.fieldId || !d.helpdeskId) continue;
            try {
                await pool.request()
                    .input('fieldId', sql.Int, d.fieldId)
                    .input('helpdeskId', sql.Int, d.helpdeskId)
                    .input('fieldName', sql.NVarChar, d.fieldName || `Campo ${d.fieldId}`)
                    .input('fieldType', sql.NVarChar, d.fieldType || 'text')
                    .input('showInDashboard', sql.Bit, d.showInDashboard ? 1 : 0)
                    .input('displayOrder', sql.Int, d.displayOrder || 0)
                    .query(`
                        MERGE InvgateCustomFieldDefs AS target
                        USING (SELECT @fieldId AS fid, @helpdeskId AS hid) AS src
                        ON target.FieldID = src.fid AND target.HelpdeskID = src.hid
                        WHEN MATCHED THEN UPDATE SET
                            FieldName = @fieldName,
                            FieldType = @fieldType,
                            ShowInDashboard = @showInDashboard,
                            DisplayOrder = @displayOrder,
                            UpdatedAt = GETDATE()
                        WHEN NOT MATCHED THEN INSERT
                            (FieldID, HelpdeskID, FieldName, FieldType, ShowInDashboard, DisplayOrder)
                        VALUES (@fieldId, @helpdeskId, @fieldName, @fieldType, @showInDashboard, @displayOrder);
                    `);
                saved++;
            } catch (e) {
                console.warn(`Failed to save field def ${d.fieldId}:`, e.message);
            }
        }
        return { saved };
    }

    // ─── View management helpers ─────────────────────────────────

    /** Get all configured views */
    async getViewConfigs() {
        await this.ensureTables();
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(
                'SELECT ViewID, Nombre, SyncEnabled, TotalTickets, ColumnsJSON, UltimaSync FROM InvgateViews ORDER BY ViewID'
            );
            return result.recordset.map(r => ({
                viewId: r.ViewID,
                nombre: r.Nombre,
                syncEnabled: !!r.SyncEnabled,
                totalTickets: r.TotalTickets || 0,
                columns: r.ColumnsJSON ? JSON.parse(r.ColumnsJSON) : [],
                ultimaSync: r.UltimaSync
            }));
        } catch (e) {
            console.warn('InvgateViews query error:', e.message);
            return [];
        }
    }

    /** Save/update a view configuration */
    async saveView(viewId, nombre, columns = []) {
        await this.ensureTables();
        const pool = await getInvgatePool();
        const columnsJson = JSON.stringify(columns);
        await pool.request()
            .input('viewId', sql.Int, viewId)
            .input('nombre', sql.NVarChar, nombre)
            .input('columnsJson', sql.NVarChar, columnsJson)
            .query(`
                MERGE InvgateViews AS target
                USING (SELECT @viewId AS vid) AS src ON target.ViewID = src.vid
                WHEN MATCHED THEN UPDATE SET
                    Nombre = @nombre, ColumnsJSON = @columnsJson
                WHEN NOT MATCHED THEN INSERT
                    (ViewID, Nombre, ColumnsJSON, SyncEnabled) VALUES (@viewId, @nombre, @columnsJson, 0);
            `);
        return { viewId, nombre };
    }

    /** Delete a view configuration and its data table */
    async deleteView(viewId) {
        await this.ensureTables();
        const pool = await getInvgatePool();
        // Drop the per-view data table
        const tableName = this._viewTableName(viewId);
        await pool.request().query(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE [${tableName}]`);
        // Delete config
        await pool.request()
            .input('viewId', sql.Int, viewId)
            .query('DELETE FROM InvgateViews WHERE ViewID = @viewId');
    }

    /** Toggle sync for a view */
    async toggleView(viewId, enabled) {
        await this.ensureTables();
        const pool = await getInvgatePool();
        await pool.request()
            .input('viewId', sql.Int, viewId)
            .input('enabled', sql.Bit, enabled ? 1 : 0)
            .query('UPDATE InvgateViews SET SyncEnabled = @enabled WHERE ViewID = @viewId');
    }

    /** Update view sync metadata after a successful sync */
    async updateViewSyncMeta(viewId, totalTickets) {
        const pool = await getInvgatePool();
        await pool.request()
            .input('viewId', sql.Int, viewId)
            .input('total', sql.Int, totalTickets)
            .query('UPDATE InvgateViews SET TotalTickets = @total, UltimaSync = GETDATE() WHERE ViewID = @viewId');
    }

    /** Get synced data for a given view from its dedicated table */
    async getViewData(viewId) {
        const pool = await getInvgatePool();
        const tableName = this._viewTableName(viewId);

        // Check if table exists
        const exists = await pool.request()
            .query(`SELECT OBJECT_ID('${tableName}', 'U') AS tid`);
        if (!exists.recordset[0]?.tid) {
            return { viewId, tableName, columns: [], totalRows: 0, data: [] };
        }

        // Get columns (exclude internal _RowId and _SyncedAt)
        const colResult = await pool.request()
            .input('tbl', sql.NVarChar, tableName)
            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl AND COLUMN_NAME NOT LIKE '\\_%' ESCAPE '\\' ORDER BY ORDINAL_POSITION`);
        const columns = colResult.recordset.map(r => r.COLUMN_NAME);

        // Get data
        const result = await pool.request().query(`SELECT * FROM [${tableName}] ORDER BY [_RowId]`);
        const data = result.recordset.map(row => {
            const clean = {};
            for (const col of columns) {
                clean[col] = row[col] || '';
            }
            return clean;
        });

        return { viewId, tableName, columns, totalRows: data.length, data };
    }
}


module.exports = new InvGateSyncService();
