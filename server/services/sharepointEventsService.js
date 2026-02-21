/**
 * SharePoint Events Service
 * Fetches events from the SharePoint "Eventos Rosti" list via Microsoft Graph API
 * and caches them in SQL table SP_EVENTOS_ROSTI for performance.
 * 
 * Reuses OAuth 2.0 credentials from FormsConfig (TENANT_ID, CLIENT_ID, CLIENT_SECRET).
 */

const axios = require('axios');
const formsService = require('./formsService');
const { sql, poolPromise } = require('../db');

// SharePoint site and list identifiers
const SP_SITE_HOSTNAME = 'rostipolloscr.sharepoint.com';
const SP_SITE_PATH = '/sites/OperacionesRostipollos';
const SP_LIST_NAME = 'Eventos Rosti';

// Cache for site-id to avoid repeated lookups
let _siteId = null;

/**
 * Get the SharePoint site ID using Microsoft Graph API
 */
async function getSiteId() {
    if (_siteId) return _siteId;

    const token = await formsService.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/sites/${SP_SITE_HOSTNAME}:${SP_SITE_PATH}?$select=id`;
    console.log('🔍 Resolving SharePoint site ID from:', url);

    try {
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        _siteId = response.data.id;
        console.log('📍 SharePoint site ID resolved:', _siteId);
        return _siteId;
    } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('❌ Failed to resolve SP site ID. Status:', err.response?.status, 'Detail:', detail);
        throw err;
    }
}

/**
 * Fetch all events from the SharePoint "Eventos Rosti" list
 * Handles pagination (Graph API returns max 200 items per page)
 */
async function fetchSharePointEvents() {
    const token = await formsService.getAccessToken();
    const siteId = await getSiteId();

    let allItems = [];
    let nextLink = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(SP_LIST_NAME)}/items?$expand=fields&$top=200`;

    while (nextLink) {
        const response = await axios.get(nextLink, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.value) {
            allItems = allItems.concat(response.data.value);
        }

        nextLink = response.data['@odata.nextLink'] || null;
    }

    console.log(`📥 Fetched ${allItems.length} events from SharePoint list "${SP_LIST_NAME}"`);
    return allItems;
}

/**
 * Map a SharePoint list item to our DB schema.
 * Actual Eventos Rosti fields (discovered via debug):
 *   Title, Start, End, Tipo_x0020_Evento, Duraci_x00f3_n_x0020_Evento,
 *   Ubicaci_x00f3_n (array), id
 */
function mapSharePointItem(item) {
    const f = item.fields || {};

    // Start and End are the date fields in this list
    const fechaInicio = f.Start || f.EventDate || f.FechaDeInicio || f.StartDate || null;
    const fechaFin = f.End || f.EndDate || f.FechaDeFin || null;

    // Ubicación is an array of location names
    let ubicacion = null;
    if (Array.isArray(f['Ubicaci_x00f3_n'])) {
        ubicacion = f['Ubicaci_x00f3_n'].join(', ');
    } else if (typeof f['Ubicaci_x00f3_n'] === 'string') {
        ubicacion = f['Ubicaci_x00f3_n'];
    } else if (f.Location) {
        ubicacion = f.Location;
    }

    return {
        sharePointItemId: String(item.id),
        titulo: f.Title || f.Titulo || '(Sin título)',
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        ubicacion: ubicacion,
        categoria: f['Tipo_x0020_Evento'] || f.Category || null,
        todoElDia: (f['Duraci_x00f3_n_x0020_Evento'] === 'Todo el día') || f.fAllDayEvent === true || false,
        descripcion: f.Description || null
    };
}

/**
 * Sync events from SharePoint to SQL cache table SP_EVENTOS_ROSTI.
 * Uses MERGE strategy: insert new, update existing, leave orphans.
 */
