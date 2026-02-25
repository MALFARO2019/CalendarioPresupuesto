const axios = require('axios');
const { getFormsPool, sql } = require('../formsDb');

/**
 * Microsoft Forms Service
 * Reads form responses from the Excel file that Forms auto-generates in OneDrive
 * Uses Graph API with Client Credentials (Files.Read.All permission)
 */
class FormsService {
    constructor() {
        this._accessToken = null;
        this._tokenExpiry = null;
    }

    // ─── Config helpers ───────────────────────────────────────────────────────

    async getConfig(key) {
        try {
            const pool = await getFormsPool();
            const result = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT ConfigValue FROM FormsConfig WHERE ConfigKey = @key');
            return result.recordset.length > 0 ? result.recordset[0].ConfigValue : null;
        } catch (error) {
            console.error(`Error getting config ${key}:`, error.message);
            return null;
        }
    }

    async updateConfig(key, value, updatedBy = 'SYSTEM') {
        try {
            const pool = await getFormsPool();
            await pool.request()
                .input('key', sql.NVarChar, key)
                .input('value', sql.NVarChar, value)
                .input('updatedBy', sql.NVarChar, updatedBy)
                .query(`
                    MERGE FormsConfig AS target
                    USING (SELECT @key AS ConfigKey) AS source
                    ON target.ConfigKey = source.ConfigKey
                    WHEN MATCHED THEN
                        UPDATE SET ConfigValue = @value, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
                    WHEN NOT MATCHED THEN
                        INSERT (ConfigKey, ConfigValue, UpdatedBy)
                        VALUES (@key, @value, @updatedBy);
                `);
            return true;
        } catch (error) {
            console.error(`Error updating config ${key}:`, error.message);
            throw error;
        }
    }

    // ─── OAuth Token ──────────────────────────────────────────────────────────

