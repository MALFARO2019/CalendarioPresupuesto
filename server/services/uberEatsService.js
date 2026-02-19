/**
 * uberEatsService.js
 * Uber Eats Reporting API service — OAuth 2.0 client_credentials flow
 * Pattern mirrors invgateService.js
 */
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { getUberEatsPool, sql } = require('../uberEatsDb');

const UBER_AUTH_URL = 'https://auth.uber.com/oauth/v2/token';
const UBER_API_BASE = 'https://api.uber.com/v1';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
function getEncKey() {
    const k = process.env.DB_ENCRYPTION_KEY || 'default-key-change-in-production-32';
    return Buffer.from(k.padEnd(32, '0').substring(0, 32));
}

function encryptValue(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncKey(), iv);
    return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decryptValue(encrypted) {
    if (!encrypted) return '';
    const parts = encrypted.split(':');
    if (parts.length !== 2) return encrypted;
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncKey(), Buffer.from(parts[0], 'hex'));
    return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
}

class UberEatsService {
    constructor() {
        this.clientId = null;
        this.clientSecret = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.initialized = false;
    }

    // ─── Config helpers ───────────────────────────────────
    async getConfig(key) {
        try {
            const pool = await getUberEatsPool();
            const result = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT ConfigValue FROM UberEatsConfig WHERE ConfigKey = @key');
            return result.recordset[0]?.ConfigValue ?? null;
        } catch { return null; }
    }

    async setConfig(key, value) {
        const pool = await getUberEatsPool();
        await pool.request()
            .input('key', sql.NVarChar, key)
            .input('val', sql.NVarChar, value)
            .query(`
                MERGE UberEatsConfig AS t
                USING (SELECT @key AS k) AS s ON t.ConfigKey = s.k
                WHEN MATCHED THEN UPDATE SET ConfigValue = @val, FechaModificacion = GETDATE()
                WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue) VALUES (@key, @val);
            `);
    }

    // ─── Initialize from DB config ────────────────────────
    async initialize() {
        try {
            const pool = await getUberEatsPool();
            const result = await pool.request().query(`
                SELECT ConfigKey, ConfigValue FROM UberEatsConfig
                WHERE ConfigKey IN ('CLIENT_ID', 'CLIENT_SECRET')
            `);
            const cfg = {};
            result.recordset.forEach(r => { cfg[r.ConfigKey] = r.ConfigValue; });

            this.clientId = cfg.CLIENT_ID || null;
            const encSecret = cfg.CLIENT_SECRET || null;
            this.clientSecret = encSecret ? decryptValue(encSecret) : null;
            this.initialized = !!(this.clientId && this.clientSecret);

            if (this.initialized) {
                console.log('✅ UberEats Service initialized (clientId:', this.clientId.substring(0, 8) + '...)');
            } else {
                console.log('⚠️ UberEats Service not configured (missing CLIENT_ID or CLIENT_SECRET)');
            }
            return this.initialized;
        } catch (err) {
            console.error('❌ UberEats Service init error:', err.message);
            this.initialized = false;
            return false;
        }
    }

