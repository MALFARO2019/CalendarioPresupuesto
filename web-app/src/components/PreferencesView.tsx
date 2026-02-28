import React from 'react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useUserPreferences } from '../context/UserPreferences';

interface PreferencesViewProps {
    onBack: () => void;
    groups?: string[];
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    onYearTypeChange: (v: 'Año Anterior' | 'Año Anterior Ajustado') => void;
}

export const PreferencesView: React.FC<PreferencesViewProps> = ({
    onBack,
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
        setTheme,
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

                {/* ── TEMAS DE COLORES ── */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tema de Colores</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex flex-col sm:flex-row gap-3">
                            {([
                                { value: 'normal', label: 'Normal', desc: 'Tema Claro por Defecto' },
                                { value: 'oscuro', label: 'Oscuro', desc: 'Diseñado Personalizado' },
                                { value: 'rosti', label: 'Rosti', desc: 'Tema Base Azul' }
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setTheme(opt.value)}
                                    className={`flex-1 py-3 px-4 text-left rounded-xl border-2 transition-all ${preferences.theme === opt.value
                                            ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-100'
                                            : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-4 h-4 rounded-full border-2 flex flex-shrink-0 items-center justify-center ${preferences.theme === opt.value ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                                            }`}>
                                            {preferences.theme === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <div className={`text-sm font-bold ${preferences.theme === opt.value ? 'text-indigo-800' : 'text-gray-800'}`}>
                                            {opt.label}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 pl-6">{opt.desc}</div>
                                </button>
                            ))}
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
