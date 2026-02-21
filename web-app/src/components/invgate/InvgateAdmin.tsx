import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, getToken } from '../../api';
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
            alert('Error: ' + (e.response?.data?.error || e.message));
        }
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
        if (!confirm('¿Eliminar esta vista de la configuración?')) return;
        try {
            await axios.delete(`${API_BASE}/invgate/views/${viewId}`, { headers: authHeaders() });
            await loadViews();
        } catch (e: any) {
            setViewError('Error eliminando vista: ' + (e.response?.data?.error || e.message));
        }
    };

    // ─── Load synced data for a view ─────────────────────────────
    const loadViewData = async (viewId: number) => {
        if (viewData?.viewId === viewId) { setViewData(null); return; } // toggle off
        setLoadingViewData(true);
        setViewError(null);
        try {
            const r = await axios.get(`${API_BASE}/invgate/views/${viewId}/data`, { headers: authHeaders() });
            setViewData(r.data);
        } catch (e: any) {
            setViewError('Error cargando datos: ' + (e.response?.data?.error || e.message));
        } finally { setLoadingViewData(false); }
    };

    // ─── Save OAuth config ────────────────────────────────────────
    const saveConfig = async () => {
        if (!clientId || !tokenUrl) { alert('Por favor complete Client ID y Token URL'); return; }
        setSavingConfig(true);
        try {
            await axios.post(`${API_BASE}/invgate/config`,
                { clientId, clientSecret, tokenUrl, apiBaseUrl, syncIntervalHours: parseInt(syncInterval), syncEnabled },
                { headers: authHeaders() });
            alert('✅ Configuración guardada');
        } catch (e: any) {
            alert('Error: ' + (e.response?.data?.error || e.message));
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
        if (!confirm(`¿Iniciar sincronización ${syncType === 'full' ? 'COMPLETA' : 'INCREMENTAL'}?`)) return;
        setSyncing(true);
        try {
            await axios.post(`${API_BASE}/invgate/sync`, { syncType }, { headers: authHeaders() });
            alert('✅ Sincronización iniciada. Revise el estado en unos momentos.');
            setTimeout(() => { loadSyncStatus(); loadSyncLogs(); }, 2000);
        } catch (e: any) {
            alert('Error: ' + (e.response?.data?.error || e.message));
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
                                    <th style={{ width: '80px', textAlign: 'center' }}>Sync</th>
                                    <th style={{ width: '80px' }}></th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {views.map(v => (
                                    <tr key={v.viewId}>
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
                                        <td style={{ textAlign: 'center' }}>
                                            <label className="toggle-switch">
                                                <input type="checkbox" checked={v.syncEnabled}
                                                    onChange={() => toggleViewSync(v)} />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <button onClick={() => loadViewData(v.viewId)}
                                                disabled={loadingViewData}
                                                style={{ background: 'none', border: '1px solid #3b82f6', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', padding: '2px 8px' }}
                                                title="Ver datos sincronizados">
                                                {loadingViewData && viewData?.viewId !== v.viewId ? '⏳' : viewData?.viewId === v.viewId ? '🔼 Ocultar' : '📊 Datos'}
                                            </button>
                                        </td>
                                        <td>
                                            <button onClick={() => deleteView(v.viewId)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                                title="Eliminar vista">🗑️</button>
                                        </td>
                                    </tr>
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

