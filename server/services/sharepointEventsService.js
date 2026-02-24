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

// Costa Rica is UTC-6 year-round (no DST)
const CR_OFFSET_MS = -6 * 60 * 60 * 1000;

/**
 * Format a YYYY-MM-DD string from various date representations.
 * Converts UTC to Costa Rica local time (UTC-6) before extracting the date.
 */
function toDateStr(val) {
    if (!val) return null;
    if (typeof val === 'string') {
        // If already a date-only string (no 'T'), return it trimmed
        if (!val.includes('T')) {
            return val.substring(0, 10);
        }
        // Full ISO datetime: parse and convert to CR timezone
        const d = new Date(val);
        if (isNaN(d.getTime())) return null;
        const crTime = new Date(d.getTime() + CR_OFFSET_MS);
        return `${crTime.getUTCFullYear()}-${String(crTime.getUTCMonth() + 1).padStart(2, '0')}-${String(crTime.getUTCDate()).padStart(2, '0')}`;
    }
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const crTime = new Date(val.getTime() + CR_OFFSET_MS);
        return `${crTime.getUTCFullYear()}-${String(crTime.getUTCMonth() + 1).padStart(2, '0')}-${String(crTime.getUTCDate()).padStart(2, '0')}`;
    }
    return null;
}

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
 *
 * DATES: Returns fechaInicio/fechaFin as 'YYYY-MM-DD' strings (Costa Rica local date).
 * This avoids any timezone ambiguity when storing to SQL.
 */
function mapSharePointItem(item) {
    const f = item.fields || {};

    // Start and End are the date fields in this list
    const rawStart = f.Start || f.EventDate || f.FechaDeInicio || f.StartDate || null;
    const rawEnd = f.End || f.EndDate || f.FechaDeFin || null;

    // Convert UTC dates from Graph API to Costa Rica local date strings
    const fechaInicio = toDateStr(rawStart);
    const fechaFin = toDateStr(rawEnd);

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
        fechaInicio: fechaInicio,   // 'YYYY-MM-DD' string or null
        fechaFin: fechaFin,         // 'YYYY-MM-DD' string or null
        ubicacion: ubicacion,
        categoria: f['Tipo_x0020_Evento'] || f.Category || null,
        todoElDia: (f['Duraci_x00f3_n_x0020_Evento'] === 'Todo el día') || f.fAllDayEvent === true || false,
        descripcion: f.Description || null
    };
}

/**
 * Sync events from SharePoint to SQL cache table SP_EVENTOS_ROSTI.
 * Uses MERGE strategy: insert new, update existing, delete stale.
 *
 * FechaInicio/FechaFin are stored as DATE (not DATETIME) to avoid timezone issues.
 * The mapSharePointItem function returns them as 'YYYY-MM-DD' strings in CR timezone.
 */
