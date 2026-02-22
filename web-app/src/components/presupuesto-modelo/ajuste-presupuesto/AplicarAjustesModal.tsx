// ============================================================
// AplicarAjustesModal — Confirmación de aplicar
// ============================================================

import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useAjusteStore, useResumen } from './store';
import { useShallow } from 'zustand/react/shallow';
import { fmtFull, fmtDelta } from './helpers';

export const AplicarAjustesModal: React.FC = () => {
    const { activeModal, chartLoading } = useAjusteStore(
        useShallow(s => ({
            activeModal: s.activeModal,
            chartLoading: s.chartLoading,
        }))
    );
    const closeModal = useAjusteStore(s => s.closeModal);
    const applyAllAjustes = useAjusteStore(s => s.applyAllAjustes);
    const resumen = useResumen();

    if (activeModal !== 'aplicar') return null;

    const hasChanges = resumen.totalAjustes > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h3 className="font-bold text-gray-800">Aplicar todos los ajustes</h3>
                    </div>
                    <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {!hasChanges ? (
                        <div className="text-center py-4 text-gray-500">
                            <p className="text-sm">No hay ajustes pendientes para aplicar.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Esta acción recalculará el presupuesto diario con todos los ajustes activos del mes.
                                Este proceso <strong>no se puede deshacer</strong> fácilmente.
                            </p>

                            {/* Resumen de impacto */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                                <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                                    Resumen de impacto
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] text-amber-600">Ajustes activos</p>
                                        <p className="text-lg font-bold text-gray-800">{resumen.totalAjustes}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-amber-600">Pendientes</p>
                                        <p className="text-lg font-bold text-amber-600">{resumen.countPendiente}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-amber-600">Delta total</p>
                                        <p className={`text-lg font-bold ${resumen.deltaNeto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {fmtDelta(resumen.deltaNeto)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-amber-600">Ppto ajustado</p>
                                        <p className="text-lg font-bold text-gray-800">{fmtFull(resumen.presupuestoAjustado)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                                <strong>Nota:</strong> Los ajustes se aplicarán con el método de distribución configurado en cada uno.
                                El delta aplica al canal y período definido en cada ajuste individual.
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={closeModal}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    {hasChanges && (
                        <button
                            onClick={applyAllAjustes}
                            disabled={chartLoading}
                            className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {chartLoading ? 'Aplicando...' : 'Sí, aplicar ajustes'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
