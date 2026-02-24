import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { fetchBudgetData } from '../api';
import type { BudgetRecord } from '../mockData';
import { formatCurrencyCompact, useFormatCurrency } from '../utils/formatters';

interface ComparableCurvesProps {
    stores: string[];
    year: number;
    month?: number; // 0-indexed, absent = annual
    canal: string;
    kpi: string;
    mode: 'mensual' | 'anual';
    fechaLimite?: string;
}

// 12 distinct colors for store lines
const STORE_COLORS = [
    '#6366F1', // indigo
    '#EC4899', // pink
    '#F59E0B', // amber
    '#10B981', // emerald
    '#EF4444', // red
    '#8B5CF6', // violet
    '#06B6D4', // cyan
    '#F97316', // orange
    '#14B8A6', // teal
    '#A855F7', // purple
    '#3B82F6', // blue
    '#84CC16', // lime
];

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAY_LETTERS = ['D', 'L', 'K', 'M', 'J', 'V', 'S'];

type DataType = 'MontoReal' | 'Monto' | 'MontoAnterior' | 'MontoAnteriorAjustado';

const DATA_TYPE_LABELS: Record<DataType, string> = {
    MontoReal: 'Real',
    Monto: 'Presupuesto',
    MontoAnterior: 'Año Anterior',
    MontoAnteriorAjustado: 'Año Ant. Ajustado',
};

