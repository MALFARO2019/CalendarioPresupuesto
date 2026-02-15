import React, { useMemo, useState } from 'react';
import type { BudgetRecord } from '../mockData';
import { formatCurrencyCompact, formatCurrency } from '../utils/formatters';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnnualCalendarProps {
    data: BudgetRecord[];
    year: number;
    comparisonType: string;
    kpi: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
}

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

interface MonthAgg {
    month: number;
    monthName: string;
    monthShort: string;
    presupuesto: number;
    presupuestoAcumulado: number;
    presupuestoAcumuladoConDatos: number;
    real: number;
    realAcumulado: number;
    anterior: number;
    anteriorAcumulado: number;
    anteriorAjustado: number;
    anteriorAjustadoAcumulado: number;
    alcanceAcumulado: number;
    hasData: boolean;
}

export const AnnualCalendar: React.FC<AnnualCalendarProps> = ({
    data, year, kpi
}) => {
    const [visibleBars, setVisibleBars] = useState({
        presupuesto: true,
        real: true,
        anterior: false,
        anteriorAjustado: false
    });

    const toggleBar = (bar: keyof typeof visibleBars) => {
        setVisibleBars(prev => ({ ...prev, [bar]: !prev[bar] }));
    };

    const monthlyData: MonthAgg[] = useMemo(() => {
        let accPresupuesto = 0;
        let accPresupuestoConDatos = 0;
        let accReal = 0;
        let accAnterior = 0;
        let accAnteriorAjustado = 0;

        return MONTH_NAMES.map((name, i) => {
            const monthNum = i + 1;
            const monthRecords = data.filter(d => d.Mes === monthNum && d.Año === year);
            const hasRealData = monthRecords.some(d => d.MontoReal > 0);

            const presupuesto = monthRecords.reduce((sum, d) => sum + d.Monto, 0);
            const presupuestoConDatos = monthRecords.filter(d => d.MontoReal > 0).reduce((sum, d) => sum + d.Monto, 0);
            const real = monthRecords.reduce((sum, d) => sum + d.MontoReal, 0);
            const anterior = monthRecords.reduce((sum, d) => sum + (d.MontoAnterior || 0), 0);
            const anteriorAjustado = monthRecords.reduce((sum, d) => sum + (d.MontoAnteriorAjustado || 0), 0);

            accPresupuesto += presupuesto;
            accPresupuestoConDatos += presupuestoConDatos;
            accReal += real;
            accAnterior += anterior;
            accAnteriorAjustado += anteriorAjustado;

            const alcanceAcumulado = accPresupuestoConDatos > 0 ? (accReal / accPresupuestoConDatos) * 100 : 0;

            return {
                month: monthNum,
                monthName: name,
                monthShort: MONTH_SHORT[i],
                presupuesto,
                presupuestoAcumulado: accPresupuesto,
                presupuestoAcumuladoConDatos: accPresupuestoConDatos,
                real,
                realAcumulado: accReal,
                anterior,
                anteriorAcumulado: accAnterior,
                anteriorAjustado,
                anteriorAjustadoAcumulado: accAnteriorAjustado,
                alcanceAcumulado,
                hasData: hasRealData,
            };
        });
    }, [data, year]);

    const getAlcanceColor = (pct: number, hasData: boolean) => {
        if (!hasData) return 'bg-gray-100 text-gray-400';
        if (pct >= 100) return 'bg-green-500 text-white';
        if (pct >= 90) return 'bg-orange-400 text-white';
        return 'bg-red-500 text-white';
    };

    const getAlcanceBorder = (pct: number, hasData: boolean) => {
        if (!hasData) return 'border-gray-200';
        if (pct >= 100) return 'border-green-300';
        if (pct >= 90) return 'border-orange-300';
        return 'border-red-300';
    };

    const annualTotals = useMemo(() => {
        const last = monthlyData.find(m => m.hasData && m.month === Math.max(...monthlyData.filter(x => x.hasData).map(x => x.month)));
        const fullYearPresupuesto = monthlyData.reduce((sum, m) => sum + m.presupuesto, 0);
        return {
            presupuestoAnual: fullYearPresupuesto,
            presupuestoAcumulado: last?.presupuestoAcumuladoConDatos || 0,
            real: last?.realAcumulado || 0,
            anterior: last?.anteriorAcumulado || 0,
            anteriorAjustado: last?.anteriorAjustadoAcumulado || 0,
            alcance: last?.alcanceAcumulado || 0,
            hasData: !!last,
        };
    }, [monthlyData]);

    // Chart data
    const chartData = useMemo(() => {
        return monthlyData.map(m => ({
            name: m.monthShort,
            Presupuesto: m.presupuesto,
            Real: m.hasData ? m.real : 0,
            'Año Anterior': m.anterior,
            'Año Ant. Ajust.': m.anteriorAjustado,
        }));
    }, [monthlyData]);

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
        <div className="w-full">
            {/* Section header */}
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800">Calendario Anual {year}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                    KPI: <span className="font-semibold text-gray-500">{kpi}</span>
                    {' · '} Alcance % calculado sobre acumulado vs presupuesto acumulado
                </p>
            </div>

            {/* 12-month grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {monthlyData.map((m) => (
                    <div
                        key={m.month}
                        className={`rounded-2xl border-2 p-4 bg-white transition-all hover:shadow-lg ${getAlcanceBorder(m.alcanceAcumulado, m.hasData)}`}
                    >
                        {/* Month header */}
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-700">{m.monthName}</h3>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getAlcanceColor(m.alcanceAcumulado, m.hasData)}`}>
                                {m.hasData ? `${m.alcanceAcumulado.toFixed(1)}%` : '—'}
                            </span>
                        </div>

                        {/* Data rows */}
                        <div className="space-y-1.5">
                            <Row label="Presup." value={formatCurrencyCompact(m.presupuesto, kpi)} color="text-gray-500" />
                            <Row label="P. Acum." value={formatCurrencyCompact(m.presupuestoAcumulado, kpi)} color="text-indigo-600" bold />
                            <Row label="Real" value={m.hasData ? formatCurrencyCompact(m.real, kpi) : '—'} color={m.hasData ? 'text-gray-800' : 'text-gray-400'} bold />
                            <Row label="Año Ant." value={formatCurrencyCompact(m.anterior, kpi)} color="text-orange-500" />
                            <Row label="Ant. Ajust." value={formatCurrencyCompact(m.anteriorAjustado, kpi)} color="text-amber-500" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Annual total bar */}
            <div className="mt-6 bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-700">Alcance {year}</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getAlcanceColor(annualTotals.alcance, annualTotals.hasData)}`}>
                            {annualTotals.hasData ? `${annualTotals.alcance.toFixed(1)}%` : '—'}
                        </span>
                    </div>
                    <div className="flex gap-6">
                        <TotalCell label="Presupuesto" value={formatCurrency(annualTotals.presupuestoAnual, kpi)} />
                        <TotalCell label="P. Acumulado" value={formatCurrency(annualTotals.presupuestoAcumulado, kpi)} bold />
                        <TotalCell label="Real" value={formatCurrency(annualTotals.real, kpi)} bold />
                        <TotalCell label="Año Anterior" value={formatCurrency(annualTotals.anterior, kpi)} />
                        <TotalCell label="Ant. Ajustado" value={formatCurrency(annualTotals.anteriorAjustado, kpi)} />
                    </div>
                </div>
            </div>

            {/* Monthly comparison chart */}
            <div className="mt-8 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">Comparativo Mensual</h3>
                    <div className="flex flex-wrap gap-2">
                        <ToggleBtn label="Presupuesto" color="bg-blue-500" checked={visibleBars.presupuesto} onChange={() => toggleBar('presupuesto')} />
                        <ToggleBtn label="Real" color="bg-green-500" checked={visibleBars.real} onChange={() => toggleBar('real')} />
                        <ToggleBtn label="Año Anterior" color="bg-orange-400" checked={visibleBars.anterior} onChange={() => toggleBar('anterior')} />
                        <ToggleBtn label="Ant. Ajustado" color="bg-indigo-500" checked={visibleBars.anteriorAjustado} onChange={() => toggleBar('anteriorAjustado')} />
                    </div>
                </div>

                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                            <defs>
                                <linearGradient id="colorPresup" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRealAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorAntAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FB923C" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FB923C" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorAntAjAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                                tickFormatter={(value: number) => formatCurrencyCompact(value, kpi)}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {visibleBars.anteriorAjustado && (
                                <Area type="monotone" dataKey="Año Ant. Ajust." stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorAntAjAnual)" />
                            )}
                            {visibleBars.anterior && (
                                <Area type="monotone" dataKey="Año Anterior" stroke="#FB923C" strokeWidth={2} fillOpacity={1} fill="url(#colorAntAnual)" />
                            )}
                            {visibleBars.presupuesto && (
                                <Area type="monotone" dataKey="Presupuesto" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorPresup)" />
                            )}
                            {visibleBars.real && (
                                <Area type="monotone" dataKey="Real" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorRealAnual)" />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

// Helper components
function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
            <span className={`text-sm font-mono ${color} ${bold ? 'font-bold' : 'font-semibold'}`}>{value}</span>
        </div>
    );
}

function TotalCell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase">{label}</p>
            <p className={`text-sm font-mono ${bold ? 'font-bold text-gray-800' : 'font-semibold text-gray-600'}`}>{value}</p>
        </div>
    );
}

function ToggleBtn({ label, color, checked, onChange }: { label: string; color: string; checked: boolean; onChange: () => void }) {
    return (
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
            <input type="checkbox" checked={checked} onChange={onChange} className="w-3 h-3" />
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className={checked ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
        </label>
    );
}
