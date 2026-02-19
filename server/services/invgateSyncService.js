const invgateService = require('./invgateService');
const { getInvgatePool, sql } = require('../invgateDb');

/**
 * InvGate Sync Service - Handles synchronization of tickets from InvGate to local database
 */
class InvGateSyncService {
    /**
     * Perform full synchronization (all tickets)
     */
    async fullSync(initiatedBy = 'SYSTEM') {
        const startTime = Date.now();
        let totalProcessed = 0;
        let totalNew = 0;
        let totalUpdated = 0;
        let errors = [];

        try {
            console.log('🔄 Starting FULL synchronization with InvGate...');

            // Get page size from config
            const pageSizeStr = await invgateService.getConfig('SYNC_PAGE_SIZE');
            const pageSize = parseInt(pageSizeStr) || 100;

            let currentPage = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                try {
                    console.log(`  📄 Fetching page ${currentPage}...`);

                    const response = await invgateService.getTickets({
                        page: currentPage,
                        pageSize
                    });

                    // Handle different response formats from InvGate API
                    const tickets = Array.isArray(response) ? response : (response.data || response.requests || []);
                    const pagination = response.pagination || response.meta || {};

                    if (tickets.length === 0) {
                        hasMorePages = false;
                        break;
                    }

                    // Process tickets in current page
                    for (const ticket of tickets) {
                        try {
                            const syncResult = await this.syncTicket(ticket);
                            totalProcessed++;

                            if (syncResult.isNew) {
                                totalNew++;
                            } else {
                                totalUpdated++;
                            }
                        } catch (err) {
                            errors.push({
                                ticketId: ticket.id || 'unknown',
                                error: err.message
                            });
                            console.error(`  ❌ Failed to sync ticket ${ticket.id}:`, err.message);
                        }
                    }

                    // Check if there are more pages
                    if (pagination.total_pages) {
                        hasMorePages = currentPage < pagination.total_pages;
                    } else if (pagination.next_page) {
                        hasMorePages = true;
                    } else {
                        // If no pagination info and we got less than pageSize, assume last page
                        hasMorePages = tickets.length >= pageSize;
                    }

                    currentPage++;

                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (pageErr) {
                    console.error(`  ❌ Error fetching page ${currentPage}:`, pageErr.message);
                    errors.push({
                        page: currentPage,
                        error: pageErr.message
                    });
                    break; // Stop on page error
                }
            }

            const duration = Date.now() - startTime;
            const status = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';

            // Log sync operation
            await this.logSync({
                tipoSync: 'FULL',
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: totalUpdated,
                estado: status,
                mensajeError: errors.length > 0 ? JSON.stringify(errors) : null,
                tiempoEjecucionMs: duration,
                iniciadoPor: initiatedBy
            });

            // Update last sync date in config
            if (status === 'SUCCESS') {
                await this.updateLastSyncDate();
            }

            console.log(`✅ FULL sync completed: ${totalProcessed} tickets (${totalNew} new, ${totalUpdated} updated) in ${duration}ms`);

            return {
                success: true,
                totalProcessed,
                totalNew,
                totalUpdated,
                errors,
                duration
            };

        } catch (err) {
            console.error('❌ FULL sync failed:', err);

            const duration = Date.now() - startTime;
            await this.logSync({
                tipoSync: 'FULL',
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: totalUpdated,
                estado: 'ERROR',
                mensajeError: err.message,
                tiempoEjecucionMs: duration,
                iniciadoPor: initiatedBy
            });

            throw err;
        }
    }

