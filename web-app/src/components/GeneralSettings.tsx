import React, { useState, useEffect } from 'react';
import { fetchConfig, saveConfig, fetchModeloConfig, getUserAlcanceTable, saveUserAlcanceTable } from '../api';
import { Loader2, AlertCircle, CheckCircle, Database, AlertTriangle, User, Globe } from 'lucide-react';

export const GeneralSettings: React.FC = () => {
    // === GLOBAL (ADMIN) CONFIG ===
    const [tableName, setTableName] = useState<string>('RSM_ALCANCE_DIARIO');
    const [originalValue, setOriginalValue] = useState<string>('RSM_ALCANCE_DIARIO');
    const [availableTables, setAvailableTables] = useState<string[]>(['RSM_ALCANCE_DIARIO']);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastModified, setLastModified] = useState<string | null>(null);
    const [lastUser, setLastUser] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // === PER-USER OVERRIDE ===
    const [userOverride, setUserOverride] = useState<string | null>(null);
    const [originalOverride, setOriginalOverride] = useState<string | null>(null);
    const [userAvailableTables, setUserAvailableTables] = useState<string[]>(['RSM_ALCANCE_DIARIO']);
    const [globalTable, setGlobalTable] = useState<string>('RSM_ALCANCE_DIARIO');
    const [loadingUser, setLoadingUser] = useState(true);
    const [savingUser, setSavingUser] = useState(false);
    const [messageUser, setMessageUser] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadConfig();
        loadUserConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const [data, configs] = await Promise.all([
                fetchConfig('ALCANCE_TABLE_NAME'),
                fetchModeloConfig().catch(() => [])
            ]);
            const val = data.Valor || 'RSM_ALCANCE_DIARIO';
            setTableName(val);
            setOriginalValue(val);
            setLastModified(data.FechaModificacion);
            setLastUser(data.UsuarioModificacion);

            const tablesFromConfigs = configs.map((c: any) => c.tablaDestino as string);
            const uniqueTables = Array.from(new Set(['RSM_ALCANCE_DIARIO', val, ...tablesFromConfigs]));
            setAvailableTables(uniqueTables);
        } catch {
            setTableName('RSM_ALCANCE_DIARIO');
            setOriginalValue('RSM_ALCANCE_DIARIO');
        } finally {
            setLoading(false);
        }
    };

    const loadUserConfig = async () => {
        setLoadingUser(true);
        try {
            const data = await getUserAlcanceTable();
            setUserOverride(data.override);
            setOriginalOverride(data.override);
            setGlobalTable(data.global);
            setUserAvailableTables(data.availableTables);
        } catch {
            // Silently fail
        } finally {
            setLoadingUser(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await saveConfig('ALCANCE_TABLE_NAME', tableName);
            setOriginalValue(tableName);
            setLastModified(new Date().toISOString());
            setGlobalTable(tableName); // Update global reference in user section
            setMessage({ type: 'success', text: 'Configuración global guardada exitosamente' });
            setTimeout(() => setMessage(null), 4000);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error al guardar' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveUser = async () => {
        setSavingUser(true);
        setMessageUser(null);
        try {
            await saveUserAlcanceTable(userOverride);
            setOriginalOverride(userOverride);
            setMessageUser({ type: 'success', text: userOverride ? 'Preferencia personal guardada' : 'Usando configuración del sistema' });
            setTimeout(() => setMessageUser(null), 4000);
        } catch (err: any) {
            setMessageUser({ type: 'error', text: err.message || 'Error al guardar' });
        } finally {
            setSavingUser(false);
        }
    };

    const isProd = tableName === 'RSM_ALCANCE_DIARIO';
    const hasChanges = tableName !== originalValue;
    const hasUserChanges = userOverride !== originalOverride;

    const getTableLabel = (t: string) => {
        if (t === 'RSM_ALCANCE_DIARIO') return 'Producción';
        if (t === 'RSM_ALCANCE_DIARIO_TEST') return 'Pruebas';
        const suffix = t.replace(/^RSM_ALCANCE_DIARIO_?/, '');
        return suffix || t;
    };

    if (loading || loadingUser) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="ml-2 text-gray-500">Cargando configuración...</span>
            </div>
        );
    }

    // Determine what the user effectively sees
    const effectiveTable = userOverride || globalTable;
    const effectiveIsProd = effectiveTable === 'RSM_ALCANCE_DIARIO';

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-gray-900">Configuración General</h2>
                <p className="text-sm text-gray-500 mt-1">Ajustes generales del sistema</p>
            </div>

            {/* ===== GLOBAL CONFIG (ADMIN) ===== */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!isProd ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                            <Globe className={`w-5 h-5 ${!isProd ? 'text-amber-600' : 'text-emerald-600'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Tabla de Datos — Global</h3>
                            <p className="text-xs text-gray-500">Configuración del sistema para <strong>todos</strong> los usuarios</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* Dynamic table options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {availableTables.map(t => {
                            const isSelected = tableName === t;
                            const isProduction = t === 'RSM_ALCANCE_DIARIO';
                            const borderColor = isSelected
                                ? (isProduction ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-amber-400 bg-amber-50 ring-2 ring-amber-100')
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50';
                            const dotColor = isSelected
                                ? (isProduction ? 'border-emerald-500 bg-emerald-500' : 'border-amber-500 bg-amber-500')
                                : 'border-gray-300';
                            const textColor = isSelected
                                ? (isProduction ? 'text-emerald-800' : 'text-amber-800')
                                : 'text-gray-700';
                            return (
                                <button key={t}
                                    onClick={() => setTableName(t)}
                                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${borderColor}`}
                                >
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${dotColor}`}>
                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className={`text-sm font-bold ${textColor}`}>{getTableLabel(t)}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 font-mono truncate">{t}</div>
                                    </div>
                                    {isSelected && (
                                        <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full uppercase flex-shrink-0 ${isProduction ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                                            Activo
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Non-production warning */}
                    {!isProd && (
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-amber-800">Modo No-Producción Activo (Global)</p>
                                <p className="text-xs text-amber-700 mt-1">
                                    <strong>TODOS</strong> los usuarios leerán datos de <strong className="font-mono">{tableName}</strong>, a menos que tengan una preferencia personal configurada.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Last modified info */}
                    {lastModified && (
                        <p className="text-xs text-gray-400">
                            Última modificación: {new Date(lastModified).toLocaleString('es-CR')}
                            {lastUser && ` por ${lastUser}`}
                        </p>
                    )}

                    {/* Status message */}
                    {message && (
                        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {message.text}
                        </div>
                    )}

                    {/* Save button */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Guardar Cambios Globales
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ===== PER-USER OVERRIDE ===== */}
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-indigo-100 bg-indigo-50/50">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userOverride ? 'bg-violet-100' : 'bg-indigo-100'}`}>
                            <User className={`w-5 h-5 ${userOverride ? 'text-violet-600' : 'text-indigo-600'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Mi Configuración Personal</h3>
                            <p className="text-xs text-gray-500">Solo aplica para tu usuario — no afecta a los demás</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* Option: Use system config */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* System default option */}
                        <button
                            onClick={() => setUserOverride(null)}
                            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${userOverride === null
                                    ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${userOverride === null ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                                }`}>
                                {userOverride === null && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="min-w-0">
                                <div className={`text-sm font-bold ${userOverride === null ? 'text-indigo-800' : 'text-gray-700'}`}>
                                    Usar config del sistema
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    Actual: <span className="font-mono font-bold">{getTableLabel(globalTable)}</span>
                                </div>
                            </div>
                            {userOverride === null && (
                                <span className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full uppercase flex-shrink-0 bg-indigo-200 text-indigo-800">
                                    Activo
                                </span>
                            )}
                        </button>

                        {/* Individual table options */}
                        {userAvailableTables.map(t => {
                            const isSelected = userOverride === t;
                            const isProduction = t === 'RSM_ALCANCE_DIARIO';
                            const borderColor = isSelected
                                ? (isProduction ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-violet-400 bg-violet-50 ring-2 ring-violet-100')
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50';
                            const dotColor = isSelected
                                ? (isProduction ? 'border-emerald-500 bg-emerald-500' : 'border-violet-500 bg-violet-500')
                                : 'border-gray-300';
                            const textColor = isSelected
                                ? (isProduction ? 'text-emerald-800' : 'text-violet-800')
                                : 'text-gray-700';
                            return (
                                <button key={t}
                                    onClick={() => setUserOverride(t)}
                                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${borderColor}`}
                                >
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${dotColor}`}>
                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className={`text-sm font-bold ${textColor}`}>{getTableLabel(t)}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 font-mono truncate">{t}</div>
                                    </div>
                                    {isSelected && (
                                        <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full uppercase flex-shrink-0 ${isProduction ? 'bg-emerald-200 text-emerald-800' : 'bg-violet-200 text-violet-800'}`}>
                                            Personal
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Info about effective table */}
                    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ${userOverride
                            ? (effectiveIsProd ? 'bg-emerald-50 border border-emerald-200' : 'bg-violet-50 border border-violet-200')
                            : 'bg-gray-50 border border-gray-200'
                        }`}>
                        <Database className={`w-5 h-5 flex-shrink-0 mt-0.5 ${userOverride
                                ? (effectiveIsProd ? 'text-emerald-500' : 'text-violet-500')
                                : 'text-gray-400'
                            }`} />
                        <div>
                            <p className={`text-sm font-semibold ${userOverride
                                    ? (effectiveIsProd ? 'text-emerald-800' : 'text-violet-800')
                                    : 'text-gray-600'
                                }`}>
                                {userOverride ? 'Override Personal Activo' : 'Siguiendo configuración del sistema'}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Tu dashboard leerá datos de <strong className="font-mono">{effectiveTable}</strong>
                                {userOverride && (
                                    <> — <span className="text-violet-600 font-semibold">solo para ti</span>, el resto de usuarios ven <strong className="font-mono">{globalTable}</strong></>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Status message */}
                    {messageUser && (
                        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${messageUser.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                            {messageUser.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {messageUser.text}
                        </div>
                    )}

                    {/* Save button */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleSaveUser}
                            disabled={!hasUserChanges || savingUser}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                            {savingUser ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <User className="w-4 h-4" />
                                    Guardar Mi Preferencia
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