    // ─── OAuth2 token ─────────────────────────────────────
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return this.accessToken;
        }
        console.log('🔑 Requesting Uber Eats OAuth token...');
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            scope: 'eats.report'
        });
        const { data } = await axios.post(UBER_AUTH_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000);
        console.log('✅ Uber Eats token obtained, expires in', data.expires_in, 's');
        return this.accessToken;
    }

    // ─── Step 1: Request report ───────────────────────────
    async requestReport(storeIds, startDate, endDate, reportType = 'FINANCE_SUMMARY_REPORT') {
        const token = await this.getAccessToken();
        console.log(`📊 Requesting ${reportType} for ${storeIds.length} stores [${startDate} → ${endDate}]`);
        const { data } = await axios.post(`${UBER_API_BASE}/eats/report`, {
            report_type: reportType,
            store_ids: storeIds,
            time_range: { start_date: startDate, end_date: endDate }
        }, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        console.log(`📋 Report requested: ${data.report_id}`);
        return data.report_id;
    }

    // ─── Step 2: Poll until COMPLETED ─────────────────────
    async waitForReport(reportId, maxWaitMs = 600000) {
        const token = await this.getAccessToken();
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const { data } = await axios.get(`${UBER_API_BASE}/eats/report/${reportId}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15000
            });
            console.log(`  ↳ Report ${reportId} status: ${data.status}`);
            if (data.status === 'COMPLETED') return true;
            if (data.status === 'FAILED') throw new Error(`Report generation failed: ${reportId}`);
            await new Promise(r => setTimeout(r, 30000));
        }
        throw new Error('Timeout esperando reporte Uber Eats');
    }

    // ─── Step 3: Download CSV ─────────────────────────────
    async downloadReportCsv(reportId) {
        const token = await this.getAccessToken();
        // Get signed URL
        const { data: urlData } = await axios.post(
            `${UBER_API_BASE}/eats/report/${reportId}/url`, {},
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        // Download CSV
        const { data: csvText } = await axios.get(urlData.url, {
            responseType: 'text',
            timeout: 60000
        });
        return parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    }

    // ─── Save records by report type ─────────────────────────
    async saveRecords(records, reportType, syncDate) {
        if (!records || records.length === 0) return 0;
        const pool = await getUberEatsPool();
        let saved = 0;

        // Helper: get column value trying multiple possible header names
        const col = (row, ...keys) => {
            for (const k of keys) {
                const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
                if (v !== undefined && v !== '') return v;
            }
            return null;
        };
        const num = v => parseFloat(v) || 0;
        const dt = v => { try { return v ? new Date(v) : null; } catch { return null; } };

        for (const row of records) {
            try {
                if (reportType === 'FINANCE_SUMMARY_REPORT' || reportType === 'PAYMENT_DETAILS_REPORT') {
                    await pool.request()
                        .input('oid', sql.NVarChar(255), col(row, 'order_id', 'Order ID', 'OrderId'))
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('fec', sql.DateTime2, dt(col(row, 'order_date', 'Order Date', 'Date')))
                        .input('bru', sql.Decimal(18, 2), num(col(row, 'gross_sales', 'Gross Sales', 'order_value')))
                        .input('net', sql.Decimal(18, 2), num(col(row, 'net_payout', 'Net Payout', 'net_amount')))
                        .input('com', sql.Decimal(18, 2), num(col(row, 'uber_fee', 'Uber Fee', 'uber_commission')))
                        .input('des', sql.Decimal(18, 2), num(col(row, 'discount_total', 'Discount', 'promo_discount')))
                        .input('imp', sql.Decimal(18, 2), num(col(row, 'tax_amount', 'Tax', 'sales_tax')))
                        .input('mon', sql.NVarChar(10), col(row, 'currency', 'Currency') || 'CRC')
                        .input('ent', sql.NVarChar(50), col(row, 'delivery_type', 'Delivery Type'))
                        .input('pag', sql.NVarChar(50), col(row, 'payment_method', 'Payment Method'))
                        .input('fue', sql.NVarChar(100), reportType)
                        .query(`
                            MERGE UberEatsOrdenes AS t
                            USING (SELECT @oid AS OrderId) AS s ON t.OrderId = s.OrderId
                            WHEN NOT MATCHED THEN INSERT
                                (OrderId,StoreId,NombreLocal,FechaPedido,VentaBruta,NetoPagado,ComisionUber,Descuentos,Impuestos,Moneda,TipoEntrega,MetodoPago,FuenteReporte)
                            VALUES (@oid,@sid,@nom,@fec,@bru,@net,@com,@des,@imp,@mon,@ent,@pag,@fue)
                            WHEN MATCHED THEN UPDATE SET VentaBruta=@bru,NetoPagado=@net,ComisionUber=@com,FechaSync=GETDATE();
                        `);

                } else if (reportType === 'ORDER_HISTORY') {
                    await pool.request()
                        .input('oid', sql.NVarChar(255), col(row, 'order_id', 'Order ID'))
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('fpd', sql.DateTime2, dt(col(row, 'order_date', 'Ordered At')))
                        .input('fen', sql.DateTime2, dt(col(row, 'delivered_at', 'Delivery Time')))
                        .input('est', sql.NVarChar(50), col(row, 'status', 'Order Status'))
                        .input('tip', sql.NVarChar(50), col(row, 'delivery_type', 'Order Type'))
                        .input('sub', sql.Decimal(18, 2), num(col(row, 'subtotal', 'Cart Subtotal')))
                        .input('tot', sql.Decimal(18, 2), num(col(row, 'total', 'Total Charged')))
                        .input('pro', sql.Decimal(18, 2), num(col(row, 'tip', 'Courier Tip')))
                        .input('mon', sql.NVarChar(10), col(row, 'currency', 'Currency') || 'CRC')
                        .input('cli', sql.NVarChar(255), col(row, 'customer_name', 'Customer Name'))
                        .input('its', sql.Int, parseInt(col(row, 'items_count', 'Number of Items')) || 0)
                        .query(`
                            MERGE UberEatsHistorialOrdenes AS t
                            USING (SELECT @oid AS OrderId) AS s ON t.OrderId = s.OrderId
                            WHEN NOT MATCHED THEN INSERT
                                (OrderId,StoreId,NombreLocal,FechaPedido,FechaEntrega,Estado,TipoEntrega,SubtotalCliente,TotalCliente,PropinaConductor,Moneda,NombreCliente,CantidadItems)
                            VALUES (@oid,@sid,@nom,@fpd,@fen,@est,@tip,@sub,@tot,@pro,@mon,@cli,@its)
                            WHEN MATCHED THEN UPDATE SET Estado=@est,FechaSync=GETDATE();
                        `);

                } else if (reportType === 'ADJUSTMENT_REPORT') {
                    await pool.request()
                        .input('aid', sql.NVarChar(255), col(row, 'adjustment_id', 'Adjustment ID') || col(row, 'order_id'))
                        .input('oid', sql.NVarChar(255), col(row, 'order_id', 'Order ID'))
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('fec', sql.DateTime2, dt(col(row, 'adjustment_date', 'Date')))
                        .input('tip', sql.NVarChar(100), col(row, 'adjustment_type', 'Type', 'Reason Type'))
                        .input('mon', sql.Decimal(18, 2), num(col(row, 'amount', 'Adjustment Amount')))
                        .input('cur', sql.NVarChar(10), col(row, 'currency', 'Currency') || 'CRC')
                        .input('mot', sql.NVarChar(sql.MAX), col(row, 'reason', 'Description', 'Notes'))
                        .query(`
                            MERGE UberEatsAjustes AS t
                            USING (SELECT @aid AS AjusteId) AS s ON t.AjusteId = s.AjusteId
                            WHEN NOT MATCHED THEN INSERT
                                (AjusteId,OrderId,StoreId,NombreLocal,FechaAjuste,TipoAjuste,Monto,Moneda,Motivo)
                            VALUES (@aid,@oid,@sid,@nom,@fec,@tip,@mon,@cur,@mot)
                            WHEN MATCHED THEN UPDATE SET Monto=@mon,FechaSync=GETDATE();
                        `);

                } else if (reportType === 'DOWNTIME_REPORT') {
                    await pool.request()
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('ini', sql.DateTime2, dt(col(row, 'start_time', 'Start Time', 'From')))
                        .input('fin', sql.DateTime2, dt(col(row, 'end_time', 'End Time', 'To')))
                        .input('dur', sql.Int, parseInt(col(row, 'duration_minutes', 'Duration (min)')) || 0)
                        .input('tip', sql.NVarChar(100), col(row, 'downtime_type', 'Type', 'Reason'))
                        .input('mot', sql.NVarChar(255), col(row, 'reason', 'Notes'))
                        .query(`
                            MERGE UberEatsDowntime AS t
                            USING (SELECT @sid AS StoreId, @ini AS FechaInicio) AS s
                            ON t.StoreId=s.StoreId AND t.FechaInicio=s.FechaInicio
                            WHEN NOT MATCHED THEN INSERT
                                (StoreId,NombreLocal,FechaInicio,FechaFin,DuracionMinutos,TipoDowntime,Motivo)
                            VALUES (@sid,@nom,@ini,@fin,@dur,@tip,@mot)
                            WHEN MATCHED THEN UPDATE SET FechaFin=@fin,DuracionMinutos=@dur,FechaSync=GETDATE();
                        `);

                } else if (reportType === 'FEEDBACK_REPORT') {
                    await pool.request()
                        .input('fid', sql.NVarChar(255), col(row, 'feedback_id', 'Feedback ID') || col(row, 'order_id'))
                        .input('oid', sql.NVarChar(255), col(row, 'order_id', 'Order ID'))
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('fec', sql.DateTime2, dt(col(row, 'feedback_date', 'Date')))
                        .input('cal', sql.Decimal(3, 2), parseFloat(col(row, 'rating', 'Rating', 'Score')) || null)
                        .input('com', sql.NVarChar(sql.MAX), col(row, 'comment', 'Review', 'Feedback Text'))
                        .input('tip', sql.NVarChar(100), col(row, 'feedback_type', 'Type', 'Category'))
                        .query(`
                            MERGE UberEatsFeedback AS t
                            USING (SELECT @fid AS FeedbackId) AS s ON t.FeedbackId=s.FeedbackId
                            WHEN NOT MATCHED THEN INSERT
                                (FeedbackId,OrderId,StoreId,NombreLocal,FechaFeedback,Calificacion,Comentario,TipoFeedback)
                            VALUES (@fid,@oid,@sid,@nom,@fec,@cal,@com,@tip)
                            WHEN MATCHED THEN UPDATE SET Calificacion=@cal,FechaSync=GETDATE();
                        `);

                } else if (reportType === 'MENU_ITEM_INSIGHTS') {
                    await pool.request()
                        .input('sid', sql.NVarChar(255), col(row, 'store_id', 'Store ID'))
                        .input('nom', sql.NVarChar(255), col(row, 'store_name', 'Store Name'))
                        .input('fec', sql.Date, dt(col(row, 'date', 'Date', 'Report Date')))
                        .input('iid', sql.NVarChar(255), col(row, 'item_id', 'Item ID', 'Menu Item ID'))
                        .input('inm', sql.NVarChar(255), col(row, 'item_name', 'Item Name', 'Menu Item'))
                        .input('qty', sql.Int, parseInt(col(row, 'quantity_sold', 'Units Sold')) || 0)
                        .input('rev', sql.Decimal(18, 2), num(col(row, 'total_revenue', 'Revenue', 'Gross Sales')))
                        .input('cur', sql.NVarChar(10), col(row, 'currency', 'Currency') || 'CRC')
                        .query(`
                            MERGE UberEatsMenuInsights AS t
                            USING (SELECT @sid AS StoreId, @fec AS Fecha, @iid AS ItemId) AS s
                            ON t.StoreId=s.StoreId AND t.Fecha=s.Fecha AND t.ItemId=s.ItemId
                            WHEN NOT MATCHED THEN INSERT
                                (StoreId,NombreLocal,Fecha,ItemId,NombreItem,CantidadVendida,IngresoTotal,Moneda)
                            VALUES (@sid,@nom,@fec,@iid,@inm,@qty,@rev,@cur)
                            WHEN MATCHED THEN UPDATE SET CantidadVendida=@qty,IngresoTotal=@rev,FechaSync=GETDATE();
                        `);
                } else {
                    console.warn(`⚠️ saveRecords: unhandled reportType '${reportType}', skipping row`);
                }
                saved++;
            } catch (rowErr) {
                console.error('  ⚠️ Error saving row:', rowErr.message);
            }
        }
        return saved;
    }

    // ─── Main sync orchestration ──────────────────────────
    async syncDailyReports(triggeredBy = 'MANUAL') {
        await this.initialize();
        if (!this.initialized) throw new Error('Uber Eats API no configurada. Configure CLIENT_ID y CLIENT_SECRET.');

        // Get active stores
        const pool = await getUberEatsPool();
        const storesResult = await pool.request().query(
            `SELECT StoreId FROM UberEatsStores WHERE Activo = 1`
        );
        const storeIds = storesResult.recordset.map(r => r.StoreId);
        if (storeIds.length === 0) throw new Error('No hay stores configurados. Agrega al menos un Store ID.');

        const daysBack = parseInt(await this.getConfig('DAYS_BACK') || '1');
        const d = new Date();
        d.setDate(d.getDate() - daysBack);
        const dateStr = d.toISOString().split('T')[0];

        // Read report types from DB config (comma-separated)
        const reportTypesRaw = await this.getConfig('REPORT_TYPES') || 'FINANCE_SUMMARY_REPORT';
        const reportTypes = reportTypesRaw.split(',').map(t => t.trim()).filter(Boolean);
        console.log(`📊 UberEats sync for ${dateStr}: [${reportTypes.join(', ')}]`);
        let totalSaved = 0;

        for (const reportType of reportTypes) {
            let logStatus = 'SUCCESS';
            let logMsg = '';
            let reportId = null;
            let saved = 0;
            try {
                reportId = await this.requestReport(storeIds, dateStr, dateStr, reportType);
                await this.waitForReport(reportId);
                const records = await this.downloadReportCsv(reportId);
                saved = await this.saveRecords(records, reportType, dateStr);
                totalSaved += saved;
                logMsg = `${saved} registros procesados`;
                console.log(`✅ ${reportType}: ${saved} records saved`);
            } catch (err) {
                logStatus = 'FAILED';
                logMsg = err.message;
                console.error(`❌ ${reportType} failed:`, err.message);
            }

            // Write log
            await pool.request()
                .input('syncDate', sql.Date, dateStr)
                .input('repType', sql.NVarChar(100), reportType)
                .input('repId', sql.NVarChar(255), reportId)
                .input('status', sql.NVarChar(50), logStatus)
                .input('count', sql.Int, saved)
                .input('msg', sql.NVarChar(sql.MAX), logMsg)
                .query(`
                    INSERT INTO UberEatsSyncLog
                        (FechaSync, ReportType, ReportId, Status, RegistrosProcesados, Mensaje)
                    VALUES (@syncDate, @repType, @repId, @status, @count, @msg)
                `);
        }

        // Update LAST_SYNC
        await this.setConfig('LAST_SYNC', new Date().toISOString());
        return { totalSaved, date: dateStr };
    }

    // ─── Test connection ──────────────────────────────────
    async testConnection() {
        try {
            await this.initialize();
            if (!this.initialized) {
                return { success: false, message: 'API no configurada. Guarda CLIENT_ID y CLIENT_SECRET primero.' };
            }
            this.accessToken = null;
            this.tokenExpiry = null;
            await this.getAccessToken();
            return { success: true, message: '✅ Conexión exitosa con Uber Eats API (token obtenido)' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
}

module.exports = new UberEatsService();
