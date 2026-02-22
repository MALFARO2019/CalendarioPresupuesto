// ============================================================
// AjusteFormulario — Crear / Editar ajuste
// ============================================================

import React, { useState, useEffect } from 'react';
import { Save, Eye, X, AlertTriangle } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { CANALES, REDISTRIBUCION_LABELS } from './types';
import type { AjusteFormData, AjusteTipo, CanalType, RedistribucionTipo } from './types';
import { esDiaPasado, validarAjusteForm } from './helpers';

export const AjusteFormulario: React.FC = () => {
    const { formMode, formData, formDate, canAdjust, chartLoading } = useAjusteStore(
        useShallow(s => ({
            formMode: s.formMode,
            formData: s.formData,
            formDate: s.formDate,
            canAdjust: s.canAdjust,
            chartLoading: s.chartLoading,
        }))
    );
    const saveAjuste = useAjusteStore(s => s.saveAjuste);
    const closeForm = useAjusteStore(s => s.closeForm);

    // Local form state
    const [fecha, setFecha] = useState('');
    const [tipoAjuste, setTipoAjuste] = useState<AjusteTipo>('Porcentaje');
    const [canal, setCanal] = useState<CanalType>('Todos');
    const [valor, setValor] = useState('');
    const [redistribucion, setRedistribucion] = useState<RedistribucionTipo>('TodosLosDias');
    const [comentario, setComentario] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    const [previewing, setPreviewing] = useState(false);

    // Sync from store form data
    useEffect(() => {
        if (formData) {
            setFecha(formData.fecha);
            setTipoAjuste(formData.tipoAjuste);
            setCanal(formData.canal);
            setValor(formData.valor ? String(formData.valor) : '');
            setRedistribucion(formData.redistribucion);
            setComentario(formData.comentario);
            setErrors([]);
        }
    }, [formData]);

    // Override fecha when clicking a chart point
    useEffect(() => {
        if (formDate) setFecha(formDate);
    }, [formDate]);

    if (!formMode || !canAdjust) return null;

    const fechaPasada = fecha && esDiaPasado(fecha);

    const handleSubmit = () => {
        const parsed = parseFloat(valor) || 0;
        const validation = validarAjusteForm({ fecha, valor: parsed, comentario });
        if (validation.length > 0) {
            setErrors(validation);
            return;
        }
        if (fechaPasada) {
            setErrors(['No se pueden crear ajustes en días pasados']);
            return;
        }
        setErrors([]);
        const data: AjusteFormData = {
            fecha,
            tipoAjuste,
            canal,
            valor: parsed,
            redistribucion,
            comentario,
        };
        saveAjuste(data);
    };

    const handlePreview = () => {
        setPreviewing(true);
        // TODO: Integrate with previewImpacto service
        setTimeout(() => setPreviewing(false), 1500);
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm">
                    {formMode === 'crear' ? 'Crear ajuste' : 'Editar ajuste'}
                </h3>
                <button onClick={closeForm} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Errors */}
                {errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        {errors.map((err, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-red-700">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{err}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Row 1: Fecha + Tipo */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            Fecha del ajuste
                        </label>
                        <input
                            type="date"
                            value={fecha}
                            readOnly
                            disabled
                            className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-all ${fechaPasada
                                ? 'border-red-300 bg-red-50 text-red-600'
                                : 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                                }`}
                        />
                        {fechaPasada && (
                            <p className="text-[10px] text-red-500 mt-0.5">Día pasado — no editable</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            Tipo de ajuste
                        </label>
                        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed">
                            {tipoAjuste === 'Porcentaje' ? '%' : 'Monto'}
                        </div>
                    </div>
                </div>

                {/* Row 2: Canal + Valor */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            Canal objetivo
                        </label>
                        <select
                            value={canal}
                            onChange={e => setCanal(e.target.value as CanalType)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        >
                            {CANALES.map(c => (
                                <option key={c} value={c}>
                                    {c}{c === 'Todos' ? ' (redistribuye proporcional por canal)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            Valor
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                                {tipoAjuste === 'Monto' ? '₡' : '%'}
                            </span>
                            <input
                                type="number"
                                value={valor}
                                onChange={e => setValor(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                placeholder={tipoAjuste === 'Monto' ? 'ej: 145000' : 'ej: 3.5'}
                            />
                        </div>
                    </div>
                </div>

                {/* Redistribución */}
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
                        Distribuir diferencial en
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {(Object.entries(REDISTRIBUCION_LABELS) as [RedistribucionTipo, string][]).map(([key, label]) => (
                            <label
                                key={key}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all text-sm ${redistribucion === key
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="redistribucion"
                                    value={key}
                                    checked={redistribucion === key}
                                    onChange={() => setRedistribucion(key)}
                                    className="hidden"
                                />
                                <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${redistribucion === key ? 'border-indigo-500' : 'border-gray-300'
                                    }`}>
                                    {redistribucion === key && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                                </span>
                                {label}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Comentario */}
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Comentario / motivo
                    </label>
                    <textarea
                        value={comentario}
                        onChange={e => setComentario(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-y"
                        placeholder="Ajuste por evento operativo no modelado en SP"
                        rows={3}
                    />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        onClick={handleSubmit}
                        disabled={chartLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        {chartLoading ? 'Guardando...' : 'Guardar ajuste'}
                    </button>
                    <button
                        onClick={handlePreview}
                        disabled={previewing}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        <Eye className="w-4 h-4" />
                        {previewing ? 'Previsualizando...' : 'Previsualizar impacto'}
                    </button>
                    <button
                        onClick={closeForm}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};
