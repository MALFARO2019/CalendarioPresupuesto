import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getToken, API_BASE } from '../../api';

interface CategoryRow {
    name: string;
    columnName: string;
    group: string;
    months: Record<number, number>;
    promedio: number;
}

interface CategoryGroup {
    group: string;
    rows: CategoryRow[];
}

interface KpiConfig {
    Meta?: number;
    Advertencia?: number;
}

type RangeType = 'anual' | 'semestre' | 'trimestre' | 'mes';

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

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface InocuidadCalorProps {
    year: number;
    rangeType: RangeType;
    rangePeriod: number;
    groups: string[];
    individualStores: string[];
    filterLocal: string;
    onFilterLocalChange: (v: string) => void;
    sourceId: number | null;
}

function colorForScore(score: number | null | undefined): { bg: string; fg: string } {
    if (score == null) return { bg: '#f3f4f6', fg: '#6b7280' };
    if (score < 75) return { bg: '#fee2e2', fg: '#991b1b' };
    if (score < 85) return { bg: '#fef3c7', fg: '#92400e' };
    if (score < 92) return { bg: '#dcfce7', fg: '#166534' };
    return { bg: '#bbf7d0', fg: '#14532d' };
}

export const InocuidadCalor: React.FC<InocuidadCalorProps> = ({
    year, rangeType, rangePeriod, groups, filterLocal, sourceId
}) => {
    const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);

    // Visible months based on range type
    const visibleMonths = useMemo(() => {
        switch (rangeType) {
            case 'anual': return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            case 'semestre': return SEMESTERS_MONTHS[rangePeriod] || [1, 2, 3, 4, 5, 6];
            case 'trimestre': return TRIMESTERS_MONTHS[rangePeriod] || [1, 2, 3];
            case 'mes': return [rangePeriod];
            default: return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        }
    }, [rangeType, rangePeriod]);

    // Fetch data
    useEffect(() => {
        if (!sourceId) return;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = getToken();
                if (!token) { setError('No hay sesión activa'); return; }

                const params = new URLSearchParams({
                    sourceId: String(sourceId),
                    year: String(year)
                });
                if (filterLocal && groups.includes(filterLocal)) {
                    params.set('grupo', filterLocal);
                } else if (filterLocal && filterLocal !== 'Corporativo') {
                    params.set('locales', filterLocal);
                }

                const response = await fetch(`${API_BASE}/inocuidad/calor-categorias?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);

                const result = await response.json();
                setCategoryGroups(result.groups || []);
                setKpiConfig(result.kpiConfig || null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [sourceId, year, filterLocal, groups]);

    // Compute row spans for groups
    const groupRowSpans = useMemo(() => {
        const spans: Record<string, number> = {};
        for (const g of categoryGroups) {
            spans[g.group] = g.rows.length;
        }
        return spans;
    }, [categoryGroups]);

    // Flatten groups to rows for rendering, tracking which rows need group cell
    const flatRows = useMemo(() => {
        const result: Array<{ row: CategoryRow; group: string; isFirstInGroup: boolean }> = [];
        for (const g of categoryGroups) {
            g.rows.forEach((row, i) => {
                result.push({ row, group: g.group, isFirstInGroup: i === 0 });
            });
        }
        return result;
    }, [categoryGroups]);

    // Filter visible months that have data
    const activeMonths = useMemo(() => {
        const dataMonths = new Set<number>();
        for (const g of categoryGroups) {
            for (const row of g.rows) {
                Object.keys(row.months).forEach(m => dataMonths.add(parseInt(m)));
            }
        }
        return visibleMonths.filter(m => dataMonths.has(m));
    }, [categoryGroups, visibleMonths]);

    // Use activeMonths if any have data, otherwise show all visible months
    const displayMonths = activeMonths.length > 0 ? activeMonths : visibleMonths;

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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg className="w-7 h-7 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando mapa de calor...</span>
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

    if (flatRows.length === 0) {
        return (
            <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500">
                <p className="font-medium">No hay datos para el período seleccionado.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-800">Mapa de calor por categoría</h3>
            </div>
            <div className="overflow-auto">
                <table className="min-w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr>
                            <th className="px-3 py-2.5 text-left border-b-2 border-gray-200 border-r border-gray-200 min-w-[120px] text-xs font-bold text-gray-500 uppercase">
                                Grupo
                            </th>
                            <th className="px-3 py-2.5 text-left border-b-2 border-gray-200 border-r border-gray-200 min-w-[180px] text-xs font-bold text-gray-500 uppercase">
                                Categoría
                            </th>
                            {displayMonths.map(m => (
                                <th key={m} className="px-2 py-2.5 text-center border-b-2 border-gray-200 border-r border-gray-100 min-w-[52px] text-xs font-bold text-gray-500 uppercase">
                                    {MONTH_LABELS[m - 1]}
                                </th>
                            ))}
                            <th className="px-3 py-2.5 text-center border-b-2 border-gray-200 min-w-[60px] text-xs font-bold text-gray-500 uppercase">
                                Prom.
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {flatRows.map(({ row, group, isFirstInGroup }, idx) => {
                            const avgColor = colorForScore(row.promedio > 0 ? row.promedio : null);
                            return (
                                <tr key={`${group}-${row.columnName}`} className="bg-white hover:bg-gray-50/70 transition-colors">
                                    {isFirstInGroup && (
                                        <td
                                            rowSpan={groupRowSpans[group]}
                                            className="px-3 py-2.5 border-b border-gray-200 border-r border-gray-200 align-top font-semibold text-gray-700 bg-gray-50 text-xs"
                                        >
                                            {group}
                                        </td>
                                    )}
                                    <td className="px-3 py-2.5 border-b border-gray-100 border-r border-gray-200 text-gray-700 text-xs">
                                        {row.name}
                                    </td>
                                    {displayMonths.map(m => {
                                        const value = row.months[m];
                                        const c = colorForScore(value != null ? value : null);
                                        return (
                                            <td
                                                key={m}
                                                className="px-2 py-2.5 border-b border-gray-100 border-r border-gray-100 text-center font-medium text-xs"
                                                style={{ backgroundColor: c.bg, color: c.fg }}
                                                title={`${row.name} • ${MONTH_LABELS[m - 1]}: ${value != null ? value + '%' : 'Sin dato'}`}
                                            >
                                                {value != null ? Math.round(value) : '—'}
                                            </td>
                                        );
                                    })}
                                    <td
                                        className="px-2 py-2.5 border-b border-gray-100 text-center font-bold text-xs"
                                        style={{ backgroundColor: avgColor.bg, color: avgColor.fg }}
                                    >
                                        {row.promedio > 0 ? row.promedio.toFixed(1) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <span className="font-semibold">Leyenda:</span>
                <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#fee2e2' }} />
                    &lt; 75%
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#fef3c7' }} />
                    75% - 84.9%
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#dcfce7' }} />
                    85% - 91.9%
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#bbf7d0' }} />
                    ≥ 92%
                </span>
            </div>
        </div>
    );
};