    async getAccessToken() {
        const now = Date.now();
        if (this._accessToken && this._tokenExpiry && now < this._tokenExpiry - 60000) {
            return this._accessToken;
        }

        const tenantId = await this.getConfig('TENANT_ID');
        const clientId = await this.getConfig('CLIENT_ID');
        const clientSecret = await this.getConfig('CLIENT_SECRET');

        if (!tenantId || !clientId || !clientSecret) {
            throw new Error('Missing Azure AD credentials (TENANT_ID, CLIENT_ID, CLIENT_SECRET)');
        }

        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default'
        });

        const response = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            params.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        this._accessToken = response.data.access_token;
        this._tokenExpiry = now + (response.data.expires_in * 1000);
        return this._accessToken;
    }

    // ─── Test Connection ──────────────────────────────────────────────────────

    async testConnection() {
        try {
            this._accessToken = null;
            this._tokenExpiry = null;

            const token = await this.getAccessToken();
            const response = await axios.get('https://graph.microsoft.com/v1.0/organization', {
                headers: { Authorization: `Bearer ${token}` }
            });

            const org = response.data.value?.[0];
            return {
                success: true,
                message: 'Conexión exitosa',
                organization: org?.displayName || 'Unknown',
                tenantId: org?.id
            };
        } catch (error) {
            const errMsg = error.response?.data?.error_description
                || error.response?.data?.error?.message
                || error.message;
            return { success: false, message: errMsg, error: error.toString() };
        }
    }

    // ─── Excel-based Forms API ────────────────────────────────────────────────

    /**
     * Get Excel workbook info from config
     */
    async getExcelConfig() {
        const [driveId, itemId, sheetName, ownerUserId] = await Promise.all([
            this.getConfig('EXCEL_DRIVE_ID'),
            this.getConfig('EXCEL_ITEM_ID'),
            this.getConfig('EXCEL_SHEET_NAME'),
            this.getConfig('EXCEL_OWNER_USER_ID')
        ]);
        return { driveId, itemId, sheetName: sheetName || 'Sheet1', ownerUserId };
    }

    /**
     * Convert Excel serial date number to JavaScript Date
     * Excel dates are stored as days since Jan 1, 1900
     */
    excelDateToJSDate(serial) {
        if (!serial || typeof serial !== 'number') return null;
        // Excel's epoch starts at Jan 1, 1900 (with a leap year bug for 1900)
        const utcDays = Math.floor(serial - 25569); // 25569 = days from 1900-01-01 to 1970-01-01
        const utcValue = utcDays * 86400; // seconds
        const dateInfo = new Date(utcValue * 1000);
        // Add fractional day for time
        const fractionalDay = serial - Math.floor(serial);
        const totalSeconds = Math.round(86400 * fractionalDay);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        // El número serial asume que las fechas están en tiempo local. Obtenemos un pseudo-UTC y lo arreglamos con el offset
        const d = new Date(Date.UTC(
            dateInfo.getUTCFullYear(),
            dateInfo.getUTCMonth(),
            dateInfo.getUTCDate(),
            hours, minutes, seconds
        ));

        // Sumamos 6 horas porque los datos en Excel vienen en Timezone Costa Rica (UTC-6) 
        // y queremos su equivalente real en tiempo absoluto (UTC)
        d.setUTCHours(d.getUTCHours() + 6);
        return d;
    }

    /**
     * Parse a date value that could be an Excel serial number or a string
     */
    parseDate(value) {
        if (!value && value !== 0) return null;
        if (typeof value === 'number') return this.excelDateToJSDate(value);
        if (typeof value === 'string' && value.trim()) {
            // Intentar forzar el timezone local (Costa Rica) si el string no especifica uno
            // Microsoft Forms exporta en tiempo local
            let stringVal = value;
            if (!stringVal.includes('Z') && !stringVal.includes('+') && !stringVal.includes('-0')) {
                stringVal = stringVal + ' GMT-0600';
            }
            const d = new Date(stringVal);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    /**
     * Get all form responses from the Excel file in OneDrive
     * @param {string} formIdEntry - Form ID (used for config lookup)
     * @param {string} updatedSince - ISO date for incremental sync
     */
    async getFormResponses(formIdEntry, updatedSince = null) {
        const token = await this.getAccessToken();
        const { driveId, itemId, sheetName } = await this.getExcelConfig();

        if (!driveId || !itemId) {
            throw new Error('Excel config not set. Run setup to configure EXCEL_DRIVE_ID and EXCEL_ITEM_ID');
        }

        // Read all data from the Excel sheet
        const rangeR = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange?$select=values`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const values = rangeR.data.values;
        if (!values || values.length < 2) return [];

        const headers = values[0];
        const rows = values.slice(1);

        // Convert rows to response objects
        const responses = rows
            .filter(row => row.some(cell => cell !== '' && cell !== null))
            .map((row, idx) => {
                const obj = {};
                headers.forEach((h, i) => {
                    obj[h] = row[i] ?? '';
                });
                const submittedDate = this.parseDate(
                    obj['Hora de inicio'] || obj['Start time'] || obj['Fecha'] || null
                );
                const endDate = this.parseDate(
                    obj['Hora de finalización'] || obj['Completion time'] || null
                );
                return {
                    id: `excel_row_${idx + 2}`, // Row number as ID
                    _rowIndex: idx + 2,
                    _rawRow: obj,
                    submittedDateTime: submittedDate ? submittedDate.toISOString() : null,
                    lastModifiedDateTime: endDate ? endDate.toISOString() : null,
                    responder: {
                        email: obj['Correo electrónico'] || obj['Email'] || null,
                        displayName: obj['Nombre'] || obj['Name'] || null
                    },
                    answers: obj
                };
            });

        // Filter by date if incremental sync
        if (updatedSince) {
            const since = new Date(updatedSince);
            return responses.filter(r => {
                if (!r.submittedDateTime) return true; // Include if no date
                return new Date(r.submittedDateTime) > since;
            });
        }

        return responses;

    }

    /**
     * Get form details from FormsSources table by sourceId
     */
    async getFormDetails(sourceId) {
        const pool = await getFormsPool();
        const result = await pool.request()
            .input('id', sql.Int, sourceId)
            .query('SELECT * FROM FormsSources WHERE SourceID = @id');
        return result.recordset[0] || null;
    }

    /**
     * Resolve DriveId and ItemId from a SharePoint/OneDrive Excel URL
     * Supports URLs like:
     *   https://xxx-my.sharepoint.com/personal/user/_layouts/15/Doc.aspx?sourcedoc={GUID}
     *   https://xxx-my.sharepoint.com/personal/user/_layouts/15/AccessDenied.aspx?Source=...sourcedoc%3D%257BGUID%257D
     *   https://xxx-my.sharepoint.com/:x:/r/personal/user/...
     * 
     * Uses three resolution strategies:
     *   1. User drive + item GUID lookup (tries UPN from URL, then ownerEmail)
     *   2. Shares API fallback (works with sharing URLs)
     *   3. Personal site drive lookup (extracts personal folder from URL)
     */
    async resolveExcelFromUrl(excelUrl, ownerEmail) {
        const token = await this.getAccessToken();

        // Extract item GUID from URL (handles both encoded and plain formats)
        let itemGuid = null;

        // Try direct sourcedoc={GUID} pattern
        const directMatch = excelUrl.match(/sourcedoc[=%{]+([0-9A-Fa-f-]{36})/i);
        if (directMatch) {
            itemGuid = directMatch[1].replace(/-/g, '').toUpperCase();
            // Reformat as GUID with dashes
            itemGuid = `${itemGuid.slice(0, 8)}-${itemGuid.slice(8, 12)}-${itemGuid.slice(12, 16)}-${itemGuid.slice(16, 20)}-${itemGuid.slice(20)}`;
        }

        // Try URL-encoded pattern %257B = %7B = {
        if (!itemGuid) {
            const decoded = decodeURIComponent(decodeURIComponent(excelUrl));
            const decodedMatch = decoded.match(/sourcedoc[=\{]+([0-9A-Fa-f-]{36})/i);
            if (decodedMatch) itemGuid = decodedMatch[1];
        }

        if (!itemGuid) {
            throw new Error('No se pudo extraer el ID del archivo de la URL. Asegúrese de usar la URL del Excel en SharePoint/OneDrive.');
        }

        // Extract personal site folder from URL (e.g. /personal/jjalonso_rosti_cr/)
        // This helps us derive the UPN even if ownerEmail doesn't match Azure AD
        let personalFolder = null;
        let derivedUpn = null;
        const personalMatch = excelUrl.match(/\/personal\/([^/]+)/i);
        if (personalMatch) {
            personalFolder = personalMatch[1];
            // Convert "jjalonso_rosti_cr" → "jjalonso@rosti.cr"
            // SharePoint replaces @ with _ and . with _ in the folder name
            // Pattern: user_domain_tld → user@domain.tld
            const parts = personalFolder.split('_');
            if (parts.length >= 3) {
                // Last part is TLD, second-to-last is domain, rest is username
                const tld = parts[parts.length - 1];
                const domain = parts[parts.length - 2];
                const user = parts.slice(0, parts.length - 2).join('_');
                derivedUpn = `${user}@${domain}.${tld}`;
            }
        }

        // Extract SharePoint hostname for later use
        let spHostname = null;
        try {
            spHostname = new URL(excelUrl).hostname;
        } catch (e) { /* ignore */ }

        // Build list of emails to try (deduplicated)
        const emailsToTry = [];
        if (derivedUpn) emailsToTry.push(derivedUpn);
        if (ownerEmail && !emailsToTry.includes(ownerEmail.toLowerCase())) emailsToTry.push(ownerEmail.toLowerCase());

        // ── Strategy 1: User drive + item GUID ──────────────────────────────────
        let strategy1Err = null;
        for (const email of emailsToTry) {
            try {
                console.log(`🔍 Strategy 1: Trying user "${email}" for GUID ${itemGuid}...`);
                const userR = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${email}?$select=id,userPrincipalName`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const userId = userR.data.id;

                const fileR = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${userId}/drive/items/${itemGuid}?$select=id,name,parentReference`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const driveId = fileR.data.parentReference?.driveId;
                const itemId = fileR.data.id;

                let sheetName = 'Sheet1';
                try {
                    const sheetsR = await axios.get(
                        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    sheetName = sheetsR.data.value?.[0]?.name || 'Sheet1';
                } catch (e) { /* keep default */ }

                console.log(`✅ Resolved via user "${email}": DriveId=${driveId?.substring(0, 20)}...`);
                return { driveId, itemId, sheetName, fileName: fileR.data.name };
            } catch (err) {
                strategy1Err = err;
                console.warn(`⚠️ Strategy 1 failed for "${email}": ${err.response?.status || err.message}`);
            }
        }

        // ── Strategy 2: Shares API fallback ─────────────────────────────────────
        let strategy2Err = null;
        try {
            // Build multiple URL variants for the Shares API
            const urlVariants = new Set();
            urlVariants.add(excelUrl);                    // Original full URL
            urlVariants.add(excelUrl.split('&')[0]);      // URL up to first &

            // If it's a _layouts/15 URL, try constructing a direct file URL
            if (spHostname && personalFolder) {
                // Try: https://hostname/personal/folder/Documents/... format
                const basePersonalUrl = `https://${spHostname}/personal/${personalFolder}`;
                urlVariants.add(basePersonalUrl);

                // If the URL contains a file path after /Documents/
                const docPathMatch = excelUrl.match(/\/Documents\/([^?&]+)/i);
                if (docPathMatch) {
                    urlVariants.add(`${basePersonalUrl}/Documents/${docPathMatch[1]}`);
                }
            }

            // If URL is an AccessDenied redirect, extract the actual Doc.aspx URL from Source param
            if (excelUrl.includes('AccessDenied')) {
                try {
                    const url = new URL(excelUrl);
                    const source = url.searchParams.get('Source');
                    if (source) {
                        const decodedSource = decodeURIComponent(source);
                        urlVariants.add(decodedSource);
                        urlVariants.add(decodedSource.split('&')[0]);
                    }
                } catch (e) { /* ignore */ }
            }

            let lastErr = null;
            for (const urlVariant of urlVariants) {
                try {
                    const encodedUrl = Buffer.from(urlVariant).toString('base64url');
                    const shareToken = `u!${encodedUrl}`;

                    const shareR = await axios.get(
                        `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem?$select=id,name,parentReference`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const driveId = shareR.data.parentReference?.driveId;
                    const itemId = shareR.data.id;

                    if (!driveId || !itemId) continue;

                    let sheetName = 'Sheet1';
                    try {
                        const sheetsR = await axios.get(
                            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        sheetName = sheetsR.data.value?.[0]?.name || 'Sheet1';
                    } catch (e) { /* keep default */ }

                    console.log(`✅ Resolved via Shares API: DriveId=${driveId?.substring(0, 20)}...`);
                    return { driveId, itemId, sheetName, fileName: shareR.data.name };
                } catch (e) {
                    lastErr = e;
                }
            }

            strategy2Err = lastErr;
        } catch (sharesErr) {
            strategy2Err = sharesErr;
        }

        // ── Strategy 3: Personal site drive lookup ──────────────────────────────
        // Use the SharePoint site URL to find the drive directly
        if (spHostname && personalFolder) {
            try {
                console.log(`🔍 Strategy 3: Looking up personal site drive for "${personalFolder}"...`);
                // Get site by path
                const myHost = spHostname; // e.g. rostipollocr-my.sharepoint.com
                const siteR = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${myHost}:/personal/${personalFolder}?$select=id`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const siteId = siteR.data.id;

                // Get the default drive for this site
                const drivesR = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name&$top=5`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                // Search for the item by GUID in each drive
                for (const drive of drivesR.data.value || []) {
                    try {
                        const fileR = await axios.get(
                            `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${itemGuid}?$select=id,name,parentReference`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        const driveId = fileR.data.parentReference?.driveId || drive.id;
                        const itemId = fileR.data.id;

                        let sheetName = 'Sheet1';
                        try {
                            const sheetsR = await axios.get(
                                `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`,
                                { headers: { Authorization: `Bearer ${token}` } }
                            );
                            sheetName = sheetsR.data.value?.[0]?.name || 'Sheet1';
                        } catch (e) { /* keep default */ }

                        console.log(`✅ Resolved via personal site drive: DriveId=${driveId?.substring(0, 20)}...`);
                        return { driveId, itemId, sheetName, fileName: fileR.data.name };
                    } catch (e) {
                        // Item not in this drive, try next
                    }
                }
            } catch (siteErr) {
                console.warn(`⚠️ Strategy 3 failed: ${siteErr.response?.status || siteErr.message}`);
            }
        }

        // ── All strategies failed ───────────────────────────────────────────────
        const s1msg = strategy1Err?.response?.data?.error?.message || strategy1Err?.message || 'desconocido';
        const s2msg = strategy2Err?.response?.data?.error?.message || strategy2Err?.message || 'desconocido';
        throw new Error(
            `No se pudo resolver el archivo Excel (GUID: ${itemGuid}).\n` +
            `• Estrategia 1 (usuario): ${s1msg}\n` +
            `• Estrategia 2 (Shares API): ${s2msg}\n` +
            `• Estrategia 3 (sitio personal): ${personalFolder ? 'falló' : 'no aplicable'}\n` +
            `Verifique que el correo del propietario sea correcto y que la URL del Excel sea válida.`
        );
    }

    /**
     * Get form responses from Excel for a specific FormsSources entry
     */
    async getFormResponsesBySource(source, updatedSince = null) {
        const token = await this.getAccessToken();
        const { DriveId: driveId, ItemId: itemId, SheetName: sheetName } = source;

        if (!driveId || !itemId) {
            throw new Error(`Formulario "${source.Alias}" no tiene DriveId/ItemId resueltos. Use el botón Resolver primero.`);
        }

        const rangeR = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(sheetName || 'Sheet1')}/usedRange?$select=values`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const values = rangeR.data.values;
        if (!values || values.length < 2) return [];

        const headers = values[0];
        const rows = values.slice(1);

        const responses = rows
            .filter(row => row.some(cell => cell !== '' && cell !== null))
            .map((row, idx) => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
                const submittedDate = this.parseDate(obj['Hora de inicio'] || obj['Start time'] || obj['Fecha'] || null);
                const endDate = this.parseDate(obj['Hora de finalización'] || obj['Completion time'] || null);
                return {
                    id: `src${source.SourceID}_row_${idx + 2}`,
                    _rowIndex: idx + 2,
                    _rawRow: obj,
                    submittedDateTime: submittedDate ? submittedDate.toISOString() : null,
                    lastModifiedDateTime: endDate ? endDate.toISOString() : null,
                    responder: {
                        email: obj['Correo electrónico'] || obj['Email'] || null,
                        displayName: obj['Nombre'] || obj['Name'] || null
                    },
                    answers: obj
                };
            });

        if (updatedSince) {
            const since = new Date(updatedSince);
            return responses.filter(r => !r.submittedDateTime || new Date(r.submittedDateTime) > since);
        }

        return responses;
    }

    /**
     * Refresh the Excel file
     * Note: Forms updates the Excel automatically
     */
    async refreshExcel() {
        return true;
    }
}

module.exports = new FormsService();

