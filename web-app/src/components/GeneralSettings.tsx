import React, { useState, useEffect } from 'react';
import { fetchConfig, saveConfig, fetchModeloConfig } from '../api';
import { Loader2, AlertCircle, CheckCircle, Database, AlertTriangle } from 'lucide-react';

export const GeneralSettings: React.FC = () => {
    const [tableName, setTableName] = useState<string>('RSM_ALCANCE_DIARIO');
    const [originalValue, setOriginalValue] = useState<string>('RSM_ALCANCE_DIARIO');
    const [availableTables, setAvailableTables] = useState<string[]>(['RSM_ALCANCE_DIARIO']);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastModified, setLastModified] = useState<string | null>(null);
    const [lastUser, setLastUser] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            // Load current config and available tables in parallel
            const [data, configs] = await Promise.all([
                fetchConfig('ALCANCE_TABLE_NAME'),
                fetchModeloConfig().catch(() => [])
            ]);
            const val = data.Valor || 'RSM_ALCANCE_DIARIO';
            setTableName(val);
            setOriginalValue(val);
            setLastModified(data.FechaModificacion);
            setLastUser(data.UsuarioModificacion);

            // Build unique table list: always include RSM_ALCANCE_DIARIO + all from configs
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

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await saveConfig('ALCANCE_TABLE_NAME', tableName);
            setOriginalValue(tableName);
            setLastModified(new Date().toISOString());
            setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
            setTimeout(() => setMessage(null), 4000);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error al guardar' });
        } finally {
            setSaving(false);
        }
    };

    const isProd = tableName === 'RSM_ALCANCE_DIARIO';
    const hasChanges = tableName !== originalValue;

    const getTableLabel = (t: string) => {
        if (t === 'RSM_ALCANCE_DIARIO') return 'Producción';
        if (t === 'RSM_ALCANCE_DIARIO_TEST') return 'Pruebas';
        const suffix = t.replace(/^RSM_ALCANCE_DIARIO_?/, '');
        return suffix || t;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="ml-2 text-gray-500">Cargando configuración...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-gray-900">Configuración General</h2>
                <p className="text-sm text-gray-500 mt-1">Ajustes generales del sistema</p>
            </div>

            {/* Tabla de Alcance Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!isProd ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                            <Database className={`w-5 h-5 ${!isProd ? 'text-amber-600' : 'text-emerald-600'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Tabla de Datos (Alcance)</h3>
                            <p className="text-xs text-gray-500">Seleccione la tabla de datos para presupuesto y alcance</p>
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
                                <p className="text-sm font-semibold text-amber-800">Modo No-Producción Activo</p>
                                <p className="text-xs text-amber-700 mt-1">
                                    El sistema leerá datos de <strong className="font-mono">{tableName}</strong>. Los datos mostrados en presupuesto,
                                    tendencia y alcance <strong>no serán datos reales de producción</strong>.
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
                                    Guardar Cambios
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
