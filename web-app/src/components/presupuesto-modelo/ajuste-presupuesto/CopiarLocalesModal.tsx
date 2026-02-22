// ============================================================
// CopiarLocalesModal — Copiar ajuste a otros locales
// ============================================================

import React, { useState, useMemo } from 'react';
import { X, Copy, Search, Check } from 'lucide-react';
import { useAjusteStore, useSelectedAjuste } from './store';
import { useShallow } from 'zustand/react/shallow';
import type { AjusteTipo, CopiarLocalesData } from './types';
import { fmtFull, fmtPct } from './helpers';

export const CopiarLocalesModal: React.FC = () => {
    const { activeModal, gruposLocales, chartLoading, filtros } = useAjusteStore(
        useShallow(s => ({
            activeModal: s.activeModal,
            gruposLocales: s.gruposLocales,
            chartLoading: s.chartLoading,
            filtros: s.filtros,
        }))
    );
    const closeModal = useAjusteStore(s => s.closeModal);
    const copyToLocales = useAjusteStore(s => s.copyToLocales);
    const selectedAjuste = useSelectedAjuste();

    const [grupoFilter, setGrupoFilter] = useState('Todos');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [aplicarComo, setAplicarComo] = useState<AjusteTipo>('Porcentaje');

    const currentGroup = useMemo(
        () => gruposLocales.find(g => g.nombre === grupoFilter) || gruposLocales[0],
        [gruposLocales, grupoFilter]
    );

    const filteredLocales = useMemo(
        () => (currentGroup?.locales || [])
            .filter(s => s.code !== filtros.codAlmacen) // Exclude current
            .filter(s =>
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.code.toLowerCase().includes(search.toLowerCase())
            ),
        [currentGroup, search, filtros.codAlmacen]
    );

    const toggleAll = () => {
        if (selected.size === filteredLocales.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filteredLocales.map(s => s.code)));
        }
    };

    const toggle = (code: string) => {
        const next = new Set(selected);
        if (next.has(code)) next.delete(code);
        else next.add(code);
        setSelected(next);
    };

    const handleCopy = () => {
        if (!selectedAjuste || selected.size === 0) return;
        const data: CopiarLocalesData = {
            ajusteId: String(selectedAjuste.id),
            grupoLocal: grupoFilter,
            localesSeleccionados: Array.from(selected),
            aplicarComo,
        };
        copyToLocales(data);
    };

    if (activeModal !== 'copiar') return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">Copiar ajuste a otros locales</h3>
                    <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Selected adjustment info */}
                {selectedAjuste && (
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Ajuste seleccionado</div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-800">{selectedAjuste.idFormateado}</span>
                            <span className={`font-bold ${selectedAjuste.valorAjuste >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {selectedAjuste.metodoAjuste === 'Porcentaje'
                                    ? fmtPct(selectedAjuste.valorAjuste)
                                    : fmtFull(selectedAjuste.valorAjuste)}
                            </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                            Canal: {selectedAjuste.canal} — {selectedAjuste.comentario}
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Grupo + Search */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                                Grupo de local
                            </label>
                            <select
                                value={grupoFilter}
                                onChange={e => { setGrupoFilter(e.target.value); setSelected(new Set()); }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                            >
                                {gruposLocales.map(g => (
                                    <option key={g.nombre} value={g.nombre}>{g.nombre} ({g.locales.length})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                                Aplicar como
                            </label>
                            <select
                                value={aplicarComo}
                                onChange={e => setAplicarComo(e.target.value as AjusteTipo)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                            >
                                <option value="Porcentaje">Porcentaje</option>
                                <option value="Monto">Monto</option>
                            </select>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar local..."
                            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                    </div>

                    {/* Select all */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={toggleAll}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                            {selected.size === filteredLocales.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                        <span className="text-xs text-gray-400">
                            {selected.size} de {filteredLocales.length} seleccionados
                        </span>
                    </div>

                    {/* Locales list */}
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                        {filteredLocales.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-sm">Sin locales disponibles</div>
                        ) : (
                            filteredLocales.map(s => (
                                <label
                                    key={s.code}
                                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${selected.has(s.code) ? 'bg-indigo-50' : ''
                                        }`}
                                >
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selected.has(s.code) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                                        }`}>
                                        {selected.has(s.code) && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(s.code)}
                                        onChange={() => toggle(s.code)}
                                        className="hidden"
                                    />
                                    <span className="text-sm text-gray-700">{s.name}</span>
                                    <span className="text-[10px] text-gray-400 ml-auto">{s.code}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={closeModal}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCopy}
                        disabled={selected.size === 0 || chartLoading}
                        className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        <Copy className="w-4 h-4" />
                        Copiar y asociar ({selected.size})
                    </button>
                </div>
            </div>
        </div>
    );
};
