const formsService = require('./formsService');
const { getFormsPool, sql } = require('../formsDb');
const { ensureFormTable, upsertFormRow, getTableName } = require('./formsDynamicTable');

/**
 * Forms Sync Service - Handles synchronization of Microsoft Forms responses
 * Uses FormsSources table to support multiple forms with different question schemas
 */
class FormsSyncService {
    constructor() {
        this.isRunning = false;
    }

    // ─── Get active sources ───────────────────────────────────────────────────

    async getActiveSources() {
        const pool = await getFormsPool();
        const result = await pool.request().query(
            'SELECT * FROM FormsSources WHERE Activo = 1 ORDER BY SourceID'
        );
        return result.recordset;
    }

    // ─── Full Sync ────────────────────────────────────────────────────────────

    async fullSync(initiatedBy = 'SYSTEM') {
        if (this.isRunning) return { success: false, message: 'Sync already in progress' };
        this.isRunning = true;
        const startTime = Date.now();
        console.log('🔄 Starting FULL sync...');

        let syncLog = { tipo: 'FULL', iniciadoPor: initiatedBy, registrosProcesados: 0, registrosNuevos: 0, registrosActualizados: 0, estado: 'SUCCESS', mensajeError: null };

        try {
            const sources = await this.getActiveSources();
            if (sources.length === 0) throw new Error('No hay formularios activos configurados en FormsSources');

            console.log(`📋 Syncing ${sources.length} form(s)...`);

            for (const source of sources) {
                try {
                    console.log(`  📝 Processing: ${source.Alias}`);
                    const responses = await formsService.getFormResponsesBySource(source);
                    console.log(`  📊 Found ${responses.length} responses`);
                    const result = await this.syncSourceResponses(source, responses);
                    syncLog.registrosProcesados += responses.length;
                    syncLog.registrosNuevos += result.nuevos;
                    syncLog.registrosActualizados += result.actualizados;
                    await this.updateSourceStats(source.SourceID);
                } catch (formError) {
                    console.error(`  ❌ Error syncing ${source.Alias}:`, formError.message);
                    syncLog.estado = 'PARTIAL';
                    syncLog.mensajeError = (syncLog.mensajeError || '') + `\n${source.Alias}: ${formError.message}`;
                }
            }

            await formsService.updateConfig('LAST_SYNC_DATE', new Date().toISOString(), initiatedBy);
            console.log('✅ Full sync completed');
        } catch (error) {
            console.error('❌ Full sync failed:', error.message);
            syncLog.estado = 'ERROR';
            syncLog.mensajeError = error.message;
        } finally {
            syncLog.tiempoEjecucionMs = Date.now() - startTime;
            await this.logSync(syncLog);
            this.isRunning = false;
        }

        return { success: syncLog.estado !== 'ERROR', ...syncLog };
    }

    // ─── Incremental Sync ─────────────────────────────────────────────────────

    async incrementalSync(initiatedBy = 'SYSTEM') {
        if (this.isRunning) return { success: false, message: 'Sync already in progress' };
        this.isRunning = true;
        const startTime = Date.now();
        console.log('🔄 Starting INCREMENTAL sync...');

        let syncLog = { tipo: 'INCREMENTAL', iniciadoPor: initiatedBy, registrosProcesados: 0, registrosNuevos: 0, registrosActualizados: 0, estado: 'SUCCESS', mensajeError: null };

        try {
            const lastSyncDate = await formsService.getConfig('LAST_SYNC_DATE');
            if (!lastSyncDate) {
                this.isRunning = false;
                return await this.fullSync(initiatedBy);
            }

            const sources = await this.getActiveSources();
            console.log(`📋 Syncing ${sources.length} form(s) since ${lastSyncDate}...`);

            for (const source of sources) {
                try {
                    console.log(`  📝 Processing: ${source.Alias}`);
                    const responses = await formsService.getFormResponsesBySource(source, lastSyncDate);
                    console.log(`  📊 Found ${responses.length} new/updated responses`);
                    const result = await this.syncSourceResponses(source, responses);
                    syncLog.registrosProcesados += responses.length;
                    syncLog.registrosNuevos += result.nuevos;
                    syncLog.registrosActualizados += result.actualizados;
                    if (responses.length > 0) await this.updateSourceStats(source.SourceID);
                } catch (formError) {
                    console.error(`  ❌ Error syncing ${source.Alias}:`, formError.message);
                    syncLog.estado = 'PARTIAL';
                    syncLog.mensajeError = (syncLog.mensajeError || '') + `\n${source.Alias}: ${formError.message}`;
                }
            }

            await formsService.updateConfig('LAST_SYNC_DATE', new Date().toISOString(), initiatedBy);
            console.log('✅ Incremental sync completed');
        } catch (error) {
            console.error('❌ Incremental sync failed:', error.message);
            syncLog.estado = 'ERROR';
            syncLog.mensajeError = error.message;
        } finally {
            syncLog.tiempoEjecucionMs = Date.now() - startTime;
            await this.logSync(syncLog);
            this.isRunning = false;
        }

        return { success: syncLog.estado !== 'ERROR', ...syncLog };
    }

