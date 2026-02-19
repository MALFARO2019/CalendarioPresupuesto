import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, getToken } from '../../api';
import './InvgateAdmin.css';

interface Config {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    apiBaseUrl: string;
    sync_interval_hours: string;
    sync_enabled: string;
    last_sync_date: string | null;
}

interface SyncLog {
    SyncID: number;
    FechaSync: string;
    TipoSync: string;
    RegistrosProcesados: number;
    RegistrosNuevos: number;
    RegistrosActualizados: number;
    Estado: string;
    MensajeError: string | null;
    TiempoEjecucionMs: number;
    IniciadoPor: string;
}

interface SyncStatus {
    lastSync: SyncLog | null;
    cronJob: {
        isActive: boolean;
        isRunning: boolean;
        schedule: string | null;
    };
}

export const InvgateAdmin: React.FC = () => {
    const [config, setConfig] = useState<Config | null>(null);
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [tokenUrl, setTokenUrl] = useState('https://rostipollos.cloud.invgate.net/oauth/v2.0/access_token');
    const [apiBaseUrl, setApiBaseUrl] = useState('https://rostipollos.cloud.invgate.net/api/v2');
    const [syncInterval, setSyncInterval] = useState('1');
    const [syncEnabled, setSyncEnabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

    // Auto-load config on mount
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const response = await axios.get(`${API_BASE}/invgate/config`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConfig(response.data);
            setClientId(response.data.clientId || '');
            setClientSecret(response.data.clientSecret || '');
            setTokenUrl(response.data.tokenUrl || 'https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token');
            setApiBaseUrl(response.data.apiBaseUrl || 'https://rostipollos.cloud.invgate.net/api/v2');
            setSyncInterval(response.data.sync_interval_hours || '1');
            setSyncEnabled(response.data.sync_enabled === 'true');
        } catch (error: any) {
            console.error('Error loading config:', error);
            alert('Error al cargar configuración: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const loadSyncStatus = async () => {
        try {
            const token = getToken();
            const response = await axios.get(`${API_BASE}/invgate/sync-status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSyncStatus(response.data);
        } catch (error) {
            console.error('Error loading sync status:', error);
        }
    };

    const loadSyncLogs = async () => {
        try {
            const token = getToken();
            const response = await axios.get(`${API_BASE}/invgate/sync-logs?limit=10`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSyncLogs(response.data);
        } catch (error) {
            console.error('Error loading sync logs:', error);
        }
    };

    const saveConfig = async () => {
        if (!clientId || !tokenUrl) {
            alert('Por favor complete Client ID y Token URL');
            return;
        }

        setSavingConfig(true);
        try {
            const token = getToken();
            const payload = {
                clientId,
                clientSecret,
                tokenUrl,
                apiBaseUrl,
                syncIntervalHours: parseInt(syncInterval),
                syncEnabled
            };
            console.log('Saving InvGate config payload:', {
                ...payload,
                clientSecret: payload.clientSecret ? `[${payload.clientSecret.length} chars]` : 'empty'
            });
            await axios.post(
                `${API_BASE}/invgate/config`,
                payload,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            alert('✅ Configuración guardada exitosamente');
        } catch (error: any) {
            console.error('Error saving config:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || error.message;
            alert('Error al guardar configuración: ' + msg);
        } finally {
            setSavingConfig(false);
        }
    };

    const testConnection = async () => {
        setConnectionStatus('Probando conexión...');
        try {
            const token = getToken();
            const response = await axios.post(
                `${API_BASE}/invgate/test-connection`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (response.data.success) {
                setConnectionStatus('✅ ' + response.data.message);
            } else {
                setConnectionStatus('❌ ' + response.data.message);
            }
        } catch (error: any) {
            setConnectionStatus('❌ Error: ' + (error.response?.data?.error || error.message));
        }
    };

    const triggerSync = async (syncType: 'incremental' | 'full') => {
        if (!confirm(`¿Desea iniciar una sincronización ${syncType === 'full' ? 'COMPLETA' : 'INCREMENTAL'}?`)) {
            return;
        }

        setSyncing(true);
        try {
            const token = getToken();
            await axios.post(
                `${API_BASE}/invgate/sync`,
                { syncType },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            alert('✅ Sincronización iniciada. Revise el estado en unos momentos.');
            setTimeout(() => {
                loadSyncStatus();
                loadSyncLogs();
            }, 2000);
        } catch (error: any) {
            console.error('Error triggering sync:', error);
            alert('Error al iniciar sincronización: ' + (error.response?.data?.error || error.message));
        } finally {
            setSyncing(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Nunca';
        return new Date(dateString).toLocaleString('es-CR');
    };

    const formatDuration = (ms: number | null) => {
        if (!ms) return '-';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    if (loading) {
        return <div className="invgate-admin-loading">Cargando configuración...</div>;
    }

    return (
        <div className="invgate-admin">
            <h2>⚙️ Configuración de InvGate</h2>

            {/* OAuth 2.0 Configuration Section */}
            <div className="config-section">
                <h3>Autenticación OAuth 2.0</h3>
                <p className="config-description">InvGate usa OAuth 2.0 con client_credentials para autenticación.</p>

                <div className="config-form">
                    <div className="form-group">
                        <label>Client ID:</label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="019c6eb1-0ee4-723d-91ce-5e547b33ab3b"
                            className="config-input"
                        />
                        <small>ID de cliente de la credencial OAuth en InvGate</small>
                    </div>

                    <div className="form-group">
                        <label>Client Secret:</label>
                        <input
                            type="text"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder="Secreto de cliente"
                            className="config-input"
                        />
                    </div>

                    <div className="form-group">
                        <label>URL de Token OAuth:</label>
                        <input
                            type="text"
                            value={tokenUrl}
                            onChange={(e) => setTokenUrl(e.target.value)}
                            placeholder="https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token"
                            className="config-input"
                        />
                        <small>URL para obtener el token de acceso</small>
                    </div>

                    <div className="form-group">
                        <label>URL Base del API:</label>
                        <input
                            type="text"
                            value={apiBaseUrl}
                            onChange={(e) => setApiBaseUrl(e.target.value)}
                            placeholder="https://rostipollos.cloud.invgate.net/api/v2"
                            className="config-input"
                        />
                        <small>URL base del API de InvGate</small>
                    </div>

                    <div className="form-group">
                        <label>Frecuencia de Sincronización:</label>
                        <select
                            value={syncInterval}
                            onChange={(e) => setSyncInterval(e.target.value)}
                            className="config-select"
                        >
                            <option value="1">Cada hora</option>
                            <option value="2">Cada 2 horas</option>
                            <option value="4">Cada 4 horas</option>
                            <option value="6">Cada 6 horas</option>
                            <option value="12">Cada 12 horas</option>
                            <option value="24">Cada 24 horas</option>
                        </select>
                    </div>

                    <div className="form-group checkbox-group">
                        <input
                            type="checkbox"
                            id="syncEnabled"
                            checked={syncEnabled}
                            onChange={(e) => setSyncEnabled(e.target.checked)}
                        />
                        <label htmlFor="syncEnabled">Habilitar sincronización automática</label>
                    </div>

                    <div className="config-actions">
                        <button
                            onClick={saveConfig}
                            disabled={savingConfig}
                            className="btn-primary"
                        >
                            {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                        </button>
                        <button
                            onClick={testConnection}
                            className="btn-secondary"
                        >
                            Probar Conexión
                        </button>
                    </div>

                    {connectionStatus && (
                        <div className={`connection-status ${connectionStatus.includes('✅') ? 'success' : 'error'}`}>
                            {connectionStatus}
                        </div>
                    )}
                </div>
            </div>

            {/* Sync Section */}
            <div className="config-section">
                <h3>Sincronización Manual</h3>
                <div className="sync-actions">
                    <button
                        onClick={() => triggerSync('incremental')}
                        disabled={syncing}
                        className="btn-secondary"
                    >
                        {syncing ? 'Sincronizando...' : '🔄 Sync Incremental'}
                    </button>
                    <button
                        onClick={() => triggerSync('full')}
                        disabled={syncing}
                        className="btn-warning"
                    >
                        {syncing ? 'Sincronizando...' : '🔄 Sync Completo'}
                    </button>
                    <button onClick={() => { loadSyncStatus(); loadSyncLogs(); }} className="btn-secondary">
                        📊 Ver Estado
                    </button>
                </div>

                {syncStatus && (
                    <div className="sync-status-card">
                        <h4>Estado del Cron Job</h4>
                        <p>Estado: {syncStatus.cronJob?.isActive ? '✅ Activo' : '⏸️ Inactivo'}</p>
                        {syncStatus.lastSync && (
                            <>
                                <p>Última sync: {formatDate(syncStatus.lastSync.FechaSync)}</p>
                                <p>Estado: {syncStatus.lastSync.Estado}</p>
                                <p>Registros: {syncStatus.lastSync.RegistrosProcesados} procesados</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Sync Logs */}
            {syncLogs.length > 0 && (
                <div className="config-section">
                    <h3>Historial de Sincronizaciones</h3>
                    <div className="sync-logs-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                    <th>Procesados</th>
                                    <th>Nuevos</th>
                                    <th>Actualizados</th>
                                    <th>Duración</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncLogs.map((log) => (
                                    <tr key={log.SyncID} className={log.Estado === 'ERROR' ? 'error-row' : ''}>
                                        <td>{formatDate(log.FechaSync)}</td>
                                        <td>{log.TipoSync}</td>
                                        <td>{log.Estado}</td>
                                        <td>{log.RegistrosProcesados}</td>
                                        <td>{log.RegistrosNuevos}</td>
                                        <td>{log.RegistrosActualizados}</td>
                                        <td>{formatDuration(log.TiempoEjecucionMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
