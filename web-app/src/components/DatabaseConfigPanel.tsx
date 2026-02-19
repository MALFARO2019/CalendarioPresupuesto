import React, { useState, useEffect } from 'react';
import {
    Database, Server, Key, AlertCircle, CheckCircle,
    Loader2, Save, RefreshCw, Wifi, WifiOff, ShieldCheck,
    ChevronRight, ChevronDown, RotateCcw, ArrowDownToLine
} from 'lucide-react';
import {
    API_BASE, getToken,
    saveAuxiliaryDBConfig, getAuxiliaryDBConfig,
    testAuxiliaryDBConnection, getDBStatus, syncDatabases
} from '../api';

interface DatabaseConfigPanelProps {
    onConfigSaved?: () => void;
}

interface MainDBConfig {
    directServer: string;
    directDatabase: string;
    directUser: string;
    directPassword: string;
    hybridReadServer: string;
    hybridReadDatabase: string;
    hybridReadUser: string;
    hybridReadPassword: string;
    hybridWriteServer: string;
    hybridWriteDatabase: string;
    hybridWriteUser: string;
    hybridWritePassword: string;
}

interface AuxConfig {
    server: string;
    database: string;
    username: string;
    password: string;
    port: string; // optional direct port (avoids SQL Server Browser UDP lookup)
}

interface DBStatusInfo {
    activeMode: 'primary' | 'auxiliary';
    primaryHealthy: boolean;
    auxiliaryConfigured: boolean;
    lastHealthCheck: string | null;
}

interface SyncStats {
    RSM_ALCANCE_DIARIO?: number;
    APP_USUARIOS?: number;
    [key: string]: number | undefined;
}

const EMPTY_MAIN: MainDBConfig = {
    directServer: '', directDatabase: '', directUser: '', directPassword: '',
    hybridReadServer: '', hybridReadDatabase: '', hybridReadUser: '', hybridReadPassword: '',
    hybridWriteServer: '', hybridWriteDatabase: '', hybridWriteUser: '', hybridWritePassword: ''
};

const EMPTY_AUX: AuxConfig = { server: '', database: '', username: '', password: '', port: '' };

// ─── Shared input component ──────────────────────────────────────────────────
function Field({
    label, value, onChange, type = 'text', placeholder = '', required = false
}: {
    label: string; value: string; onChange: (v: string) => void;
    type?: string; placeholder?: string; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none
                           focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white transition-all"
            />
        </div>
    );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {ok ? <CheckCircle className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {label}
        </span>
    );
}