    // ─── Sync single source ───────────────────────────────────────────────────

    async syncSource(sourceId, initiatedBy = 'SYSTEM') {
        const pool = await getFormsPool();
        const srcResult = await pool.request()
            .input('id', sql.Int, sourceId)
            .query('SELECT * FROM FormsSources WHERE SourceID = @id AND Activo = 1');
        if (srcResult.recordset.length === 0) throw new Error('Formulario no encontrado o inactivo');

        const source = srcResult.recordset[0];
        const startTime = Date.now();
        console.log(`🔄 Syncing source: ${source.Alias}`);

        const responses = await formsService.getFormResponsesBySource(source);
        const result = await this.syncSourceResponses(source, responses);
        await this.updateSourceStats(sourceId);

        const syncLog = {
            tipo: 'MANUAL',
            iniciadoPor: initiatedBy,
            registrosProcesados: responses.length,
            registrosNuevos: result.nuevos,
            registrosActualizados: result.actualizados,
            estado: 'SUCCESS',
            mensajeError: null,
            tiempoEjecucionMs: Date.now() - startTime
        };
        await this.logSync(syncLog);

        return { success: true, ...syncLog, alias: source.Alias };
    }

    // ─── Save responses to DB ─────────────────────────────────────────────────

    async syncSourceResponses(source, responses) {
        const pool = await getFormsPool();
        let nuevos = 0, actualizados = 0;

        // ── Step 1: Detect columns from all responses for dynamic table ──────────
        let tableName = null;
        if (responses.length > 0) {
            try {
                const allKeys = new Set();
                responses.forEach(r => Object.keys(r._rawRow || r.answers || {}).forEach(k => allKeys.add(k)));

                const columns = Array.from(allKeys).map(key => ({
                    name: key,
                    sampleValues: responses
                        .slice(0, 20)
                        .map(r => (r._rawRow || r.answers || {})[key])
                        .filter(v => v !== null && v !== undefined && v !== '')
                }));

                tableName = await ensureFormTable(source.SourceID, source.Alias, columns);
            } catch (tableErr) {
                console.warn(`⚠️ Could not ensure Frm_ table for ${source.Alias}:`, tableErr.message.substring(0, 120));
            }
        }

        // ── Step 2: Save each response ───────────────────────────────────────────
        for (const response of responses) {
            try {
                const t = this.transformResponseData(response, source);

                // Save to FormResponses (JSON backup)
                const existing = await pool.request()
                    .input('responseId', sql.NVarChar, t.responseId)
                    .query('SELECT ResponseID FROM FormResponses WHERE ResponseID = @responseId');

                if (existing.recordset.length > 0) {
                    await pool.request()
                        .input('responseId', sql.NVarChar, t.responseId)
                        .input('lastModified', sql.DateTime, t.lastModifiedAt)
                        .input('answers', sql.NVarChar(sql.MAX), JSON.stringify(t.answers))
                        .input('rawData', sql.NVarChar(sql.MAX), JSON.stringify(response))
                        .query(`UPDATE FormResponses SET LastModifiedAt=@lastModified,Answers=@answers,RawDataJSON=@rawData,UpdatedAt=GETDATE(),UltimaSync=GETDATE() WHERE ResponseID=@responseId`);
                    actualizados++;
                } else {
                    await pool.request()
                        .input('responseId', sql.NVarChar, t.responseId)
                        .input('sourceId', sql.Int, source.SourceID)
                        .input('formId', sql.NVarChar, source.Alias)
                        .input('formTitle', sql.NVarChar, source.Alias)
                        .input('email', sql.NVarChar, t.respondentEmail)
                        .input('name', sql.NVarChar, t.respondentName)
                        .input('submitted', sql.DateTime, t.submittedAt)
                        .input('lastModified', sql.DateTime, t.lastModifiedAt)
                        .input('answers', sql.NVarChar(sql.MAX), JSON.stringify(t.answers))
                        .input('rawData', sql.NVarChar(sql.MAX), JSON.stringify(response))
                        .query(`INSERT INTO FormResponses (ResponseID,SourceID,FormID,FormTitle,RespondentEmail,RespondentName,SubmittedAt,LastModifiedAt,Answers,RawDataJSON) VALUES (@responseId,@sourceId,@formId,@formTitle,@email,@name,@submitted,@lastModified,@answers,@rawData)`);
                    nuevos++;
                }

                // Save to Frm_* dynamic table
                if (tableName) {
                    try {
                        await upsertFormRow(
                            tableName,
                            t.responseId,
                            t.respondentEmail,
                            t.respondentName,
                            t.submittedAt,
                            t.answers
                        );
                    } catch (frmErr) {
                        console.warn(`  ⚠️ Frm_ upsert error for ${t.responseId}:`, frmErr.message.substring(0, 100));
                    }
                }

            } catch (error) {
                console.error(`Error saving response ${response.id}:`, error.message.substring(0, 200));
            }
        }

        return { nuevos, actualizados };
    }

