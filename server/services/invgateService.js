const axios = require('axios');
const { getInvgatePool, sql } = require('../invgateDb');

/**
 * InvGate Service - OAuth 2.0 client_credentials authentication + V1 API methods
 * API V1: incidents fetched by helpdesk (GET /incidents/by.helpdesk?ids[]=X)
 * Response format: { "ticketId": { ...ticketData }, ... }
 */
class InvGateService {
    constructor() {
        this.clientId = null;
        this.clientSecret = null;
        this.tokenUrl = null;
        this.apiBaseUrl = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.initialized = false;
        this.dbScopes = null; // scopes loaded from DB (production-configurable)
        // In-memory lookup caches (TTL: 1 hour)
        this._helpdeskCache = null;
        this._helpdeskCacheExpiry = 0;
        this._categoryCache = null;
        this._categoryCacheExpiry = 0;
    }

    // ================================================================
    // INIT & AUTH
    // ================================================================

    async initialize() {
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(`
                SELECT ConfigKey, ConfigValue 
                FROM InvgateConfig 
                WHERE ConfigKey IN ('CLIENT_ID', 'CLIENT_SECRET', 'TOKEN_URL', 'API_BASE_URL')
            `);

            const config = {};
            result.recordset.forEach(row => {
                config[row.ConfigKey] = row.ConfigValue;
            });

            this.clientId = config.CLIENT_ID;
            this.clientSecret = config.CLIENT_SECRET;
            this.tokenUrl = config.TOKEN_URL;
            this.apiBaseUrl = config.API_BASE_URL || 'https://rostipollos.cloud.invgate.net/api/v1';
            this.initialized = !!(this.clientId && this.clientSecret && this.tokenUrl);

            // Load configurable scopes from DB
            try {
                const scopeResult = await pool.request().query(
                    `SELECT ConfigValue FROM InvgateConfig WHERE ConfigKey = 'OAUTH_SCOPES'`
                );
                if (scopeResult.recordset.length > 0 && scopeResult.recordset[0].ConfigValue) {
                    this.dbScopes = scopeResult.recordset[0].ConfigValue;
                    console.log(`  📋 Using DB-configured scopes (${this.dbScopes.split(' ').length} scopes)`);
                }
            } catch (e) { /* OAUTH_SCOPES key not in DB — use defaults */ }

            if (this.initialized) {
                console.log(`✅ InvGate Service initialized (OAuth 2.0) — base: ${this.apiBaseUrl}`);
            } else {
                console.log('⚠️ InvGate Service not configured (missing CLIENT_ID, CLIENT_SECRET or TOKEN_URL)');
            }
            return this.initialized;
        } catch (err) {
            console.error('❌ Failed to initialize InvGate Service:', err.message);
            this.initialized = false;
            return false;
        }
    }

    async getAccessToken() {
        // Return cached token if still valid (with 60s buffer)
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return this.accessToken;
        }

        console.log('🔑 Requesting new InvGate OAuth token...');
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
            // InvGate REQUIRES explicit scopes — without this the JWT has scopes:[] and all API calls return 403
            // Use DB-configured scopes if available, otherwise use hardcoded defaults
            const DEFAULT_SCOPES = [
                'api.v1.incidents:get',
                'api.v1.incident:get',
                'api.v1.helpdesks:get',
                'api.v1.incidents.by.helpdesk:get',
                'api.v1.incidents.by.status:get',
                'api.v1.incidents.by.view:get',
                'api.v1.incidents.details.by.view:get',
                'api.v1.categories:get',
                'api.v1.incident.attributes.status:get',
                'api.v1.incident.attributes.priority:get',
                'api.v1.incident.attributes.category:get',
                'api.v1.incident.comment:get',
            ].join(' ');
            params.append('scope', this.dbScopes || DEFAULT_SCOPES);

            const response = await axios.post(this.tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            });

            if (response.data.error) {
                const desc = response.data.error_description || response.data.error;
                throw new Error(`InvGate OAuth: ${desc}`);
            }

            this.accessToken = response.data.access_token || response.data.token || response.data.jwt || response.data.id_token;
            const expiresIn = response.data.expires_in || 3600;
            this.tokenExpiry = Date.now() + (expiresIn * 1000);
            console.log('✅ InvGate OAuth token obtained, expires in', expiresIn, 'seconds');
            return this.accessToken;
        } catch (err) {
            if (err.message.startsWith('InvGate OAuth:')) throw err;
            const httpStatus = err.response?.status;
            let msg;
            if (httpStatus === 404) {
                msg = `Token URL no encontrada (404). Verifique TOKEN_URL: ${this.tokenUrl}`;
            } else if (httpStatus === 401 || httpStatus === 403) {
                msg = `Credenciales inválidas (HTTP ${httpStatus}): ${err.response?.data?.error_description || err.message}`;
            } else {
                msg = err.response?.data?.error_description || err.message;
            }
            console.error('❌ Failed to get InvGate OAuth token:', msg);
            throw new Error(msg);
        }
    }

    async getConfig(key) {
        try {
            const pool = await getInvgatePool();
            const result = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT ConfigValue FROM InvgateConfig WHERE ConfigKey = @key');
            return result.recordset[0]?.ConfigValue || null;
        } catch (e) {
            return null;
        }
    }

    // ================================================================
    // HTTP HELPER
    // ================================================================

    async makeRequest(endpoint, method = 'GET', data = null, params = {}, _isRetry = false) {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.initialized) {
            throw new Error('InvGate no configurado. Configure CLIENT_ID, CLIENT_SECRET y TOKEN_URL.');
        }

        const token = await this.getAccessToken();
        try {
            const url = `${this.apiBaseUrl}${endpoint}`;
            const config = {
                method,
                url,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                params,
                timeout: 30000
            };
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                config.data = data;
            }
            console.log(`📡 InvGate API: ${method} ${endpoint}`);
            const response = await axios(config);
            return response.data;
        } catch (err) {
            // Auto-retry on 403: force a fresh token and try once more
            if (!_isRetry && err.response?.status === 403) {
                console.warn(`⚠️ InvGate 403 on ${endpoint} — forcing token refresh and retrying...`);
                this.accessToken = null;
                this.tokenExpiry = null;
                return this.makeRequest(endpoint, method, data, params, true);
            }
            console.error(`❌ InvGate API Error (${endpoint}):`, err.message);
            if (err.response) {
                console.error('   Status:', err.response.status);
                console.error('   Data:', JSON.stringify(err.response.data).substring(0, 300));
            }
            throw new Error(`InvGate API Error: ${err.message}`);
        }
    }

    // ================================================================
    // V1 API METHODS
    // ================================================================

    /**
     * Get all helpdesks from InvGate
     * Returns array: [{id, name, status_id, parent_id, type_id, ...}]
     */
    async getHelpdesks() {
        const now = Date.now();
        if (this._helpdeskCache && now < this._helpdeskCacheExpiry) {
            return this._helpdeskCache;
        }
        const data = await this.makeRequest('/helpdesks', 'GET');
        const helpdesks = Array.isArray(data) ? data : [];
        this._helpdeskCache = helpdesks;
        this._helpdeskCacheExpiry = now + 3600000; // 1 hour
        return helpdesks;
    }

    /**
     * Get all incidents for a specific helpdesk
     * V1 API returns: { "ticketId": { ...ticketData }, ... }
     * Returns: array of ticket objects (with helpdeskId injected)
     */
    async getIncidentsByHelpdesk(helpdeskId) {
        try {
            const data = await this.makeRequest('/incidents/by.helpdesk', 'GET', null, { 'ids[]': helpdeskId });
            if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
            if (data.error) {
                console.warn(`  ⚠️ Helpdesk ${helpdeskId} returned error:`, data.error);
                return [];
            }
            // Convert object {id: ticketData} to array
            const tickets = Object.entries(data).map(([id, ticket]) => ({
                ...ticket,
                id: parseInt(id),
                _helpdeskId: helpdeskId
            }));
            return tickets;
        } catch (err) {
            console.warn(`  ⚠️ Failed to get incidents for helpdesk ${helpdeskId}:`, err.message);
            return [];
        }
    }

    /**
     * Get all incidents from all ENABLED helpdesks
     * Returns: array of all ticket objects
     */
    async getAllIncidents() {
        const helpdesks = await this.getHelpdesks();
        // Get enabled helpdesks from DB
        let enabledIds = null;
        try {
            const pool = await getInvgatePool();
            const result = await pool.request().query(
                'SELECT HelpdeskID FROM InvgateHelpdesks WHERE SyncEnabled = 1'
            );
            if (result.recordset.length > 0) {
                enabledIds = new Set(result.recordset.map(r => r.HelpdeskID));
            }
        } catch (e) {
            // Table may not exist yet — sync all helpdesks
            console.log('  ℹ️ InvgateHelpdesks table not found, syncing all helpdesks');
        }

        const allTickets = [];
        for (const hd of helpdesks) {
            if (enabledIds && !enabledIds.has(hd.id)) {
                console.log(`  ⏭️ Skipping helpdesk ${hd.name} (not enabled for sync)`);
                continue;
            }
            console.log(`  📂 Fetching incidents for helpdesk: ${hd.name} (ID: ${hd.id})`);
            const tickets = await this.getIncidentsByHelpdesk(hd.id);
            // Inject helpdesk info
            tickets.forEach(t => {
                t._helpdeskName = hd.name;
            });
            allTickets.push(...tickets);
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(`  ✅ Total incidents fetched: ${allTickets.length}`);
        return allTickets;
    }

    /**
     * Get all categories from InvGate
     * Returns: array of {id, name, parent_id, ...}
     */
    async getCategories() {
        const now = Date.now();
        if (this._categoryCache && now < this._categoryCacheExpiry) {
            return this._categoryCache;
        }
        try {
            const data = await this.makeRequest('/categories', 'GET');
            const categories = Array.isArray(data) ? data : (data.categories || []);
            this._categoryCache = categories;
            this._categoryCacheExpiry = now + 3600000;
            return categories;
        } catch (err) {
            console.warn('  ⚠️ Failed to get categories:', err.message);
            return [];
        }
    }

    /**
     * Get custom field metadata (names) from InvGate API.
     * Tries multiple endpoints — InvGate API naming varies by version/config.
     * Returns: { [fieldId]: { name, fieldType } }
     */
    async getCustomFieldMetadata() {
        const endpoints = [
            '/custom_fields',
            '/custom_attributes',
            '/cf.fields',
            '/incidents/custom_fields'
        ];
        for (const ep of endpoints) {
            try {
                const data = await this.makeRequest(ep, 'GET');
                if (!data) continue;
                // Normalize to map: {id -> {name, type}}
                const items = Array.isArray(data) ? data
                    : (data.custom_fields || data.custom_attributes || data.fields || Object.values(data));
                if (!Array.isArray(items) || items.length === 0) continue;
                const map = {};
                for (const item of items) {
                    const id = item.id || item.field_id || item.fieldId;
                    if (!id) continue;
                    map[parseInt(id)] = {
                        name: item.name || item.label || item.display_name || item.title || null,
                        fieldType: item.type || item.field_type || item.kind || null
                    };
                }
                if (Object.keys(map).length > 0) {
                    console.log(`  ✅ Custom field metadata from ${ep}: ${Object.keys(map).length} fields`);
                    return map;
                }
            } catch (e) {
                // Endpoint not available, try next
                console.log(`  ⏭️ Custom field metadata endpoint ${ep} not available: ${e.message.substring(0, 60)}`);
            }
        }
        console.log('  ℹ️ No custom field metadata endpoint found — names will be inferred from ticket data');
        return {};
    }

    /**
     * Detect all custom field IDs used in a helpdesk's incidents.
     * Returns: [{fieldId, fieldName, fieldType, sampleValues[]}]
     * Now also fetches real field names from the API metadata endpoint.
     */
    async detectCustomFields(helpdeskId) {
        // First try to get metadata (real names)
        const metaMap = await this.getCustomFieldMetadata().catch(() => ({}));

        const tickets = await this.getIncidentsByHelpdesk(helpdeskId);
        const fieldMap = {};
        for (const ticket of tickets) {
            if (!ticket.custom_fields) continue;
            // InvGate v1 custom_fields can be either:
            //   {id: value} or {id: {name: "field name", value: ...}}
            for (const [fieldId, raw] of Object.entries(ticket.custom_fields)) {
                const fid = parseInt(fieldId);
                if (!fieldMap[fid]) {
                    // Try to get name from the value object itself (InvGate sometimes embeds it)
                    let embeddedName = null;
                    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                        embeddedName = raw.name || raw.field_name || raw.label || null;
                    }
                    fieldMap[fid] = {
                        fieldId: fid,
                        fieldName: (metaMap[fid]?.name) || embeddedName || null,
                        sampleValues: []
                    };
                }
                // Extract display value
                let displayValue = raw;
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    // Could be {hash: "name"} dropdown OR {name, value} structure
                    if (raw.value !== undefined) {
                        displayValue = raw.value;
                    } else {
                        const vals = Object.values(raw).filter(v => typeof v === 'string');
                        displayValue = vals[0] || null;
                    }
                } else if (typeof raw === 'number' && raw > 1000000000 && raw < 9999999999) {
                    displayValue = `[date: ${new Date(raw * 1000).toISOString().split('T')[0]}]`;
                }
                if (displayValue !== null && displayValue !== undefined && fieldMap[fid].sampleValues.length < 3) {
                    fieldMap[fid].sampleValues.push(String(displayValue));
                }
            }
        }

        // Determine field type from sample values + metadata
        for (const f of Object.values(fieldMap)) {
            // Priority: API metadata type > inferred type
            if (metaMap[f.fieldId]?.fieldType) {
                const apiType = metaMap[f.fieldId].fieldType.toLowerCase();
                if (apiType.includes('date') || apiType.includes('time')) f.fieldType = 'date';
                else if (apiType.includes('num') || apiType.includes('int') || apiType.includes('float')) f.fieldType = 'number';
                else if (apiType.includes('list') || apiType.includes('drop') || apiType.includes('select') || apiType.includes('option')) f.fieldType = 'dropdown';
                else f.fieldType = 'text';
            } else {
                const samples = f.sampleValues;
                if (samples.some(s => s.startsWith('[date:'))) {
                    f.fieldType = 'date';
                } else if (samples.length > 0 && samples.every(s => !isNaN(s) && s !== '')) {
                    f.fieldType = 'number';
                } else {
                    const ticket = tickets.find(t => t.custom_fields && t.custom_fields[f.fieldId]);
                    const rawVal = ticket?.custom_fields?.[f.fieldId];
                    f.fieldType = (rawVal && typeof rawVal === 'object') ? 'dropdown' : 'text';
                }
            }

            // If still no name, use a descriptive default based on type
            if (!f.fieldName) {
                const typeLabel = { date: 'Fecha', number: 'Número', dropdown: 'Lista', text: 'Texto' }[f.fieldType] || 'Campo';
                f.fieldName = `${typeLabel} ${f.fieldId}`;
            }
        }

        return Object.values(fieldMap).sort((a, b) => a.fieldId - b.fieldId);
    }


    // ================================================================
    // VIEW-BASED API METHODS
    // ================================================================

    /**
     * Get incidents by InvGate view (single page).
     * Uses /incidents.details.by.view endpoint with cursor-based pagination.
     * Returns: { tickets: [...], metadata: {...}, nextPageKey, totalCount, columns: [...] }
     */
    async getIncidentsByView(viewId, pageKey = null) {
        try {
            const params = { view_id: viewId };
            if (pageKey) params.page_key = pageKey;

            const data = await this.makeRequest('/incidents.details.by.view', 'GET', null, params);
            if (!data || typeof data !== 'object') {
                return { tickets: [], metadata: {}, nextPageKey: null, totalCount: 0, columns: [] };
            }

            // Extract metadata (column labels, hash-to-label value maps)
            const metadata = data.metadata || {};
            const nextPageKey = data.next_page_key || null;

            // Normalize response — InvGate v1 may return object {id: ticketData} or array
            let tickets = [];
            if (Array.isArray(data.data)) {
                tickets = data.data;
            } else if (Array.isArray(data)) {
                tickets = data;
            } else if (data.error) {
                throw new Error(`InvGate view error: ${data.error}`);
            } else if (data.data && typeof data.data === 'object') {
                // Object format {id: {...}, id2: {...}}
                tickets = Object.entries(data.data).map(([id, ticket]) => ({
                    ...ticket,
                    id: parseInt(id)
                }));
            }

            // Auto-detect columns from first ticket
            const columns = [];
            if (tickets.length > 0) {
                const sample = tickets[0];
                for (const key of Object.keys(sample)) {
                    if (key.startsWith('_')) continue; // skip internal fields
                    columns.push(key);
                }
            }

            return {
                tickets,
                metadata,
                nextPageKey,
                totalCount: data.total || data.count || tickets.length,
                columns
            };
        } catch (err) {
            console.error(`❌ Error getting incidents by view ${viewId}:`, err.message);
            throw err;
        }
    }

    /**
     * Preview a view — returns first page of data with resolved columns.
     * Used in the admin UI to let the user see what a view contains before enabling sync.
     */
    async getViewPreview(viewId) {
        const result = await this.getIncidentsByView(viewId);
        // Resolve tickets using metadata for human-readable column names
        const resolvedTickets = this._resolveTickets(result.tickets, result.metadata);
        // Limit to first 10 rows for preview
        const previewTickets = resolvedTickets.slice(0, 10);

        // Build column info with sample values
        const columnSet = new Set();
        for (const t of previewTickets) {
            for (const k of Object.keys(t)) columnSet.add(k);
        }
        const columnInfo = Array.from(columnSet).map(col => {
            const samples = previewTickets
                .map(t => {
                    const val = t[col];
                    if (val === null || val === undefined) return null;
                    if (typeof val === 'object') return JSON.stringify(val);
                    return String(val);
                })
                .filter(v => v !== null)
                .slice(0, 3);
            return { name: col, sampleValues: samples };
        });

        return {
            viewId,
            totalCount: result.totalCount,
            previewRows: previewTickets.length,
            columns: columnInfo,
            data: previewTickets
        };
    }

    /**
     * Resolve raw API tickets into human-readable flat objects using metadata.
     * - Renames cf_XXX → metadata label (e.g. cf_137 → "Tipo de Queja:")
     * - Resolves hash codes to labels for list-type custom fields
     * - Flattens nested built-in fields (request, priority, status, etc.)
     */
    _resolveTickets(tickets, metadata) {
        if (!tickets || tickets.length === 0) return [];
        const resolved = [];

        for (const ticket of tickets) {
            const row = {};
            for (const [key, value] of Object.entries(ticket)) {
                const fieldMeta = metadata[key];

                if (fieldMeta && key.startsWith('cf_')) {
                    // Custom field — use metadata label and resolve hash values
                    const colName = fieldMeta.label || key;
                    if (fieldMeta.type === 'list' && Array.isArray(value) && fieldMeta.values) {
                        row[colName] = value.map(hash => fieldMeta.values[hash]?.label || hash).join(', ');
                    } else {
                        row[colName] = value;
                    }
                } else if (key === 'id') {
                    row['ID'] = value;
                } else if (key === 'request' && typeof value === 'object' && value !== null) {
                    // Flatten request: category, type, subject
                    if (value.category) row['Categoría'] = value.category.label || value.category;
                    if (value.type) row['Tipo'] = value.type.label || value.type;
                } else if (key === 'priority') {
                    row['Prioridad'] = (typeof value === 'object' && value?.label) ? value.label : value;
                } else if (key === 'status') {
                    row['Estado'] = (typeof value === 'object' && value?.label) ? value.label : value;
                } else if (key === 'waiting_for') {
                    row['Esperando'] = (typeof value === 'object' && value?.label) ? value.label : value;
                } else if (key === 'last_update') {
                    if (typeof value === 'object' && value?.formatted) {
                        row['Fecha de creación'] = value.formatted;
                    } else {
                        row['Fecha de creación'] = value;
                    }
                } else if (key === 'customer') {
                    // Resolve customer using metadata if available
                    if (fieldMeta && fieldMeta.values && fieldMeta.values[String(value)]) {
                        row['Cliente'] = fieldMeta.values[String(value)].label;
                    } else {
                        row['Cliente'] = value;
                    }
                } else if (key === 'description') {
                    row['Descripción'] = value;
                } else {
                    // Any other field — pass through, flatten if object
                    if (typeof value === 'object' && value !== null) {
                        row[key] = value.label || value.formatted || JSON.stringify(value);
                    } else {
                        row[key] = value;
                    }
                }
            }
            resolved.push(row);
        }
        return resolved;
    }

    /**
     * Get ALL incidents from a view (cursor-based paginated fetch).
     * Uses next_page_key for proper pagination.
     * Returns resolved (human-readable) ticket objects ready for DB storage.
     */
    async getAllIncidentsByView(viewId) {
        const allTickets = [];
        const seenIds = new Set();
        let pageKey = null;
        let pageNum = 1;
        let metadata = {};
        const MAX_PAGES = 500; // safety cap

        while (pageNum <= MAX_PAGES) {
            console.log(`  📄 View ${viewId}: fetching page ${pageNum}...`);
            const result = await this.getIncidentsByView(viewId, pageKey);

            // Merge metadata (first page usually has all of it)
            if (result.metadata && Object.keys(result.metadata).length > 0) {
                metadata = { ...metadata, ...result.metadata };
            }

            if (result.tickets.length === 0) {
                break;
            }

            // Deduplicate
            let newCount = 0;
            for (const ticket of result.tickets) {
                const ticketId = ticket.id || ticket.ID;
                if (ticketId && !seenIds.has(ticketId)) {
                    seenIds.add(ticketId);
                    allTickets.push(ticket);
                    newCount++;
                } else if (!ticketId) {
                    allTickets.push(ticket); // no ID, can't deduplicate
                    newCount++;
                }
            }

            if (newCount === 0) {
                console.log(`  ⚠️ View ${viewId}: page ${pageNum} returned only duplicate data, stopping`);
                break;
            }

            console.log(`    📊 Page ${pageNum}: ${result.tickets.length} returned, ${newCount} new (${allTickets.length} total)`);

            // Stop if no next page key
            if (!result.nextPageKey) {
                break;
            }

            pageKey = result.nextPageKey;
            pageNum++;

            // Rate limit protection
            await new Promise(r => setTimeout(r, 300));
        }

        if (pageNum > MAX_PAGES) {
            console.warn(`  ⚠️ View ${viewId}: reached max page limit (${MAX_PAGES}), stopping`);
        }

        // Resolve all tickets using collected metadata
        const resolvedTickets = this._resolveTickets(allTickets, metadata);

        console.log(`  ✅ View ${viewId}: total ${resolvedTickets.length} unique incidents fetched and resolved`);
        return resolvedTickets;
    }

    // ================================================================
    // CONNECTION TEST
    // ================================================================

    async testConnection() {
        try {
            await this.initialize();
            if (!this.initialized) {
                return { success: false, message: 'API no configurada. Guarde primero CLIENT_ID, CLIENT_SECRET y TOKEN_URL.' };
            }
            // Force fresh token
            this.accessToken = null;
            this.tokenExpiry = null;

            let token;
            try {
                token = await this.getAccessToken();
            } catch (tokenErr) {
                const msg = tokenErr.message;
                let hint = '';
                if (msg.includes('invalid_client') || msg.includes('Client authentication failed')) {
                    hint = ' → Credenciales OAuth inválidas. Verifique CLIENT_ID y CLIENT_SECRET en InvGate.';
                } else if (msg.includes('404') || msg.includes('no encontrada')) {
                    hint = ` → TOKEN_URL incorrecta: ${this.tokenUrl}`;
                }
                return { success: false, message: msg + hint };
            }

            if (!token) {
                return { success: false, message: 'No se pudo obtener token OAuth (respuesta vacía del servidor)' };
            }

            try {
                const helpdeskData = await this.makeRequest('/helpdesks', 'GET');
                const count = Array.isArray(helpdeskData) ? helpdeskData.length : Object.keys(helpdeskData || {}).length;
                return { success: true, message: `✅ Conexión exitosa con InvGate (${count} helpdesk(s) encontrado(s))` };
            } catch (apiErr) {
                const apiMsg = apiErr.message;
                let apiHint = apiMsg.includes('404') ? ` → URL Base incorrecta: ${this.apiBaseUrl}` : '';
                return { success: false, message: 'Token OK ✅, pero error al llamar la API: ' + apiMsg + apiHint };
            }
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
}

module.exports = new InvGateService();