async function syncEventos() {
    console.log('🔄 Starting SharePoint Eventos Rosti sync...');

    const spItems = await fetchSharePointEvents();
    const pool = await poolPromise;

    // Ensure table exists — use DATE type (not DATETIME) for clean date storage
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SP_EVENTOS_ROSTI')
        BEGIN
            CREATE TABLE SP_EVENTOS_ROSTI (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                SharePointItemId NVARCHAR(100) NOT NULL,
                Titulo NVARCHAR(500) NOT NULL,
                FechaInicio DATE NOT NULL,
                FechaFin DATE NULL,
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

    // Migrate existing DATETIME columns to DATE if they exist as DATETIME
    try {
        await pool.request().query(`
            IF EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'SP_EVENTOS_ROSTI' AND COLUMN_NAME = 'FechaInicio' AND DATA_TYPE = 'datetime'
            )
            BEGIN
                -- Drop indexes that reference these columns first
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SP_EVENTOS_FechaInicio' AND object_id = OBJECT_ID('SP_EVENTOS_ROSTI'))
                    DROP INDEX IX_SP_EVENTOS_FechaInicio ON SP_EVENTOS_ROSTI;
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SP_EVENTOS_FechaFin' AND object_id = OBJECT_ID('SP_EVENTOS_ROSTI'))
                    DROP INDEX IX_SP_EVENTOS_FechaFin ON SP_EVENTOS_ROSTI;
                -- Alter columns from DATETIME to DATE
                ALTER TABLE SP_EVENTOS_ROSTI ALTER COLUMN FechaInicio DATE NOT NULL;
                ALTER TABLE SP_EVENTOS_ROSTI ALTER COLUMN FechaFin DATE NULL;
                -- Recreate indexes
                CREATE INDEX IX_SP_EVENTOS_FechaInicio ON SP_EVENTOS_ROSTI(FechaInicio);
                CREATE INDEX IX_SP_EVENTOS_FechaFin ON SP_EVENTOS_ROSTI(FechaFin);
                PRINT 'Migrated SP_EVENTOS_ROSTI date columns from DATETIME to DATE';
            END
        `);
    } catch (migErr) {
        console.warn('⚠️ Could not migrate date columns (may already be DATE):', migErr.message);
    }

    let inserted = 0;
    let skipped = 0;

    for (const spItem of spItems) {
        const mapped = mapSharePointItem(spItem);

        // Skip items without a valid start date string
        if (!mapped.fechaInicio) {
            skipped++;
            continue;
        }

        try {
            await pool.request()
                .input('spItemId', sql.NVarChar(100), mapped.sharePointItemId)
                .input('titulo', sql.NVarChar(500), mapped.titulo)
                .input('fechaInicio', sql.Date, mapped.fechaInicio)
                .input('fechaFin', sql.Date, mapped.fechaFin)
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

            inserted++;
        } catch (err) {
            console.error(`❌ Error syncing SP item ${mapped.sharePointItemId}:`, err.message);
            skipped++;
        }
    }

    // Delete items that no longer exist in SharePoint
    const spIds = spItems.map(i => String(i.id)).filter(Boolean);
    if (spIds.length > 0) {
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
 *
 * All date handling uses strings ('YYYY-MM-DD') to avoid timezone ambiguity.
 */
async function getEventosPorMes(year, month) {
    const pool = await poolPromise;

    // String date boundaries — timezone-safe
    const mm = String(month).padStart(2, '0');
    const startStr = `${year}-${mm}-01`;
    const endStr = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const result = await pool.request()
        .input('startDate', sql.VarChar(10), startStr)
        .input('endDate', sql.VarChar(10), endStr)
        .query(`
            SELECT Id, SharePointItemId, Titulo,
                   CONVERT(VARCHAR(10), FechaInicio, 120) AS FechaInicioStr,
                   CONVERT(VARCHAR(10), FechaFin, 120) AS FechaFinStr,
                   Ubicacion, Categoria, TodoElDia, Descripcion
            FROM SP_EVENTOS_ROSTI
            WHERE FechaInicio < @endDate
              AND (FechaFin >= @startDate OR (FechaFin IS NULL AND FechaInicio >= @startDate))
            ORDER BY FechaInicio
        `);

    const byDate = {};

    for (const row of result.recordset) {
        const eventStartStr = row.FechaInicioStr; // 'YYYY-MM-DD'
        const eventEndStr = row.FechaFinStr || eventStartStr;

        // Determine the loop range within the requested month
        const loopStartStr = eventStartStr < startStr ? startStr : eventStartStr;
        // endStr is exclusive — the last valid day is the day before endStr
        const loopEndStr = eventEndStr >= endStr
            ? subtractOneDay(endStr)
            : eventEndStr;

        // Iterate day by day using simple string arithmetic
        let currentStr = loopStartStr;
        while (currentStr <= loopEndStr) {
            if (!byDate[currentStr]) byDate[currentStr] = [];
            byDate[currentStr].push({
                id: row.Id,
                evento: row.Titulo,
                esFeriado: false,
                esInterno: false,
                ubicacion: row.Ubicacion,
                categoria: row.Categoria,
                todoElDia: row.TodoElDia
            });
            currentStr = addOneDay(currentStr);
        }
    }

    return byDate;
}

/**
 * Get cached events for an entire year, grouped by date (EventosByDate format).
 * All date handling uses strings to avoid timezone ambiguity.
 */
async function getEventosPorAno(year) {
    const pool = await poolPromise;

    const startStr = `${year}-01-01`;
    const endStr = `${year + 1}-01-01`;

    const result = await pool.request()
        .input('startDate', sql.VarChar(10), startStr)
        .input('endDate', sql.VarChar(10), endStr)
        .query(`
            SELECT Id, SharePointItemId, Titulo,
                   CONVERT(VARCHAR(10), FechaInicio, 120) AS FechaInicioStr,
                   CONVERT(VARCHAR(10), FechaFin, 120) AS FechaFinStr,
                   Ubicacion, Categoria, TodoElDia, Descripcion
            FROM SP_EVENTOS_ROSTI
            WHERE FechaInicio < @endDate
              AND (FechaFin >= @startDate OR (FechaFin IS NULL AND FechaInicio >= @startDate))
            ORDER BY FechaInicio
        `);

    const byDate = {};

    for (const row of result.recordset) {
        const eventStartStr = row.FechaInicioStr;
        const eventEndStr = row.FechaFinStr || eventStartStr;

        const loopStartStr = eventStartStr < startStr ? startStr : eventStartStr;
        const loopEndStr = eventEndStr >= endStr
            ? subtractOneDay(endStr)
            : eventEndStr;

        let currentStr = loopStartStr;
        while (currentStr <= loopEndStr) {
            if (!byDate[currentStr]) byDate[currentStr] = [];
            byDate[currentStr].push({
                id: row.Id,
                evento: row.Titulo,
                esFeriado: false,
                esInterno: false,
                ubicacion: row.Ubicacion,
                categoria: row.Categoria,
                todoElDia: row.TodoElDia
            });
            currentStr = addOneDay(currentStr);
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

/**
 * Helper: add one day to a 'YYYY-MM-DD' string.
 */
function addOneDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Helper: subtract one day from a 'YYYY-MM-DD' string.
 */
function subtractOneDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Debug: get stored dates for a month to compare with SharePoint.
 */
async function debugStoredDates(year, month) {
    const pool = await poolPromise;
    const mm = String(month).padStart(2, '0');
    const startStr = `${year}-${mm}-01`;
    const endStr = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const result = await pool.request()
        .input('startDate', sql.VarChar(10), startStr)
        .input('endDate', sql.VarChar(10), endStr)
        .query(`
            SELECT SharePointItemId, Titulo,
                   CONVERT(VARCHAR(10), FechaInicio, 120) AS FechaInicio,
                   CONVERT(VARCHAR(10), FechaFin, 120) AS FechaFin,
                   Categoria, TodoElDia
            FROM SP_EVENTOS_ROSTI
            WHERE FechaInicio < @endDate
              AND (FechaFin >= @startDate OR (FechaFin IS NULL AND FechaInicio >= @startDate))
            ORDER BY FechaInicio
        `);
    return result.recordset;
}

module.exports = {
    syncEventos,
    getEventosPorMes,
    getEventosPorAno,
    debugListFields,
    debugStoredDates,
    fetchSharePointEvents
};