    /**
     * Perform incremental synchronization (only tickets updated since last sync)
     */
    async incrementalSync(initiatedBy = 'SYSTEM') {
        const startTime = Date.now();
        let totalProcessed = 0;
        let totalNew = 0;
        let totalUpdated = 0;
        let errors = [];

        try {
            console.log('🔄 Starting INCREMENTAL synchronization with InvGate...');

            const lastSyncDate = await invgateService.getConfig('LAST_SYNC_DATE');

            if (!lastSyncDate) {
                console.log('⚠️ No previous sync date found, performing FULL sync instead');
                return await this.fullSync(initiatedBy);
            }

            console.log(`  📅 Fetching tickets updated since: ${lastSyncDate}`);

            const pageSizeStr = await invgateService.getConfig('SYNC_PAGE_SIZE');
            const pageSize = parseInt(pageSizeStr) || 100;

            let currentPage = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                try {
                    const response = await invgateService.getTickets({
                        page: currentPage,
                        pageSize,
                        updatedSince: lastSyncDate
                    });

                    const tickets = Array.isArray(response) ? response : (response.data || response.requests || []);
                    const pagination = response.pagination || response.meta || {};

                    if (tickets.length === 0) {
                        hasMorePages = false;
                        break;
                    }

                    for (const ticket of tickets) {
                        try {
                            const syncResult = await this.syncTicket(ticket);
                            totalProcessed++;

                            if (syncResult.isNew) {
                                totalNew++;
                            } else {
                                totalUpdated++;
                            }
                        } catch (err) {
                            errors.push({
                                ticketId: ticket.id || 'unknown',
                                error: err.message
                            });
                        }
                    }

                    if (pagination.total_pages) {
                        hasMorePages = currentPage < pagination.total_pages;
                    } else {
                        hasMorePages = tickets.length >= pageSize;
                    }

                    currentPage++;
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (pageErr) {
                    errors.push({
                        page: currentPage,
                        error: pageErr.message
                    });
                    break;
                }
            }

            const duration = Date.now() - startTime;
            const status = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';

            await this.logSync({
                tipoSync: 'INCREMENTAL',
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: totalUpdated,
                estado: status,
                mensajeError: errors.length > 0 ? JSON.stringify(errors) : null,
                tiempoEjecucionMs: duration,
                iniciadoPor: initiatedBy
            });

            if (status === 'SUCCESS') {
                await this.updateLastSyncDate();
            }

            console.log(`✅ INCREMENTAL sync completed: ${totalProcessed} tickets (${totalNew} new, ${totalUpdated} updated) in ${duration}ms`);

            return {
                success: true,
                totalProcessed,
                totalNew,
                totalUpdated,
                errors,
                duration
            };

        } catch (err) {
            console.error('❌ INCREMENTAL sync failed:', err);

            const duration = Date.now() - startTime;
            await this.logSync({
                tipoSync: 'INCREMENTAL',
                registrosProcesados: totalProcessed,
                registrosNuevos: totalNew,
                registrosActualizados: totalUpdated,
                estado: 'ERROR',
                mensajeError: err.message,
                tiempoEjecucionMs: duration,
                iniciadoPor: initiatedBy
            });

            throw err;
        }
    }

