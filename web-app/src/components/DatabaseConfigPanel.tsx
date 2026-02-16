import React, { useState, useEffect } from 'react';
import { Database, Server, CheckCircle, AlertCircle, Loader2, TestTube, Save, RefreshCw } from 'lucide-react';

interface DBConfig {
    Id?: number;
    Modo: string;
    DirectServer?: string;
    DirectDatabase?: string;
    DirectUser?: string;
    ReadServer?: string;
    ReadDatabase?: string;
    ReadUser?: string;
    WriteServer?: string;
    WriteDatabase?: string;
    WriteUser?: string;
}

interface DatabaseConfigPanelProps {
    onConfigSaved?: () => void;
}

export const DatabaseConfigPanel: React.FC<DatabaseConfigPanelProps> = ({ onConfigSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [currentMode, setCurrentMode] = useState<string>('direct');
    const [selectedMode, setSelectedMode] = useState<'direct' | 'hybrid'>('direct');

    // Direct mode fields
    const [directServer, setDirectServer] = useState('');
    const [directDatabase, setDirectDatabase] = useState('');
    const [directUser, setDirectUser] = useState('');
    const [directPassword, setDirectPassword] = useState('');

    // Hybrid mode fields - Read
    const [readServer, setReadServer] = useState('');
    const [readDatabase, setReadDatabase] = useState('');
    const [readUser, setReadUser] = useState('');
    const [readPassword, setReadPassword] = useState('');

    // Hybrid mode fields - Write
    const [writeServer, setWriteServer] = useState('');
    const [writeDatabase, setWriteDatabase] = useState('');
    const [writeUser, setWriteUser] = useState('');
    const [writePassword, setWritePassword] = useState('');

    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE}/admin/db-config`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('No se pudo cargar la configuración');
            }

            const data = await response.json();
            setCurrentMode(data.currentMode || 'direct');

            if (data.config) {
                setSelectedMode(data.config.Modo || 'direct');
                setDirectServer(data.config.DirectServer || '');
                setDirectDatabase(data.config.DirectDatabase || '');
                setDirectUser(data.config.DirectUser || '');

                setReadServer(data.config.ReadServer || '');
                setReadDatabase(data.config.ReadDatabase || '');
                setReadUser(data.config.ReadUser || '');

                setWriteServer(data.config.WriteServer || '');
                setWriteDatabase(data.config.WriteDatabase || '');
                setWriteUser(data.config.WriteUser || '');
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error cargando configuración' });
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setMessage(null);
        try {
            const config = {
                modo: selectedMode,
                directServer,
                directDatabase,
                directUser,
                directPassword,
                readServer,
                readDatabase,
                readUser,
                readPassword,
                writeServer,
                writeDatabase,
                writeUser,
                writePassword
            };

            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE}/admin/test-db-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ type: 'success', text: result.message });
            } else {
                setMessage({ type: 'error', text: result.message });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Error probando conexión: ' + err.message });
        } finally {
            setTesting(false);
        }
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const config = {
                modo: selectedMode,
                directServer,
                directDatabase,
                directUser,
                directPassword,
                readServer,
                readDatabase,
                readUser,
                readPassword,
                writeServer,
                writeDatabase,
                writeUser,
                writePassword
            };

            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE}/admin/db-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                setMessage({
                    type: 'info',
                    text: result.message || 'Configuración guard ada. Reinicie el servidor para aplicar cambios.'
                });
                onConfigSaved?.();
                // Clear passwords for security
                setDirectPassword('');
                setReadPassword('');
                setWritePassword('');
            } else {
                setMessage({ type: 'error', text: result.error || result.message || 'Error guardando configuración' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Error guardando configuración: ' + err.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="ml-3 text-gray-500">Cargando configuración...</span>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-xl">
                    <Database className="w-5 h-5 text-blue-700" />
                </div>
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900">Configuración de Base de Datos</h2>
                    <p className="text-sm text-gray-500">Modo actual: <span className="font-semibold text-blue-600">{currentMode === 'direct' ? 'SQL Directo' : 'Azure Hybrid'}</span></p>
                </div>
            </div>

            {/* Messages */}
            {message && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl mb-6 ${message.type === 'success' ? 'bg-green-50 border border-green-200' :
                        message.type === 'error' ? 'bg-red-50 border border-red-200' :
                            'bg-blue-50 border border-blue-200'
                    }`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /> :
                        message.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" /> :
                            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />}
                    <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-700' :
                            message.type === 'error' ? 'text-red-700' :
                                'text-blue-700'
                        }`}>{message.text}</p>
                </div>
            )}

            {/* Mode Selector */}
            <div className="mb-6">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-3">Modo de Conexión</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => setSelectedMode('direct')}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${selectedMode === 'direct'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className={`p-2 rounded-lg ${selectedMode === 'direct' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                            <Server className={`w-5 h-5 ${selectedMode === 'direct' ? 'text-blue-600' : 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-bold text-gray-900">SQL Directo</div>
                            <div className="text-xs text-gray-500 mt-1">Una sola conexión. Ideal para desarrollo local con VPN.</div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setSelectedMode('hybrid')}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${selectedMode === 'hybrid'
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className={`p-2 rounded-lg ${selectedMode === 'hybrid' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                            <Database className={`w-5 h-5 ${selectedMode === 'hybrid' ? 'text-purple-600' : 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-bold text-gray-900">Azure Hybrid</div>
                            <div className="text-xs text-gray-500 mt-1">Lectura en Azure SQL + Escritura on-premise.</div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Configuration Forms */}
            <div className="space-y-6">
                {selectedMode === 'direct' ? (
                    <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50">
                        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
                            <Server className="w-4 h-4" />
                            Configuración SQL Directo
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Servidor</label>
                                <input
                                    type="text"
                                    value={directServer}
                                    onChange={e => setDirectServer(e.target.value)}
                                    placeholder="10.29.1.14"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Base de Datos</label>
                                <input
                                    type="text"
                                    value={directDatabase}
                                    onChange={e => setDirectDatabase(e.target.value)}
                                    placeholder="RP_BI_RESUMENES"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                                <input
                                    type="text"
                                    value={directUser}
                                    onChange={e => setDirectUser(e.target.value)}
                                    placeholder="sa"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                                <input
                                    type="password"
                                    value={directPassword}
                                    onChange={e => setDirectPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Read Pool */}
                        <div className="border border-green-200 rounded-xl p-5 bg-green-50/30">
                            <h3 className="text-sm font-bold text-green-800 uppercase mb-4 flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                Pool de Lectura (Azure SQL)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Servidor Azure</label>
                                    <input
                                        type="text"
                                        value={readServer}
                                        onChange={e => setReadServer(e.target.value)}
                                        placeholder="myserver.database.windows.net"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-200 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Base de Datos</label>
                                    <input
                                        type="text"
                                        value={readDatabase}
                                        onChange={e => setReadDatabase(e.target.value)}
                                        placeholder="RP_BI_RESUMENES_READ"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-200 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                                    <input
                                        type="text"
                                        value={readUser}
                                        onChange={e => setReadUser(e.target.value)}
                                        placeholder="azureuser"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-200 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                                    <input
                                        type="password"
                                        value={readPassword}
                                        onChange={e => setReadPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-200 focus:border-green-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Write Pool */}
                        <div className="border border-orange-200 rounded-xl p-5 bg-orange-50/30">
                            <h3 className="text-sm font-bold text-orange-800 uppercase mb-4 flex items-center gap-2">
                                <Server className="w-4 h-4" />
                                Pool de Escritura (On-Premise via Hybrid)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Servidor Local</label>
                                    <input
                                        type="text"
                                        value={writeServer}
                                        onChange={e => setWriteServer(e.target.value)}
                                        placeholder="10.29.1.14"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Base de Datos</label>
                                    <input
                                        type="text"
                                        value={writeDatabase}
                                        onChange={e => setWriteDatabase(e.target.value)}
                                        placeholder="RP_BI_RESUMENES"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                                    <input
                                        type="text"
                                        value={writeUser}
                                        onChange={e => setWriteUser(e.target.value)}
                                        placeholder="sa"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                                    <input
                                        type="password"
                                        value={writePassword}
                                        onChange={e => setWritePassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-gray-200">
                <button
                    onClick={loadConfig}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                    <RefreshCw className="w-4 h-4" />
                    Recargar
                </button>
                <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    {testing ? 'Probando...' : 'Probar Conexión'}
                </button>
                <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-indigo-200"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>

            {/* Warning about restart */}
            {selectedMode !== currentMode && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-800">
                            <strong>Importante:</strong> Los cambios en el modo de conexión requieren reiniciar el servidor para aplicarse.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
