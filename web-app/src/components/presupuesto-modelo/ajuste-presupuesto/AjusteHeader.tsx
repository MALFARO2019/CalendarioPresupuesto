// ============================================================
// AjusteHeader — Breadcrumb + título + acciones principales
// ============================================================

import React from 'react';
import { Save, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';

export const AjusteHeader: React.FC = () => {
    const { filtros, locales, canAdjust, pendingChanges, message } = useAjusteStore(
        useShallow(s => ({
            filtros: s.filtros,
            locales: s.locales,
            canAdjust: s.canAdjust,
            pendingChanges: s.pendingChanges,
            message: s.message,
        }))
    );
    const openModal = useAjusteStore(s => s.openModal);
    const setMessage = useAjusteStore(s => s.setMessage);
    const storeName = locales.find(s => s.code === filtros.codAlmacen)?.name || filtros.codAlmacen;

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 md:p-5">
            {/* Breadcrumb */}
            <div className="text-xs text-gray-400 mb-1">
                <span className="hover:text-gray-600 cursor-pointer">KpisRosti</span>
                <span className="mx-1.5">/</span>
                <span className="hover:text-gray-600 cursor-pointer">Sistema</span>
                <span className="mx-1.5">/</span>
                <span className="text-gray-600 font-medium">Modelo de Presupuesto</span>
            </div>

            {/* Title + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        Vista de Ajuste del Modelo de Presupuesto
                    </h1>
                    <p className="text-sm text-gray-500">
                        {filtros.nombrePresupuesto || 'Sin presupuesto'} — Local {storeName}
                    </p>
                </div>

                {canAdjust && (
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Guardar ajustes */}
                        <button
                            onClick={() => openModal('aplicar')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            <span className="hidden sm:inline">Guardar ajustes</span>
                            {pendingChanges && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            )}
                        </button>

                        {/* Copiar a otros locales */}
                        <button
                            onClick={() => openModal('copiar')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Copiar a otros locales</span>
                        </button>

                        {/* Aplicar ajustes */}
                        <button
                            onClick={() => openModal('aplicar')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Aplicar ajustes</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Global message toast */}
            {message && (
                <div
                    className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${message.ok
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                >
                    {message.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="flex-1">{message.text}</span>
                    <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
                </div>
            )}
        </div>
    );
};
