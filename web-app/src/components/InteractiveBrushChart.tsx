import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Legend, LabelList, ReferenceLine } from 'recharts';
import { formatCurrencyCompact } from '../utils/formatters';
import type { EventosByDate } from '../api';

interface PeriodData {
    periodo: string;
    periodoInicio: string;
    periodoFin: string;
    presupuesto: number;
    presupuestoConDatos: number;
    real: number;
    anterior: number;
    anteriorAjustado: number;
    anteriorFull?: number;
    anteriorAjustadoFull?: number;
    pctAlcance: number;
    pctAnterior: number;
    pctAnteriorAjustado: number;
}

interface InteractiveBrushChartProps {
    periods: PeriodData[];
    kpi: string;
    onBrushChange?: (startIndex: number, endIndex: number) => void;
    verEventos?: boolean;
    onVerEventosChange?: (v: boolean) => void;
    eventosByYear?: EventosByDate;
    verEventosAjuste?: boolean;
    onVerEventosAjusteChange?: (v: boolean) => void;
    eventosAjusteByDate?: EventosByDate;
    verEventosAA?: boolean;
    onVerEventosAAChange?: (v: boolean) => void;
    eventosAAByDate?: EventosByDate;
    onOpenListadoEventos?: () => void;
}

export function InteractiveBrushChart({ periods, kpi, onBrushChange, verEventos = false, onVerEventosChange, eventosByYear = {}, verEventosAjuste = false, onVerEventosAjusteChange, eventosAjusteByDate = {}, verEventosAA = false, onVerEventosAAChange, eventosAAByDate = {}, onOpenListadoEventos }: InteractiveBrushChartProps) {
    // Series visibility state
    const [showReal, setShowReal] = useState(true);
    const [showPresupuesto, setShowPresupuesto] = useState(true);
    const [showAnterior, setShowAnterior] = useState(true);
    const [showAnteriorAjust, setShowAnteriorAjust] = useState(false);

    // Label visibility state
    const [showRealLabel, setShowRealLabel] = useState(false);
    const [showPresLabel, setShowPresLabel] = useState(false);
    const [showAntLabel, setShowAntLabel] = useState(false);
    const [showAntAjustLabel, setShowAntAjustLabel] = useState(false);

    if (!periods || periods.length === 0) {
        return null;
    }

    // Helper to normalize dates from SQL (2026-02-02T00:00:00.000Z) to YYYY-MM-DD
    const toDateStr = (d: string) => d ? d.split('T')[0] : d;

    // Prepare data for chart
    const chartData = periods.map(p => ({
        name: p.periodo,
        Real: p.real,
        Presupuesto: p.presupuesto,
        Anterior: p.anteriorFull ?? p.anterior,
        AnteriorAjustado: p.anteriorAjustadoFull ?? p.anteriorAjustado,
        periodoInicio: toDateStr(p.periodoInicio),
        periodoFin: toDateStr(p.periodoFin)
    }));

    const handleBrushChange = (brushData: any) => {
        if (brushData && brushData.startIndex !== undefined && brushData.endIndex !== undefined) {
            if (onBrushChange) {
                onBrushChange(brushData.startIndex, brushData.endIndex);
            }
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || payload.length === 0) return null;

        // Get values from payload
        const real = payload.find((p: any) => p.dataKey === 'Real')?.value || 0;
        const presupuesto = payload.find((p: any) => p.dataKey === 'Presupuesto')?.value || 0;
        const anteriorAjustado = payload.find((p: any) => p.dataKey === 'AnteriorAjustado')?.value || 0;

        // Calculate differences
        const difPpto = real - presupuesto;
        const difPptoPct = presupuesto > 0 ? (difPpto / presupuesto) * 100 : 0;

        const difAjust = real - anteriorAjustado;
        const difAjustPct = anteriorAjustado > 0 ? (difAjust / anteriorAjustado) * 100 : 0;

        // Find events for the hovered period
        const periodData = payload[0]?.payload;
        const periodName = periodData?.name;

        // Find regular events in this period
        const regularEventsForPeriod: { evento: string; esFeriado: boolean }[] = [];
        if (verEventos && periodData) {
            const period = periods.find(p => p.periodo === periodName);
            if (period) {
                const pStart = toDateStr(period.periodoInicio);
                const pEnd = toDateStr(period.periodoFin);
                Object.entries(eventosByYear).forEach(([d, evs]) => {
                    if (d >= pStart && d <= pEnd) {
                        evs.forEach(e => regularEventsForPeriod.push({ evento: e.evento, esFeriado: e.esFeriado }));
                    }
                });
            }
        }

        // Find ajuste events
        const ajusteEventsForPeriod: { evento: string }[] = [];
        if (verEventosAjuste && periodData) {
            const period = periods.find(p => p.periodo === periodName);
            if (period) {
                const pStart = toDateStr(period.periodoInicio);
                const pEnd = toDateStr(period.periodoFin);
                Object.entries(eventosAjusteByDate).forEach(([d, evs]) => {
                    if (d >= pStart && d <= pEnd) {
                        evs.forEach(e => ajusteEventsForPeriod.push({ evento: e.evento }));
                    }
                });
            }
        }

        // Find año anterior events
        const aaEventsForPeriod: { evento: string }[] = [];
        if (verEventosAA && periodData) {
            const period = periods.find(p => p.periodo === periodName);
            if (period) {
                const pStart = toDateStr(period.periodoInicio);
                const pEnd = toDateStr(period.periodoFin);
                Object.entries(eventosAAByDate).forEach(([d, evs]) => {
                    if (d >= pStart && d <= pEnd) {
                        evs.forEach(e => aaEventsForPeriod.push({ evento: e.evento }));
                    }
                });
            }
        }

        return (
            <div className="bg-white border-2 border-gray-200 rounded-lg shadow-xl p-3">
                <p className="font-bold text-gray-800 mb-2 text-sm">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-xs mb-1">
                        <div
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="font-semibold text-gray-700">{entry.name}:</span>
                        <span className="font-bold text-gray-900">
                            {formatCurrencyCompact(entry.value, kpi)}
                        </span>
                    </div>
                ))}
                {/* Show differences */}
                {presupuesto > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                        <div className="text-xs font-semibold text-red-600">
                            Dif. Ppto: {difPpto >= 0 ? '₡' : '₡-'}{formatCurrencyCompact(Math.abs(difPpto), kpi)} ({difPptoPct.toFixed(1)}%)
                        </div>
                    </div>
                )}
                {anteriorAjustado > 0 && showAnteriorAjust && (
                    <div className="text-xs font-semibold text-red-600 mt-1">
                        Dif. Ajust.: {difAjust >= 0 ? '₡' : '₡-'}{formatCurrencyCompact(Math.abs(difAjust), kpi)} ({difAjustPct.toFixed(1)}%)
                    </div>
                )}
                {/* Regular events */}
                {regularEventsForPeriod.length > 0 && (
                    <>
                        <div className="h-px bg-amber-200 my-1.5" />
                        {regularEventsForPeriod.map((ev, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                <div className={`w-2 h-2 rounded-full ${ev.esFeriado ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                                <span className={ev.esFeriado ? 'text-red-700 font-semibold' : 'text-amber-800 font-semibold'}>{ev.evento}</span>
                            </div>
                        ))}
                    </>
                )}
                {/* Ajuste events */}
                {ajusteEventsForPeriod.length > 0 && (
                    <>
                        <div className="h-px bg-red-200 my-1.5" />
                        {ajusteEventsForPeriod.map((aev, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                <div className="w-2 h-2 rounded-full bg-red-600"></div>
                                <span className="text-red-700 font-semibold">{aev.evento}</span>
                            </div>
                        ))}
                    </>
                )}
                {/* Año anterior events */}
                {aaEventsForPeriod.length > 0 && (
                    <>
                        <div className="h-px bg-purple-200 my-1.5" />
                        {aaEventsForPeriod.map((aev, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs font-medium">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span className="text-purple-700 font-semibold">{aev.evento}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-lg font-bold text-gray-800">Tendencia</h3>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Event toggle buttons */}
                    {onVerEventosChange && (
                        <button
                            onClick={() => onVerEventosChange(!verEventos)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventos
                                ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                }`}
                        >
                            <span>{verEventos ? '📅' : '🗓️'}</span>
                            Eventos
                        </button>
                    )}
                    {onVerEventosAAChange && (
                        <button
                            onClick={() => onVerEventosAAChange(!verEventosAA)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventosAA
                                ? 'bg-purple-100 text-purple-700 border-purple-300'
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                }`}
                        >
                            <span>{verEventosAA ? '🟣' : '⚪'}</span>
                            Eventos Año Ant.
                        </button>
                    )}
                    {onVerEventosAjusteChange && (
                        <button
                            onClick={() => onVerEventosAjusteChange(!verEventosAjuste)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventosAjuste
                                ? 'bg-red-100 text-red-700 border-red-300'
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                }`}
                        >
                            <span>{verEventosAjuste ? '🔴' : '⚪'}</span>
                            Eventos Ajuste
                        </button>
                    )}
                    {onOpenListadoEventos && (
                        <button
                            onClick={onOpenListadoEventos}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100 hover:border-indigo-400"
                        >
                            <span>📋</span>
                            Listado Eventos
                        </button>
                    )}
                </div>
            </div>

            {/* Series visibility controls */}
            <div className="mb-4 pb-3 border-b border-gray-200">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
                    {/* Series toggles */}
                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded touch-target">
                        <input
                            type="checkbox"
                            checked={showReal}
                            onChange={(e) => setShowReal(e.target.checked)}
                            className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-300"
                        />
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <span className="font-medium text-gray-700">Real</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded touch-target">
                        <input
                            type="checkbox"
                            checked={showPresupuesto}
                            onChange={(e) => setShowPresupuesto(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-300"
                        />
                        <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                        <span className="font-medium text-gray-700">Presupuesto</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded touch-target">
                        <input
                            type="checkbox"
                            checked={showAnterior}
                            onChange={(e) => setShowAnterior(e.target.checked)}
                            className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-300"
                        />
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="font-medium text-gray-700">Año Anterior</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded touch-target">
                        <input
                            type="checkbox"
                            checked={showAnteriorAjust}
                            onChange={(e) => setShowAnteriorAjust(e.target.checked)}
                            className="w-4 h-4 text-pink-600 rounded focus:ring-2 focus:ring-pink-300"
                        />
                        <span className="w-3 h-3 rounded-full bg-pink-500"></span>
                        <span className="font-medium text-gray-700">Año Anterior Ajust.</span>
                    </label>

                    {/* Label toggles */}
                    <div className="flex items-center gap-2 pl-3 sm:pl-4 border-l border-gray-300">
                        <span className="text-xs font-semibold text-gray-600">Etiquetar:</span>
                        <label className="flex items-center gap-1 cursor-pointer touch-target">
                            <input
                                type="checkbox"
                                checked={showRealLabel}
                                onChange={(e) => setShowRealLabel(e.target.checked)}
                                disabled={!showReal}
                                className="w-3.5 h-3.5 text-green-600 rounded focus:ring-1 focus:ring-green-300 disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-700">Real</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer touch-target">
                            <input
                                type="checkbox"
                                checked={showPresLabel}
                                onChange={(e) => setShowPresLabel(e.target.checked)}
                                disabled={!showPresupuesto}
                                className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-1 focus:ring-indigo-300 disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-700">Pres.</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer touch-target">
                            <input
                                type="checkbox"
                                checked={showAntLabel}
                                onChange={(e) => setShowAntLabel(e.target.checked)}
                                disabled={!showAnterior}
                                className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-1 focus:ring-amber-300 disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-700">Ant.</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer touch-target">
                            <input
                                type="checkbox"
                                checked={showAntAjustLabel}
                                onChange={(e) => setShowAntAjustLabel(e.target.checked)}
                                disabled={!showAnteriorAjust}
                                className="w-3.5 h-3.5 text-pink-600 rounded focus:ring-1 focus:ring-pink-300 disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-700">Ajust.</span>
                        </label>
                    </div>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPpto" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorAnteriorAjust" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        stroke="#d1d5db"
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        stroke="#d1d5db"
                        tickFormatter={(value) => formatCurrencyCompact(value, kpi)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                        iconType="circle"
                    />
                    {showReal && (
                        <Area
                            type="monotone"
                            dataKey="Real"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fill="url(#colorReal)"
                            name="Real"
                        >
                            {showRealLabel && <LabelList dataKey="Real" position="top" formatter={(value: number) => formatCurrencyCompact(value, kpi)} style={{ fontSize: '10px', fill: '#10b981', fontWeight: 'bold' }} />}
                        </Area>
                    )}
                    {showPresupuesto && (
                        <Area
                            type="monotone"
                            dataKey="Presupuesto"
                            stroke="#6366f1"
                            strokeWidth={2}
                            fill="url(#colorPpto)"
                            name="Presupuesto"
                        >
                            {showPresLabel && <LabelList dataKey="Presupuesto" position="top" formatter={(value: number) => formatCurrencyCompact(value, kpi)} style={{ fontSize: '10px', fill: '#6366f1', fontWeight: 'bold' }} />}
                        </Area>
                    )}
                    {showAnterior && (
                        <Area
                            type="monotone"
                            dataKey="Anterior"
                            stroke="#f59e0b"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            fill="url(#colorAnterior)"
                            name="Año Anterior"
                        >
                            {showAntLabel && <LabelList dataKey="Anterior" position="top" formatter={(value: number) => formatCurrencyCompact(value, kpi)} style={{ fontSize: '10px', fill: '#f59e0b', fontWeight: 'bold' }} />}
                        </Area>
                    )}
                    {showAnteriorAjust && (
                        <Area
                            type="monotone"
                            dataKey="AnteriorAjustado"
                            stroke="#ec4899"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            fill="url(#colorAnteriorAjust)"
                            name="Año Anterior Ajust."
                        >
                            {showAntAjustLabel && <LabelList dataKey="AnteriorAjustado" position="top" formatter={(value: number) => formatCurrencyCompact(value, kpi)} style={{ fontSize: '10px', fill: '#ec4899', fontWeight: 'bold' }} />}
                        </Area>
                    )}
                    {/* Event Reference Lines – match dates within displayed period ranges */}
                    {verEventos && Object.entries(eventosByYear).map(([dateStr, evs]) => {
                        const period = periods.find(p => dateStr >= toDateStr(p.periodoInicio) && dateStr <= toDateStr(p.periodoFin));
                        if (!period) return null;
                        const hasFeriado = evs.some(e => e.esFeriado);
                        return (
                            <ReferenceLine
                                key={dateStr}
                                x={period.periodo}
                                stroke={hasFeriado ? '#EF4444' : '#F59E0B'}
                                strokeWidth={2}
                                strokeDasharray="4 2"
                                label={{ value: '📅', position: 'insideTopLeft', fontSize: 10 }}
                                isFront
                            />
                        );
                    })}
                    {/* Ajuste Event Reference Lines (red) */}
                    {verEventosAjuste && Object.entries(eventosAjusteByDate).map(([dateStr, evs]) => {
                        const period = periods.find(p => dateStr >= toDateStr(p.periodoInicio) && dateStr <= toDateStr(p.periodoFin));
                        if (!period) return null;
                        return (
                            <ReferenceLine
                                key={`aj-${dateStr}`}
                                x={period.periodo}
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
                        const period = periods.find(p => dateStr >= toDateStr(p.periodoInicio) && dateStr <= toDateStr(p.periodoFin));
                        if (!period) return null;
                        return (
                            <ReferenceLine
                                key={`aa-${dateStr}`}
                                x={period.periodo}
                                stroke="#8B5CF6"
                                strokeWidth={2}
                                strokeDasharray="4 2"
                                label={{ value: '🟣', position: 'top', fontSize: 10 }}
                                isFront
                            />
                        );
                    })}
                    <Brush
                        dataKey="name"
                        height={30}
                        stroke="#6366f1"
                        fill="#f3f4f6"
                        onChange={handleBrushChange}
                    />
                </AreaChart>
            </ResponsiveContainer>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">
                    💡 <span className="font-semibold">Consejo:</span> Arrastra el control inferior (brush) para ajustar el rango visible de fechas.
                </p>
            </div>
        </div>
    );
}