    /**
     * Sync a single ticket to database
     */
    async syncTicket(ticketData) {
        const pool = await getInvgatePool();

        // Transform InvGate ticket data to our schema
        const ticket = this.transformTicketData(ticketData);

        // Check if ticket exists
        const existingTicket = await pool.request()
            .input('ticketId', sql.NVarChar, ticket.TicketID)
            .query('SELECT TicketID FROM InvgateTickets WHERE TicketID = @ticketId');

        const isNew = existingTicket.recordset.length === 0;

        if (isNew) {
            // Insert new ticket
            await pool.request()
                .input('ticketId', sql.NVarChar, ticket.TicketID)
                .input('numeroTicket', sql.NVarChar, ticket.NumeroTicket)
                .input('titulo', sql.NVarChar, ticket.Titulo)
                .input('descripcion', sql.NVarChar, ticket.Descripcion)
                .input('estado', sql.NVarChar, ticket.Estado)
                .input('prioridad', sql.NVarChar, ticket.Prioridad)
                .input('categoria', sql.NVarChar, ticket.Categoria)
                .input('subcategoria', sql.NVarChar, ticket.Subcategoria)
                .input('tipo', sql.NVarChar, ticket.Tipo)
                .input('asignadoA', sql.NVarChar, ticket.AsignadoA)
                .input('grupoAsignado', sql.NVarChar, ticket.GrupoAsignado)
                .input('solicitadoPor', sql.NVarChar, ticket.SolicitadoPor)
                .input('emailSolicitante', sql.NVarChar, ticket.EmailSolicitante)
                .input('fechaCreacion', sql.DateTime, ticket.FechaCreacion)
                .input('fechaActualizacion', sql.DateTime, ticket.FechaActualizacion)
                .input('fechaCierre', sql.DateTime, ticket.FechaCierre)
                .input('fechaVencimiento', sql.DateTime, ticket.FechaVencimiento)
                .input('tiempoRespuesta', sql.Int, ticket.TiempoRespuesta)
                .input('tiempoResolucion', sql.Int, ticket.TiempoResolucion)
                .input('tiempoEnEspera', sql.Int, ticket.TiempoEnEspera)
                .input('tags', sql.NVarChar, ticket.Tags)
                .input('impacto', sql.NVarChar, ticket.Impacto)
                .input('urgencia', sql.NVarChar, ticket.Urgencia)
                .input('ubicacion', sql.NVarChar, ticket.Ubicacion)
                .input('departamento', sql.NVarChar, ticket.Departamento)
                .input('numeroComentarios', sql.Int, ticket.NumeroComentarios)
                .input('numeroAdjuntos', sql.Int, ticket.NumeroAdjuntos)
                .input('datosJSON', sql.NVarChar, ticket.DatosJSON)
                .query(`
                    INSERT INTO InvgateTickets (
                        TicketID, NumeroTicket, Titulo, Descripcion, Estado, Prioridad,
                        Categoria, Subcategoria, Tipo, AsignadoA, GrupoAsignado,
                        SolicitadoPor, EmailSolicitante, FechaCreacion, FechaActualizacion,
                        FechaCierre, FechaVencimiento, TiempoRespuesta, TiempoResolucion,
                        TiempoEnEspera, Tags, Impacto, Urgencia, Ubicacion, Departamento,
                        NumeroComentarios, NumeroAdjuntos, DatosJSON
                    ) VALUES (
                        @ticketId, @numeroTicket, @titulo, @descripcion, @estado, @prioridad,
                        @categoria, @subcategoria, @tipo, @asignadoA, @grupoAsignado,
                        @solicitadoPor, @emailSolicitante, @fechaCreacion, @fechaActualizacion,
                        @fechaCierre, @fechaVencimiento, @tiempoRespuesta, @tiempoResolucion,
                        @tiempoEnEspera, @tags, @impacto, @urgencia, @ubicacion, @departamento,
                        @numeroComentarios, @numeroAdjuntos, @datosJSON
                    )
                `);
        } else {
            // Update existing ticket
            await pool.request()
                .input('ticketId', sql.NVarChar, ticket.TicketID)
                .input('numeroTicket', sql.NVarChar, ticket.NumeroTicket)
                .input('titulo', sql.NVarChar, ticket.Titulo)
                .input('descripcion', sql.NVarChar, ticket.Descripcion)
                .input('estado', sql.NVarChar, ticket.Estado)
                .input('prioridad', sql.NVarChar, ticket.Prioridad)
                .input('categoria', sql.NVarChar, ticket.Categoria)
                .input('subcategoria', sql.NVarChar, ticket.Subcategoria)
                .input('tipo', sql.NVarChar, ticket.Tipo)
                .input('asignadoA', sql.NVarChar, ticket.AsignadoA)
                .input('grupoAsignado', sql.NVarChar, ticket.GrupoAsignado)
                .input('solicitadoPor', sql.NVarChar, ticket.SolicitadoPor)
                .input('emailSolicitante', sql.NVarChar, ticket.EmailSolicitante)
                .input('fechaCreacion', sql.DateTime, ticket.FechaCreacion)
                .input('fechaActualizacion', sql.DateTime, ticket.FechaActualizacion)
                .input('fechaCierre', sql.DateTime, ticket.FechaCierre)
                .input('fechaVencimiento', sql.DateTime, ticket.FechaVencimiento)
                .input('tiempoRespuesta', sql.Int, ticket.TiempoRespuesta)
                .input('tiempoResolucion', sql.Int, ticket.TiempoResolucion)
                .input('tiempoEnEspera', sql.Int, ticket.TiempoEnEspera)
                .input('tags', sql.NVarChar, ticket.Tags)
                .input('impacto', sql.NVarChar, ticket.Impacto)
                .input('urgencia', sql.NVarChar, ticket.Urgencia)
                .input('ubicacion', sql.NVarChar, ticket.Ubicacion)
                .input('departamento', sql.NVarChar, ticket.Departamento)
                .input('numeroComentarios', sql.Int, ticket.NumeroComentarios)
                .input('numeroAdjuntos', sql.Int, ticket.NumeroAdjuntos)
                .input('datosJSON', sql.NVarChar, ticket.DatosJSON)
                .query(`
                    UPDATE InvgateTickets SET
                        NumeroTicket = @numeroTicket,
                        Titulo = @titulo,
                        Descripcion = @descripcion,
                        Estado = @estado,
                        Prioridad = @prioridad,
                        Categoria = @categoria,
                        Subcategoria = @subcategoria,
                        Tipo = @tipo,
                        AsignadoA = @asignadoA,
                        GrupoAsignado = @grupoAsignado,
                        SolicitadoPor = @solicitadoPor,
                        EmailSolicitante = @emailSolicitante,
                        FechaCreacion = @fechaCreacion,
                        FechaActualizacion = @fechaActualizacion,
                        FechaCierre = @fechaCierre,
                        FechaVencimiento = @fechaVencimiento,
                        TiempoRespuesta = @tiempoRespuesta,
                        TiempoResolucion = @tiempoResolucion,
                        TiempoEnEspera = @tiempoEnEspera,
                        Tags = @tags,
                        Impacto = @impacto,
                        Urgencia = @urgencia,
                        Ubicacion = @ubicacion,
                        Departamento = @departamento,
                        NumeroComentarios = @numeroComentarios,
                        NumeroAdjuntos = @numeroAdjuntos,
                        DatosJSON = @datosJSON,
                        UltimaSync = GETDATE(),
                        UpdatedAt = GETDATE()
                    WHERE TicketID = @ticketId
                `);
        }

        return { isNew, ticketId: ticket.TicketID };
    }

