// ============================================================
// VistaAjustePresupuesto — Main orchestrating view
// ============================================================

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { AjusteHeader } from './AjusteHeader';
import { AjusteFiltros } from './AjusteFiltros';
import { AjusteResumen } from './AjusteResumen';
import { AjusteGrafica } from './AjusteGrafica';
import { AjusteListaPanel } from './AjusteListaPanel';
import { AjusteFormulario } from './AjusteFormulario';
import { CopiarLocalesModal } from './CopiarLocalesModal';
import { AplicarAjustesModal } from './AplicarAjustesModal';

interface Props {
    anoModelo: number;
    nombrePresupuesto: string;
}

export const VistaAjustePresupuesto: React.FC<Props> = ({ anoModelo, nombrePresupuesto }) => {
    const { loading, error, formMode, message } = useAjusteStore(
        useShallow(s => ({
            loading: s.loading,
            error: s.error,
            formMode: s.formMode,
            message: s.message,
        }))
    );
    // Actions don't need shallow — they're stable references
    const clearError = useAjusteStore(s => s.clearError);
    const init = useAjusteStore(s => s.init);
    const setMessage = useAjusteStore(s => s.setMessage);


    // Init on mount
    useEffect(() => {
        init();
    }, [init]);

    // Auto-dismiss messages after 4s
    useEffect(() => {
        if (message) {
            const t = setTimeout(() => setMessage(null), 4000);
            return () => clearTimeout(t);
        }
    }, [message, setMessage]);

    // ── Loading state ──
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
                <p className="text-sm text-gray-500 font-medium">Cargando vista de ajustes...</p>
            </div>
        );
    }

    // ── Error state ──
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-sm text-red-600 font-medium">{error}</p>
                <button
                    onClick={() => { clearError(); init(); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" /> Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-8">
            {/* Header */}
            <AjusteHeader />

            {/* Filtros */}
            <AjusteFiltros />

            {/* Resumen Cards */}
            <AjusteResumen />

            {/* Main content: Chart + Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Chart — 2/3 width on desktop */}
                <div className="lg:col-span-2 space-y-4">
                    <AjusteGrafica />

                    {/* Form (conditionally below chart) */}
                    {formMode && (
                        <AjusteFormulario />
                    )}
                </div>

                {/* Side panel — 1/3 width on desktop, full on mobile */}
                <div className="lg:col-span-1">
                    <AjusteListaPanel />
                </div>
            </div>

            {/* Modals */}
            <CopiarLocalesModal />
            <AplicarAjustesModal />
        </div>
    );
};

export default VistaAjustePresupuesto;
