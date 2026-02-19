import React from 'react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useUserPreferences } from '../context/UserPreferences';

interface PreferencesViewProps {
    onBack: () => void;
    verEventos: boolean;
    onVerEventosChange: (v: boolean) => void;
    eventosYear: number;
    onEventosYearChange: (y: number) => void;
    availableYears?: number[];
    groups?: string[];
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    onYearTypeChange: (v: 'Año Anterior' | 'Año Anterior Ajustado') => void;
}

export const PreferencesView: React.FC<PreferencesViewProps> = ({
    onBack,
    verEventos,
    onVerEventosChange,
    eventosYear,
    onEventosYearChange,
    availableYears = [2024, 2025, 2026, 2027],
    groups = [],
    yearType,
    onYearTypeChange,
}) => {
    const {
        preferences,
        setPctDisplayMode,
        setPctDecimals,
        setValueDecimals,
        setValueDisplayMode,
        setDefaultYearType,
        setGroupOrder,
    } = useUserPreferences();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
                        <h1 className="text-lg font-bold text-gray-800">Preferencias</h1>
                    </div>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

                {/* ── EVENTOS ── */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                        <span className="text-lg">📅</span>
                        <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Calendario de Eventos</h2>
                    </div>
                    <div className="p-5 space-y-4">
                        {/* Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">Mostrar eventos en gráficos</p>
                                <p className="text-xs text-gray-500 mt-0.5">Activa líneas y chips de eventos en todas las vistas</p>
                            </div>
                            <button
                                onClick={() => onVerEventosChange(!verEventos)}
                                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${verEventos ? 'bg-amber-400' : 'bg-gray-200'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${verEventos ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* Year chips */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Año de eventos</label>
                            <div className="flex flex-wrap gap-2">
                                {availableYears.map(y => (
                                    <button
                                        key={y}
                                        onClick={() => onEventosYearChange(y)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${eventosYear === y
                                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:bg-amber-50'
                                            }`}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                            {verEventos && (
                                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                                    <span>⚠️</span> Cargando eventos del año {eventosYear}
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── PORCENTAJES ── */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Formato de Porcentajes</h2>
                    </div>
                    <div className="p-5 space-y-3">
                        {[
                            { value: 'base100', label: 'Base 100', example: 'Ej: 105%, 92%' },
                            { value: 'differential', label: 'Diferencial', example: 'Ej: +5%, -8%' },
                        ].map(opt => (
                            <label
                                key={opt.value}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${preferences.pctDisplayMode === opt.value
                                    ? 'bg-indigo-50 border-indigo-300'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="pctMode"
                                    checked={preferences.pctDisplayMode === opt.value as any}
                                    onChange={() => setPctDisplayMode(opt.value as any)}
                                    className="accent-indigo-600"
                                />
                                <div>
                                    <div className="text-sm font-semibold text-gray-800">{opt.label}</div>
                                    <div className="text-xs text-gray-500">{opt.example}</div>
                                </div>
                            </label>
                        ))}

                        <div className="pt-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Decimales</label>
                            <div className="flex gap-2">
                                {[0, 1, 2, 3].map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setPctDecimals(d)}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-all ${preferences.pctDecimals === d
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >{d}</button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">Ej: {(105.1234).toFixed(preferences.pctDecimals)}%</p>
                        </div>
                    </div>
                </section>

                {/* ── VALORES ── */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Formato de Valores</h2>
                    </div>
                    <div className="p-5 space-y-3">
                        <div className="flex gap-2">
                            {(['completo', 'miles', 'millones'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setValueDisplayMode(mode)}
                                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all ${preferences.valueDisplayMode === mode
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    {mode === 'completo' ? 'Completo' : mode === 'miles' ? 'Miles' : 'Millones'}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400">
                            Ej: {preferences.valueDisplayMode === 'completo' ? '₡1 234 568' : preferences.valueDisplayMode === 'miles' ? '₡1 235K' : '₡1,2M'}
                        </p>

                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Decimales en Valores</label>
                            <div className="flex gap-2">
                                {[0, 1, 2, 3].map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setValueDecimals(d)}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-all ${preferences.valueDecimals === d
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >{d}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── AÑO ── */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tipo de Año Predeterminado</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex gap-2">
                            {([
                                { value: 'Año Anterior', label: 'Natural' },
                                { value: 'Año Anterior Ajustado', label: 'Ajustado' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => {
                                        setDefaultYearType(opt.value);
                                        onYearTypeChange(opt.value);
                                    }}
                                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${yearType === opt.value
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── ORDEN DE GRUPOS ── */}
                {groups.length > 0 && (
                    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Orden de Grupos</h2>
                        </div>
                        <div className="p-5">
                            <div className="flex flex-col gap-1.5">
                                {(preferences.groupOrder && preferences.groupOrder.length > 0
                                    ? preferences.groupOrder.filter(g => groups.includes(g)).concat(groups.filter(g => !(preferences.groupOrder || []).includes(g)))
                                    : groups
                                ).map((group, idx, arr) => (
                                    <div key={group} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                                        <span className="text-sm text-gray-700 flex-1 font-medium">{group}</span>
                                        <button
                                            disabled={idx === 0}
                                            onClick={() => {
                                                const newOrder = [...arr];
                                                [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                                                setGroupOrder(newOrder);
                                            }}
                                            className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed touch-target"
                                        >▲</button>
                                        <button
                                            disabled={idx === arr.length - 1}
                                            onClick={() => {
                                                const newOrder = [...arr];
                                                [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                                setGroupOrder(newOrder);
                                            }}
                                            className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed touch-target"
                                        >▼</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <div className="pb-8" />
            </div>
        </div>
    );
};