export const DatabaseConfigPanel: React.FC<DatabaseConfigPanelProps> = ({ onConfigSaved }) => {
    // ── Main DB state
    const [selectedMode, setSelectedMode] = useState<'direct' | 'hybrid'>('direct');
    const [savedMode, setSavedMode] = useState<'direct' | 'hybrid' | null>(null); // Mode saved in DB
    const [currentMode, setCurrentMode] = useState<string | null>(null); // primary/auxiliary
    const [mainConfig, setMainConfig] = useState<MainDBConfig>(EMPTY_MAIN);
    const [mainLoading, setMainLoading] = useState(true);
    const [mainTesting, setMainTesting] = useState(false);
    const [mainSaving, setMainSaving] = useState(false);
    const [mainMsg, setMainMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [mainExpanded, setMainExpanded] = useState(true);

    // ── Auxiliary DB state
    const [auxConfig, setAuxConfig] = useState<AuxConfig>(EMPTY_AUX);
    const [auxLoading, setAuxLoading] = useState(true);
    const [auxTesting, setAuxTesting] = useState(false);
    const [auxSaving, setAuxSaving] = useState(false);
    const [auxSyncing, setAuxSyncing] = useState(false);
    const [auxMsg, setAuxMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [dbStatus, setDbStatus] = useState<DBStatusInfo | null>(null);
    const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
    const [auxExpanded, setAuxExpanded] = useState(true);

    // ─── Load on mount ────────────────────────────────────────────────────────
    useEffect(() => {
        loadMainConfig();
        loadAuxConfig();
        loadDBStatus();
    }, []);

    async function loadMainConfig() {
        setMainLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/db-config`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setCurrentMode(data.currentMode || 'primary');
            if (data.config) {
                const c = data.config;
                const mode: 'direct' | 'hybrid' = c.Modo === 'hybrid' ? 'hybrid' : 'direct';
                setSelectedMode(mode);
                setSavedMode(mode);
                setMainConfig({
                    directServer: c.DirectServer || '',
                    directDatabase: c.DirectDatabase || '',
                    directUser: c.DirectUser || '',
                    directPassword: c.DirectPassword || '',
                    hybridReadServer: c.ReadServer || '',
                    hybridReadDatabase: c.ReadDatabase || '',
                    hybridReadUser: c.ReadUser || '',
                    hybridReadPassword: c.ReadPassword || '',
                    hybridWriteServer: c.WriteServer || '',
                    hybridWriteDatabase: c.WriteDatabase || '',
                    hybridWriteUser: c.WriteUser || '',
                    hybridWritePassword: c.WritePassword || '',
                });
            }
        } catch {
            // Silent - either no config saved yet or DB not available; user can still edit fields
        } finally {
            setMainLoading(false);
        }
    }

    async function loadAuxConfig() {
        setAuxLoading(true);
        try {
            const data = await getAuxiliaryDBConfig();
            setAuxConfig({
                server: data.server || '',
                database: data.database || '',
                username: data.username || '',
                password: data.password || '',   // now pre-filled from server (decrypted)
                port: data.port || '',
            });
        } catch {
            // silent — no aux config yet
        } finally {
            setAuxLoading(false);
        }
    }

    async function loadDBStatus() {
        try {
            const status = await getDBStatus();
            setDbStatus(status);
        } catch {
            // silent
        }
    }

    // ─── Main DB handlers ─────────────────────────────────────────────────────
    function setMain(key: keyof MainDBConfig, val: string) {
        setMainConfig(prev => ({ ...prev, [key]: val }));
    }

    async function handleTestMain() {
        setMainTesting(true);
        setMainMsg(null);
        try {
            const payload = selectedMode === 'direct'
                ? { mode: 'direct', server: mainConfig.directServer, database: mainConfig.directDatabase, user: mainConfig.directUser, password: mainConfig.directPassword }
                : {
                    mode: 'hybrid',
                    readServer: mainConfig.hybridReadServer, readDatabase: mainConfig.hybridReadDatabase, readUser: mainConfig.hybridReadUser, readPassword: mainConfig.hybridReadPassword,
                    writeServer: mainConfig.hybridWriteServer, writeDatabase: mainConfig.hybridWriteDatabase, writeUser: mainConfig.hybridWriteUser, writePassword: mainConfig.hybridWritePassword
                };
            const res = await fetch(`${API_BASE}/admin/test-db-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            setMainMsg({ type: data.success ? 'success' : 'error', text: data.message || (data.success ? 'Conexión exitosa' : 'Error de conexión') });
        } catch (err: any) {
            setMainMsg({ type: 'error', text: err.message });
        } finally {
            setMainTesting(false);
        }
    }

    async function handleSaveMain() {
        setMainSaving(true);
        setMainMsg(null);
        try {
            const payload = selectedMode === 'direct'
                ? { Modo: 'direct', DirectServer: mainConfig.directServer, DirectDatabase: mainConfig.directDatabase, DirectUser: mainConfig.directUser, DirectPassword: mainConfig.directPassword }
                : {
                    Modo: 'hybrid',
                    ReadServer: mainConfig.hybridReadServer, ReadDatabase: mainConfig.hybridReadDatabase, ReadUser: mainConfig.hybridReadUser, ReadPassword: mainConfig.hybridReadPassword,
                    WriteServer: mainConfig.hybridWriteServer, WriteDatabase: mainConfig.hybridWriteDatabase, WriteUser: mainConfig.hybridWriteUser, WritePassword: mainConfig.hybridWritePassword
                };
            const res = await fetch(`${API_BASE}/admin/db-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar');
            setMainMsg({ type: 'success', text: data.message || 'Configuración guardada' });
            onConfigSaved?.();
        } catch (err: any) {
            setMainMsg({ type: 'error', text: err.message });
        } finally {
            setMainSaving(false);
        }
    }

    // ─── Auxiliary DB handlers ────────────────────────────────────────────────
    function setAux(key: keyof AuxConfig, val: string) {
        setAuxConfig(prev => ({ ...prev, [key]: val }));
    }

    async function handleTestAux() {
        setAuxTesting(true);
        setAuxMsg(null);
        try {
            const result = await testAuxiliaryDBConnection(auxConfig);
            setAuxMsg({ type: result.success ? 'success' : 'error', text: result.message });
        } catch (err: any) {
            setAuxMsg({ type: 'error', text: err.message });
        } finally {
            setAuxTesting(false);
            loadDBStatus();
        }
    }

    async function handleSaveAux() {
        setAuxSaving(true);
        setAuxMsg(null);
        try {
            const result = await saveAuxiliaryDBConfig(auxConfig);
            setAuxMsg({ type: 'success', text: result.message || 'Configuración guardada' });
            loadDBStatus();
        } catch (err: any) {
            setAuxMsg({ type: 'error', text: err.message });
        } finally {
            setAuxSaving(false);
        }
    }

    async function handleSync() {
        setAuxSyncing(true);
        setAuxMsg(null);
        setSyncStats(null);
        try {
            const result = await syncDatabases();
            setSyncStats(result.stats);
            setAuxMsg({ type: 'success', text: result.message || 'Sincronización completada' });
        } catch (err: any) {
            setAuxMsg({ type: 'error', text: err.message });
        } finally {
            setAuxSyncing(false);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const msgClass = (type: 'success' | 'error') =>
        type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700';

    const msgIcon = (type: 'success' | 'error') =>
        type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />;

    return (
        <div className="space-y-6">
            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN 1 — Conexión Principal
            ══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

                {/* Header */}
                <button
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                    onClick={() => setMainExpanded(v => !v)}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                            <Database className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-gray-900">Conexión Principal</h2>
                            <p className="text-xs text-gray-500">
                                Base de datos primaria de la aplicación
                                {currentMode && (
                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${currentMode === 'primary' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {currentMode === 'primary' ? 'Activa' : 'Usando BD Auxiliar'}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    {mainExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                {mainExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                        {mainLoading ? (
                            <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
                                <Loader2 className="w-5 h-5 animate-spin" /> Cargando configuración...
                            </div>
                        ) : (
                            <>
                                {/* Mode selector */}
                                <div className="mt-5 mb-5 flex gap-3">
                                    {(['direct', 'hybrid'] as const).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setSelectedMode(mode)}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${selectedMode === mode
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                        >
                                            {mode === 'direct' ? '🔌 SQL Directo' : '☁️ Azure Hybrid'}
                                        </button>
                                    ))}
                                </div>

                                {selectedMode === 'direct' ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Field label="Servidor" value={mainConfig.directServer} onChange={v => setMain('directServer', v)} placeholder="ip\instancia o localhost\SQLEXPRESS" required />
                                        <Field label="Base de Datos" value={mainConfig.directDatabase} onChange={v => setMain('directDatabase', v)} placeholder="NombreDB" required />
                                        <Field label="Usuario" value={mainConfig.directUser} onChange={v => setMain('directUser', v)} placeholder="sa" />
                                        <div>
                                            <Field label="Contraseña" value={mainConfig.directPassword} onChange={v => setMain('directPassword', v)} type="password" placeholder="Ingrese contraseña para probar/guardar" />
                                            {!mainConfig.directPassword && (
                                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> No pre-rellenada por seguridad — escríbala para probar o cambiarla
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1">
                                                <span className="w-2 h-2 bg-blue-400 rounded-full inline-block" /> Lectura (Azure SQL)
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50 rounded-xl p-3">
                                                <Field label="Servidor" value={mainConfig.hybridReadServer} onChange={v => setMain('hybridReadServer', v)} placeholder="servidor.database.windows.net" required />
                                                <Field label="Base de Datos" value={mainConfig.hybridReadDatabase} onChange={v => setMain('hybridReadDatabase', v)} placeholder="NombreDB" required />
                                                <Field label="Usuario" value={mainConfig.hybridReadUser} onChange={v => setMain('hybridReadUser', v)} placeholder="usuario@servidor" />
                                                <Field label="Contraseña" value={mainConfig.hybridReadPassword} onChange={v => setMain('hybridReadPassword', v)} type="password" placeholder="••••••••" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1">
                                                <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block" /> Escritura (On-Premise)
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50 rounded-xl p-3">
                                                <Field label="Servidor" value={mainConfig.hybridWriteServer} onChange={v => setMain('hybridWriteServer', v)} placeholder="servidor\instancia" required />
                                                <Field label="Base de Datos" value={mainConfig.hybridWriteDatabase} onChange={v => setMain('hybridWriteDatabase', v)} placeholder="NombreDB" required />
                                                <Field label="Usuario" value={mainConfig.hybridWriteUser} onChange={v => setMain('hybridWriteUser', v)} placeholder="sa" />
                                                <Field label="Contraseña" value={mainConfig.hybridWritePassword} onChange={v => setMain('hybridWritePassword', v)} type="password" placeholder="••••••••" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {savedMode !== null && selectedMode !== savedMode && (
                                    <div className="mt-4 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        Cambiar el modo de conexión requiere reiniciar el servidor.
                                    </div>
                                )}

                                {mainMsg && (
                                    <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${msgClass(mainMsg.type)}`}>
                                        {msgIcon(mainMsg.type)} {mainMsg.text}
                                    </div>
                                )}

                                <div className="flex gap-3 mt-5 justify-end">
                                    <button
                                        onClick={handleTestMain}
                                        disabled={mainTesting}
                                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-all"
                                    >
                                        {mainTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                        Probar Conexión
                                    </button>
                                    <button
                                        onClick={handleSaveMain}
                                        disabled={mainSaving}
                                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm"
                                    >
                                        {mainSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN 2 — Base de Datos Auxiliar (Fallback)
            ══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

                {/* Header */}
                <button
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                    onClick={() => setAuxExpanded(v => !v)}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-gray-900">BD Auxiliar — Fallback</h2>
                            <p className="text-xs text-gray-500">Conexión de emergencia cuando no hay VPN</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {dbStatus && (
                            <StatusBadge
                                ok={dbStatus.activeMode === 'auxiliary'}
                                label={dbStatus.activeMode === 'auxiliary' ? 'En uso' : dbStatus.auxiliaryConfigured ? 'Configurada' : 'No configurada'}
                            />
                        )}
                        {auxExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                </button>

                {auxExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100">

                        {/* Status strip */}
                        {dbStatus && (
                            <div className="mt-4 grid grid-cols-3 gap-2 mb-4">
                                <div className={`rounded-lg px-3 py-2 text-center border ${dbStatus.primaryHealthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <p className="text-xs font-semibold text-gray-600 mb-0.5">BD Principal</p>
                                    <span className={`text-xs font-bold ${dbStatus.primaryHealthy ? 'text-green-700' : 'text-red-700'}`}>
                                        {dbStatus.primaryHealthy ? '✓ Online' : '✗ Offline'}
                                    </span>
                                </div>
                                <div className={`rounded-lg px-3 py-2 text-center border ${dbStatus.auxiliaryConfigured ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <p className="text-xs font-semibold text-gray-600 mb-0.5">BD Auxiliar</p>
                                    <span className={`text-xs font-bold ${dbStatus.auxiliaryConfigured ? 'text-amber-700' : 'text-gray-500'}`}>
                                        {dbStatus.auxiliaryConfigured ? '✓ Configurada' : '— Sin config'}
                                    </span>
                                </div>
                                <div className={`rounded-lg px-3 py-2 text-center border ${dbStatus.activeMode === 'auxiliary' ? 'bg-amber-50 border-amber-300' : 'bg-indigo-50 border-indigo-200'}`}>
                                    <p className="text-xs font-semibold text-gray-600 mb-0.5">Modo Activo</p>
                                    <span className={`text-xs font-bold ${dbStatus.activeMode === 'auxiliary' ? 'text-amber-700' : 'text-indigo-700'}`}>
                                        {dbStatus.activeMode === 'auxiliary' ? '⚡ Auxiliar' : '● Principal'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {auxLoading ? (
                            <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Servidor" value={auxConfig.server} onChange={v => setAux('server', v)} placeholder="SERVIDOR\INSTANCIA" required />
                                    <Field label="Puerto (opcional)" value={auxConfig.port} onChange={v => setAux('port', v)} placeholder="ej. 1433, 1435 — vacío = Auto (Browser)" />
                                    <Field label="Base de Datos" value={auxConfig.database} onChange={v => setAux('database', v)} placeholder="NombreDB" required />
                                    <Field label="Usuario" value={auxConfig.username} onChange={v => setAux('username', v)} placeholder="sa" />
                                    <Field label="Contraseña" value={auxConfig.password} onChange={v => setAux('password', v)} type="password" placeholder="••••••••" />
                                </div>

                                {auxMsg && (
                                    <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${msgClass(auxMsg.type)}`}>
                                        {msgIcon(auxMsg.type)} {auxMsg.text}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 mt-5 justify-end">
                                    <button
                                        onClick={() => loadDBStatus()}
                                        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Actualizar Estado
                                    </button>
                                    <button
                                        onClick={handleTestAux}
                                        disabled={auxTesting || !auxConfig.server || !auxConfig.database}
                                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-all"
                                    >
                                        {auxTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                        Probar
                                    </button>
                                    <button
                                        onClick={handleSaveAux}
                                        disabled={auxSaving || !auxConfig.server || !auxConfig.database}
                                        className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm"
                                    >
                                        {auxSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                </div>

                                {/* Sync section — visible only when aux is configured */}
                                {dbStatus?.auxiliaryConfigured && (
                                    <div className="mt-5 border-t border-dashed border-gray-200 pt-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-sm font-bold text-gray-800">Sincronizar datos</p>
                                                <p className="text-xs text-gray-500 mt-0.5">Copia los datos del año actual a la BD auxiliar</p>
                                            </div>
                                            <button
                                                onClick={handleSync}
                                                disabled={auxSyncing}
                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm"
                                            >
                                                {auxSyncing
                                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...</>
                                                    : <><ArrowDownToLine className="w-4 h-4" /> Sincronizar ahora</>
                                                }
                                            </button>
                                        </div>

                                        {syncStats && (
                                            <div className="grid grid-cols-2 gap-2 mt-3">
                                                {Object.entries(syncStats).map(([table, count]) => (
                                                    <div key={table} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                                        <span className="text-xs font-mono text-gray-600 truncate">{table}</span>
                                                        <span className="text-xs font-bold text-indigo-700 ml-2">{count?.toLocaleString()} reg.</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