    /**
     * Transform InvGate API ticket data to our database schema
     */
    transformTicketData(ticketData) {
        // This transformation depends on InvGate's actual API response structure
        // Adjust field mappings based on real API response
        return {
            TicketID: String(ticketData.id || ticketData.ticket_id || ''),
            NumeroTicket: String(ticketData.number || ticketData.ticket_number || ''),
            Titulo: ticketData.subject || ticketData.title || '',
            Descripcion: ticketData.description || ticketData.body || '',
            Estado: ticketData.status || ticketData.state || '',
            Prioridad: ticketData.priority || '',
            Categoria: ticketData.category || ticketData.category_name || '',
            Subcategoria: ticketData.subcategory || ticketData.subcategory_name || '',
            Tipo: ticketData.type || ticketData.request_type || '',
            AsignadoA: ticketData.assigned_to || ticketData.agent || '',
            GrupoAsignado: ticketData.assigned_group || ticketData.team || '',
            SolicitadoPor: ticketData.requester || ticketData.submitted_by || '',
            EmailSolicitante: ticketData.requester_email || '',
            FechaCreacion: ticketData.created_at ? new Date(ticketData.created_at) : null,
            FechaActualizacion: ticketData.updated_at ? new Date(ticketData.updated_at) : null,
            FechaCierre: ticketData.closed_at ? new Date(ticketData.closed_at) : null,
            FechaVencimiento: ticketData.due_date ? new Date(ticketData.due_date) : null,
            TiempoRespuesta: ticketData.response_time || null,
            TiempoResolucion: ticketData.resolution_time || null,
            TiempoEnEspera: ticketData.waiting_time || null,
            Tags: Array.isArray(ticketData.tags) ? ticketData.tags.join(', ') : (ticketData.tags || ''),
            Impacto: ticketData.impact || '',
            Urgencia: ticketData.urgency || '',
            Ubicacion: ticketData.location || '',
            Departamento: ticketData.department || '',
            NumeroComentarios: ticketData.comments_count || 0,
            NumeroAdjuntos: ticketData.attachments_count || 0,
            DatosJSON: JSON.stringify(ticketData)
        };
    }

    /**
     * Log sync operation to database
     */
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
            console.error('Failed to log sync operation:', err);
        }
    }

    /**
     * Update last successful sync date in config
     */
    async updateLastSyncDate() {
        const pool = await getInvgatePool();
        const now = new Date().toISOString();

        await pool.request()
            .input('value', sql.NVarChar, now)
            .query(`
                UPDATE InvgateConfig 
                SET ConfigValue = @value, UpdatedAt = GETDATE() 
                WHERE ConfigKey = 'LAST_SYNC_DATE'
            `);
    }

    /**
     * Get sync logs with pagination
     */
    async getSyncLogs(limit = 50) {
        const pool = await getInvgatePool();
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit) *
                FROM InvgateSyncLog
                ORDER BY FechaSync DESC
            `);

        return result.recordset;
    }

    /**
     * Get last sync status
     */
    async getLastSyncStatus() {
        const pool = await getInvgatePool();
        const result = await pool.request().query(`
            SELECT TOP 1 *
            FROM InvgateSyncLog
            ORDER BY FechaSync DESC
        `);

        return result.recordset.length > 0 ? result.recordset[0] : null;
    }
}

module.exports = new InvGateSyncService();
