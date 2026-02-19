import React, { useState, useEffect } from 'react';
import {
    saveAuxiliaryDBConfig,
    getAuxiliaryDBConfig,
    testAuxiliaryDBConnection,
    getDBStatus,
    syncDatabases,
    type AuxiliaryDBConfig,
    type DBStatus as DBStatusType,
    type SyncStats
} from '../api';

export function AuxiliaryDBAdminPanel() {
    const [config, setConfig] = useState<AuxiliaryDBConfig>({
        server: '',
        database: '',
        username: 'sa',
        password: ''
    });
    const [dbStatus, setDBStatus] = useState<DBStatusType | null>(null);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');
    const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load config and status on mount
    useEffect(() => {
        loadConfig();
        loadStatus();
    }, []);

    const loadConfig = async () => {
        try {
            const loadedConfig = await getAuxiliaryDBConfig();
            setConfig(prev => ({ ...prev, ...loadedConfig }));
        } catch (err) {
            console.error('Error loading config:', err);
        }
    };

    const loadStatus = async () => {
        try {
            const status = await getDBStatus();
            setDBStatus(status);
        } catch (err) {
            console.error('Error loading status:', err);
        }
    };

    const handleTest = async () => {
        if (!config.server || !config.database) {
            setMessage({ type: 'error', text: 'Server y Database son requeridos' });
            return;
        }

        setTesting(true);
        setMessage(null);

        try {
            const result = await testAuxiliaryDBConnection(config);
            if (result.success) {
                setMessage({ type: 'success', text: '✅ Conexión exitosa' });
            } else {
                setMessage({ type: 'error', text: `❌ Error: ${result.message}` });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: `❌ ${err.message}` });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!config.server || !config.database) {
            setMessage({ type: 'error', text: 'Server y Database son requeridos' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const result = await saveAuxiliaryDBConfig(config);
            setMessage({ type: 'success', text: result.message });
            await loadStatus();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleSync = async () => {
        if (!dbStatus?.auxiliaryConfigured) {
            setMessage({ type: 'error', text: 'Debe configurar la BD auxiliar primero' });
            return;
        }

        setSyncing(true);
        setMessage(null);
        setSyncProgress('Iniciando sincronización...');
        setSyncStats(null);

        try {
            const result = await syncDatabases();
            setSyncStats(result.stats);
            setMessage({ type: 'success', text: result.message });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSyncing(false);
            setSyncProgress('');
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">⚙️ Base de Datos Auxiliar</h3>
                <p className="text-sm text-gray-600">
                    Configure una base de datos de respaldo que se activará automáticamente si la principal no responde
                </p>
            </div>

            {/* Estado Actual */}
            {dbStatus && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Base de Datos Activa:</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${dbStatus.activeMode === 'primary'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {dbStatus.activeMode === 'primary' ? '🟢 Principal' : '🟡 Auxiliar'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Estado Principal:</span>
                        <span className={`text-sm ${dbStatus.primaryHealthy ? 'text-green-600' : 'text-red-600'}`}>
                            {dbStatus.primaryHealthy ? '✅ Saludable' : '❌ No disponible'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">BD Auxiliar Configurada:</span>
                        <span className={`text-sm ${dbStatus.auxiliaryConfigured ? 'text-green-600' : 'text-gray-500'}`}>
                            {dbStatus.auxiliaryConfigured ? '✅ Sí' : '⚪ No'}
                        </span>
                    </div>
                </div>
            )}

            {/* Mensaje */}
            {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Formulario de Configuración */}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Servidor</label>
                    <input
                        type="text"
                        value={config.server}
                        onChange={e => setConfig({ ...config, server: e.target.value })}
                        placeholder="ej: 10.29.1.15"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base de Datos</label>
                    <input
                        type="text"
                        value={config.database}
                        onChange={e => setConfig({ ...config, database: e.target.value })}
                        placeholder="ej: RP_BI_RESUMENES_BACKUP"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                    <input
                        type="text"
                        value={config.username}
                        onChange={e => setConfig({ ...config, username: e.target.value })}
                        placeholder="ej: sa"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contraseña <span className="text-gray-500 text-xs">(dejar en blanco para no cambiar)</span>
                    </label>
                    <input
                        type="password"
                        value={config.password}
                        onChange={e => setConfig({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex gap-3">
                <button
                    onClick={handleTest}
                    disabled={testing || !config.server || !config.database}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                    {testing ? '⏳ Probando...' : '🔌 Probar Conexión'}
                </button>

                <button
                    onClick={handleSave}
                    disabled={saving || !config.server || !config.database}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                    {saving ? '⏳ Guardando...' : '💾 Guardar Configuración'}
                </button>
            </div>

            {/* Sincronización */}
            {dbStatus?.auxiliaryConfigured && (
                <div className="border-t pt-6 space-y-4">
                    <h4 className="font-semibold text-gray-900">Sincronización de Datos</h4>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar Datos a BD Auxiliar'}
                    </button>

                    {syncing && syncProgress && (
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                <span className="text-sm text-blue-800">{syncProgress}</span>
                            </div>
                        </div>
                    )}

                    {syncStats && (
                        <div className="bg-green-50 p-4 rounded-lg space-y-2">
                            <h5 className="font-semibold text-green-900">✅ Sincronización Completada</h5>
                            <div className="text-sm text-green-800 space-y-1">
                                {Object.entries(syncStats).map(([table, count]) => (
                                    count !== undefined && (
                                        <div key={table} className="flex justify-between">
                                            <span>{table}:</span>
                                            <span className="font-medium">{count.toLocaleString()} registros</span>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
