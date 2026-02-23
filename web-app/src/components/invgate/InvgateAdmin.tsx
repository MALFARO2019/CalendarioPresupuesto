import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_BASE, getToken } from '../../api';
import { useToast } from '../ui/Toast';
import { SearchableSelect } from '../SearchableSelect';
import './InvgateAdmin.css';

// ─── Interfaces ───────────────────────────────────────────────────
interface Config {
    clientId: string; clientSecret: string; tokenUrl: string;
    apiBaseUrl: string; sync_interval_hours: string;
    sync_enabled: string; last_sync_date: string | null;
}
interface SyncLog {
    SyncID: number; FechaSync: string; TipoSync: string;
    RegistrosProcesados: number; RegistrosNuevos: number;
    RegistrosActualizados: number; Estado: string;
    MensajeError: string | null; TiempoEjecucionMs: number; IniciadoPor: string;
}
interface SyncStatus {
    lastSync: SyncLog | null;
    cronJob: { isActive: boolean; isRunning: boolean; schedule: string | null; };
}
interface Helpdesk {
    id: number; name: string; syncEnabled: boolean; totalTickets: number;
}
interface ViewConfig {
    viewId: number; nombre: string; syncEnabled: boolean;
    totalTickets: number; columns: string[]; ultimaSync: string | null;
    ultimoRegistro: string | null;
}
interface ViewPreview {
    viewId: number; totalCount: number; previewRows: number;
    columns: { name: string; sampleValues: string[] }[];
    data: any[];
}
interface ViewData {
    viewId: number; tableName: string; columns: string[]; totalRows: number;
    data: Record<string, string>[];
}

// ─── Tab enum ─────────────────────────────────────────────────────
type Tab = 'auth' | 'helpdesks' | 'views' | 'sync';

