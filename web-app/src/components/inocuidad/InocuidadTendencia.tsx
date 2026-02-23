import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getToken, API_BASE, fetchAdminPorLocal, type PersonalAsignado } from '../../api';

interface TendenciaRow {
    codAlmacen: string;
    local: string;
    months: Record<number, { promedio: number; evaluaciones: number }>;
}

interface KpiConfig {
    Meta?: number;
    Advertencia?: number;
    ColorMeta?: string;
    ColorAdvertencia?: string;
    ColorCritico?: string;
}

type RangeType = 'anual' | 'semestre' | 'trimestre' | 'mes';

interface InocuidadTendenciaProps {
    year: number;
    rangeType: RangeType;
    rangePeriod: number;
    groups: string[];
    individualStores: string[];
    filterLocal: string;
    onFilterLocalChange: (v: string) => void;
    sourceId: number | null;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SEMESTERS_MONTHS: Record<number, number[]> = {
    1: [1, 2, 3, 4, 5, 6],
    2: [7, 8, 9, 10, 11, 12],
};

const TRIMESTERS_MONTHS: Record<number, number[]> = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
};

export const InocuidadTendencia: React.FC<InocuidadTendenciaProps> = ({
    year, rangeType, rangePeriod, groups, individualStores, filterLocal, onFilterLocalChange, sourceId
}) => {
    const [data, setData] = useState<TendenciaRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
    const [personalAsignado, setPersonalAsignado] = useState<PersonalAsignado[]>([]);
    const [sortCol, setSortCol] = useState<string>('local');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Determine visible months based on range type + period
    const visibleMonths = useMemo(() => {
        switch (rangeType) {
            case 'anual':
                return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            case 'semestre':
                return SEMESTERS_MONTHS[rangePeriod] || [1, 2, 3, 4, 5, 6];
            case 'trimestre':
                return TRIMESTERS_MONTHS[rangePeriod] || [1, 2, 3];
            case 'mes':
                return [rangePeriod];
            default:
                return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        }
    }, [rangeType, rangePeriod]);

    // Fetch personal for selected local
    useEffect(() => {
        if (!filterLocal || groups.includes(filterLocal) || filterLocal === 'Corporativo') {
            setPersonalAsignado([]);
            return;
        }
        let cancelled = false;
        fetchAdminPorLocal(filterLocal).then(lista => {
            if (!cancelled) setPersonalAsignado(lista);
        });
        return () => { cancelled = true; };
    }, [filterLocal, groups]);

    // Fetch data
    useEffect(() => {
        if (!sourceId) return;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = getToken();
                if (!token) { setError('No hay sesión activa'); return; }

                const params = new URLSearchParams({ sourceId: String(sourceId), year: String(year) });
                if (filterLocal && groups.includes(filterLocal)) {
                    params.set('grupo', filterLocal);
                } else if (filterLocal && filterLocal !== 'Corporativo') {
                    params.set('locales', filterLocal);
                }

                const response = await fetch(`${API_BASE}/inocuidad/tendencia?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);

                const result = await response.json();
                setData(result.rows || []);
                setKpiConfig(result.kpiConfig || null);
                if (result.personalAsignado) setPersonalAsignado(result.personalAsignado);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [sourceId, year, filterLocal, groups]);

    // Color function
    const getScoreColor = useCallback((score: number) => {
        const meta = kpiConfig?.Meta ?? 80;
        const warn = kpiConfig?.Advertencia ?? 60;
        if (score >= meta) return { bg: kpiConfig?.ColorMeta || '#dcfce7', text: kpiConfig?.ColorMeta ? '#fff' : '#166534' };
        if (score >= warn) return { bg: kpiConfig?.ColorAdvertencia || '#fef9c3', text: kpiConfig?.ColorAdvertencia ? '#fff' : '#854d0e' };
        return { bg: kpiConfig?.ColorCritico || '#fecaca', text: kpiConfig?.ColorCritico ? '#fff' : '#991b1b' };
    }, [kpiConfig]);

    // Filter months that have data AND are in visible range
    const filteredMonths = useMemo(() => {
        const dataMonths = new Set<number>();
        for (const row of data) {
            Object.keys(row.months).forEach(m => dataMonths.add(parseInt(m)));
        }
        return visibleMonths.filter(m => dataMonths.has(m));
    }, [data, visibleMonths]);

    // Sort data
    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => {
            let cmp: number;
            if (sortCol === 'local') {
                cmp = a.local.localeCompare(b.local);
            } else if (sortCol === 'promedio') {
                const avgA = filteredMonths.reduce((s, m) => s + (a.months[m]?.promedio || 0), 0) / (filteredMonths.length || 1);
                const avgB = filteredMonths.reduce((s, m) => s + (b.months[m]?.promedio || 0), 0) / (filteredMonths.length || 1);
                cmp = avgA - avgB;
            } else {
                const mNum = parseInt(sortCol);
                cmp = (a.months[mNum]?.promedio || 0) - (b.months[mNum]?.promedio || 0);
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data, sortCol, sortDir, filteredMonths]);

    const handleSort = (col: string) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir(col === 'local' ? 'asc' : 'desc');
        }
    };

    if (!sourceId) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg className="w-7 h-7 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-red-600 text-sm">⚠️ {error}</span>
            </div>
        );
    }

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg className="w-7 h-7 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando tendencia...</span>
            </div>
        );
    }

    // Personal info subtitle
    const personalInfo = filterLocal && filterLocal !== 'Corporativo' && !groups.includes(filterLocal) && personalAsignado.length > 0
        ? personalAsignado.map(p => `${p.nombre} (${p.perfil})`).join(', ')
        : null;

    // No data
    if (data.length === 0) {
        return (
            <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500">
                <p className="font-medium">No hay datos de inocuidad para el período seleccionado.</p>
                <p className="text-sm mt-1">Verifique que existan evaluaciones sincronizadas con CodAlmacen mapeado.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {personalInfo && (
                <div className="px-4 py-2 border-b border-gray-100 bg-teal-50 text-sm text-teal-700">
                    <strong>{filterLocal}</strong> — {personalInfo}
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-teal-600 select-none sticky left-0 bg-gray-50 z-10"
                                onClick={() => handleSort('local')}>
                                Restaurante {sortCol === 'local' && (sortDir === 'asc' ? '↑' : '↓')}
                            </th>
                            {(filteredMonths.length > 0 ? filteredMonths : visibleMonths).map(m => (
                                <th key={m}
                                    className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-teal-600 select-none min-w-[70px]"
                                    onClick={() => handleSort(String(m))}>
                                    {MONTHS[m - 1]} {sortCol === String(m) && (sortDir === 'asc' ? '↑' : '↓')}
                                </th>
                            ))}
                            <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-teal-600 select-none"
                                onClick={() => handleSort('promedio')}>
                                Prom. {sortCol === 'promedio' && (sortDir === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map(row => {
                            const displayMonths = filteredMonths.length > 0 ? filteredMonths : visibleMonths;
                            const monthsWithData = displayMonths.filter(m => row.months[m]);
                            const avg = monthsWithData.length > 0
                                ? monthsWithData.reduce((s, m) => s + (row.months[m]?.promedio || 0), 0) / monthsWithData.length
                                : 0;
                            return (
                                <tr key={row.codAlmacen} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-2.5 px-3 text-sm font-medium text-gray-800 sticky left-0 bg-white z-10 whitespace-nowrap">
                                        {row.local}
                                    </td>
                                    {displayMonths.map(m => {
                                        const val = row.months[m];
                                        if (!val) return <td key={m} className="py-2.5 px-2 text-center text-gray-300 text-xs">—</td>;
                                        const colors = getScoreColor(val.promedio);
                                        return (
                                            <td key={m} className="py-2.5 px-2 text-center">
                                                <span
                                                    className="inline-block px-2 py-1 rounded-md text-xs font-bold"
                                                    style={{ backgroundColor: colors.bg, color: colors.text }}
                                                    title={`${val.evaluaciones} evaluación(es)`}
                                                >
                                                    {val.promedio.toFixed(1)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className="py-2.5 px-3 text-center">
                                        {monthsWithData.length > 0 ? (
                                            <span className="inline-block px-2 py-1 rounded-md text-xs font-bold"
                                                style={{ backgroundColor: getScoreColor(avg).bg, color: getScoreColor(avg).text }}>
                                                {avg.toFixed(1)}
                                            </span>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex flex-wrap gap-3">
                <span>{data.length} restaurante(s)</span>
                <span>Año {year}</span>
                {kpiConfig && <span>Meta: ≥{kpiConfig.Meta} / Advertencia: ≥{kpiConfig.Advertencia}</span>}
            </div>
        </div>
    );
};
