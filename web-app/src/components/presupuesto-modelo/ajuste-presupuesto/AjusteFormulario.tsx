// ============================================================
// AjusteFormulario — Read-only adjustment summary card
// Shows chart-driven data: date, canal, %, distribution mode.
// Only "comentario" is editable.
// ============================================================

import React from 'react';
import { X, Info } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { REDISTRIBUCION_LABELS } from './types';
import { esDiaPasado } from './helpers';

const fmtCompact = (n: number) => {
    if (Math.abs(n) >= 1e6) return `₡${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `₡${(n / 1e3).toFixed(0)}k`;
    return `₡${n.toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;
};

export const AjusteFormulario: React.FC = () => {
    const {
        formMode, formData, filtros, canAdjust,
        chartDragPct, chartRedistribucion, chartSelectedDate, formComentario,
    } = useAjusteStore(
        useShallow(s => ({
            formMode: s.formMode,
            formData: s.formData,
            filtros: s.filtros,
            canAdjust: s.canAdjust,
            chartDragPct: s.chartDragPct,
            chartRedistribucion: s.chartRedistribucion,
            chartSelectedDate: s.chartSelectedDate,
            formComentario: s.formComentario,
        }))
    );
    const closeForm = useAjusteStore(s => s.closeForm);
    const setFormComentario = useAjusteStore(s => s.setFormComentario);

    if (!formMode || !canAdjust || !formData) return null;

    const fecha = chartSelectedDate || formData.fecha;
    const fechaPasada = fecha && esDiaPasado(fecha);
    const canal = filtros.canal;
    const pct = chartDragPct;
    const redistLabel = REDISTRIBUCION_LABELS[chartRedistribucion] || chartRedistribucion;

    const dateStr = fecha
        ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-CR', {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        })
        : '—';

    const createdStr = new Date().toLocaleDateString('es-CR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-500" />
                    <h3 className="font-bold text-gray-800 text-sm">
                        {formMode === 'crear' ? 'Nuevo ajuste' : 'Editando ajuste'}
                    </h3>
                </div>
                <button onClick={closeForm} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <div className="p-4 space-y-3">
                {/* Date warning for past days */}
                {fechaPasada && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
                        ⚠ Día pasado — no se pueden crear ajustes
                    </div>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {/* Fecha del ajuste */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Fecha del ajuste</p>
                        <p className="text-sm font-semibold text-gray-800">{dateStr}</p>
                    </div>

                    {/* Canal */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Canal</p>
                        <p className="text-sm font-semibold text-gray-800">
                            {canal === 'Todos' ? 'Todos (proporcional)' : canal}
                        </p>
                    </div>

                    {/* Porcentaje */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Ajuste</p>
                        <p className={`text-lg font-bold font-mono ${pct === 0 ? 'text-gray-400' : pct > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                        </p>
                    </div>

                    {/* Tipo */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Tipo</p>
                        <p className="text-sm font-semibold text-gray-800">Porcentaje</p>
                    </div>

                    {/* Distribución */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Distribución</p>
                        <p className="text-sm font-semibold text-indigo-700">{redistLabel}</p>
                    </div>

                    {/* Fecha de creación */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Creado</p>
                        <p className="text-sm text-gray-500">{createdStr}</p>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Comentario — the only editable field */}
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Comentario / motivo <span className="text-gray-300">(opcional)</span>
                    </label>
                    <textarea
                        value={formComentario}
                        onChange={e => setFormComentario(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-y"
                        placeholder="Ajuste por evento operativo no modelado en SP"
                        rows={2}
                    />
                </div>

                {/* Hint */}
                <p className="text-[10px] text-gray-400 text-center">
                    Modifica el ajuste en la gráfica. Presiona <span className="font-bold text-indigo-500">Aplicar</span> para guardar.
                </p>
            </div>
        </div>
    );
};
