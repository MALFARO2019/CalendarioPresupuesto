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
        return new Date(Date.UTC(
            dateInfo.getUTCFullYear(),
            dateInfo.getUTCMonth(),
            dateInfo.getUTCDate(),
            hours, minutes, seconds
        ));
    }

    /**
     * Parse a date value that could be an Excel serial number or a string
     */
    parseDate(value) {
        if (!value && value !== 0) return null;
        if (typeof value === 'number') return this.excelDateToJSDate(value);
        if (typeof value === 'string' && value.trim()) {
            const d = new Date(value);
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
     * Uses two resolution strategies:
     *   1. User drive + item GUID lookup
     *   2. Shares API fallback (works even if email is wrong)
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

        // ── Strategy 1: User drive + item GUID ──────────────────────────────────
        try {
            // Get user ID for owner
            const userR = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${ownerEmail}?$select=id`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const userId = userR.data.id;

            // Get file info using the GUID as item ID
            const fileR = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${userId}/drive/items/${itemGuid}?$select=id,name,parentReference`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const driveId = fileR.data.parentReference?.driveId;
            const itemId = fileR.data.id;

            // Get first sheet name
            let sheetName = 'Sheet1';
            try {
                const sheetsR = await axios.get(
                    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                sheetName = sheetsR.data.value?.[0]?.name || 'Sheet1';
            } catch (e) { /* keep default */ }

            return { driveId, itemId, sheetName, fileName: fileR.data.name };
        } catch (directErr) {
            console.warn(`⚠️ Direct resolve failed (${directErr.response?.status || directErr.message}), trying Shares API...`);
        }

        // ── Strategy 2: Shares API fallback (works with any URL) ────────────────
        try {
            // Try multiple URL variants for the Shares API
            const urlVariants = [
                excelUrl,  // Original full URL
                excelUrl.split('&')[0],  // URL up to first &
            ];

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

                    // Get first sheet name
                    let sheetName = 'Sheet1';
                    try {
                        const sheetsR = await axios.get(
                            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        sheetName = sheetsR.data.value?.[0]?.name || 'Sheet1';
                    } catch (e) { /* keep default */ }

                    return { driveId, itemId, sheetName, fileName: shareR.data.name };
                } catch (e) {
                    lastErr = e;
                }
            }

            throw lastErr || new Error('Shares API: todas las variantes fallaron');
        } catch (sharesErr) {
            throw new Error(`No se pudo resolver el archivo Excel. Error directo: usuario no encontrado. Error Shares API: ${sharesErr.response?.data?.error?.message || sharesErr.message}`);
        }
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

