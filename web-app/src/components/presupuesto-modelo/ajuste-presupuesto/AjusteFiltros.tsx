// ============================================================
// AjusteFiltros — Filtros superiores
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Search, Lock } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { MESES, CANALES } from './types';

export const AjusteFiltros: React.FC = () => {
    const { filtros, presupuestos, locales } = useAjusteStore(
        useShallow(s => ({
            filtros: s.filtros,
            presupuestos: s.presupuestos,
            locales: s.locales,
        }))
    );
    const setFiltro = useAjusteStore(s => s.setFiltro);

    // Local search input
    const [localSearch, setLocalSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredLocales = locales.filter(s =>
        s.name.toLowerCase().includes(localSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(localSearch.toLowerCase())
    );

    const selectedLocal = locales.find(s => s.code === filtros.codAlmacen);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const changeMes = useCallback((delta: number) => {
        let newMes = filtros.mes + delta;
        if (newMes < 1) newMes = 12;
        if (newMes > 12) newMes = 1;
        setFiltro('mes', newMes);
    }, [filtros.mes, setFiltro]);

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                {/* Presupuesto */}
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Presupuesto
                    </label>
                    <select
                        value={filtros.presupuestoId ?? ''}
                        onChange={e => setFiltro('presupuestoId', parseInt(e.target.value) || null)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    >
                        {presupuestos.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.nombre} ({p.ano}) {p.activo ? '(Activo)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Local (searchable) */}
                <div className="relative" ref={dropdownRef}>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Local
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={showDropdown ? localSearch : (selectedLocal?.name || '')}
                            onChange={e => { setLocalSearch(e.target.value); setShowDropdown(true); }}
                            onFocus={() => { setShowDropdown(true); setLocalSearch(''); }}
                            placeholder="Buscar local..."
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                    </div>
                    {showDropdown && (
                        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                            {filteredLocales.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
                            ) : (
                                filteredLocales.map(s => (
                                    <button
                                        key={s.code}
                                        onClick={() => {
                                            setFiltro('codAlmacen', s.code);
                                            setShowDropdown(false);
                                            setLocalSearch('');
                                        }}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${s.code === filtros.codAlmacen ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                                            }`}
                                    >
                                        {s.name}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Mes (con flechas) */}
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Mes
                    </label>
                    <div className="flex items-center gap-0">
                        <button
                            onClick={() => changeMes(-1)}
                            className="px-2 py-2 border border-r-0 border-gray-200 rounded-l-lg hover:bg-gray-50 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <div className="flex-1 px-3 py-2 border border-gray-200 text-sm text-center font-medium text-gray-800 bg-white min-w-[100px]">
                            {MESES[filtros.mes]} {filtros.ano}
                        </div>
                        <button
                            onClick={() => changeMes(1)}
                            className="px-2 py-2 border border-l-0 border-gray-200 rounded-r-lg hover:bg-gray-50 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Canal */}
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Canal
                    </label>
                    <select
                        value={filtros.canal}
                        onChange={e => setFiltro('canal', e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    >
                        {CANALES.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* Permiso indicator */}
                <div className="flex items-end">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-700">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">No editar días pasados</span>
                        <span className="sm:hidden">Bloqueado</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
