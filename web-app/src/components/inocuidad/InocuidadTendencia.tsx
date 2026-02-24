import React, { useState, useEffect, useMemo } from 'react';
import { getToken, API_BASE } from '../../api';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

interface TrendPoint {
    periodo: string;
    mes: number;
    puntaje: number;
    evaluaciones: number;
}

interface Hallazgo {
    categoria: string;
    promedio: number;
}

interface KpiConfig {
    Meta?: number;
    Advertencia?: number;
}

interface DashboardStats {
    avgScore: number;
    evaluaciones: number;
    categoriasAbajo: number;
    hallazgoRecurrente: string | null;
    hallazgosTop: Hallazgo[];
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
    year, rangeType, rangePeriod, groups, filterLocal, sourceId
}) => {
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Determine visible months based on range
    const visibleMonths = useMemo(() => {
        switch (rangeType) {
            case 'anual': return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            case 'semestre': return SEMESTERS_MONTHS[rangePeriod] || [1, 2, 3, 4, 5, 6];
            case 'trimestre': return TRIMESTERS_MONTHS[rangePeriod] || [1, 2, 3];
            case 'mes': return [rangePeriod];
            default: return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        }
    }, [rangeType, rangePeriod]);

    // Fetch data from tendencia-dashboard endpoint
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

                const response = await fetch(`${API_BASE}/inocuidad/tendencia-dashboard?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);

                const result = await response.json();
                setTrend(result.trend || []);
                setStats(result.stats || null);
                setKpiConfig(result.kpiConfig || null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [sourceId, year, filterLocal, groups]);

    // Filter trend data to visible months
    const filteredTrend = useMemo(() => {
        return trend.filter(t => visibleMonths.includes(t.mes));
    }, [trend, visibleMonths]);

    // Recalculate stats for visible range
    const rangeStats = useMemo(() => {
        if (!stats) return null;
        if (rangeType === 'anual') return stats;
        // Recalculate avg and evaluaciones for visible months
        const visibleTrend = trend.filter(t => visibleMonths.includes(t.mes));
        const totalEvals = visibleTrend.reduce((s, t) => s + t.evaluaciones, 0);
        const scores = visibleTrend.map(t => t.puntaje);
        const avgScore = scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : 0;
        return { ...stats, avgScore, evaluaciones: totalEvals };
    }, [stats, trend, visibleMonths, rangeType]);

    const metaValue = kpiConfig?.Meta || 95;

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

    if (!rangeStats || filteredTrend.length === 0) {
        return (
            <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500">
                <p className="font-medium">No hay datos de inocuidad para el período seleccionado.</p>
                <p className="text-sm mt-1">Verifique que existan evaluaciones sincronizadas.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ═══════ KPI Summary Cards ═══════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Puntaje promedio */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                    <div className="text-xs text-gray-500 font-medium">Puntaje promedio</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{rangeStats.avgScore}%</div>
                    <div className="text-xs text-gray-400 mt-1">Meta sugerida: {metaValue}%</div>
                </div>

                {/* Evaluaciones */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                    <div className="text-xs text-gray-500 font-medium">Evaluaciones</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{rangeStats.evaluaciones}</div>
                    <div className="text-xs text-gray-400 mt-1">Según rango seleccionado</div>
                </div>

                {/* Categorías bajo meta */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                    <div className="text-xs text-gray-500 font-medium">Categorías bajo {kpiConfig?.Meta || 85}%</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{rangeStats.categoriasAbajo}</div>
                    <div className="text-xs text-gray-400 mt-1">Prioridad de mejora</div>
                </div>

                {/* Hallazgo recurrente */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 flex items-center gap-3">
                    <div className="rounded-xl bg-amber-100 p-2.5 flex-shrink-0">
                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs text-gray-500 font-medium">Hallazgo recurrente</div>
                        <div className="text-sm font-semibold text-gray-900 truncate">{rangeStats.hallazgoRecurrente || '—'}</div>
                    </div>
                </div>
            </div>

            {/* ═══════ Chart + Top Hallazgos Row ═══════ */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Tendencia Chart */}
                <div className="xl:col-span-2 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-800">Tendencia de Inocuidad</h3>
                    </div>
                    <div className="h-[260px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={filteredTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="periodo"
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    axisLine={{ stroke: '#d1d5db' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={[65, 100]}
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    axisLine={{ stroke: '#d1d5db' }}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'white',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        fontSize: '12px'
                                    }}
                                    formatter={(value: number) => [`${value}%`, 'Puntaje']}
                                />
                                <ReferenceLine
                                    y={metaValue}
                                    stroke="#ef4444"
                                    strokeDasharray="4 4"
                                    label={{ value: `Meta ${metaValue}%`, position: 'right', fontSize: 10, fill: '#ef4444' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="puntaje"
                                    stroke="#0d9488"
                                    strokeWidth={3}
                                    dot={{ r: 3, fill: '#0d9488', strokeWidth: 0 }}
                                    activeDot={{ r: 5, fill: '#0d9488', strokeWidth: 2, stroke: 'white' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Hallazgos */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-5">
                    <h3 className="text-base font-bold text-gray-800 mb-3">Top hallazgos</h3>
                    <div className="space-y-3">
                        {(rangeStats.hallazgosTop || []).map((h, i) => (
                            <div key={h.categoria} className="rounded-xl border border-gray-100 p-3 bg-white hover:shadow-sm transition-shadow">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium text-gray-800 leading-tight min-w-0 truncate">
                                        {i + 1}. {h.categoria}
                                    </div>
                                    <span className="text-xs font-semibold rounded-md px-2 py-1 bg-gray-100 text-gray-700 flex-shrink-0">
                                        {h.promedio}%
                                    </span>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.max(4, Math.min(100, h.promedio))}%`,
                                            backgroundColor: h.promedio >= (kpiConfig?.Meta || 85) ? '#0d9488' : h.promedio >= (kpiConfig?.Advertencia || 75) ? '#f59e0b' : '#ef4444'
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                        {(!rangeStats.hallazgosTop || rangeStats.hallazgosTop.length === 0) && (
                            <div className="text-center text-gray-400 text-sm py-4">Sin hallazgos</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
