import React, { useState, useEffect, useMemo } from 'react';
import { getToken, API_BASE } from '../../api';
import { SearchableLocalSelect } from '../SearchableLocalSelect';
import { InocuidadTendencia } from './InocuidadTendencia';
import { InocuidadCalor } from './InocuidadCalor';

interface FormSource {
    SourceID: number;
    Alias: string;
    TableName: string;
    UltimaSync: string;
    TotalRespuestas: number;
    Activo: boolean;
}

interface InocuidadViewProps {
    year: number;
    groups: string[];
    individualStores: string[];
    filterLocal: string;
    onFilterLocalChange: (v: string) => void;
    activeSubTab: 'tendencia' | 'calor';
}

type RangeType = 'anual' | 'semestre' | 'trimestre' | 'mes';

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SEMESTERS = [
    { label: 'Semestre 1 (Ene–Jun)', value: 1 },
    { label: 'Semestre 2 (Jul–Dic)', value: 2 },
];

const TRIMESTERS = [
    { label: 'T1 (Ene–Mar)', value: 1 },
    { label: 'T2 (Abr–Jun)', value: 2 },
    { label: 'T3 (Jul–Sep)', value: 3 },
    { label: 'T4 (Oct–Dic)', value: 4 },
];

export const InocuidadView: React.FC<InocuidadViewProps> = ({
    year: parentYear, groups, individualStores, filterLocal, onFilterLocalChange, activeSubTab
}) => {
    const [sources, setSources] = useState<FormSource[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
    const [sourcesLoading, setSourcesLoading] = useState(true);
    const [availableYears, setAvailableYears] = useState<number[]>([]);

    // Shared parameter state
    const [selectedYear, setSelectedYear] = useState<number>(parentYear);
    const [rangeType, setRangeType] = useState<RangeType>('anual');
    const [rangePeriod, setRangePeriod] = useState<number>(1);

    // Auto-detect current period when range type changes
    useEffect(() => {
        const currentMonth = new Date().getMonth() + 1;
        if (rangeType === 'mes') setRangePeriod(currentMonth);
        else if (rangeType === 'semestre') setRangePeriod(currentMonth <= 6 ? 1 : 2);
        else if (rangeType === 'trimestre') setRangePeriod(Math.ceil(currentMonth / 3));
        else setRangePeriod(1);
    }, [rangeType]);

    // Year options: prefer available years from API
    const yearOptions = useMemo(() => {
        if (availableYears.length > 0) return [...availableYears].sort((a, b) => a - b);
        const now = new Date().getFullYear();
        return [now - 2, now - 1, now];
    }, [availableYears]);

    // Load available form sources, auto-select first, then fetch available years
    useEffect(() => {
        const loadSources = async () => {
            try {
                const token = getToken();
                if (!token) return;
                const response = await fetch(`${API_BASE}/inocuidad/sources`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) return;
                const data = await response.json();
                setSources(data);
                if (data.length > 0) {
                    const srcId = data[0].SourceID;
                    setSelectedSourceId(srcId);
                    // Fetch available years for this source
                    try {
                        const yearsResp = await fetch(`${API_BASE}/inocuidad/available-years/${srcId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (yearsResp.ok) {
                            const years: number[] = await yearsResp.json();
                            if (years.length > 0) {
                                setAvailableYears(years);
                                // Auto-select most recent year with data
                                setSelectedYear(years[0]); // sorted DESC from backend
                            }
                        }
                    } catch { /* ignore */ }
                }
            } catch (e) {
                console.warn('❌ [InocuidadView] Could not load sources:', e);
            } finally {
                setSourcesLoading(false);
            }
        };
        loadSources();
    }, []);

    // Period selector options
    const periodOptions = useMemo(() => {
        switch (rangeType) {
            case 'mes':
                return MONTHS_SHORT.map((m, i) => ({ label: m, value: i + 1 }));
            case 'semestre':
                return SEMESTERS;
            case 'trimestre':
                return TRIMESTERS;
            default:
                return [];
        }
    }, [rangeType]);

    // Loading sources
    if (sourcesLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <svg className="w-8 h-8 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando datos de inocuidad...</span>
            </div>
        );
    }

    // No sources found
    if (sources.length === 0) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <p className="text-amber-700 font-semibold mb-2">No hay formularios configurados</p>
                <p className="text-amber-600 text-sm">
                    Configure al menos un formulario en Administración → Forms y sincronice los datos.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ═══════ Shared Parameter Bar ═══════ */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-lg border border-gray-100">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800 tracking-tight mb-4">
                    {activeSubTab === 'tendencia' ? 'Tendencia' : 'Mapa de Calor'} — Inocuidad {selectedYear}
                </h2>
                <div className="flex flex-wrap gap-3 sm:gap-4 items-end">
                    {/* Year */}
                    <div className="min-w-[80px]">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Año</label>
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white text-gray-700 cursor-pointer focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Range type */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rango</label>
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                            {([
                                { key: 'anual' as RangeType, label: 'Año' },
                                { key: 'semestre' as RangeType, label: 'Sem.' },
                                { key: 'trimestre' as RangeType, label: 'Trim.' },
                                { key: 'mes' as RangeType, label: 'Mes' },
                            ]).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setRangeType(opt.key)}
                                    className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${rangeType === opt.key
                                            ? 'bg-teal-500 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-teal-600 hover:bg-white'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Period selector (only for non-annual) */}
                    {rangeType !== 'anual' && (
                        <div className="min-w-[100px]">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Período</label>
                            <select
                                value={rangePeriod}
                                onChange={e => setRangePeriod(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white text-gray-700 cursor-pointer focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
                            >
                                {periodOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Local / Group filter */}
                    <div className="min-w-[160px] flex-1 max-w-xs">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Local / Grupo</label>
                        <SearchableLocalSelect
                            value={filterLocal}
                            onChange={onFilterLocalChange}
                            groups={groups}
                            individualStores={individualStores}
                        />
                    </div>
                </div>
            </div>

            {/* ═══════ Content ═══════ */}
            {activeSubTab === 'tendencia' && (
                <InocuidadTendencia
                    year={selectedYear}
                    rangeType={rangeType}
                    rangePeriod={rangePeriod}
                    groups={groups}
                    individualStores={individualStores}
                    filterLocal={filterLocal}
                    onFilterLocalChange={onFilterLocalChange}
                    sourceId={selectedSourceId}
                />
            )}

            {activeSubTab === 'calor' && (
                <InocuidadCalor
                    year={selectedYear}
                    rangeType={rangeType}
                    rangePeriod={rangePeriod}
                    groups={groups}
                    individualStores={individualStores}
                    filterLocal={filterLocal}
                    onFilterLocalChange={onFilterLocalChange}
                    sourceId={selectedSourceId}
                />
            )}
        </div>
    );
};