export const InvgateAdmin: React.FC = () => {
    // Config state
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [tokenUrl, setTokenUrl] = useState('https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token');
    const [apiBaseUrl, setApiBaseUrl] = useState('https://rostipollos.cloud.invgate.net/api/v1');
    const [syncInterval, setSyncInterval] = useState('1');
    const [syncEnabled, setSyncEnabled] = useState(true);
    const [oauthScopes, setOauthScopes] = useState('');

    // UI state
    const [tab, setTab] = useState<Tab>('auth');
    const [loading, setLoading] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

    // Helpdesks state
    const [helpdesks, setHelpdesks] = useState<Helpdesk[]>([]);
    const [loadingHelpdesks, setLoadingHelpdesks] = useState(false);
    const [helpdeskError, setHelpdeskError] = useState<string | null>(null);

    // Helpdesk tickets data viewer
    const [ticketsData, setTicketsData] = useState<{ data: any[]; total: number; page: number } | null>(null);
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [ticketFilter, setTicketFilter] = useState<number | null>(null);

    // Views state
    const [views, setViews] = useState<ViewConfig[]>([]);
    const [newViewId, setNewViewId] = useState('');
    const [newViewName, setNewViewName] = useState('');
    const [viewPreview, setViewPreview] = useState<ViewPreview | null>(null);
    const [loadingViews, setLoadingViews] = useState(false);
    const [previewingView, setPreviewingView] = useState(false);
    const [addingView, setAddingView] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);
    const [viewData, setViewData] = useState<ViewData | null>(null);
    const [loadingViewData, setLoadingViewData] = useState(false);
    const [syncingViewId, setSyncingViewId] = useState<number | null>(null);

    // Mapping state
    const [mappingViewId, setMappingViewId] = useState<number | null>(null);
    const [mappingData, setMappingData] = useState<{
        mappings: { FieldType: string; ColumnName: string; UpdatedBy?: string }[];
        stats: { total: number; withCodAlmacen: number; withPersonalId: number; withoutCodAlmacen: number; withoutPersonalId: number } | null;
        columns: string[];
    } | null>(null);
    const [unmappedData, setUnmappedData] = useState<{ records: any[]; count: number; total: number; personaCol: string | null; almacenCol: string | null } | null>(null);
    const [loadingMapping, setLoadingMapping] = useState(false);
    const [resolvingMapping, setResolvingMapping] = useState(false);
    const [loadingUnmapped, setLoadingUnmapped] = useState(false);
    const [resolvedMappings, setResolvedMappings] = useState<{ almacen: { sourceValue: string; resolvedValue: string; resolvedNombre?: string; count: number }[]; persona: { sourceValue: string; resolvedId: number; resolvedName: string; count: number }[] } | null>(null);
    const [loadingResolved, setLoadingResolved] = useState(false);
    const [reviewMappingType, setReviewMappingType] = useState<'CODALMACEN' | 'PERSONA' | null>(null);
    const [clearingMapping, setClearingMapping] = useState<string | null>(null);

    // Reference data for mapping combos
    const [storesList, setStoresList] = useState<{ CodAlmacen: string; Nombre: string }[]>([]);
    const [usersList, setUsersList] = useState<{ Id: number; Nombre: string }[]>([]);

    const { showToast, showConfirm } = useToast();
    const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

    // ─── Load config on mount ─────────────────────────────────────
    useEffect(() => { loadConfig(); }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API_BASE}/invgate/config`, { headers: authHeaders() });
            setClientId(r.data.clientId || '');
            setClientSecret(r.data.clientSecret || '');
            setTokenUrl(r.data.tokenUrl || 'https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token');
            setApiBaseUrl(r.data.apiBaseUrl || 'https://rostipollos.cloud.invgate.net/api/v1');
            setSyncInterval(r.data.sync_interval_hours || '1');
            setSyncEnabled(r.data.sync_enabled === 'true');
            setOauthScopes(r.data.oauthScopes || '');
        } catch (e: any) {
            console.error('Error loading config:', e);
        } finally { setLoading(false); }
    };

    // ─── Load helpdesks from API ──────────────────────────────────
    const loadHelpdesks = async () => {
        setLoadingHelpdesks(true);
        setHelpdeskError(null);
        try {
            const r = await axios.get(`${API_BASE}/invgate/helpdesks`, { headers: authHeaders() });
            // Support both old array format and new {helpdesks, apiError} format
            const list: Helpdesk[] = Array.isArray(r.data) ? r.data : (r.data.helpdesks || []);
            const apiErr: string | null = r.data.apiError || null;
            setHelpdesks(list);
            if (apiErr) {
                setHelpdeskError(`⚠️ API de InvGate no disponible: ${apiErr}. Se muestran las solicitudes guardadas localmente.`);
            }
        } catch (e: any) {
            setHelpdeskError('Error cargando helpdesks: ' + (e.response?.data?.error || e.message));
        } finally { setLoadingHelpdesks(false); }
    };

    // ─── Toggle helpdesk sync ─────────────────────────────────────
    const toggleHelpdesk = async (hd: Helpdesk) => {
        const newEnabled = !hd.syncEnabled;
        // Optimistic update
        setHelpdesks(prev => prev.map(h => h.id === hd.id ? { ...h, syncEnabled: newEnabled } : h));
        try {
            await axios.put(`${API_BASE}/invgate/helpdesks/${hd.id}/toggle`,
                { enabled: newEnabled, name: hd.name }, { headers: authHeaders() });
        } catch (e: any) {
            // Rollback
            setHelpdesks(prev => prev.map(h => h.id === hd.id ? { ...h, syncEnabled: hd.syncEnabled } : h));
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        }
    };

    // ─── Load helpdesk tickets from DB ────────────────────────────
    const loadTickets = async (page = 1, helpdeskId: number | null = ticketFilter) => {
        setLoadingTickets(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: '50' });
            if (helpdeskId) params.set('helpdeskId', String(helpdeskId));
            const r = await axios.get(`${API_BASE}/invgate/tickets?${params}`, { headers: authHeaders() });
            setTicketsData(r.data);
        } catch (e: any) {
            setHelpdeskError('Error cargando tiquetes: ' + (e.response?.data?.error || e.message));
        } finally { setLoadingTickets(false); }
    };

    // ─── Load views ────────────────────────────────────────────────
    const loadViews = useCallback(async () => {
        setLoadingViews(true);
        setViewError(null);
        try {
            const r = await axios.get(`${API_BASE}/invgate/views`, { headers: authHeaders() });
            setViews(r.data || []);
        } catch (e: any) {
            setViewError('Error cargando vistas: ' + (e.response?.data?.error || e.message));
        } finally { setLoadingViews(false); }
    }, []);

    useEffect(() => {
        if (tab === 'views') { loadViews(); }
    }, [tab, loadViews]);

    // ─── Preview a view ──────────────────────────────────────────
    const previewView = async (viewId: number) => {
        setPreviewingView(true);
        setViewPreview(null);
        setViewError(null);
        try {
            const r = await axios.get(`${API_BASE}/invgate/views/${viewId}/preview`, { headers: authHeaders() });
            setViewPreview(r.data);
        } catch (e: any) {
            setViewError('Error previsualizando vista: ' + (e.response?.data?.error || e.message));
        } finally { setPreviewingView(false); }
    };

    // ─── Add a new view ──────────────────────────────────────────
    const addView = async () => {
        if (!newViewId || !newViewName) return;
        setAddingView(true);
        setViewError(null);
        try {
            const columns = viewPreview?.columns.map(c => c.name) || [];
            await axios.post(`${API_BASE}/invgate/views`, {
                viewId: parseInt(newViewId), nombre: newViewName, columns
            }, { headers: authHeaders() });
            setNewViewId(''); setNewViewName(''); setViewPreview(null);
            await loadViews();
        } catch (e: any) {
            setViewError('Error agregando vista: ' + (e.response?.data?.error || e.message));
        } finally { setAddingView(false); }
    };

    // ─── Toggle view sync ────────────────────────────────────────
    const toggleViewSync = async (v: ViewConfig) => {
        const newEnabled = !v.syncEnabled;
        setViews(prev => prev.map(x => x.viewId === v.viewId ? { ...x, syncEnabled: newEnabled } : x));
        try {
            await axios.put(`${API_BASE}/invgate/views/${v.viewId}/toggle`,
                { enabled: newEnabled }, { headers: authHeaders() });
        } catch (e: any) {
            setViews(prev => prev.map(x => x.viewId === v.viewId ? { ...x, syncEnabled: v.syncEnabled } : x));
            setViewError('Error: ' + (e.response?.data?.error || e.message));
        }
    };

    // ─── Delete a view ────────────────────────────────────────────
    const deleteView = async (viewId: number) => {
        if (!(await showConfirm({ message: '¿Eliminar esta vista de la configuración?', destructive: true }))) return;
        try {
            await axios.delete(`${API_BASE}/invgate/views/${viewId}`, { headers: authHeaders() });
            await loadViews();
        } catch (e: any) {
            setViewError('Error eliminando vista: ' + (e.response?.data?.error || e.message));
        }
    };

    // ─── Load synced data for a view ─────────────────────────────
    const loadViewData = async (viewId: number) => {
        if (viewData?.viewId === viewId) { setViewData(null); return; }
        setLoadingViewData(true);
        try {
            const { data } = await axios.get<ViewData>(`${API_BASE}/invgate/views/${viewId}/data`, { headers: authHeaders() });
            setViewData(data);
        } catch (err: any) {
            setViewError(err.response?.data?.error || err.message);
        } finally {
            setLoadingViewData(false);
        }
    };

    // ─── Sync a single view ──────────────────────────────────────
    const syncView = async (viewId: number, type: 'incremental' | 'full') => {
        setSyncingViewId(viewId);
        try {
            await axios.post(`${API_BASE}/invgate/views/${viewId}/sync`, { type }, { headers: authHeaders() });
            // Reload views to get updated meta
            const { data } = await axios.get<ViewConfig[]>(`${API_BASE}/invgate/views`, { headers: authHeaders() });
            setViews(data);
            setViewError(null);
        } catch (err: any) {
            setViewError(err.response?.data?.error || err.message);
        } finally {
            setSyncingViewId(null);
        }
    };

    // ─── Mapping functions ────────────────────────────────────────
    const loadReferenceData = async () => {
        if (storesList.length > 0 && usersList.length > 0) return;
        try {
            const [storesRes, usersRes] = await Promise.all([
                axios.get(`${API_BASE}/invgate/lookup-stores`, { headers: authHeaders() }),
                axios.get(`${API_BASE}/invgate/lookup-users`, { headers: authHeaders() }),
            ]);
            setStoresList(storesRes.data || []);
            setUsersList((usersRes.data || []).map((u: any) => ({ Id: u.ID || u.Id || u.id, Nombre: u.NOMBRE || u.Nombre || u.nombre })));
        } catch (e: any) {
            console.warn('Error loading reference data:', e.message);
        }
    };

    const openMappingPanel = async (viewId: number) => {
        if (mappingViewId === viewId) { setMappingViewId(null); setMappingData(null); setUnmappedData(null); return; }
        setMappingViewId(viewId);
        setLoadingMapping(true);
        setUnmappedData(null);
        try {
            const [mappingsRes, statsRes] = await Promise.all([
                axios.get(`${API_BASE}/invgate/views/${viewId}/mappings`, { headers: authHeaders() }),
                axios.get(`${API_BASE}/invgate/views/${viewId}/mapping-stats`, { headers: authHeaders() }),
            ]);
            await loadReferenceData();
            const view = views.find(v => v.viewId === viewId);
            setMappingData({
                mappings: mappingsRes.data,
                stats: statsRes.data.hasMappingColumns ? statsRes.data.stats : null,
                columns: view?.columns || [],
            });
        } catch (e: any) {
            setViewError('Error cargando mapeos: ' + (e.response?.data?.error || e.message));
        } finally { setLoadingMapping(false); }
    };

    const saveMapping = async (viewId: number, fieldType: string, columnName: string) => {
        try {
            if (columnName) {
                // __NO_MAP__ is a special value meaning "this field doesn't apply to this view"
                await axios.post(`${API_BASE}/invgate/views/${viewId}/mappings`, { fieldType, columnName }, { headers: authHeaders() });
            } else {
                await axios.delete(`${API_BASE}/invgate/views/${viewId}/mappings/${fieldType}`, { headers: authHeaders() });
            }
            setUnmappedData(null);
            await openMappingPanel(viewId);
        } catch (e: any) {
            setViewError('Error guardando mapeo: ' + (e.response?.data?.error || e.message));
        }
    };

    const resolveMappings = async (viewId: number) => {
        setResolvingMapping(true);
        try {
            const r = await axios.post(`${API_BASE}/invgate/views/${viewId}/resolve-mappings`, {}, { headers: authHeaders() });
            showToast(r.data.message || `Resueltos: ${r.data.resolved}`, 'success');
            setUnmappedData(null);
            await openMappingPanel(viewId);
        } catch (e: any) {
            setViewError('Error resolviendo mapeos: ' + (e.response?.data?.error || e.message));
        } finally { setResolvingMapping(false); }
    };

    const loadUnmapped = async (viewId: number) => {
        if (unmappedData) { setUnmappedData(null); return; }
        setLoadingUnmapped(true);
        try {
            const r = await axios.get(`${API_BASE}/invgate/views/${viewId}/unmapped`, { headers: authHeaders() });
            setUnmappedData({
                records: r.data.unmapped,
                count: r.data.unmappedCount,
                total: r.data.totalCount,
                personaCol: r.data.personaColumn,
                almacenCol: r.data.almacenColumn,
            });
        } catch (e: any) {
            showToast('Error cargando no mapeados: ' + (e.response?.data?.error || e.message), 'error');
        } finally { setLoadingUnmapped(false); }
    };

    // ─── Load ALL resolved mappings ───────────────────────────────
    const loadResolvedMappings = async (viewId: number) => {
        setLoadingResolved(true);
        try {
            const r = await axios.get(`${API_BASE}/invgate/views/${viewId}/resolved-mappings`, { headers: authHeaders() });
            setResolvedMappings(r.data || { almacen: [], persona: [] });
        } catch (e: any) {
            showToast('Error cargando mapeos resueltos: ' + (e.response?.data?.error || e.message), 'error');
        } finally { setLoadingResolved(false); }
    };

    // ─── Clear a resolved mapping ─────────────────────────────────
    const clearResolvedMapping = async (viewId: number, fieldType: string, sourceValue: string) => {
        const key = `${fieldType}:${sourceValue}`;
        setClearingMapping(key);
        try {
            const r = await axios.delete(`${API_BASE}/invgate/views/${viewId}/resolved-mappings`, {
                headers: authHeaders(),
                data: { fieldType, sourceValue }
            });
            showToast(`Limpiado: ${r.data.cleared} registros`, 'success');
            await loadResolvedMappings(viewId);
            // Refresh stats
            await openMappingPanel(viewId);
        } catch (e: any) {
            showToast('Error borrando mapeo: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setClearingMapping(null);
        }
    };

    // Save a manual alias (store name → CodAlmacen) and re-resolve
    const saveStoreAlias = async (alias: string, codAlmacen: string, viewId: number) => {
        try {
            await axios.post(`${API_BASE}/admin/store-aliases`, { alias, codAlmacen, fuente: 'InvGate' }, { headers: authHeaders() });
            showToast(`Alias guardado: ${alias} → ${codAlmacen}`, 'success');
            await resolveMappings(viewId);
        } catch (e: any) {
            if (e.response?.status === 409) showToast('Alias ya existe', 'warning');
            else setViewError('Error guardando alias: ' + (e.response?.data?.error || e.message));
        }
    };

    // Save a manual persona mapping and refresh
    const savePersonaMapping = async (sourceValue: string, userId: string, viewId: number) => {
        const user = usersList.find(u => String(u.Id) === userId);
        if (!user) return;
        try {
            const r = await axios.post(`${API_BASE}/invgate/views/${viewId}/map-persona`,
                { sourceValue, userId: user.Id, userName: user.Nombre },
                { headers: authHeaders() }
            );
            showToast(`Persona mapeada: "${sourceValue}" → ${user.Nombre} (${r.data.updated} registros)`, 'success');
            setUnmappedData(null);
            await openMappingPanel(viewId);
        } catch (e: any) {
            setViewError('Error mapeando persona: ' + (e.response?.data?.error || e.message));
        }
    };

    // Computed: unique unmapped values grouped by type
    const unmappedUniqueValues = useMemo(() => {
        if (!unmappedData || unmappedData.records.length === 0) return { almacen: [], persona: [] };
        const almacenVals = new Map<string, number>();
        const personaVals = new Map<string, number>();
        for (const row of unmappedData.records) {
            if (unmappedData.almacenCol && !row._CODALMACEN) {
                const v = (row[unmappedData.almacenCol] || '').trim();
                if (v) almacenVals.set(v, (almacenVals.get(v) || 0) + 1);
            }
            if (unmappedData.personaCol && !row._PERSONAL_ID) {
                const v = (row[unmappedData.personaCol] || '').trim();
                if (v) personaVals.set(v, (personaVals.get(v) || 0) + 1);
            }
        }
        return {
            almacen: Array.from(almacenVals.entries()).sort((a, b) => b[1] - a[1]),
            persona: Array.from(personaVals.entries()).sort((a, b) => b[1] - a[1]),
        };
    }, [unmappedData]);

    // Computed: options for SearchableSelect
    const storeOptions = useMemo(() =>
        storesList.map(s => ({ value: s.CodAlmacen, label: `${s.CodAlmacen} - ${s.Nombre}` })),
        [storesList]
    );
    const userOptions = useMemo(() =>
        usersList.map(u => ({ value: String(u.Id), label: u.Nombre })),
        [usersList]
    );
    const columnOptions = useMemo(() => {
        if (!mappingData) return [];
        const cols = mappingData.columns.filter(c => !c.startsWith('_')).map(c => ({ value: c, label: c }));
        return [{ value: '__NO_MAP__', label: '— No mapea —' }, ...cols];
    }, [mappingData]);

    // ─── Save OAuth config ────────────────────────────────────────
    const saveConfig = async () => {
        if (!clientId || !tokenUrl) { showToast('Por favor complete Client ID y Token URL', 'warning'); return; }
        setSavingConfig(true);
        try {
            await axios.post(`${API_BASE}/invgate/config`,
                { clientId, clientSecret, tokenUrl, apiBaseUrl, syncIntervalHours: parseInt(syncInterval), syncEnabled, oauthScopes: oauthScopes || undefined },
                { headers: authHeaders() });
            showToast('Configuración guardada', 'success');
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally { setSavingConfig(false); }
    };

    const testConnection = async () => {
        setConnectionStatus('Probando conexión...');
        try {
            const r = await axios.post(`${API_BASE}/invgate/test-connection`, {}, { headers: authHeaders() });
            setConnectionStatus(r.data.success ? '✅ ' + r.data.message : '❌ ' + r.data.message);
        } catch (e: any) {
            setConnectionStatus('❌ Error: ' + (e.response?.data?.error || e.message));
        }
    };

    const triggerSync = async (syncType: 'incremental' | 'full') => {
        if (!(await showConfirm({ message: `¿Iniciar sincronización ${syncType === 'full' ? 'COMPLETA' : 'INCREMENTAL'}?` }))) return;
        setSyncing(true);
        try {
            await axios.post(`${API_BASE}/invgate/sync`, { syncType }, { headers: authHeaders() });
            showToast('Sincronización iniciada. Revise el estado en unos momentos.', 'success');
            setTimeout(() => { loadSyncStatus(); loadSyncLogs(); }, 2000);
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally { setSyncing(false); }
    };

    const loadSyncStatus = async () => {
        try {
            const r = await axios.get(`${API_BASE}/invgate/sync-status`, { headers: authHeaders() });
            setSyncStatus(r.data);
        } catch (e) { console.error(e); }
    };

    const loadSyncLogs = async () => {
        try {
            const r = await axios.get(`${API_BASE}/invgate/sync-logs?limit=10`, { headers: authHeaders() });
            setSyncLogs(r.data);
        } catch (e) { console.error(e); }
    };

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('es-CR') : 'Nunca';
    const formatMs = (ms: number | null) => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

    const FIELD_TYPE_OPTIONS = ['text', 'number', 'date', 'dropdown', 'email', 'phone'];
    const FIELD_TYPE_COLORS: Record<string, string> = {
        text: '#6366f1', number: '#0ea5e9', date: '#10b981',
        dropdown: '#f59e0b', email: '#ec4899', phone: '#8b5cf6'
    };

    const enabledHelpdesks = helpdesks.filter(h => h.syncEnabled);

    if (loading) return <div className="invgate-admin-loading">Cargando configuración...</div>;

    return (
        <div className="invgate-admin">
            <h2>⚙️ Configuración de InvGate</h2>

            {/* ── Tab bar ── */}
            <div className="invgate-tabs">
                {([
                    { key: 'auth', label: '🔑 Autenticación' },
                    { key: 'helpdesks', label: '📂 Solicitudes' },
                    { key: 'views', label: '👁️ Vistas' },
                    { key: 'sync', label: '🔄 Sincronización' },
                ] as { key: Tab; label: string }[]).map(t => (
                    <button key={t.key}
                        className={`invgate-tab-btn ${tab === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ════════════════════════════════════════════════════
                TAB: AUTH
            ════════════════════════════════════════════════════ */}
            {tab === 'auth' && (
                <div className="config-section">
                    <h3>Autenticación OAuth 2.0</h3>
                    <p className="config-description">InvGate usa OAuth 2.0 con client_credentials.</p>
                    <div className="config-form">
                        <div className="form-group">
                            <label>Client ID:</label>
                            <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
                                placeholder="019c6eb1-..." className="config-input" />
                        </div>
                        <div className="form-group">
                            <label>Client Secret:</label>
                            <input type="text" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                                placeholder="Secreto de cliente" className="config-input" />
                        </div>
                        <div className="form-group">
                            <label>URL de Token OAuth:</label>
                            <input type="text" value={tokenUrl} onChange={e => setTokenUrl(e.target.value)}
                                placeholder="https://...oauth/v2.0/access_token" className="config-input" />
                            <small>Usar /v2.0/ (no /v2/0/)</small>
                        </div>
                        <div className="form-group">
                            <label>URL Base del API:</label>
                            <input type="text" value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)}
                                placeholder="https://.../api/v1" className="config-input" />
                            <small>Debe ser /api/v1 (no /v2)</small>
                        </div>
                        <div className="form-group">
                            <label>Frecuencia de Sincronización:</label>
                            <select value={syncInterval} onChange={e => setSyncInterval(e.target.value)} className="config-select">
                                {['1', '2', '4', '6', '12', '24'].map(v => (
                                    <option key={v} value={v}>Cada {v} hora{v !== '1' ? 's' : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="syncEnabled" checked={syncEnabled} onChange={e => setSyncEnabled(e.target.checked)} />
                            <label htmlFor="syncEnabled">Habilitar sincronización automática</label>
                        </div>
                        <div className="form-group">
                            <label>OAuth Scopes <small style={{ color: '#94a3b8', fontWeight: 400 }}>(opcional — vacío = defaults)</small>:</label>
                            <textarea value={oauthScopes} onChange={e => setOauthScopes(e.target.value)}
                                placeholder="api.v1.incidents:get api.v1.incident:get api.v1.helpdesks:get ..."
                                className="config-input" rows={3}
                                style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} />
                            <small>Separar con espacios. Si está vacío se usan los scopes por defecto del servidor.</small>
                        </div>
                        <div className="config-actions">
                            <button onClick={saveConfig} disabled={savingConfig} className="btn-primary">
                                {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                            </button>
                            <button onClick={testConnection} className="btn-secondary">🔌 Probar Conexión</button>
                        </div>
                        {connectionStatus && (
                            <div className={`connection-status ${connectionStatus.includes('✅') ? 'success' : 'error'}`}>
                                {connectionStatus}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════
                TAB: HELPDESKS
            ════════════════════════════════════════════════════ */}
            {tab === 'helpdesks' && (
                <div className="config-section">
                    <div className="section-header-row">
                        <h3>Solicitudes a Sincronizar</h3>
                        <button onClick={loadHelpdesks} disabled={loadingHelpdesks} className="btn-secondary btn-sm">
                            {loadingHelpdesks ? '⏳ Cargando...' : '🔄 Cargar desde InvGate'}
                        </button>
                    </div>
                    <p className="config-description">
                        Activa el toggle en las solicitudes que deseas sincronizar.
                        {enabledHelpdesks.length > 0 && <strong> ({enabledHelpdesks.length} activas)</strong>}
                    </p>
                    {helpdeskError && (
                        <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', color: '#92400e', fontSize: '13px' }}>
                            {helpdeskError}
                        </div>
                    )}
                    {helpdesks.length === 0 && !loadingHelpdesks && (
                        <div className="empty-state">
                            <p>📂 Haz clic en "Cargar desde InvGate" para ver las solicitudes disponibles.</p>
                        </div>
                    )}

                    <div className="helpdesk-grid">
                        {helpdesks.map(hd => (
                            <div key={hd.id} className={`helpdesk-card ${hd.syncEnabled ? 'enabled' : ''}`}>
                                <div className="helpdesk-card-body">
                                    <div className="helpdesk-info">
                                        <span className="helpdesk-name">📁 {hd.name}</span>
                                        {hd.totalTickets > 0 && (
                                            <span className="helpdesk-count">{hd.totalTickets} tickets</span>
                                        )}
                                    </div>
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={hd.syncEnabled}
                                            onChange={() => toggleHelpdesk(hd)} />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Tickets data viewer ── */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '20px' }}>
                        <div className="section-header-row">
                            <h3>📊 Tiquetes Sincronizados</h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <select
                                    value={ticketFilter ?? ''}
                                    onChange={e => setTicketFilter(e.target.value ? parseInt(e.target.value) : null)}
                                    className="config-select"
                                    style={{ minWidth: '180px', fontSize: '13px' }}
                                >
                                    <option value="">Todas las solicitudes</option>
                                    {helpdesks.map(hd => (
                                        <option key={hd.id} value={hd.id}>{hd.name}</option>
                                    ))}
                                </select>
                                <button onClick={() => loadTickets(1, ticketFilter)} disabled={loadingTickets} className="btn-secondary btn-sm">
                                    {loadingTickets ? '⏳ Cargando...' : '📊 Ver tiquetes'}
                                </button>
                            </div>
                        </div>

                        {!ticketsData && !loadingTickets && (
                            <p style={{ color: '#9ca3af', fontSize: '13px' }}>
                                Presiona "Ver tiquetes" para ver los datos sincronizados de la tabla InvgateTickets.
                            </p>
                        )}

                        {ticketsData && (
                            <div style={{ marginTop: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                                        {ticketsData.total} tiquetes en total — Página {ticketsData.page}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => loadTickets(ticketsData.page - 1)}
                                            disabled={ticketsData.page <= 1 || loadingTickets}
                                            className="btn-secondary btn-sm"
                                        >← Anterior</button>
                                        <button
                                            onClick={() => loadTickets(ticketsData.page + 1)}
                                            disabled={ticketsData.data.length < 50 || loadingTickets}
                                            className="btn-secondary btn-sm"
                                        >Siguiente →</button>
                                        <button onClick={() => setTicketsData(null)} className="btn-secondary btn-sm"
                                            style={{ color: '#64748b' }}>✕ Cerrar</button>
                                    </div>
                                </div>
                                <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    <table className="custom-fields-table" style={{ fontSize: '12px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>ID</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Título</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Estado</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Prioridad</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Categoría</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Solicitado por</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Asignado a</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Helpdesk</th>
                                                <th style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#f1f5f9' }}>Fecha Creación</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ticketsData.data.map((t, i) => (
                                                <tr key={t.TicketID || i}>
                                                    <td style={{ padding: '4px 10px', fontFamily: 'monospace' }}>{t.TicketID}</td>
                                                    <td style={{ padding: '4px 10px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        title={t.Titulo || ''}>{t.Titulo || '—'}</td>
                                                    <td style={{ padding: '4px 10px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                                            background: t.Estado?.toLowerCase().includes('close') || t.Estado === '3' || t.Estado === '4' ? '#dcfce7' : '#fef3c7',
                                                            color: t.Estado?.toLowerCase().includes('close') || t.Estado === '3' || t.Estado === '4' ? '#166534' : '#92400e',
                                                        }}>{t.Estado || '—'}</span>
                                                    </td>
                                                    <td style={{ padding: '4px 10px' }}>{t.Prioridad || '—'}</td>
                                                    <td style={{ padding: '4px 10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        title={t.Categoria || ''}>{t.Categoria || '—'}</td>
                                                    <td style={{ padding: '4px 10px' }}>{t.SolicitadoPor || '—'}</td>
                                                    <td style={{ padding: '4px 10px' }}>{t.AsignadoA || '—'}</td>
                                                    <td style={{ padding: '4px 10px', fontSize: '11px', color: '#64748b' }}>{t.HelpdeskNombre || t.HelpdeskID || '—'}</td>
                                                    <td style={{ padding: '4px 10px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                                                        {t.FechaCreacion ? new Date(t.FechaCreacion).toLocaleString('es-CR') : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {ticketsData.data.length === 0 && (
                                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
                                                    No hay tiquetes sincronizados. Ejecuta una sincronización desde la pestaña "Sincronización".
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════
                TAB: VIEWS
            ════════════════════════════════════════════════════ */}
            {tab === 'views' && (
                <div className="config-section">
                    <h3>👁️ Vistas de InvGate</h3>
                    <p className="config-description">
                        Define vistas en InvGate con las columnas que necesitás, luego agregalas acá por su ID.
                        Las columnas se detectan automáticamente.
                    </p>

                    {viewError && (
                        <div className="config-warning" style={{ marginBottom: '16px' }}>
                            {viewError}
                        </div>
                    )}

                    {/* ── Add new view form ── */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>➕ Agregar Vista</h4>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ minWidth: '100px' }}>
                                <label>ID de Vista:</label>
                                <input type="number" value={newViewId} onChange={e => setNewViewId(e.target.value)}
                                    placeholder="123" className="config-input" style={{ width: '100px' }} />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                                <label>Nombre descriptivo:</label>
                                <input type="text" value={newViewName} onChange={e => setNewViewName(e.target.value)}
                                    placeholder="ej: Tickets Soporte TI" className="config-input" />
                            </div>
                            <button className="btn-secondary" onClick={() => newViewId && previewView(parseInt(newViewId))}
                                disabled={!newViewId || previewingView}>
                                {previewingView ? '⏳ Cargando...' : '🔍 Previsualizar'}
                            </button>
                            <button className="btn-primary" onClick={addView}
                                disabled={!newViewId || !newViewName || addingView}>
                                {addingView ? '⏳...' : '💾 Agregar'}
                            </button>
                        </div>

                        {/* Preview result */}
                        {viewPreview && (
                            <div style={{ marginTop: '16px' }}>
                                <p style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>
                                    ✅ Vista #{viewPreview.viewId}: {viewPreview.totalCount} tickets, {viewPreview.columns.length} columnas
                                </p>
                                <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                    <table className="custom-fields-table" style={{ fontSize: '12px' }}>
                                        <thead>
                                            <tr>
                                                {viewPreview.columns.map(col => (
                                                    <th key={col.name} style={{ whiteSpace: 'nowrap', padding: '6px 10px' }}>
                                                        {col.name}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viewPreview.data.slice(0, 5).map((row, i) => (
                                                <tr key={i}>
                                                    {viewPreview.columns.map(col => (
                                                        <td key={col.name} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 10px' }}>
                                                            {typeof row[col.name] === 'object' ? JSON.stringify(row[col.name]) : String(row[col.name] ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Configured views list ── */}
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>📋 Vistas Configuradas</h4>
                    {loadingViews ? (
                        <p>Cargando vistas...</p>
                    ) : views.length === 0 ? (
                        <div className="empty-state">
                            <p>No hay vistas configuradas. Agrega una vista arriba.</p>
                        </div>
                    ) : (
                        <table className="custom-fields-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px' }}>ID</th>
                                    <th>Nombre</th>
                                    <th style={{ width: '100px' }}>Tickets</th>
                                    <th style={{ width: '160px' }}>Última Sync</th>
                                    <th style={{ width: '160px' }}>Último Registro</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Sync</th>
                                    <th style={{ width: '170px' }}></th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {views.map(v => (
                                    <React.Fragment key={v.viewId}>
                                        <tr>
                                            <td><span className="field-id">#{v.viewId}</span></td>
                                            <td><strong>{v.nombre}</strong>
                                                {v.columns.length > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                                        {v.columns.slice(0, 5).join(', ')}{v.columns.length > 5 ? ` +${v.columns.length - 5}` : ''}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{v.totalTickets}</td>
                                            <td style={{ fontSize: '12px' }}>
                                                {v.ultimaSync ? new Date(v.ultimaSync).toLocaleString('es-CR') : '—'}
                                            </td>
                                            <td style={{ fontSize: '12px' }}>
                                                {(() => {
                                                    if (!v.ultimoRegistro) return '—';
                                                    const d = new Date(v.ultimoRegistro);
                                                    const hoursAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60);
                                                    const isOld = hoursAgo > 24;
                                                    return (
                                                        <span style={{ color: isOld ? '#ef4444' : 'inherit', fontWeight: isOld ? 700 : 400 }}
                                                            title={isOld ? `Hace ${Math.floor(hoursAgo)} horas — más de 24h sin registro` : ''}>
                                                            {d.toLocaleString('es-CR')}
                                                            {isOld && ' ⚠️'}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <label className="toggle-switch">
                                                    <input type="checkbox" checked={v.syncEnabled}
                                                        onChange={() => toggleViewSync(v)} />
                                                    <span className="toggle-slider"></span>
                                                </label>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button onClick={() => syncView(v.viewId, 'incremental')}
                                                        disabled={syncingViewId !== null}
                                                        style={{ background: 'none', border: '1px solid #22c55e', color: '#22c55e', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap', opacity: syncingViewId === v.viewId ? 0.5 : 1 }}
                                                        title="Sincronización incremental">
                                                        {syncingViewId === v.viewId ? '⏳' : '🔄'}
                                                    </button>
                                                    <button onClick={() => syncView(v.viewId, 'full')}
                                                        disabled={syncingViewId !== null}
                                                        style={{ background: 'none', border: '1px solid #f59e0b', color: '#f59e0b', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap', opacity: syncingViewId === v.viewId ? 0.5 : 1 }}
                                                        title="Sincronización completa">
                                                        {syncingViewId === v.viewId ? '⏳' : '⚡'}
                                                    </button>
                                                    <button onClick={() => loadViewData(v.viewId)}
                                                        disabled={loadingViewData}
                                                        style={{ background: 'none', border: '1px solid #3b82f6', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', padding: '2px 8px' }}
                                                        title="Ver datos sincronizados">
                                                        {loadingViewData && viewData?.viewId !== v.viewId ? '⏳' : viewData?.viewId === v.viewId ? '🔼 Ocultar' : '📊 Datos'}
                                                    </button>
                                                    <button onClick={() => openMappingPanel(v.viewId)}
                                                        disabled={loadingMapping && mappingViewId === v.viewId}
                                                        style={{ background: 'none', border: '1px solid #f59e0b', color: '#f59e0b', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', padding: '2px 8px' }}
                                                        title="Configurar mapeos de Persona y CodAlmacen">
                                                        {mappingViewId === v.viewId ? '🔼 Cerrar' : '🔗 Mapeos'}
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <button onClick={() => deleteView(v.viewId)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                                    title="Eliminar vista">🗑️</button>
                                            </td>
                                        </tr>

                                        {/* ── Inline mapping panel ── */}
                                        {mappingViewId === v.viewId && (
                                            <tr>
                                                <td colSpan={7} style={{ padding: 0 }}>
                                                    <div className="invgate-mapping-panel">
                                                        {loadingMapping ? (
                                                            <div className="forms-loading">Cargando mapeos...</div>
                                                        ) : mappingData ? (
                                                            <>
                                                                <div className="detail-header">
                                                                    <h3>🔗 Mapeos — {v.nombre}</h3>
                                                                    <button className="btn-close" onClick={() => { setMappingViewId(null); setMappingData(null); setUnmappedData(null); setResolvedMappings(null); setReviewMappingType(null); }}>✕</button>
                                                                </div>

                                                                {/* Stats */}
                                                                {mappingData.stats && (
                                                                    <div className="mapping-stats">
                                                                        <h4>📊 Estado de Mapeos</h4>
                                                                        <div className="stats-grid">
                                                                            <div className="stat-item">
                                                                                <span className="stat-label">Total registros</span>
                                                                                <span className="stat-value">{mappingData.stats.total}</span>
                                                                            </div>
                                                                            <div className="stat-item success">
                                                                                <span className="stat-label">Con Local</span>
                                                                                <span className="stat-value">{mappingData.stats.withCodAlmacen}</span>
                                                                            </div>
                                                                            {(() => {
                                                                                const almacenCol = mappingData.mappings.find(m => m.FieldType === 'CODALMACEN')?.ColumnName;
                                                                                const almacenMapped = almacenCol && almacenCol !== '__NO_MAP__';
                                                                                return (
                                                                                    <div
                                                                                        className={`stat-item warning${almacenMapped ? ' clickable' : ''}`}
                                                                                        onClick={almacenMapped ? () => loadUnmapped(v.viewId) : undefined}
                                                                                        title={almacenMapped ? 'Click para ver sin mapear' : ''}
                                                                                        style={almacenMapped ? { cursor: 'pointer' } : {}}
                                                                                    >
                                                                                        <span className="stat-label">Sin Local</span>
                                                                                        <span className="stat-value">{mappingData.stats.withoutCodAlmacen}</span>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                            <div className="stat-item success">
                                                                                <span className="stat-label">Con Persona</span>
                                                                                <span className="stat-value">{mappingData.stats.withPersonalId}</span>
                                                                            </div>
                                                                            {(() => {
                                                                                const personaCol = mappingData.mappings.find(m => m.FieldType === 'PERSONA')?.ColumnName;
                                                                                const personaMapped = personaCol && personaCol !== '__NO_MAP__';
                                                                                return (
                                                                                    <div
                                                                                        className={`stat-item warning${personaMapped ? ' clickable' : ''}`}
                                                                                        onClick={personaMapped ? () => loadUnmapped(v.viewId) : undefined}
                                                                                        title={personaMapped ? 'Click para ver sin mapear' : ''}
                                                                                        style={personaMapped ? { cursor: 'pointer' } : {}}
                                                                                    >
                                                                                        <span className="stat-label">Sin Persona</span>
                                                                                        <span className="stat-value">{mappingData.stats.withoutPersonalId}</span>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Column selection */}
                                                                <div className="mapping-fields">
                                                                    <div className="form-group">
                                                                        <label>🏪 Campo de Local (CodAlmacen)</label>
                                                                        <SearchableSelect
                                                                            options={columnOptions}
                                                                            value={mappingData.mappings.find(m => m.FieldType === 'CODALMACEN')?.ColumnName || ''}
                                                                            onChange={val => saveMapping(v.viewId, 'CODALMACEN', val)}
                                                                            placeholder="— Sin mapear —"
                                                                        />
                                                                        <small>Se buscará en APP_STORE_ALIAS para encontrar el código del local</small>
                                                                    </div>
                                                                    <div className="form-group">
                                                                        <label>👤 Campo de Persona</label>
                                                                        <SearchableSelect
                                                                            options={columnOptions}
                                                                            value={mappingData.mappings.find(m => m.FieldType === 'PERSONA')?.ColumnName || ''}
                                                                            onChange={val => saveMapping(v.viewId, 'PERSONA', val)}
                                                                            placeholder="— Sin mapear —"
                                                                        />
                                                                        <small>Se buscará en APP_USUARIOS para encontrar el ID del usuario</small>
                                                                    </div>
                                                                </div>

                                                                {/* Action buttons */}
                                                                <div className="mapping-actions">
                                                                    <button className="btn-save" onClick={() => saveMapping(v.viewId, 'CODALMACEN', mappingData.mappings.find(m => m.FieldType === 'CODALMACEN')?.ColumnName || '')}>
                                                                        💾 Guardar Mapeos
                                                                    </button>
                                                                    <button className="btn-resolve-mapping" onClick={() => resolveMappings(v.viewId)} disabled={resolvingMapping}>
                                                                        {resolvingMapping ? '⏳ Resolviendo...' : '🔄 Resolver Pendientes'}
                                                                    </button>
                                                                    <button className="btn-unmapped" onClick={() => { if (unmappedData) { setUnmappedData(null); } else { loadUnmapped(v.viewId); } }}>
                                                                        {loadingUnmapped ? '⏳...' : unmappedData ? '✕ Cerrar' : '🔍 Ver Sin Mapear'}
                                                                    </button>
                                                                    <button className="btn-review-mapping" onClick={() => { if (reviewMappingType === 'CODALMACEN') { setReviewMappingType(null); } else { setReviewMappingType('CODALMACEN'); loadResolvedMappings(v.viewId); } }}>
                                                                        {reviewMappingType === 'CODALMACEN' ? '✕ Cerrar' : '🏪 Revisar Locales'}
                                                                    </button>
                                                                    <button className="btn-review-mapping" onClick={() => { if (reviewMappingType === 'PERSONA') { setReviewMappingType(null); } else { setReviewMappingType('PERSONA'); loadResolvedMappings(v.viewId); } }}>
                                                                        {reviewMappingType === 'PERSONA' ? '✕ Cerrar' : '👤 Revisar Personas'}
                                                                    </button>
                                                                </div>

                                                                {/* Review ALL resolved mappings panel */}
                                                                {reviewMappingType && (
                                                                    <div className="review-mappings-panel">
                                                                        <h4>{reviewMappingType === 'CODALMACEN' ? '🏪 Mapeos de Locales (Tabla)' : '👤 Mapeos de Personas (Tabla)'}</h4>
                                                                        <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 10px' }}>Todos los valores resueltos en la tabla de datos, incluyendo automáticos. Use ❌ para limpiar un mapeo.</p>

                                                                        {loadingResolved ? (
                                                                            <div className="forms-loading" style={{ padding: '8px 0' }}>Cargando...</div>
                                                                        ) : resolvedMappings ? (
                                                                            <>
                                                                                {(reviewMappingType === 'CODALMACEN' ? resolvedMappings.almacen : resolvedMappings.persona).length === 0 ? (
                                                                                    <p style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>No hay mapeos resueltos en la tabla.</p>
                                                                                ) : (
                                                                                    <div className="review-mapping-list">
                                                                                        {(reviewMappingType === 'CODALMACEN' ? resolvedMappings.almacen : resolvedMappings.persona).map((m: any, i: number) => (
                                                                                            <div className="review-mapping-row" key={i}>
                                                                                                <span className="review-source" title={m.sourceValue}>{m.sourceValue}</span>
                                                                                                <span className="review-arrow">→</span>
                                                                                                <span className="review-resolved">
                                                                                                    {reviewMappingType === 'CODALMACEN'
                                                                                                        ? (m.resolvedNombre ? `${m.resolvedValue} — ${m.resolvedNombre}` : (m.resolvedValue || '⚠️ Sin resolver'))
                                                                                                        : (m.resolvedName ? `${m.resolvedName} (${m.resolvedId})` : (m.resolvedId || '⚠️ Sin resolver'))}
                                                                                                </span>
                                                                                                <span className="review-count">{m.count || m.cnt} reg.</span>
                                                                                                {(m.resolvedValue || m.resolvedId) && (
                                                                                                    <button
                                                                                                        className="review-clear-btn"
                                                                                                        disabled={clearingMapping === `${reviewMappingType}:${m.sourceValue}`}
                                                                                                        onClick={() => clearResolvedMapping(v.viewId, reviewMappingType, m.sourceValue)}
                                                                                                        title="Limpiar mapeo (poner en NULL)"
                                                                                                    >{clearingMapping === `${reviewMappingType}:${m.sourceValue}` ? '⏳' : '❌'}</button>
                                                                                                )}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        ) : null}
                                                                    </div>
                                                                )}

                                                                {/* Unmapped values with manual mapping */}
                                                                {unmappedData && (
                                                                    <div className="unmapped-section">
                                                                        {unmappedData.records.length === 0 ? (
                                                                            <p style={{ color: '#059669', fontSize: 13, padding: '16px 0' }}>✅ Todos los registros están mapeados correctamente</p>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                                                <h4>🔍 Valores No Mapeados ({unmappedData.count} registros de {unmappedData.total})</h4>

                                                                                {/* Unmapped almacen values */}
                                                                                {unmappedUniqueValues.almacen.length > 0 && (
                                                                                    <div className="mapping-group">
                                                                                        <h5>🏪 Locales sin mapear ({unmappedUniqueValues.almacen.length})</h5>
                                                                                        <div className="mapping-value-list">
                                                                                            {unmappedUniqueValues.almacen.map(([val, count]) => (
                                                                                                <div className="mapping-value-row" key={val}>
                                                                                                    <div className="mv-source">
                                                                                                        <span className="mv-value" title={val}>{val}</span>
                                                                                                        <span className="mv-count">{count} reg.</span>
                                                                                                    </div>
                                                                                                    <div className="mv-arrow">→</div>
                                                                                                    <div className="mv-target">
                                                                                                        <SearchableSelect
                                                                                                            options={storeOptions}
                                                                                                            value=""
                                                                                                            onChange={codAlmacen => { if (codAlmacen) saveStoreAlias(val, codAlmacen, v.viewId); }}
                                                                                                            placeholder="Buscar almacén..."
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {/* Unmapped persona values */}
                                                                                {unmappedUniqueValues.persona.length > 0 && (
                                                                                    <div className="mapping-group">
                                                                                        <h5>👤 Personas sin mapear ({unmappedUniqueValues.persona.length})</h5>
                                                                                        <div className="mapping-value-list">
                                                                                            {unmappedUniqueValues.persona.map(([val, count]) => (
                                                                                                <div className="mapping-value-row" key={val}>
                                                                                                    <div className="mv-source">
                                                                                                        <span className="mv-value" title={val}>{val}</span>
                                                                                                        <span className="mv-count">{count} reg.</span>
                                                                                                    </div>
                                                                                                    <div className="mv-arrow">→</div>
                                                                                                    <div className="mv-target">
                                                                                                        <SearchableSelect
                                                                                                            options={userOptions}
                                                                                                            value=""
                                                                                                            onChange={userId => { if (userId) savePersonaMapping(val, userId, v.viewId); }}
                                                                                                            placeholder="Buscar usuario..."
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* ── View data table ── */}
                    {viewData && (
                        <div style={{ marginTop: '20px', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '14px', color: '#1e40af' }}>
                                    📊 Datos de Vista #{viewData.viewId} — {viewData.totalRows} registros
                                    {viewData.tableName && (
                                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, marginLeft: '8px' }}>
                                            Tabla SQL: <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>{viewData.tableName}</code>
                                        </span>
                                    )}
                                </h4>
                                <button onClick={() => setViewData(null)}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                            </div>
                            {viewData.totalRows === 0 ? (
                                <div className="empty-state">
                                    <p>No hay datos sincronizados. Ejecutá una sincronización primero desde la pestaña "Sincronización".</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                                    <table className="custom-fields-table" style={{ fontSize: '12px' }}>
                                        <thead>
                                            <tr>
                                                {viewData.columns.map(col => (
                                                    <th key={col} style={{ whiteSpace: 'nowrap', padding: '6px 10px', position: 'sticky', top: 0, background: '#e0f2fe' }}>
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viewData.data.map((row, i) => (
                                                <tr key={i}>
                                                    {viewData.columns.map(col => (
                                                        <td key={col} style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 10px' }}
                                                            title={row[col] || ''}>
                                                            {row[col] || ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════
                TAB: SYNC
            ════════════════════════════════════════════════════ */}
            {tab === 'sync' && (
                <>
                    {/* ── Auto-Sync Config ─────────────────────── */}
                    <div className="config-section">
                        <h3>⏰ Sincronización Automática</h3>
                        <p className="config-description">
                            Define con qué frecuencia se sincroniza InvGate automáticamente.
                        </p>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ minWidth: '180px' }}>
                                <label>Frecuencia:</label>
                                <select value={syncInterval} onChange={e => setSyncInterval(e.target.value)} className="config-select">
                                    {['1', '2', '4', '6', '12', '24'].map(v => (
                                        <option key={v} value={v}>Cada {v} hora{v !== '1' ? 's' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Estado automático:</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '4px' }}>
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={syncEnabled} onChange={e => setSyncEnabled(e.target.checked)} />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <span style={{ fontSize: '14px', color: syncEnabled ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
                                        {syncEnabled ? '✅ Habilitada' : '⏸️ Pausada'}
                                    </span>
                                </div>
                            </div>
                            <button onClick={saveConfig} disabled={savingConfig} className="btn-primary btn-sm" style={{ marginBottom: '20px' }}>
                                {savingConfig ? 'Guardando...' : '💾 Guardar'}
                            </button>
                        </div>
                    </div>

                    {/* ── Manual Sync ──────────────────────────── */}
                    <div className="config-section">
                        <h3>Sincronización Manual</h3>
                        <div className="sync-actions">
                            <button onClick={() => triggerSync('incremental')} disabled={syncing} className="btn-secondary">
                                {syncing ? 'Sincronizando...' : '🔄 Sync Incremental'}
                            </button>
                            <button onClick={() => triggerSync('full')} disabled={syncing} className="btn-warning">
                                {syncing ? 'Sincronizando...' : '⚡ Sync Completo'}
                            </button>
                            <button onClick={() => { loadSyncStatus(); loadSyncLogs(); }} className="btn-secondary">
                                📊 Ver Estado
                            </button>
                        </div>
                        {syncStatus && (
                            <div className="sync-status-card">
                                <h4 style={{ margin: '0 0 8px' }}>Estado del Cron Job</h4>
                                <p style={{ margin: '4px 0' }}>
                                    Cron: {syncStatus.cronJob?.isActive ? '✅ Activo' : '⏸️ Inactivo'}
                                    {syncStatus.cronJob?.schedule && <span style={{ color: '#6b7280', marginLeft: '8px', fontSize: '12px' }}>({syncStatus.cronJob.schedule})</span>}
                                </p>
                                {syncStatus.lastSync && (
                                    <>
                                        <p style={{ margin: '4px 0' }}>Última sync: {formatDate(syncStatus.lastSync.FechaSync)}</p>
                                        <p style={{ margin: '4px 0' }}>Estado: <span className={`status-badge ${syncStatus.lastSync.Estado?.toLowerCase()}`}>{syncStatus.lastSync.Estado}</span></p>
                                        <p style={{ margin: '4px 0' }}>Registros: {syncStatus.lastSync.RegistrosProcesados} procesados
                                            ({syncStatus.lastSync.RegistrosNuevos} nuevos, {syncStatus.lastSync.RegistrosActualizados} actualizados)
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                        {!syncStatus && (
                            <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '12px' }}>
                                Presiona "Ver Estado" para cargar el estado actual de la sincronización.
                            </p>
                        )}
                    </div>

                    {/* ── Sync Logs ────────────────────────────── */}
                    {syncLogs.length > 0 && (
                        <div className="config-section">
                            <h3>Historial de Sincronizaciones</h3>
                            <div className="sync-logs-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Fecha</th><th>Tipo</th><th>Estado</th>
                                            <th>Procesados</th><th>Nuevos</th><th>Actualizados</th><th>Duración</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {syncLogs.map(log => (
                                            <tr key={log.SyncID} className={log.Estado === 'ERROR' ? 'error-row' : ''}>
                                                <td>{formatDate(log.FechaSync)}</td>
                                                <td>{log.TipoSync}</td>
                                                <td><span className={`status-badge ${log.Estado?.toLowerCase()}`}>{log.Estado}</span></td>
                                                <td>{log.RegistrosProcesados}</td>
                                                <td>{log.RegistrosNuevos}</td>
                                                <td>{log.RegistrosActualizados}</td>
                                                <td>{formatMs(log.TiempoEjecucionMs)}</td>
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
    );
};

