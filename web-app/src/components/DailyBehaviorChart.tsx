import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatCurrencyCompact } from '../utils/formatters';

interface DailyBehaviorChartProps {
    data: any[];
    kpi: string;
}

const DAY_LETTERS = ['D', 'L', 'K', 'M', 'J', 'V', 'S'];

export const DailyBehaviorChart: React.FC<DailyBehaviorChartProps> = ({ data, kpi }) => {
    // State for controlling which lines are visible
    const [visibleLines, setVisibleLines] = useState({
        real: true,
        presupuesto: true,
        anterior: false,
        anteriorAjustado: false
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
            };
        });

    // Custom Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl">
                    <p className="font-bold text-gray-700 mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-xs font-medium">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                            <span className="text-gray-500">{entry.name}:</span>
                            <span className="text-gray-900 font-mono">{formatCurrency(entry.value, kpi)}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 w-full overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-800 tracking-tight">Tendencia Diaria</h3>
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
                </div>
            </div>

            <div className="h-[350px] w-full">
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
                            />
                        )}
                        {visibleLines.anterior && (
                            <Area
                                type="monotone"
                                dataKey="Año Anterior"
                                stroke="#F59E0B"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorAnterior)"
                            />
                        )}
                        {visibleLines.presupuesto && (
                            <Area
                                type="monotone"
                                dataKey="Presupuesto"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorBudget)"
                            />
                        )}
                        {visibleLines.real && (
                            <Area
                                type="monotone"
                                dataKey="Real"
                                stroke="#10B981"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorReal)"
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