export const ComparableCurves: React.FC<ComparableCurvesProps> = ({
    stores, year, month, canal, kpi, mode, fechaLimite
}) => {
    const [expanded, setExpanded] = useState(false);
    const [dataType, setDataType] = useState<DataType>('MontoReal');
    const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
    const [storeData, setStoreData] = useState<Record<string, BudgetRecord[]>>({});
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const fc = useFormatCurrency();

    // Initialize selectedStores when stores change
    useEffect(() => {
        setSelectedStores(new Set(stores));
        setHasLoaded(false);
        setStoreData({});
    }, [stores.join(',')]);

    // Lazy load: fetch data only when expanded
    useEffect(() => {
        if (!expanded || hasLoaded || stores.length === 0) return;

        setLoading(true);
        const startDate = mode === 'mensual' && month !== undefined
            ? `${year}-${String(month + 1).padStart(2, '0')}-01`
            : `${year}-01-01`;
        const endDate = mode === 'mensual' && month !== undefined
            ? `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`
            : `${year}-12-31`;

        Promise.all(
            stores.map(store =>
                fetchBudgetData(year, store, canal, kpi, startDate, endDate)
                    .then(data => ({ store, data }))
                    .catch(() => ({ store, data: [] as BudgetRecord[] }))
            )
        ).then(results => {
            const dataMap: Record<string, BudgetRecord[]> = {};
            for (const { store, data } of results) {
                dataMap[store] = data;
            }
            setStoreData(dataMap);
            setHasLoaded(true);
            setLoading(false);
        });
    }, [expanded, hasLoaded, stores.join(','), year, month, canal, kpi, mode]);

    // Build chart data
    const chartData = useMemo(() => {
        if (Object.keys(storeData).length === 0) return [];

        if (mode === 'mensual') {
            // Daily aggregation: one point per day
            const dayMap = new Map<number, Record<string, number>>();

            for (const [store, records] of Object.entries(storeData)) {
                for (const r of records) {
                    if (!dayMap.has(r.Dia)) dayMap.set(r.Dia, {});
                    const entry = dayMap.get(r.Dia)!;
                    entry[store] = (entry[store] || 0) + (r[dataType] || 0);
                    entry._year = r.Año;
                    entry._month = r.Mes;
                    entry._day = r.Dia;
                }
            }

            return Array.from(dayMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([dia, vals]) => {
                    const y = vals._year || year;
                    const m = vals._month || (month !== undefined ? month + 1 : 1);
                    const date = new Date(y, m - 1, dia);
                    const dayLetter = DAY_LETTERS[date.getDay()];
                    return {
                        name: `${dayLetter}_${String(dia).padStart(2, '0')}`,
                        ...vals,
                    };
                });
        } else {
            // Monthly aggregation: one point per month
            const monthMap = new Map<number, Record<string, number>>();

            for (const [store, records] of Object.entries(storeData)) {
                for (const r of records) {
                    if (!monthMap.has(r.Mes)) monthMap.set(r.Mes, {});
                    const entry = monthMap.get(r.Mes)!;
                    entry[store] = (entry[store] || 0) + (r[dataType] || 0);
                }
            }

            return Array.from(monthMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([mes, vals]) => ({
                    name: MONTH_SHORT[mes - 1] || `M${mes}`,
                    ...vals,
                }));
        }
    }, [storeData, dataType, mode, year, month]);

    const toggleStore = useCallback((store: string) => {
        setSelectedStores(prev => {
            const next = new Set(prev);
            if (next.has(store)) {
                next.delete(store);
            } else {
                next.add(store);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback(() => setSelectedStores(new Set(stores)), [stores]);
    const selectNone = useCallback(() => setSelectedStores(new Set()), []);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl min-w-[180px] max-w-[280px]">
                <p className="font-bold text-gray-700 mb-2 text-sm">{label}</p>
                {payload
                    .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
                    .map((entry: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-medium py-0.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                            <span className="text-gray-500 truncate">{entry.name}:</span>
                            <span className="text-gray-900 font-mono ml-auto">{fc(entry.value, kpi)}</span>
                        </div>
                    ))}
            </div>
        );
    };

    const title = 'Comparación por Local';
    const subtitle = mode === 'mensual' && month !== undefined
        ? `${MONTH_SHORT[month]} ${year} • ${DATA_TYPE_LABELS[dataType]}`
        : `${year} • ${DATA_TYPE_LABELS[dataType]}`;

    // Header is always rendered — even when stores haven't loaded yet
    const headerButton = (
        <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-emerald-50 to-cyan-50 hover:from-emerald-100 hover:to-cyan-100 transition-colors"
        >
            <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-lg sm:text-xl">📈</span>
                <div className="text-left">
                    <h3 className="text-sm sm:text-base font-bold text-gray-800">{title}</h3>
                    <p className="text-[10px] sm:text-xs text-gray-500">
                        {subtitle}{stores.length > 0 ? ` • ${stores.length} locales` : ''}
                    </p>
                </div>
            </div>
            {expanded
                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                : <ChevronDown className="w-5 h-5 text-gray-400" />
            }
        </button>
    );

    // When stores haven't loaded, show header with loading message
    if (stores.length === 0) {
        return (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-lg overflow-hidden mt-8">
                {headerButton}
                {expanded && (
                    <div className="px-6 py-8 text-center text-gray-400 text-sm">
                        Cargando locales...
                    </div>
                )}
            </div>
        );
    }

    // Normal render with data
    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-lg overflow-hidden mt-8">
            {/* ⚠️ DO NOT REMOVE — Comparable Curves (Comparación por Local) — CRITICAL: must always be visible */}
            {headerButton}

            {/* Expanded content */}
            {expanded && (
                <div className="p-4 sm:p-6">
                    {/* Controls */}
                    <div className="flex flex-wrap gap-3 mb-4">
                        {/* Data type selector */}
                        <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-semibold text-gray-600 mr-1">Tipo:</span>
                            {(Object.entries(DATA_TYPE_LABELS) as [DataType, string][]).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => { setDataType(key); setHasLoaded(false); }}
                                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${dataType === key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>

                        {/* Store toggles */}
                        <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-semibold text-gray-600 mr-1">Locales:</span>
                            <button onClick={selectAll} className="px-2 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">Todos</button>
                            <button onClick={selectNone} className="px-2 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">Ninguno</button>
                            {stores.map((store, i) => (
                                <label
                                    key={store}
                                    className="flex items-center gap-1 cursor-pointer px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <div
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: STORE_COLORS[i % STORE_COLORS.length] }}
                                    />
                                    <input
                                        type="checkbox"
                                        checked={selectedStores.has(store)}
                                        onChange={() => toggleStore(store)}
                                        className="w-3 h-3 sr-only"
                                    />
                                    <span className={`text-[11px] font-medium whitespace-nowrap ${selectedStores.has(store) ? 'text-gray-700' : 'text-gray-300 line-through'}`}>
                                        {store}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Chart */}
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            <span className="text-sm">Cargando datos de locales...</span>
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">
                            Sin datos disponibles
                        </div>
                    ) : (
                        <div className="h-[350px] sm:h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                        dy={10}
                                        angle={mode === 'mensual' ? -45 : 0}
                                        textAnchor={mode === 'mensual' ? 'end' : 'middle'}
                                        interval={0}
                                        height={mode === 'mensual' ? 60 : 40}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                                        tickFormatter={(value: number) => formatCurrencyCompact(value, kpi)}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    {stores.map((store, i) => (
                                        selectedStores.has(store) && (
                                            <Line
                                                key={store}
                                                type="monotone"
                                                dataKey={store}
                                                name={store}
                                                stroke={STORE_COLORS[i % STORE_COLORS.length]}
                                                strokeWidth={2}
                                                dot={mode === 'anual' ? { r: 3 } : false}
                                                activeDot={{ r: 5 }}
                                                connectNulls
                                            />
                                        )
                                    ))}
                                    <Brush
                                        dataKey="name"
                                        height={30}
                                        stroke="#6366F1"
                                        fill="#E0E7FF"
                                        travellerWidth={10}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
