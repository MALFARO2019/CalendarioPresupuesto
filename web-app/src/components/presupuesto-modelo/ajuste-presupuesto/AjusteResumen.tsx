// ============================================================
// AjusteResumen — Summary cards
// ============================================================

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useResumen } from './store';
import { fmtFull, fmtDelta } from './helpers';

export const AjusteResumen: React.FC = () => {
    const resumen = useResumen();

    const deltaColor = resumen.deltaNeto > 0 ? 'text-emerald-600' : resumen.deltaNeto < 0 ? 'text-red-600' : 'text-gray-500';
    const DeltaIcon = resumen.deltaNeto > 0 ? TrendingUp : resumen.deltaNeto < 0 ? TrendingDown : Minus;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Presupuesto Base */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Presupuesto Base Mes
                </p>
                <p className="text-lg md:text-xl font-bold text-gray-900">
                    {fmtFull(resumen.presupuestoBase)}
                </p>
            </div>

            {/* Presupuesto Ajustado */}
            <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
                <p className="text-xs font-medium text-amber-500 uppercase tracking-wider mb-1">
                    Presupuesto Ajustado Mes
                </p>
                <p className="text-lg md:text-xl font-bold text-gray-900">
                    {fmtFull(resumen.presupuestoAjustado)}
                </p>
            </div>

            {/* Delta neto */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Delta neto
                </p>
                <div className="flex items-center gap-2">
                    <DeltaIcon className={`w-5 h-5 ${deltaColor}`} />
                    <p className={`text-lg md:text-xl font-bold ${deltaColor}`}>
                        {fmtDelta(resumen.deltaNeto)}
                    </p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                    Debe quedar 0 si el mes se conserva
                </p>
            </div>

            {/* Ajustes del mes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Ajustes del mes
                </p>
                <p className="text-lg md:text-xl font-bold text-gray-900">
                    {resumen.totalAjustes}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {resumen.countAplicado > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                            {resumen.countAplicado} aplicado{resumen.countAplicado > 1 ? 's' : ''}
                        </span>
                    )}
                    {resumen.countPendiente > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                            {resumen.countPendiente} pendiente{resumen.countPendiente > 1 ? 's' : ''}
                        </span>
                    )}
                    {resumen.countAsociado > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                            {resumen.countAsociado} asociado{resumen.countAsociado > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