async function syncEventos() {
    console.log('🔄 Starting SharePoint Eventos Rosti sync...');

    const spItems = await fetchSharePointEvents();
    const pool = await poolPromise;

    // Ensure table exists
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SP_EVENTOS_ROSTI')
        BEGIN
            CREATE TABLE SP_EVENTOS_ROSTI (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                SharePointItemId NVARCHAR(100) NOT NULL,
                Titulo NVARCHAR(500) NOT NULL,
                FechaInicio DATETIME NOT NULL,
                FechaFin DATETIME NULL,
                Ubicacion NVARCHAR(500) NULL,
                Categoria NVARCHAR(200) NULL,
                TodoElDia BIT DEFAULT 0,
                Descripcion NVARCHAR(MAX) NULL,
                UltimaSyncFecha DATETIME DEFAULT GETDATE(),
                CONSTRAINT UQ_SP_EVENTOS_ItemId UNIQUE(SharePointItemId)
            );
            CREATE INDEX IX_SP_EVENTOS_FechaInicio ON SP_EVENTOS_ROSTI(FechaInicio);
            CREATE INDEX IX_SP_EVENTOS_FechaFin ON SP_EVENTOS_ROSTI(FechaFin);
        END
    `);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const spItem of spItems) {
        const mapped = mapSharePointItem(spItem);

        // Skip items without a valid start date
        if (!mapped.fechaInicio || isNaN(mapped.fechaInicio.getTime())) {
            skipped++;
            continue;
        }

        try {
            await pool.request()
                .input('spItemId', sql.NVarChar(100), mapped.sharePointItemId)
                .input('titulo', sql.NVarChar(500), mapped.titulo)
                .input('fechaInicio', sql.DateTime, mapped.fechaInicio)
                .input('fechaFin', sql.DateTime, mapped.fechaFin)
                .input('ubicacion', sql.NVarChar(500), mapped.ubicacion)
                .input('categoria', sql.NVarChar(200), mapped.categoria)
                .input('todoElDia', sql.Bit, mapped.todoElDia ? 1 : 0)
                .input('descripcion', sql.NVarChar(sql.MAX), mapped.descripcion)
                .query(`
                    MERGE SP_EVENTOS_ROSTI AS target
                    USING (SELECT @spItemId AS SharePointItemId) AS source
                    ON target.SharePointItemId = source.SharePointItemId
                    WHEN MATCHED THEN
                        UPDATE SET
                            Titulo = @titulo,
                            FechaInicio = @fechaInicio,
                            FechaFin = @fechaFin,
                            Ubicacion = @ubicacion,
                            Categoria = @categoria,
                            TodoElDia = @todoElDia,
                            Descripcion = @descripcion,
                            UltimaSyncFecha = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (SharePointItemId, Titulo, FechaInicio, FechaFin, Ubicacion, Categoria, TodoElDia, Descripcion, UltimaSyncFecha)
                        VALUES (@spItemId, @titulo, @fechaInicio, @fechaFin, @ubicacion, @categoria, @todoElDia, @descripcion, GETDATE());
                `);

            // We can't easily tell if MERGE did insert or update, just count total
            inserted++;
        } catch (err) {
            console.error(`❌ Error syncing SP item ${mapped.sharePointItemId}:`, err.message);
            skipped++;
        }
    }

    // Delete items that no longer exist in SharePoint
    const spIds = spItems.map(i => String(i.id)).filter(Boolean);
    if (spIds.length > 0) {
        // Build comma-separated quoted list for IN clause
        const idList = spIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const deleteResult = await pool.request()
            .query(`DELETE FROM SP_EVENTOS_ROSTI WHERE SharePointItemId NOT IN (${idList})`);
        const deleted = deleteResult.rowsAffected[0] || 0;
        if (deleted > 0) {
            console.log(`🗑️ Deleted ${deleted} stale events from cache`);
        }
    }

    console.log(`✅ SharePoint sync complete: ${inserted} upserted, ${skipped} skipped`);
    return { upserted: inserted, skipped, total: spItems.length };
}

/**
 * Get cached events for a specific month, grouped by date (EventosByDate format).
 * Returns events whose date range overlaps with the given month.
 */
async function getEventosPorMes(year, month) {
    const pool = await poolPromise;

    // First day of month and first day of next month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // exclusive upper bound

    const result = await pool.request()
        .input('startDate', sql.DateTime, startDate)
        .input('endDate', sql.DateTime, endDate)
        .query(`
            SELECT Id, SharePointItemId, Titulo, FechaInicio, FechaFin, 
                   Ubicacion, Categoria, TodoElDia, Descripcion
            FROM SP_EVENTOS_ROSTI
            WHERE FechaInicio < @endDate 
              AND (FechaFin >= @startDate OR (FechaFin IS NULL AND FechaInicio >= @startDate))
            ORDER BY FechaInicio
        `);

    // Group by date in YYYY-MM-DD format (EventosByDate)
    const byDate = {};

    for (const row of result.recordset) {
        const eventStart = new Date(row.FechaInicio);
        const eventEnd = row.FechaFin ? new Date(row.FechaFin) : eventStart;

        // For multi-day events, create an entry for each day in the month
        const loopStart = new Date(Math.max(eventStart.getTime(), startDate.getTime()));
        const loopEnd = new Date(Math.min(eventEnd.getTime(), endDate.getTime() - 1));

        for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().substring(0, 10);

            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push({
                id: row.Id,
                evento: row.Titulo,
                esFeriado: false, // SharePoint events are not feriados
                esInterno: false,
                ubicacion: row.Ubicacion,
                categoria: row.Categoria,
                todoElDia: row.TodoElDia
            });
        }
    }

    return byDate;
}

/**
 * Get cached events for an entire year, grouped by date (EventosByDate format).
 */
async function getEventosPorAno(year) {
    const pool = await poolPromise;

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const result = await pool.request()
        .input('startDate', sql.DateTime, startDate)
        .input('endDate', sql.DateTime, endDate)
        .query(`
            SELECT Id, SharePointItemId, Titulo, FechaInicio, FechaFin, 
                   Ubicacion, Categoria, TodoElDia, Descripcion
            FROM SP_EVENTOS_ROSTI
            WHERE FechaInicio < @endDate 
              AND (FechaFin >= @startDate OR (FechaFin IS NULL AND FechaInicio >= @startDate))
            ORDER BY FechaInicio
        `);

    const byDate = {};

    for (const row of result.recordset) {
        const eventStart = new Date(row.FechaInicio);
        const eventEnd = row.FechaFin ? new Date(row.FechaFin) : eventStart;

        const loopStart = new Date(Math.max(eventStart.getTime(), startDate.getTime()));
        const loopEnd = new Date(Math.min(eventEnd.getTime(), endDate.getTime() - 1));

        for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().substring(0, 10);

            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push({
                id: row.Id,
                evento: row.Titulo,
                esFeriado: false,
                esInterno: false,
                ubicacion: row.Ubicacion,
                categoria: row.Categoria,
                todoElDia: row.TodoElDia
            });
        }
    }

    return byDate;
}

/**
 * Debug: List all field names from the first SharePoint list item.
 * Useful to discover the exact column names of the Eventos Rosti list.
 */
async function debugListFields() {
    const token = await formsService.getAccessToken();
    const siteId = await getSiteId();

    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(SP_LIST_NAME)}/items?$expand=fields&$top=1`;
    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.value && response.data.value.length > 0) {
        const fields = response.data.value[0].fields;
        console.log('📋 SharePoint list fields:', Object.keys(fields));
        return { fields: Object.keys(fields), sample: fields };
    }
    return { fields: [], sample: null };
}

module.exports = {
    syncEventos,
    getEventosPorMes,
    getEventosPorAno,
    debugListFields,
    fetchSharePointEvents
};