    // ─── Transform response ───────────────────────────────────────────────────

    transformResponseData(response, source) {
        const answers = response.answers || response._rawRow || {};

        let submittedAt = new Date();
        let lastModifiedAt = new Date();

        if (response.submittedDateTime) {
            try { submittedAt = new Date(response.submittedDateTime); } catch (e) { }
        }
        if (response.lastModifiedDateTime) {
            try { lastModifiedAt = new Date(response.lastModifiedDateTime); } catch (e) { }
        }

        return {
            responseId: response.id,
            respondentEmail: response.responder?.email || answers['Correo electrónico'] || answers['Email'] || null,
            respondentName: response.responder?.displayName || answers['Nombre'] || answers['Name'] || null,
            submittedAt,
            lastModifiedAt,
            answers
        };
    }

    // ─── Update source stats ──────────────────────────────────────────────────

    async updateSourceStats(sourceId) {
        try {
            const pool = await getFormsPool();
            await pool.request()
                .input('id', sql.Int, sourceId)
                .query(`UPDATE FormsSources SET UltimaSync=GETDATE(), UpdatedAt=GETDATE() WHERE SourceID=@id`);
        } catch (e) { /* non-critical */ }
    }

    // ─── Logging ──────────────────────────────────────────────────────────────

    async logSync(logData) {
        try {
            const pool = await getFormsPool();
            await pool.request()
                .input('tipo', sql.NVarChar, logData.tipo)
                .input('procesados', sql.Int, logData.registrosProcesados)
                .input('nuevos', sql.Int, logData.registrosNuevos)
                .input('actualizados', sql.Int, logData.registrosActualizados)
                .input('estado', sql.NVarChar, logData.estado)
                .input('error', sql.NVarChar, logData.mensajeError)
                .input('tiempo', sql.Int, logData.tiempoEjecucionMs)
                .input('iniciado', sql.NVarChar, logData.iniciadoPor)
                .query(`INSERT INTO FormsSyncLog (TipoSync,RegistrosProcesados,RegistrosNuevos,RegistrosActualizados,Estado,MensajeError,TiempoEjecucionMs,IniciadoPor) VALUES (@tipo,@procesados,@nuevos,@actualizados,@estado,@error,@tiempo,@iniciado)`);
        } catch (error) {
            console.error('Error logging sync:', error.message);
        }
    }

    async getLatestSyncStatus() {
        try {
            const pool = await getFormsPool();
            const result = await pool.request().query('SELECT TOP 1 * FROM FormsSyncLog ORDER BY FechaSync DESC');
            return result.recordset[0] || null;
        } catch (error) { return null; }
    }

    async getSyncLogs(pageSize = 20, pageNumber = 1) {
        try {
            const pool = await getFormsPool();
            const offset = (pageNumber - 1) * pageSize;
            const result = await pool.request()
                .input('pageSize', sql.Int, pageSize)
                .input('offset', sql.Int, offset)
                .query('SELECT * FROM FormsSyncLog ORDER BY FechaSync DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY');
            const countResult = await pool.request().query('SELECT COUNT(*) as total FROM FormsSyncLog');
            return { logs: result.recordset, total: countResult.recordset[0].total, page: pageNumber, pageSize };
        } catch (error) {
            return { logs: [], total: 0, page: pageNumber, pageSize };
        }
    }
}

module.exports = new FormsSyncService();
