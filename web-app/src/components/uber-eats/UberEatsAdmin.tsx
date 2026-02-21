/**
 * UberEatsAdmin.tsx
 * Admin panel for Uber Eats Reporting API configuration
 * Pattern mirrors InvgateAdmin.tsx
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings, Store, RefreshCw, Activity, CheckCircle,
    XCircle, Loader2, Plus, Trash2, Eye, EyeOff, AlertTriangle,
    TrendingUp, ShoppingBag, DollarSign, Percent, Clock
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ───────────────────────── types ──────────────────────────────
interface UberConfig {
    CLIENT_ID: { value: string | null; fechaModificacion: string | null };
    CLIENT_SECRET: { value: string | null; fechaModificacion: string | null };
    SYNC_ENABLED: { value: string | null };
    SYNC_HOUR: { value: string | null };
    DAYS_BACK: { value: string | null };
    LAST_SYNC: { value: string | null };
    REPORT_TYPES?: { value: string | null };
}
interface UberStore { Id: number; StoreId: string; Nombre: string; Activo: boolean; }
interface SyncLog { Id: number; FechaSync: string; ReportType: string; Status: string; RegistrosProcesados: number; Mensaje: string; FechaEjecucion: string; }
interface CronStatus { isActive: boolean; isRunning: boolean; schedule: string | null; }
interface DashboardData {
    periodo: { from: string; to: string };
    totales: { TotalOrdenes: number; VentaBruta: number; NetoPagado: number; ComisionUber: number; Descuentos: number; TicketPromedio: number; PorcentajeComision: number; } | null;
    porLocal: { StoreId: string; NombreLocal: string; Ordenes: number; VentaBruta: number; NetoPagado: number; TicketPromedio: number; }[];
    tendenciaDiaria: { Fecha: string; Ordenes: number; VentaBruta: number; NetoPagado: number; }[];
}

// ───────────────────────── helpers ────────────────────────────
function fmt(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toLocaleString('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
}
function fmtN(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toLocaleString('es-CR');
}

// Available Uber Eats report types
const ALL_REPORT_TYPES: { id: string; label: string; desc: string }[] = [
    { id: 'FINANCE_SUMMARY_REPORT', label: 'Resumen Financiero', desc: 'Ventas, comisiones, neto pagado por orden' },
    { id: 'PAYMENT_DETAILS_REPORT', label: 'Detalle de Pagos', desc: 'Desglose de pagos por transacción' },
    { id: 'ORDER_HISTORY', label: 'Historial de Órdenes', desc: 'Estado, tiempos y totales por orden' },
    { id: 'ADJUSTMENT_REPORT', label: 'Ajustes / Reembolsos', desc: 'Devoluciones y compensaciones' },
    { id: 'DOWNTIME_REPORT', label: 'Tiempo Fuera de Línea', desc: 'Períodos sin disponibilidad del restaurante' },
    { id: 'FEEDBACK_REPORT', label: 'Calificaciones', desc: 'Reseñas y puntuaciones de clientes' },
    { id: 'MENU_ITEM_INSIGHTS', label: 'Insights de Menú', desc: 'Ventas y rendimiento por ítem' },
];
export const UberEatsAdmin: React.FC = () => {
    const [tab, setTab] = useState<'config' | 'stores' | 'sync' | 'dashboard'>('config');

    // Config tab
    const [config, setConfig] = useState<Partial<UberConfig>>({});
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [syncEnabled, setSyncEnabled] = useState(false);
    const [syncHour, setSyncHour] = useState(3);
    const [daysBack, setDaysBack] = useState(1);
    const [reportTypes, setReportTypes] = useState<string[]>(['FINANCE_SUMMARY_REPORT']);
    const [configLoading, setConfigLoading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [configMsg, setConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [tokenStatus, setTokenStatus] = useState<{ hasClientId: boolean; hasSecretInDb: boolean; canDecrypt: boolean; canGetToken: boolean; tokenError: string | null } | null>(null);

    // Stores tab
    const [stores, setStores] = useState<UberStore[]>([]);
    const [storesLoading, setStoresLoading] = useState(false);
    const [newStoreId, setNewStoreId] = useState('');
    const [newStoreName, setNewStoreName] = useState('');
    const [storeMsg, setStoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Sync tab
    const [syncLog, setSyncLog] = useState<SyncLog[]>([]);
    const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Dashboard tab
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [dashLoading, setDashLoading] = useState(false);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // ── Load config ──────────────────────────────────────────
    const loadConfig = useCallback(async () => {
        setConfigLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/uber-eats/config`, { headers });
            const data: UberConfig = await res.json();
            setConfig(data);
            setClientId(data.CLIENT_ID?.value || '');
            setSyncEnabled(data.SYNC_ENABLED?.value === 'true');
            setSyncHour(parseInt(data.SYNC_HOUR?.value || '3'));
            setDaysBack(parseInt(data.DAYS_BACK?.value || '1'));
            const rts = data.REPORT_TYPES?.value || 'FINANCE_SUMMARY_REPORT';
            setReportTypes(rts.split(',').map((t: string) => t.trim()).filter(Boolean));
        } catch (e: any) {
            setConfigMsg({ type: 'error', text: e.message });
        } finally { setConfigLoading(false); }

        // Also check token status
        try {
            const tsRes = await fetch(`${API_BASE}/api/uber-eats/token-status`, { headers });
            if (tsRes.ok) setTokenStatus(await tsRes.json());
        } catch { }
    }, []);

    const saveConfig = async () => {
        setConfigSaving(true);
        setConfigMsg(null);
        try {
            const body: Record<string, unknown> = { clientId, syncEnabled, syncHour, daysBack, reportTypes: reportTypes.join(',') };
            if (clientSecret.trim()) body.clientSecret = clientSecret;
            console.log('[UberEats] Saving config:', { ...body, clientSecret: body.clientSecret ? '[SET]' : undefined });
            const res = await fetch(`${API_BASE}/api/uber-eats/config`, {
                method: 'POST', headers, body: JSON.stringify(body)
            });
            const data = await res.json();
            console.log('[UberEats] Save response:', res.status, data);
            if (!res.ok) throw new Error(data.error || 'Error al guardar');
            const parts: string[] = [];
            if (clientId) parts.push('Client ID');
            if (clientSecret.trim()) parts.push('Client Secret');
            parts.push('sync config');
            setConfigMsg({ type: 'success', text: `✅ Guardado: ${parts.join(', ')}` });
            setClientSecret('');
            await loadConfig(); // this also reloads token status
        } catch (e: any) {
            console.error('[UberEats] Save error:', e);
            setConfigMsg({ type: 'error', text: e.message || 'Error desconocido al guardar' });
        } finally { setConfigSaving(false); }
    };

    const testConnection = async () => {
        setTestLoading(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/api/uber-eats/test`, { method: 'POST', headers });
            const data = await res.json();
            setTestResult(data);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally { setTestLoading(false); }
    };

    // ── Load stores ──────────────────────────────────────────
    const loadStores = useCallback(async () => {
        setStoresLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/uber-eats/stores`, { headers });
            setStores(await res.json());
        } catch { } finally { setStoresLoading(false); }
    }, []);

    const addStore = async () => {
        if (!newStoreId.trim()) return;
        setStoreMsg(null);
        try {
            const res = await fetch(`${API_BASE}/api/uber-eats/stores`, {
                method: 'POST', headers,
                body: JSON.stringify({ storeId: newStoreId.trim(), nombre: newStoreName.trim() || newStoreId.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setNewStoreId('');
            setNewStoreName('');
            setStoreMsg({ type: 'success', text: 'Store agregado correctamente' });
            loadStores();
        } catch (e: any) {
            setStoreMsg({ type: 'error', text: e.message });
        }
    };

    const deleteStore = async (id: number) => {
        if (!confirm('¿Eliminar este store?')) return;
        try {
            await fetch(`${API_BASE}/api/uber-eats/stores/${id}`, { method: 'DELETE', headers });
            loadStores();
        } catch { }
    };

    const toggleStoreActive = async (store: UberStore) => {
        try {
            await fetch(`${API_BASE}/api/uber-eats/stores/${store.Id}`, {
                method: 'PUT', headers,
                body: JSON.stringify({ nombre: store.Nombre, activo: !store.Activo })
            });
            loadStores();
        } catch { }
    };

    // ── Load sync status ─────────────────────────────────────
    const loadSyncStatus = useCallback(async () => {
        setSyncLoading(true);
        try {
            const [statusRes, logRes] = await Promise.all([
                fetch(`${API_BASE}/api/uber-eats/sync-status`, { headers }),
                fetch(`${API_BASE}/api/uber-eats/sync-log?limit=15`, { headers })
            ]);
            const statusData = await statusRes.json();
            setCronStatus(statusData.cron);
            setLastSyncTime(statusData.lastSyncTime);
            setSyncLog(await logRes.json());
        } catch { } finally { setSyncLoading(false); }
    }, []);

    const triggerSync = async () => {
        if (!confirm('¿Iniciar sincronización manual ahora?')) return;
        setSyncing(true);
        try {
            await fetch(`${API_BASE}/api/uber-eats/sync`, { method: 'POST', headers, body: '{}' });
            setTimeout(() => loadSyncStatus(), 3000);
        } catch { } finally { setSyncing(false); }
    };

    // ── Load dashboard ───────────────────────────────────────
    const loadDashboard = useCallback(async () => {
        setDashLoading(true);
        try {
            const res = await fetch(
                `${API_BASE}/api/uber-eats/dashboard?from=${fromDate}&to=${toDate}`, { headers }
            );
            setDashboard(await res.json());
        } catch { } finally { setDashLoading(false); }
    }, [fromDate, toDate]);

    useEffect(() => { loadConfig(); }, []);
    useEffect(() => { if (tab === 'stores') loadStores(); }, [tab]);
    useEffect(() => { if (tab === 'sync') loadSyncStatus(); }, [tab]);
    useEffect(() => { if (tab === 'dashboard') loadDashboard(); }, [tab, fromDate, toDate]);

    // ── Tab button ───────────────────────────────────────────
    const TabBtn: React.FC<{ id: typeof tab; label: string; icon: React.ReactNode }> = ({ id, label, icon }) => (
        <button
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === id
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
        >
            {icon}{label}
        </button>
    );

    // ── Render ───────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#06C167' }}>
                    <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Uber Eats</h2>
                    <p className="text-sm text-gray-500">Reporting API · Base de datos: <code className="text-xs bg-gray-100 px-1 rounded">KpisRosti_UberEats</code></p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
                <TabBtn id="config" label="API Config" icon={<Settings className="w-4 h-4" />} />
                <TabBtn id="stores" label="Restaurantes" icon={<Store className="w-4 h-4" />} />
                <TabBtn id="sync" label="Sincronización" icon={<RefreshCw className="w-4 h-4" />} />
                <TabBtn id="dashboard" label="Dashboard" icon={<TrendingUp className="w-4 h-4" />} />
            </div>

            {/* ══ CONFIG TAB ══════════════════════════════════════════ */}
            {tab === 'config' && (
                <div className="space-y-5">
                    {configLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                                <h3 className="font-bold text-gray-800 text-base">Credenciales de API</h3>

                                {/* Client ID */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Client ID</label>
                                    <input
                                        value={clientId}
                                        onChange={e => setClientId(e.target.value)}
                                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all font-mono"
                                        placeholder="ej. Q8eKFoos24Fm8D9cYw4lBQtDEeWv0a82"
                                    />
                                </div>

                                {/* Client Secret */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">
                                        Client Secret {config.CLIENT_SECRET?.value ? <span className="text-green-600 normal-case font-normal">(guardado encriptado)</span> : <span className="text-red-500 normal-case font-normal">(sin configurar)</span>}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showSecret ? 'text' : 'password'}
                                            value={clientSecret}
                                            onChange={e => setClientSecret(e.target.value)}
                                            className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all font-mono"
                                            placeholder={config.CLIENT_SECRET?.value ? "Dejar vacío para no cambiar" : "Pega aquí el client_secret"}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowSecret(!showSecret)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Se guarda encriptado en KpisRosti_UberEats. Nunca en texto plano.</p>
                                </div>

                                {/* Report types */}
                                <div className="pt-2 border-t border-gray-100">
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Tipos de Reporte a Sincronizar</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {ALL_REPORT_TYPES.map(rt => (
                                            <label
                                                key={rt.id}
                                                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${reportTypes.includes(rt.id)
                                                    ? 'border-orange-300 bg-orange-50'
                                                    : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 accent-orange-500"
                                                    checked={reportTypes.includes(rt.id)}
                                                    onChange={() => setReportTypes(prev =>
                                                        prev.includes(rt.id)
                                                            ? prev.filter(x => x !== rt.id)
                                                            : [...prev, rt.id]
                                                    )}
                                                />
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">{rt.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{rt.desc}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mt-2">
                                        ⚠️ Uber Eats debe aprobar el acceso a cada tipo de reporte por separado. Activa solo los que tengas habilitados.
                                    </p>
                                </div>

                                {/* Sync settings */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Sincronización automática</label>
                                        <button
                                            onClick={() => setSyncEnabled(!syncEnabled)}
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${syncEnabled ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                        >
                                            <div className={`w-4 h-4 rounded border-2 ${syncEnabled ? 'bg-green-600 border-green-600' : 'border-gray-300'}`} />
                                            {syncEnabled ? 'Activada' : 'Desactivada'}
                                        </button>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Hora del día (0–23)</label>
                                        <input
                                            type="number" min={0} max={23}
                                            value={syncHour}
                                            onChange={e => setSyncHour(parseInt(e.target.value) || 0)}
                                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Días atrás a sincronizar</label>
                                        <input
                                            type="number" min={1} max={30}
                                            value={daysBack}
                                            onChange={e => setDaysBack(parseInt(e.target.value) || 1)}
                                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Messages */}
                                {configMsg && (
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${configMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        {configMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                        {configMsg.text}
                                    </div>
                                )}

                                {/* Buttons */}
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <button
                                        onClick={saveConfig}
                                        disabled={configSaving}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl shadow transition-all disabled:opacity-60"
                                    >
                                        {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                                        Guardar Configuración
                                    </button>
                                    <button
                                        onClick={testConnection}
                                        disabled={testLoading}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-gray-200 hover:border-orange-300 text-gray-700 text-sm font-bold rounded-xl transition-all disabled:opacity-60"
                                    >
                                        {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                        Probar Conexión
                                    </button>
                                </div>

                                {/* Test result */}
                                {testResult && (
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                        {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                        {testResult.message}
                                    </div>
                                )}
                            </div>

                            {/* Info box */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                                <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-blue-700">
                                    Uber Eats usa OAuth 2.0 con <code>client_credentials</code>. El token se genera dinámicamente con tu Client ID + Secret.
                                    El token dura 1 hora y se renueva automáticamente. No se almacena ningún token — solo las credenciales encriptadas.
                                </p>
                            </div>

                            {/* Token status badge */}
                            {tokenStatus && (
                                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm ${tokenStatus.canGetToken
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : tokenStatus.hasSecretInDb && tokenStatus.canDecrypt
                                        ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                                        : 'bg-red-50 border-red-200 text-red-700'
                                    }`}>
                                    {tokenStatus.canGetToken ? (
                                        <><CheckCircle className="w-4 h-4" /> Token válido — conexión verificada con Uber Eats API</>
                                    ) : tokenStatus.hasSecretInDb && tokenStatus.canDecrypt ? (
                                        <><AlertTriangle className="w-4 h-4" /> Credenciales guardadas — {tokenStatus.tokenError || 'no se ha podido obtener token'}</>
                                    ) : tokenStatus.hasSecretInDb && !tokenStatus.canDecrypt ? (
                                        <><XCircle className="w-4 h-4" /> Error de encriptación — el secret no se puede desencriptar. Guarda uno nuevo.</>
                                    ) : (
                                        <><XCircle className="w-4 h-4" /> {!tokenStatus.hasClientId ? 'Falta Client ID' : 'Falta Client Secret'} — configura las credenciales</>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ══ STORES TAB ══════════════════════════════════════════ */}
            {tab === 'stores' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <h3 className="font-bold text-gray-800">Agregar Restaurante</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Store ID (de Uber)</label>
                                <input
                                    value={newStoreId}
                                    onChange={e => setNewStoreId(e.target.value)}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all font-mono"
                                    placeholder="-bak3yqZrr8_dg09ZrWaf4qk1OqKjDd..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre amigable</label>
                                <input
                                    value={newStoreName}
                                    onChange={e => setNewStoreName(e.target.value)}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all"
                                    placeholder="ej. Rosti Desamparados"
                                />
                            </div>
                        </div>
                        <button
                            onClick={addStore}
                            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl shadow transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Store
                        </button>
                        {storeMsg && (
                            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${storeMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {storeMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                {storeMsg.text}
                            </div>
                        )}
                    </div>

                    {/* Stores list */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="font-bold text-gray-800 mb-4">Restaurantes Configurados</h3>
                        {storesLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                            </div>
                        ) : stores.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">Sin stores configurados</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stores.map(s => (
                                    <div key={s.Id} className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${s.Activo ? 'border-green-100 bg-green-50/50' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">{s.Nombre}</p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{s.StoreId}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleStoreActive(s)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${s.Activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                            >
                                                {s.Activo ? 'Activo' : 'Inactivo'}
                                            </button>
                                            <button
                                                onClick={() => deleteStore(s.Id)}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ SYNC TAB ════════════════════════════════════════════ */}
            {tab === 'sync' && (
                <div className="space-y-4">
                    {/* Status cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className={`rounded-2xl p-4 border-2 ${cronStatus?.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Cron Status</p>
                            <p className={`text-lg font-bold ${cronStatus?.isActive ? 'text-green-700' : 'text-gray-500'}`}>
                                {cronStatus?.isActive ? '✅ Activo' : '⏸️ Inactivo'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 font-mono">{cronStatus?.schedule || '—'}</p>
                        </div>
                        <div className={`rounded-2xl p-4 border-2 ${cronStatus?.isRunning ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sync en Progreso</p>
                            <p className={`text-lg font-bold ${cronStatus?.isRunning ? 'text-blue-700' : 'text-gray-500'}`}>
                                {cronStatus?.isRunning ? '🔄 Corriendo' : '⏤ Inactivo'}
                            </p>
                        </div>
                        <div className="rounded-2xl p-4 border-2 bg-gray-50 border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Último Sync</p>
                            <p className="text-sm font-semibold text-gray-700">
                                {lastSyncTime ? new Date(lastSyncTime).toLocaleString('es-CR') : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={triggerSync}
                            disabled={syncing}
                            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl shadow transition-all disabled:opacity-60"
                        >
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sincronizar Ahora
                        </button>
                        <button onClick={loadSyncStatus} className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold rounded-xl transition-all">
                            <RefreshCw className="w-4 h-4" />
                            Actualizar
                        </button>
                    </div>

                    {/* Log table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800">Historial de Sincronizaciones</h3>
                        </div>
                        {syncLoading ? (
                            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
                        ) : syncLog.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-sm"><Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />Sin historial aún</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold">Fecha</th>
                                            <th className="px-4 py-3 text-left font-bold">Tipo</th>
                                            <th className="px-4 py-3 text-center font-bold">Estado</th>
                                            <th className="px-4 py-3 text-right font-bold">Registros</th>
                                            <th className="px-4 py-3 text-left font-bold">Mensaje</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {syncLog.map(log => (
                                            <tr key={log.Id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(log.FechaEjecucion).toLocaleString('es-CR')}</td>
                                                <td className="px-4 py-3 text-gray-700 font-mono text-xs">{log.ReportType}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${log.Status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {log.Status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-gray-700">{log.RegistrosProcesados}</td>
                                                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{log.Mensaje}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ DASHBOARD TAB ═══════════════════════════════════════ */}
            {tab === 'dashboard' && (
                <div className="space-y-4">
                    {/* Period filter */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Desde</label>
                            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Hasta</label>
                            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 transition-all" />
                        </div>
                        <button onClick={loadDashboard}
                            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl shadow transition-all">
                            <RefreshCw className="w-4 h-4" />
                            Actualizar
                        </button>
                    </div>

                    {dashLoading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
                    ) : !dashboard?.totales || dashboard.totales.TotalOrdenes === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="font-semibold text-gray-500">Sin datos para este período</p>
                            <p className="text-sm mt-1">Realiza una sincronización o ajusta el rango de fechas</p>
                        </div>
                    ) : (
                        <>
                            {/* KPI cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                    { label: 'Órdenes', icon: <ShoppingBag className="w-4 h-4" />, value: fmtN(dashboard.totales.TotalOrdenes), color: 'orange' },
                                    { label: 'Venta Bruta', icon: <DollarSign className="w-4 h-4" />, value: fmt(dashboard.totales.VentaBruta), color: 'green' },
                                    { label: 'Neto Recibido', icon: <DollarSign className="w-4 h-4" />, value: fmt(dashboard.totales.NetoPagado), color: 'blue' },
                                    { label: 'Comisión Uber', icon: <Percent className="w-4 h-4" />, value: `${dashboard.totales.PorcentajeComision ?? 0}%`, color: 'red' },
                                    { label: 'Ticket Promedio', icon: <TrendingUp className="w-4 h-4" />, value: fmt(dashboard.totales.TicketPromedio), color: 'purple' },
                                    { label: 'Total Comisión', icon: <DollarSign className="w-4 h-4" />, value: fmt(dashboard.totales.ComisionUber), color: 'red' },
                                    { label: 'Descuentos', icon: <DollarSign className="w-4 h-4" />, value: fmt(dashboard.totales.Descuentos), color: 'yellow' },
                                ].map(kpi => (
                                    <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                        <div className="flex items-center gap-2 mb-2 text-gray-500">
                                            {kpi.icon}
                                            <p className="text-xs font-bold uppercase">{kpi.label}</p>
                                        </div>
                                        <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* By store */}
                            {dashboard.porLocal.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100">
                                        <h3 className="font-bold text-gray-800">Por Restaurante</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-bold">Restaurante</th>
                                                    <th className="px-4 py-3 text-right font-bold">Órdenes</th>
                                                    <th className="px-4 py-3 text-right font-bold">Venta Bruta</th>
                                                    <th className="px-4 py-3 text-right font-bold">Neto</th>
                                                    <th className="px-4 py-3 text-right font-bold">Ticket</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {dashboard.porLocal.map(row => (
                                                    <tr key={row.StoreId} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-3 font-semibold text-gray-800">{row.NombreLocal || row.StoreId}</td>
                                                        <td className="px-4 py-3 text-right text-gray-600">{fmtN(row.Ordenes)}</td>
                                                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(row.VentaBruta)}</td>
                                                        <td className="px-4 py-3 text-right text-gray-600">{fmt(row.NetoPagado)}</td>
                                                        <td className="px-4 py-3 text-right text-gray-600">{fmt(row.TicketPromedio)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
