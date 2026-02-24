import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchModeloConfig, saveModeloConfig, deleteModeloConfig,
    ejecutarRecalculo, fetchValidacion,
    getUser, type ModeloConfig as ModeloConfigType, type ValidacionResult
} from '../../api';

interface Props {
    onConfigSelect: (config: ModeloConfigType | null) => void;
    selectedConfigId: number | null;
}

export const ModeloConfig: React.FC<Props> = ({ onConfigSelect, selectedConfigId }) => {
    const { showConfirm } = useToast();
    const user = getUser();
    const isAdmin = user?.esAdmin;
    const canRecalc = isAdmin || (user as any)?.ejecutarRecalculo;

    const [configs, setConfigs] = useState<ModeloConfigType[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [nombre, setNombre] = useState('');
    const [ano, setAno] = useState(new Date().getFullYear());
    const [tablaSufijo, setTablaSufijo] = useState('');
    const [hora, setHora] = useState('06:00');

    // Validation
    const [validacion, setValidacion] = useState<ValidacionResult[]>([]);
    const [loadingVal, setLoadingVal] = useState(false);
    const [recalcId, setRecalcId] = useState<number | null>(null); // which config is recalculating
    const [togglingJobId, setTogglingJobId] = useState<number | null>(null); // which config is toggling job

    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchModeloConfig();
            setConfigs(data);
            // Auto-select first active config if none selected
            if (!selectedConfigId && data.length > 0) {
                const active = data.find(c => c.activo) || data[0];
                onConfigSelect(active);
            } else if (selectedConfigId) {
                const sel = data.find(c => c.id === selectedConfigId);
                if (sel) onConfigSelect(sel);
            }
        } finally {
            setLoading(false);
        }
    }, [selectedConfigId, onConfigSelect]);

    useEffect(() => { loadConfigs(); }, []);

    const resetForm = () => {
        setShowForm(false);
        setEditId(null);
        setNombre('');
        setAno(new Date().getFullYear());
        setTablaSufijo('');
        setHora('06:00');
    };

    const handleEdit = (config: ModeloConfigType) => {
        setEditId(config.id);
        setNombre(config.nombrePresupuesto);
        setAno(config.anoModelo);
        setTablaSufijo(config.tablaDestino.replace(/^RSM_ALCANCE_DIARIO/, ''));
        setHora(config.horaCalculo);
        setShowForm(true);
        setMessage(null);
    };

    const handleSave = async () => {
        if (!nombre.trim()) {
            setMessage({ type: 'error', text: 'El nombre es requerido' });
            return;
        }
        try {
            setSaving(true);
            setMessage(null);
            const tablaFinal = 'RSM_ALCANCE_DIARIO' + tablaSufijo;
            await saveModeloConfig({
                id: editId || undefined,
                nombrePresupuesto: nombre.trim(),
                anoModelo: ano,
                tablaDestino: tablaFinal,
                horaCalculo: hora,
            });
            setMessage({ type: 'success', text: editId ? 'Configuración actualizada' : 'Configuración creada' });
            resetForm();
            await loadConfigs();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number, nombre: string) => {
        if (!await showConfirm({ message: `¿Eliminar la configuración "${nombre}"?`, destructive: true })) return;
        try {
            setMessage(null);
            await deleteModeloConfig(id);
            setMessage({ type: 'success', text: 'Configuración eliminada' });
            if (selectedConfigId === id) onConfigSelect(null);
            await loadConfigs();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    const handleSelect = (config: ModeloConfigType) => {
        onConfigSelect(config);
    };

    const handleRecalc = async (config: ModeloConfigType) => {
        try {
            setRecalcId(config.id);
            setMessage({ type: 'info', text: `Recalculando "${config.nombrePresupuesto}"... esto puede tomar varios minutos.` });
            const result = await ejecutarRecalculo(config.nombrePresupuesto);
            setMessage({ type: 'success', text: `Recálculo completado: ${result.totalRegistros?.toLocaleString() || '—'} registros generados` });
            await loadConfigs();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setRecalcId(null);
        }
    };
    const handleToggleJob = async (config: ModeloConfigType) => {
        try {
            setTogglingJobId(config.id);
            setMessage(null);
            await saveModeloConfig({
                id: config.id,
                nombrePresupuesto: config.nombrePresupuesto,
                anoModelo: config.anoModelo,
                tablaDestino: config.tablaDestino,
                horaCalculo: config.horaCalculo,
                ejecutarEnJob: !config.ejecutarEnJob,
            });
            await loadConfigs();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setTogglingJobId(null);
        }
    };

    const handleValidar = async () => {
        const sel = configs.find(c => c.id === selectedConfigId);
        if (!sel) {
            setMessage({ type: 'error', text: 'Seleccione una configuración primero' });
            return;
        }
        try {
            setLoadingVal(true);
            setMessage(null);
            setValidacion([]);
            const data = await fetchValidacion(sel.nombrePresupuesto);
            setValidacion(data);
            if (data.length === 0) {
                setMessage({ type: 'success', text: `✅ Validación completada para "${sel.nombrePresupuesto}": no se encontraron discrepancias entre el presupuesto diario y el consolidado mensual.` });
            } else {
                setMessage({ type: 'error', text: `⚠️ Se encontraron ${data.length} discrepancia(s) entre el presupuesto diario y el consolidado mensual.` });
            }
        } catch (err: any) {
            setValidacion([]);
            const errorMsg = err?.message || 'Error desconocido';
            if (errorMsg.includes('Invalid object') || errorMsg.includes('does not exist')) {
                setMessage({ type: 'info', text: 'No hay datos para validar aún. Ejecute primero un recálculo.' });
            } else {
                setMessage({ type: 'error', text: `Error al validar: ${errorMsg}` });
            }
        } finally {
            setLoadingVal(false);
        }
    };

    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const erroresVal = validacion.filter(v => !v.match);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-500 text-sm">Cargando configuraciones...</span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header + New Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                    Administre las configuraciones del modelo de presupuesto. Seleccione una como activa para trabajar con ella.
                </p>
                {isAdmin && (
                    <button onClick={() => { resetForm(); setShowForm(true); }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 whitespace-nowrap">
                        ➕ Nueva Config
                    </button>
                )}
            </div>

            {/* Create/Edit Form */}
            {showForm && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-4">
                    <h4 className="font-bold text-indigo-800 text-sm">
                        {editId ? '✏️ Editar Configuración' : '➕ Nueva Configuración'}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)}
                                placeholder="Ej: Presupuesto 2026"
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Año Modelo</label>
                            <input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Tabla Destino</label>
                            <div className="flex items-center gap-0">
                                <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-200 rounded-l-lg text-sm text-gray-600 font-mono whitespace-nowrap">RSM_ALCANCE_DIARIO</span>
                                <input value={tablaSufijo}
                                    onChange={e => {
                                        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                                        setTablaSufijo(v ? (v.startsWith('_') ? v : '_' + v) : '');
                                    }}
                                    placeholder="(producción)"
                                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-r-lg text-sm font-mono" />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Resultado: <span className="font-mono font-bold">RSM_ALCANCE_DIARIO{tablaSufijo}</span></p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Hora Cálculo</label>
                            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {saving ? '⏳ Guardando...' : (editId ? '💾 Actualizar' : '💾 Crear')}
                        </button>
                        <button onClick={resetForm}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Messages */}
            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                    message.type === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    {message.type === 'success' ? '✅' : message.type === 'info' ? '⏳' : '❌'} {message.text}
                </div>
            )}

            {/* Config Cards List */}
            {configs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                    No hay configuraciones. Cree una nueva para comenzar.
                </div>
            ) : (
                <div className="space-y-3">
                    {configs.map(c => {
                        const isSelected = c.id === selectedConfigId;
                        const isRecalcing = recalcId === c.id;
                        const isTogglingJob = togglingJobId === c.id;
                        return (
                            <div key={c.id}
                                onClick={() => handleSelect(c)}
                                className={`rounded-xl border p-4 cursor-pointer transition-all ${isSelected
                                    ? 'border-emerald-400 bg-emerald-50/50 shadow-md ring-2 ring-emerald-200'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                                    }`}>
                                {/* Top row: name, badges, actions */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {/* Selection indicator */}
                                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-gray-800">{c.nombrePresupuesto}</span>
                                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">{c.anoModelo}</span>
                                                {c.activo && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">Activa</span>}
                                                {c.ejecutarEnJob && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">💼 Job</span>}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                                                <span>📦 {c.tablaDestino}</span>
                                                <span>⏰ {c.horaCalculo}</span>
                                                {c.ultimoCalculo && (
                                                    <span>🔄 {new Date(c.ultimoCalculo).toLocaleString('es-CR')}</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3 font-mono">
                                                <span title="Stored Procedure">🗄️ SP_CALCULAR_PRESUPUESTO</span>
                                                {c.ejecutarEnJob && <span title="SQL Agent Job (primario) + Node.js fallback (+30min)">📋 Job: Modelo Presupuesto - Calculo Diario</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Action buttons row */}
                                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
                                        {/* Run recalc button */}
                                        {canRecalc && (
                                            <button onClick={() => handleRecalc(c)} disabled={isRecalcing || recalcId !== null}
                                                className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 transition-all"
                                                title={`Ejecutar recálculo para ${c.nombrePresupuesto}`}>
                                                {isRecalcing ? <span className="animate-spin">⏳</span> : '🔄'} Recalcular
                                            </button>
                                        )}
                                        {/* Job toggle */}
                                        {isAdmin && (
                                            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all hover:bg-blue-50 border border-transparent hover:border-blue-200"
                                                title="Incluir en ejecución automática por Job">
                                                <input
                                                    type="checkbox"
                                                    checked={!!c.ejecutarEnJob}
                                                    disabled={isTogglingJob}
                                                    onChange={() => handleToggleJob(c)}
                                                    className="w-3.5 h-3.5 rounded accent-blue-600"
                                                />
                                                <span className={c.ejecutarEnJob ? 'text-blue-700' : 'text-gray-500'}>Job</span>
                                            </label>
                                        )}
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => handleEdit(c)}
                                                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 flex items-center gap-1">
                                                    ✏️ Editar
                                                </button>
                                                <button onClick={() => handleDelete(c.id, c.nombrePresupuesto)}
                                                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 flex items-center gap-1">
                                                    🗑️ Eliminar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Validation Section */}
            <div className="border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        📊 Validación de Integridad
                    </h3>
                    <button onClick={handleValidar} disabled={loadingVal || !selectedConfigId}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                        {loadingVal ? 'Validando...' : '🔍 Validar'}
                    </button>
                </div>

                {validacion.length > 0 && (
                    <div className="p-4">
                        {erroresVal.length === 0 ? (
                            <div className="bg-green-50 rounded-lg p-3 text-green-700 text-sm">
                                ✅ Todas las sumatorias mensuales coinciden con el consolidado ({validacion.length} verificaciones)
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="bg-amber-50 rounded-lg p-3 text-amber-700 text-sm">
                                    ⚠️ {erroresVal.length} discrepancias encontradas de {validacion.length} verificaciones
                                </div>
                                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Local</th>
                                                <th className="px-3 py-2 text-center text-xs font-bold text-gray-500">Año</th>
                                                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Mes</th>
                                                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Canal</th>
                                                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Tipo</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Consolidado</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Σ Diario</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Dif.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {erroresVal.map((v, i) => (
                                                <tr key={i} className="hover:bg-amber-50">
                                                    <td className="px-3 py-2">{v.local}</td>
                                                    <td className="px-3 py-2 text-center">{v.ano}</td>
                                                    <td className="px-3 py-2">{meses[v.mes]}</td>
                                                    <td className="px-3 py-2">{v.canal}</td>
                                                    <td className="px-3 py-2">{v.tipo}</td>
                                                    <td className="px-3 py-2 text-right font-mono">{v.consolidado.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right font-mono">{v.sumaDiaria.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-red-600">{v.diferencia.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
