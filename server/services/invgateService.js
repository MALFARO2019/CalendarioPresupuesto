const axios = require('axios');
const { getInvgatePool, sql } = require('../invgateDb');

/**
 * InvGate Service - OAuth 2.0 client_credentials authentication
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
    }

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
            this.apiBaseUrl = config.API_BASE_URL || 'https://rostipollos.cloud.invgate.net/api/v2';
            this.initialized = !!(this.clientId && this.clientSecret && this.tokenUrl);

            console.log('🔧 InvGate init - clientId:', this.clientId ? this.clientId.substring(0, 8) + '...' : 'NULL');
            console.log('🔧 InvGate init - secret:', this.clientSecret ? this.clientSecret.substring(0, 5) + '...' : 'NULL');
            console.log('🔧 InvGate init - tokenUrl:', this.tokenUrl || 'NULL');
            console.log('🔧 InvGate init - initialized:', this.initialized);

            if (this.initialized) {
                console.log('✅ InvGate Service initialized (OAuth 2.0)');
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

        console.log('🔑 Requesting new InvGate OAuth token from:', this.tokenUrl);
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
            // InvGate REQUIRES explicit scopes — without this the JWT has scopes:[] and all API calls return 403
            params.append('scope', [
                'api.v1.incidents:get',
                'api.v1.incident:get',
                'api.v1.helpdesks:get',
                'api.v1.incidents.by.helpdesk:get',
                'api.v1.incidents.by.status:get',
                'api.v1.incidents.by.view:get',
                'api.v1.categories:get',
                'api.v1.incident.attributes.status:get',
                'api.v1.incident.attributes.priority:get',
                'api.v1.incident.attributes.category:get',
                'api.v1.incident.comment:get',
                'api.v1.incident.custom_field:get',
            ].join(' '));

            const response = await axios.post(this.tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            });

            // InvGate returns HTTP 200 even on auth errors — check for error field
            if (response.data.error) {
                const desc = response.data.error_description || response.data.error;
                console.error('❌ InvGate OAuth error (HTTP 200):', response.data);
                throw new Error(`InvGate OAuth: ${desc}`);
            }

            this.accessToken = response.data.access_token || response.data.token || response.data.jwt || response.data.id_token;
            const expiresIn = response.data.expires_in || 3600;
            this.tokenExpiry = Date.now() + (expiresIn * 1000);

            console.log('✅ InvGate OAuth token obtained, expires in', expiresIn, 'seconds');
            console.log('   Token field keys:', Object.keys(response.data).join(', '));
            return this.accessToken;
        } catch (err) {
            if (err.message.startsWith('InvGate OAuth:')) throw err; // already formatted
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

    async makeRequest(endpoint, method = 'GET', data = null, params = {}) {
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

            console.log(`📡 InvGate API Request: ${method} ${endpoint}`);
            const response = await axios(config);
            return response.data;
        } catch (err) {
            console.error(`❌ InvGate API Error (${endpoint}):`, err.message);
            if (err.response) {
                console.error('   Status:', err.response.status);
                console.error('   Data:', JSON.stringify(err.response.data).substring(0, 200));
            }
            throw new Error(`InvGate API Error: ${err.message}`);
        }
    }

    async getTickets(options = {}) {
        const { page = 1, pageSize = 100, updatedSince = null, status = null } = options;
        const params = { page, per_page: pageSize };
        if (updatedSince) params.updated_since = updatedSince;
        if (status) params.status = status;
        return await this.makeRequest('/incidents', 'GET', null, params);
    }

    async getTicketById(ticketId) {
        return await this.makeRequest(`/incident/${ticketId}`, 'GET');
    }

    async testConnection() {
        try {
            // Always re-initialize to pick up any config changes
            await this.initialize();

            if (!this.initialized) {
                return {
                    success: false,
                    message: 'API no configurada. Guarde primero CLIENT_ID, CLIENT_SECRET y TOKEN_URL.'
                };
            }

            // Force a fresh token (clear cache to test credentials)
            this.accessToken = null;
            this.tokenExpiry = null;

            // Step 1: obtain OAuth token
            let token;
            try {
                token = await this.getAccessToken();
            } catch (tokenErr) {
                // Provide clear diagnostic info
                const msg = tokenErr.message;
                let hint = '';
                if (msg.includes('invalid_client') || msg.includes('Client authentication failed')) {
                    hint = ' → Las credenciales OAuth (CLIENT_ID/CLIENT_SECRET) son inválidas o no están registradas en InvGate. Vea instrucciones para generar credenciales en InvGate Admin.';
                } else if (msg.includes('404') || msg.includes('no encontrada')) {
                    hint = ` → TOKEN_URL incorrecta: ${this.tokenUrl}`;
                }
                return { success: false, message: msg + hint };
            }

            if (!token) {
                return { success: false, message: 'No se pudo obtener token OAuth (respuesta vacía del servidor)' };
            }

            // Step 2: verify API connectivity using /helpdesks (no params required)
            try {
                const helpdeskData = await this.makeRequest('/helpdesks', 'GET');
                const count = Array.isArray(helpdeskData) ? helpdeskData.length : Object.keys(helpdeskData || {}).length;
                return { success: true, message: `✅ Conexión exitosa con InvGate (${count} helpdesk(s) encontrado(s))` };
            } catch (apiErr) {
                const apiMsg = apiErr.message;
                let apiHint = '';
                if (apiMsg.includes('404')) {
                    apiHint = ` → URL Base del API incorrecta: ${this.apiBaseUrl}`;
                }
                return {
                    success: false,
                    message: 'Token OAuth OK ✅, pero error al llamar la API: ' + apiMsg + apiHint
                };
            }
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

}

module.exports = new InvGateService();
