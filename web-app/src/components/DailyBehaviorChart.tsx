import React, { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, LabelList, ReferenceLine } from "recharts";
import { formatCurrencyCompact, useFormatCurrency } from '../utils/formatters';
import { useUserPreferences } from '../context/UserPreferences';
import type { EventosByDate } from '../api';

interface DailyBehaviorChartProps {
    data: any[];
    kpi: string;
    dateRange?: { startDate: string; endDate: string };
    verEventos?: boolean;
    eventsByDate?: EventosByDate;
    verEventosAjuste?: boolean;
    eventosAjusteByDate?: EventosByDate;
    verEventosAA?: boolean;
    eventosAAByDate?: EventosByDate;
}

const DAY_LETTERS = ['D', 'L', 'K', 'M', 'J', 'V', 'S'];

export const DailyBehaviorChart: React.FC<DailyBehaviorChartProps> = ({ data, kpi, dateRange, verEventos = false, eventsByDate = {}, verEventosAjuste = false, eventosAjusteByDate = {}, verEventosAA = false, eventosAAByDate = {} }) => {
    const fc = useFormatCurrency();
    const { formatPct100 } = useUserPreferences();
    // State for controlling which lines are visible
    const [visibleLines, setVisibleLines] = useState({
        real: true,
        presupuesto: true,
        anterior: false,
        anteriorAjustado: false
    });

    // Label settings state
    const [labelSettings, setLabelSettings] = useState({
        showAllLabels: false,
        showMaxPoint: false,
        showMinPoint: false,
        selectedKpis: ['Real'] as Array<'Real' | 'Presupuesto' | 'Año Anterior' | 'Año Anterior Ajustado'>
    });

    const toggleLine = (line: keyof typeof visibleLines) => {
        setVisibleLines(prev => ({ ...prev, [line]: !prev[line] }));
    };
    // Step 1: Aggregate data by day (handles duplicates from multiple Canal/Tipo)
    const aggregatedMap = new Map<number, { MontoReal: number; Monto: number; MontoAnterior: number; MontoAnteriorAjustado: number; Año: number; Mes: number; Dia: number }>();

    for (const d of data) {
        const existing = aggregatedMap.get(d.Dia);
        if (existing) {
            existing.MontoReal += d.MontoReal || 0;
            existing.Monto += d.Monto || 0;
            existing.MontoAnterior += d.MontoAnterior || 0;
            existing.MontoAnteriorAjustado += d.MontoAnteriorAjustado || 0;
        } else {
            aggregatedMap.set(d.Dia, {
                MontoReal: d.MontoReal || 0,
                Monto: d.Monto || 0,
                MontoAnterior: d.MontoAnterior || 0,
                MontoAnteriorAjustado: d.MontoAnteriorAjustado || 0,
                Año: d.Año,
                Mes: d.Mes,
                Dia: d.Dia,
            });
        }
    }

    // Step 2: Build chart data with formatted X-axis label
    const chartData = Array.from(aggregatedMap.values())
        .sort((a, b) => a.Dia - b.Dia)
        .map((d) => {
            const date = new Date(d.Año, d.Mes - 1, d.Dia);
            const dayLetter = DAY_LETTERS[date.getDay()];
            const dd = String(d.Dia).padStart(2, '0');
            const mm = String(d.Mes).padStart(2, '0');
            const yy = String(d.Año).slice(-2);
            return {
                name: `${dayLetter}_${dd}/${mm}/${yy}`,
                Real: d.MontoReal,
                Presupuesto: d.Monto,
                'Año Anterior': d.MontoAnterior,
                'Año Anterior Ajustado': d.MontoAnteriorAjustado,
                year: d.Año,
                month: d.Mes,
                day: d.Dia,
            };
        });

    // Custom Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            // Extract values for calculations
            const presupuesto = payload.find((p: any) => p.dataKey === 'Presupuesto')?.value;
            const real = payload.find((p: any) => p.dataKey === 'Real')?.value;
            const anterior = payload.find((p: any) => p.dataKey === 'Año Anterior')?.value;
            const anteriorAjustado = payload.find((p: any) => p.dataKey === 'Año Anterior Ajustado')?.value;

            // Diff vs Presupuesto
            const difPpto = (real != null && presupuesto != null) ? real - presupuesto : null;
            const pctPpto = (presupuesto != null && presupuesto !== 0 && real != null) ? (real / presupuesto * 100) : null;

            // Diff vs Año Anterior (whichever is visible)
            const anteriorVal = anteriorAjustado ?? anterior;
            const anteriorLabel = anteriorAjustado != null ? 'Ajust.' : 'Ant.';
            const difAnt = (real != null && anteriorVal != null) ? real - anteriorVal : null;
            const pctAnt = (anteriorVal != null && anteriorVal !== 0 && real != null) ? (real / anteriorVal * 100) : null;

            const tooltipDate = payload[0]?.payload;
            // Look up regular events (SharePoint / DIM_EVENTOS) for this day
            const regularEventsForDay: { id: number; evento: string; esFeriado: boolean }[] = [];
            if (verEventos && tooltipDate) {
                const dd = String(tooltipDate.day).padStart(2, '0');
                const mm = String(tooltipDate.month).padStart(2, '0');
                const dateKey = `${tooltipDate.year}-${mm}-${dd}`;
                const evs = eventsByDate[dateKey];
                if (evs) regularEventsForDay.push(...evs);
            }
            // Look up adjustment events for this day
            const ajusteEventsForDay: { id: number; evento: string }[] = [];
            if (verEventosAjuste && tooltipDate) {
                const dd = String(tooltipDate.day).padStart(2, '0');
                const mm = String(tooltipDate.month).padStart(2, '0');
                const dateKey = `${tooltipDate.year}-${mm}-${dd}`;
                const evs = eventosAjusteByDate[dateKey];
                if (evs) ajusteEventsForDay.push(...evs);
            }
            // Look up año anterior events for this day
            const aaEventsForDay: { id: number; evento: string }[] = [];
            if (verEventosAA && tooltipDate) {
                const dd = String(tooltipDate.day).padStart(2, '0');
                const mm = String(tooltipDate.month).padStart(2, '0');
                const dateKey = `${tooltipDate.year}-${mm}-${dd}`;
                const evs = eventosAAByDate[dateKey];
                if (evs) aaEventsForDay.push(...evs);
            }
            return (
                <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl min-w-[200px]">
                    <p className="font-bold text-gray-700 mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-xs font-medium">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                            <span className="text-gray-500">{entry.name}:</span>
                            <span className="text-gray-900 font-mono">{fc(entry.value, kpi)}</span>
                        </div>
                    ))}
                    {difPpto != null && (
                        <>
                            <div className="h-px bg-gray-100 my-1.5" />
                            <div className="flex items-center gap-2 text-xs font-medium">
                                <span className="text-gray-500">Dif. Ppto:</span>
                                <span className={`font-mono font-bold ${difPpto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {difPpto >= 0 ? '+' : ''}{fc(difPpto, kpi)}
                                </span>
                                {pctPpto != null && (
                                    <span className={`font-mono font-bold ${pctPpto >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                        ({formatPct100(pctPpto)})
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                    {difAnt != null && (
                        <div className="flex items-center gap-2 text-xs font-medium">
                            <span className="text-gray-500">Dif. {anteriorLabel}:</span>
                            <span className={`font-mono font-bold ${difAnt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {difAnt >= 0 ? '+' : ''}{fc(difAnt, kpi)}
                            </span>
                            {pctAnt != null && (
                                <span className={`font-mono font-bold ${pctAnt >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({formatPct100(pctAnt)})
                                </span>
                            )}
                        </div>
                    )}
                    {regularEventsForDay.length > 0 && (
                        <>
                            <div className="h-px bg-amber-200 my-1.5" />
                            {regularEventsForDay.map((ev, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                    <div className={`w-2 h-2 rounded-full ${ev.esFeriado ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                                    <span className={ev.esFeriado ? 'text-red-700 font-semibold' : 'text-amber-800 font-semibold'}>{ev.evento}</span>
                                </div>
                            ))}
                        </>
                    )}
                    {ajusteEventsForDay.length > 0 && (
                        <>
                            <div className="h-px bg-red-200 my-1.5" />
                            {ajusteEventsForDay.map((aev, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                    <div className="w-2 h-2 rounded-full bg-red-600"></div>
                                    <span className="text-red-700 font-semibold">{aev.evento}</span>
                                </div>
                            ))}
                        </>
                    )}
                    {aaEventsForDay.length > 0 && (
                        <>
                            <div className="h-px bg-purple-200 my-1.5" />
                            {aaEventsForDay.map((aev, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                    <span className="text-purple-700 font-semibold">{aev.evento}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            );
        }
        return null;
    };


    // Calculate max and min values for each KPI
    const kpiMaxMin = useMemo(() => {
        const result = new Map<string, { max: number | null; min: number | null }>();
        const kpiNames: Array<'Real' | 'Presupuesto' | 'Año Anterior' | 'Año Anterior Ajustado'> = [
            'Real', 'Presupuesto', 'Año Anterior', 'Año Anterior Ajustado'
        ];

        kpiNames.forEach(kpiName => {
            const values = chartData.map(d => d[kpiName]).filter(v => v != null && v > 0);
            result.set(kpiName, {
                max: values.length > 0 ? Math.max(...values) : null,
                min: values.length > 0 ? Math.min(...values) : null
            });
        });

        return result;
    }, [chartData]);

    // Custom label component
    const CustomLabel = (props: any) => {
        const { x, y, value, index, dataKey } = props;
        const dataPoint = chartData[index];

        if (!dataPoint) return null;

        // Only show labels for selected KPIs
        if (!labelSettings.selectedKpis.includes(dataKey as any)) return null;

        const kpiData = kpiMaxMin.get(dataKey);
        if (!kpiData) return null;

        const isMax = labelSettings.showMaxPoint && value === kpiData.max && kpiData.max !== null;
        const isMin = labelSettings.showMinPoint && value === kpiData.min && kpiData.min !== null;
        const showLabel = labelSettings.showAllLabels || isMax || isMin;

        if (!showLabel) return null;

        return (
            <text
                x={x}
                y={y - 10}
                fill={isMax ? '#10B981' : isMin ? '#EF4444' : '#6B7280'}
                fontSize={10}
                fontWeight={isMax || isMin ? 'bold' : 'normal'}
                textAnchor="middle"
            >
                {formatCurrencyCompact(value || 0, kpi)}
            </text>
        );
    };

    return (
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 w-full overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-800 tracking-tight flex items-center gap-2 flex-wrap">
                    <span>Tendencia Diaria</span>
                    {dateRange && (
                        <>
                            <span className="text-gray-400 text-sm">•</span>
                            <span className="flex items-center gap-1 text-xs text-gray-500 font-semibold">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(dateRange.startDate).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                                <span>-</span>
                                {new Date(dateRange.endDate).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </>
                    )}
                </h3>
                <div className="flex flex-wrap gap-2">
                    {/* Real Toggle */}
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                        <input
                            type="checkbox"
                            checked={visibleLines.real}
                            onChange={() => toggleLine('real')}
                            className="w-3 h-3 accent-green-500"
                        />
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className={visibleLines.real ? 'text-gray-700' : 'text-gray-400'}>Real</span>
                    </label>

                    {/* Presupuesto Toggle */}
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                        <input
                            type="checkbox"
                            checked={visibleLines.presupuesto}
                            onChange={() => toggleLine('presupuesto')}
                            className="w-3 h-3 accent-blue-500"
                        />
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className={visibleLines.presupuesto ? 'text-gray-700' : 'text-gray-400'}>Presupuesto</span>
                    </label>

                    {/* Año Anterior Toggle */}
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                        <input
                            type="checkbox"
                            checked={visibleLines.anterior}
                            onChange={() => toggleLine('anterior')}
                            className="w-3 h-3 accent-amber-500"
                        />
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className={visibleLines.anterior ? 'text-gray-700' : 'text-gray-400'}>Año Anterior</span>
                    </label>

                    {/* Año Anterior Ajustado Toggle */}
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                        <input
                            type="checkbox"
                            checked={visibleLines.anteriorAjustado}
                            onChange={() => toggleLine('anteriorAjustado')}
                            className="w-3 h-3 accent-pink-500"
                        />
                        <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                        <span className={visibleLines.anteriorAjustado ? 'text-gray-700' : 'text-gray-400'}>Año Anterior Ajust.</span>
                    </label>

                    {/* Label Controls Divider */}
                    <div className="w-px h-8 bg-gray-300"></div>

                    {/* Multi-KPI Selector for Labels */}
                    <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-gray-600">Etiquetar:</span>
                        {[
                            { key: 'Real' as const, label: 'Real' },
                            { key: 'Presupuesto' as const, label: 'Pres.' },
                            { key: 'Año Anterior' as const, label: 'Ant.' },
                            { key: 'Año Anterior Ajustado' as const, label: 'Ajust.' }
                        ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-1 cursor-pointer px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={labelSettings.selectedKpis.includes(key)}
                                    onChange={() => {
                                        setLabelSettings(prev => ({
                                            ...prev,
                                            selectedKpis: prev.selectedKpis.includes(key)
                                                ? prev.selectedKpis.filter(k => k !== key)
                                                : [...prev.selectedKpis, key]
                                        }));
                                    }}
                                    className="w-3 h-3"
                                />
                                <span className="text-xs text-gray-600">{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                        <defs>
                            <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorAnteriorAjustado" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#9CA3AF', fontSize: 9 }}
                            dy={10}
                            angle={-45}
                            textAnchor="end"
                            interval={0}
                            height={70}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#9CA3AF', fontSize: 11 }}
                            tickFormatter={(value: number) => formatCurrencyCompact(value, kpi)}
                        />
                        <Tooltip content={<CustomTooltip />} />

                        {/* Conditionally render lines based on visibility */}
                        {visibleLines.anteriorAjustado && (
                            <Area
                                type="monotone"
                                dataKey="Año Anterior Ajustado"
                                stroke="#EC4899"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorAnteriorAjustado)"
                            >
                                <LabelList
                                    dataKey="Año Anterior Ajustado"
                                    content={(props: any) => {
                                        const { x, y, value, index } = props;
                                        const dataKey = 'Año Anterior Ajustado';

                                        if (!value || !chartData[index] || !labelSettings.selectedKpis.includes(dataKey as any)) return null;
                                        const kpiData = kpiMaxMin.get(dataKey);
                                        if (!kpiData) return null;
                                        const isMax = value === kpiData.max && kpiData.max !== null;
                                        const isMin = value === kpiData.min && kpiData.min !== null;
                                        return <text x={x} y={y - 10} fill={isMax ? '#10B981' : isMin ? '#EF4444' : '#6B7280'} fontSize="10" fontWeight={isMax || isMin ? 'bold' : 'normal'} textAnchor="middle">{formatCurrencyCompact(value, kpi)}</text>;
                                    }}
                                />
                            </Area>
                        )}
                        {visibleLines.anterior && (
                            <Area
                                type="monotone"
                                dataKey="Año Anterior"
                                stroke="#F59E0B"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorAnterior)"
                            >
                                <LabelList
                                    dataKey="Año Anterior"
                                    content={(props: any) => {
                                        const { x, y, value, index } = props;
                                        const dataKey = 'Año Anterior';
                                        if (!value || !chartData[index] || !labelSettings.selectedKpis.includes(dataKey as any)) return null;
                                        const kpiData = kpiMaxMin.get(dataKey);
                                        if (!kpiData) return null;
                                        const isMax = value === kpiData.max && kpiData.max !== null;
                                        const isMin = value === kpiData.min && kpiData.min !== null;
                                        return <text x={x} y={y - 10} fill={isMax ? '#10B981' : isMin ? '#EF4444' : '#6B7280'} fontSize="10" fontWeight={isMax || isMin ? 'bold' : 'normal'} textAnchor="middle">{formatCurrencyCompact(value, kpi)}</text>;
                                    }}
                                />
                            </Area>
                        )}
                        {visibleLines.presupuesto && (
                            <Area
                                type="monotone"
                                dataKey="Presupuesto"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorBudget)"
                            >
                                <LabelList
                                    dataKey="Presupuesto"
                                    content={(props: any) => {
                                        const { x, y, value, index } = props;
                                        const dataKey = 'Presupuesto';
                                        if (!value || !chartData[index] || !labelSettings.selectedKpis.includes(dataKey as any)) return null;
                                        const kpiData = kpiMaxMin.get(dataKey);
                                        if (!kpiData) return null;
                                        const isMax = value === kpiData.max && kpiData.max !== null;
                                        const isMin = value === kpiData.min && kpiData.min !== null;
                                        return <text x={x} y={y - 10} fill={isMax ? '#10B981' : isMin ? '#EF4444' : '#6B7280'} fontSize="10" fontWeight={isMax || isMin ? 'bold' : 'normal'} textAnchor="middle">{formatCurrencyCompact(value, kpi)}</text>;
                                    }}
                                />
                            </Area>
                        )}
                        {visibleLines.real && (
                            <Area
                                type="monotone"
                                dataKey="Real"
                                stroke="#10B981"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorReal)"
                            >
                                <LabelList
                                    dataKey="Real"
                                    content={(props: any) => {
                                        const { x, y, value, index } = props;
                                        const dataKey = 'Real';
                                        if (!value || !chartData[index] || !labelSettings.selectedKpis.includes(dataKey as any)) return null;
                                        const kpiData = kpiMaxMin.get(dataKey);
                                        if (!kpiData) return null;
                                        const isMax = value === kpiData.max && kpiData.max !== null;
                                        const isMin = value === kpiData.min && kpiData.min !== null;
                                        return <text x={x} y={y - 10} fill={isMax ? '#10B981' : isMin ? '#EF4444' : '#6B7280'} fontSize="10" fontWeight={isMax || isMin ? 'bold' : 'normal'} textAnchor="middle">{formatCurrencyCompact(value, kpi)}</text>;
                                    }}
                                />
                            </Area>
                        )}

                        {/* Event Reference Lines */}
                        {verEventos && Object.entries(eventsByDate).map(([dateStr, evs]) => {
                            // Match date to chart data point name key
                            const [y, m, d] = dateStr.split('-').map(Number);
                            const date = new Date(y, m - 1, d);
                            const dayLetter = ['D', 'L', 'K', 'M', 'J', 'V', 'S'][date.getDay()];
                            const dd = String(d).padStart(2, '0');
                            const mm = String(m).padStart(2, '0');
                            const yy = String(y).slice(-2);
                            const xKey = `${dayLetter}_${dd}/${mm}/${yy}`;
                            const hasFeriado = evs.some(e => e.esFeriado);
                            const label = evs.map(e => e.evento).join(', ');
                            return (
                                <ReferenceLine
                                    key={dateStr}
                                    x={xKey}
                                    stroke={hasFeriado ? '#EF4444' : '#F59E0B'}
                                    strokeWidth={2}
                                    strokeDasharray="4 2"
                                    label={{ value: '📅', position: 'top', fontSize: 10 }}
                                    isFront
                                />
                            );
                        })}

                        {/* Adjustment Event Reference Lines (red) */}
                        {verEventosAjuste && Object.entries(eventosAjusteByDate).map(([dateStr, evs]) => {
                            const [y, m, d] = dateStr.split('-').map(Number);
                            const date = new Date(y, m - 1, d);
                            const dayLetter = ['D', 'L', 'K', 'M', 'J', 'V', 'S'][date.getDay()];
                            const dd = String(d).padStart(2, '0');
                            const mm = String(m).padStart(2, '0');
                            const yy = String(y).slice(-2);
                            const xKey = `${dayLetter}_${dd}/${mm}/${yy}`;
                            return (
                                <ReferenceLine
                                    key={`aj-${dateStr}`}
                                    x={xKey}
                                    stroke="#DC2626"
                                    strokeWidth={2}
                                    strokeDasharray="4 2"
                                    label={{ value: '🔴', position: 'top', fontSize: 10 }}
                                    isFront
                                />
                            );
                        })}

                        {/* Año Anterior Event Reference Lines (purple) */}
                        {verEventosAA && Object.entries(eventosAAByDate).map(([dateStr, evs]) => {
                            const [y, m, d] = dateStr.split('-').map(Number);
                            const date = new Date(y, m - 1, d);
                            const dayLetter = ['D', 'L', 'K', 'M', 'J', 'V', 'S'][date.getDay()];
                            const dd = String(d).padStart(2, '0');
                            const mm = String(m).padStart(2, '0');
                            const yy = String(y).slice(-2);
                            const xKey = `${dayLetter}_${dd}/${mm}/${yy}`;
                            return (
                                <ReferenceLine
                                    key={`aa-${dateStr}`}
                                    x={xKey}
                                    stroke="#8B5CF6"
                                    strokeWidth={2}
                                    strokeDasharray="4 2"
                                    label={{ value: '🟣', position: 'top', fontSize: 10 }}
                                    isFront
                                />
                            );
                        })}

                        {/* Interactive brush for date range selection */}
                        <Brush
                            dataKey="name"
                            height={30}
                            stroke="#6366F1"
                            fill="#E0E7FF"
                            travellerWidth={10}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
