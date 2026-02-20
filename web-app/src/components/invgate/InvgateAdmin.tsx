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
interface CustomFieldDef {
    FieldID?: number; fieldId: number; helpdeskId: number;
    fieldName: string; fieldType: string; showInDashboard: boolean;
    DisplayOrder?: number; displayOrder: number;
    sampleValues?: string[];
}

// ─── Tab enum ─────────────────────────────────────────────────────
type Tab = 'auth' | 'helpdesks' | 'customfields' | 'sync';

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

    // Custom fields state
    const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
    const [selectedHelpdeskTab, setSelectedHelpdeskTab] = useState<number | null>(null);
    const [detectingFields, setDetectingFields] = useState(false);
    const [savingFields, setSavingFields] = useState(false);

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
            if (list.length > 0 && !selectedHelpdeskTab) {
                setSelectedHelpdeskTab(list[0].id);
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

    // ─── Load custom fields for selected helpdesk ─────────────────
    const loadCustomFields = useCallback(async (helpdeskId: number) => {
        try {
            const r = await axios.get(`${API_BASE}/invgate/custom-fields?helpdeskId=${helpdeskId}`, { headers: authHeaders() });
            setCustomFields(prev => {
                const others = prev.filter(f => f.helpdeskId !== helpdeskId);
                const mapped = r.data.map((f: any) => ({
                    fieldId: f.FieldID, helpdeskId: f.HelpdeskID,
                    fieldName: f.FieldName, fieldType: f.FieldType,
                    showInDashboard: f.ShowInDashboard === true || f.ShowInDashboard === 1,
                    displayOrder: f.DisplayOrder || 0
                }));
                return [...others, ...mapped];
            });
        } catch (e) { console.error('Error loading custom fields:', e); }
    }, []);

    useEffect(() => {
        if (tab === 'customfields' && selectedHelpdeskTab) {
            loadCustomFields(selectedHelpdeskTab);
        }
    }, [tab, selectedHelpdeskTab, loadCustomFields]);

    // ─── Detect custom fields from API ───────────────────────────
    const detectFields = async () => {
        if (!selectedHelpdeskTab) return;
        setDetectingFields(true);
        try {
            const r = await axios.post(`${API_BASE}/invgate/detect-fields/${selectedHelpdeskTab}`,
                {}, { headers: authHeaders() });
            // Merge detected with existing (keep user-set names if already edited)
            const detected: any[] = r.data;
            setCustomFields(prev => {
                const others = prev.filter(f => f.helpdeskId !== selectedHelpdeskTab);
                const existingForHD = prev.filter(f => f.helpdeskId === selectedHelpdeskTab);
                const existingMap = new Map(existingForHD.map(f => [f.fieldId, f]));
                const merged = detected.map((d, i) => {
                    const existing = existingMap.get(d.fieldId);
                    // If name was already customized by user, keep it; otherwise use API name
                    const nameIsGeneric = existing?.fieldName?.match(/^(Campo|Fecha|Número|Lista|Texto)\s+\d+$/);
                    return {
                        fieldId: d.fieldId,
                        helpdeskId: selectedHelpdeskTab,
                        fieldName: (!existing || nameIsGeneric) ? (d.fieldName || `Campo ${d.fieldId}`) : existing.fieldName,
                        fieldType: existing && !nameIsGeneric ? existing.fieldType : (d.fieldType || 'text'),
                        showInDashboard: existing?.showInDashboard ?? false,
                        displayOrder: existing?.displayOrder ?? i,
                        sampleValues: d.sampleValues || []
                    };
                });
                return [...others, ...merged];
            });
        } catch (e: any) {
            console.error('Error detectando campos:', e);
            setHelpdeskError('Error detectando campos: ' + (e.response?.data?.error || e.message));
        } finally { setDetectingFields(false); }
    };


    // ─── Save custom fields ───────────────────────────────────────
    const saveCustomFields = async () => {
        setSavingFields(true);
        try {
            const defs = customFields.filter(f => f.helpdeskId === selectedHelpdeskTab);
            await axios.put(`${API_BASE}/invgate/custom-fields`, { defs }, { headers: authHeaders() });
            alert('✅ Campos guardados exitosamente');
        } catch (e: any) {
            alert('Error guardando campos: ' + (e.response?.data?.error || e.message));
        } finally { setSavingFields(false); }
    };

    // Update a custom field inline
    const updateField = (helpdeskId: number, fieldId: number, updates: Partial<CustomFieldDef>) => {
        setCustomFields(prev => prev.map(f =>
            f.helpdeskId === helpdeskId && f.fieldId === fieldId ? { ...f, ...updates } : f
        ));
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
                    { key: 'customfields', label: '🗂️ Campos' },
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
                TAB: CUSTOM FIELDS
            ════════════════════════════════════════════════════ */}
            {tab === 'customfields' && (
                <div className="config-section">
                    <div className="section-header-row">
                        <h3>Campos Personalizados</h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={detectFields} disabled={detectingFields || !selectedHelpdeskTab} className="btn-secondary btn-sm">
                                {detectingFields ? '⏳ Detectando...' : '🔍 Auto-detectar campos'}
                            </button>
                            <button onClick={saveCustomFields} disabled={savingFields || !selectedHelpdeskTab} className="btn-primary btn-sm">
                                {savingFields ? 'Guardando...' : '💾 Guardar'}
                            </button>
                        </div>
                    </div>
                    <p className="config-description">
                        Configura el nombre y visibilidad de cada campo personalizado por solicitud.
                    </p>

                    {/* Helpdesk tabs — only show enabled ones */}
                    {enabledHelpdesks.length === 0 ? (
                        <div className="empty-state">
                            <p>⚠️ No hay solicitudes activas. Activa al menos una en la pestaña "Solicitudes".</p>
                        </div>
                    ) : (
                        <>
                            <div className="hd-tab-bar">
                                {enabledHelpdesks.map(hd => (
                                    <button key={hd.id}
                                        className={`hd-tab-btn ${selectedHelpdeskTab === hd.id ? 'active' : ''}`}
                                        onClick={() => setSelectedHelpdeskTab(hd.id)}>
                                        {hd.name}
                                    </button>
                                ))}
                            </div>

                            {selectedHelpdeskTab && (() => {
                                const fieldsForHD = customFields.filter(f => f.helpdeskId === selectedHelpdeskTab);
                                return fieldsForHD.length === 0 ? (
                                    <div className="empty-state">
                                        <p>🔍 Haz clic en "Auto-detectar campos" para cargar los campos de esta solicitud.</p>
                                    </div>
                                ) : (
                                    <div className="custom-fields-table-wrap">
                                        <table className="custom-fields-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '50px' }}>ID</th>
                                                    <th>Nombre del Campo</th>
                                                    <th style={{ width: '200px' }}>Valores de Ejemplo</th>
                                                    <th style={{ width: '110px' }}>Tipo</th>
                                                    <th style={{ width: '80px', textAlign: 'center' }}>Dashboard</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fieldsForHD.map(f => (
                                                    <tr key={f.fieldId}>
                                                        <td><span className="field-id">#{f.fieldId}</span></td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="field-name-input"
                                                                value={f.fieldName}
                                                                onChange={e => updateField(selectedHelpdeskTab, f.fieldId, { fieldName: e.target.value })}
                                                                placeholder={`Campo ${f.fieldId}`}
                                                            />
                                                        </td>
                                                        <td>
                                                            {f.sampleValues && f.sampleValues.length > 0 ? (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                    {f.sampleValues.map((sv, i) => (
                                                                        <span key={i} style={{
                                                                            background: '#f1f5f9', border: '1px solid #e2e8f0',
                                                                            borderRadius: '4px', padding: '2px 8px',
                                                                            fontSize: '11px', color: '#475569',
                                                                            maxWidth: '180px', overflow: 'hidden',
                                                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                            display: 'inline-block'
                                                                        }}>
                                                                            {sv}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <select
                                                                className="field-type-select"
                                                                value={f.fieldType}
                                                                onChange={e => updateField(selectedHelpdeskTab, f.fieldId, { fieldType: e.target.value })}
                                                                style={{ borderColor: FIELD_TYPE_COLORS[f.fieldType] || '#6366f1' }}
                                                            >
                                                                {FIELD_TYPE_OPTIONS.map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <label className="toggle-switch">
                                                                <input type="checkbox"
                                                                    checked={f.showInDashboard}
                                                                    onChange={e => updateField(selectedHelpdeskTab, f.fieldId, { showInDashboard: e.target.checked })} />
                                                                <span className="toggle-slider"></span>
                                                            </label>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}
                        </>
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

