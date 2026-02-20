import React, { useState, useEffect } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { GroupingSelector, type GroupByType } from './GroupingSelector';
import { DynamicGrid } from './DynamicGrid';
import { InteractiveBrushChart } from './InteractiveBrushChart';
import { getToken, API_BASE, type EventosByDate } from '../api';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useFormatCurrency } from '../utils/formatters';

interface RangosViewProps {
    year: number;
    filterLocal: string;
    filterCanal: string;
    filterKpi: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    verEventos?: boolean;
    onVerEventosChange?: (v: boolean) => void;
    eventosByYear?: EventosByDate;
}

interface PeriodData {
    periodo: string;
    periodoInicio: string;
    periodoFin: string;
    presupuesto: number;
    presupuestoConDatos: number;
    real: number;
    anterior: number;
    anteriorAjustado: number;
    pctAlcance: number;
    pctAnterior: number;
    pctAnteriorAjustado: number;
}

interface KpiSummary {
    totalPresupuesto: number;
    totalPresupuestoAcum: number;
    totalReal: number;
    totalAnterior: number;
    pctPresupuesto: number;
    pctAnterior: number;
}

interface CanalData {
    canal: string;
    real: number;
    presupuesto: number;
    anterior: number;
    pctPresupuesto: number;
    pctCrecimiento: number;
    contribucion: number;
}

interface RangosResponse {
    periods: PeriodData[];
    totals: {
        presupuesto: number;
        presupuestoConDatos: number;
        real: number;
        anterior: number;
        anteriorAjustado: number;
        pctAlcance: number;
        pctAnterior: number;
        pctAnteriorAjustado: number;
    };
    resumenMultiKpi?: {
        Ventas: KpiSummary;
        Transacciones: KpiSummary;
        TQP: KpiSummary;
    };
    parameters: {
        startDate: string;
        endDate: string;
        groupBy: string;
        kpi: string;
        canal: string;
        local: string;
        yearType: string;
    };
}

interface CanalResponse {
    canales: CanalData[];
    totals: CanalData;
}

export function RangosView({ year, filterLocal, filterCanal, filterKpi, yearType, verEventos = false, onVerEventosChange, eventosByYear = {} }: RangosViewProps) {
    const formatCurrency = useFormatCurrency();

    // Initialize with current month as default
    const now = new Date();
    const monthStart = new Date(year, now.getMonth(), 1);
    const monthEnd = new Date(year, now.getMonth() + 1, 0);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(formatDate(monthStart));
    const [endDate, setEndDate] = useState(formatDate(monthEnd));
    const [groupBy, setGroupBy] = useState<GroupByType>('day');
    const [data, setData] = useState<RangosResponse | null>(null);
    const [canalData, setCanalData] = useState<CanalResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'evaluacion' | 'canal' | 'top5'>('evaluacion');

    const fetchData = async () => {
        if (!filterLocal) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const yearTypeParam = yearType === 'Año Anterior Ajustado' ? 'ajustado' : 'anterior';
            const url = `${API_BASE}/rangos?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}&kpi=${filterKpi}&canal=${filterCanal}&local=${filterLocal}&yearType=${yearTypeParam}`;

            console.log('🔵 Fetching rangos data:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Rangos data loaded:', result);
            setData(result);
        } catch (err: any) {
            console.error('❌ Error fetching rangos data:', err);
            setError(err.message || 'Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    const fetchCanalData = async () => {
        if (!filterLocal) return;

        try {
            const yearTypeParam = yearType === 'Año Anterior Ajustado' ? 'ajustado' : 'anterior';
            const url = `${API_BASE}/rangos/resumen-canal?startDate=${startDate}&endDate=${endDate}&kpi=${filterKpi}&local=${filterLocal}&yearType=${yearTypeParam}`;

            console.log('🔵 Fetching canal data:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Canal data loaded:', result);
            setCanalData(result);
        } catch (err: any) {
            console.error('❌ Error fetching canal data:', err);
        }
    };

    // Fetch data when filters change
    useEffect(() => {
        fetchData();
        if (activeTab === 'canal') {
            fetchCanalData();
        }
    }, [startDate, endDate, groupBy, filterLocal, filterCanal, filterKpi, yearType]);

    // Fetch canal data when switching to canal tab
    useEffect(() => {
        if (activeTab === 'canal' && !canalData) {
            fetchCanalData();
        }
    }, [activeTab]);

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
    };

    const handleBrushChange = (startIndex: number, endIndex: number) => {
        if (data && data.periods.length > 0) {
            const selectedStart = data.periods[startIndex].periodoInicio;
            const selectedEnd = data.periods[endIndex].periodoFin;
            setStartDate(selectedStart);
            setEndDate(selectedEnd);
        }
    };

    const formatPct = (value: number) => {
        return `${(value * 100).toFixed(1)}%`;
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="ml-3 text-gray-500 font-medium">Cargando datos...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                <p className="text-red-700 font-semibold">❌ Error al cargar datos</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
                <button
                    onClick={fetchData}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (!filterLocal) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                <p className="text-yellow-800 font-semibold">⚠️ Selecciona un local</p>
                <p className="text-yellow-700 text-sm mt-1">
                    Para visualizar datos de rangos, primero selecciona un local en los filtros superiores.
                </p>
            </div>
        );
    }

    // Get top 5 best and worst periods
    const getTop5 = () => {
        if (!data || !data.periods) return { best: [], worst: [] };

        const sorted = [...data.periods].sort((a, b) => b.pctAlcance - a.pctAlcance);
        return {
            best: sorted.slice(0, 5),
            worst: sorted.slice(-5).reverse()
        };
    };

    const top5 = getTop5();

    return (
        <div className="space-y-6">
            {/* Date Range Picker + Events Toggle */}
            <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        year={year}
                    />
                </div>
                {onVerEventosChange && (
                    <button
                        onClick={() => onVerEventosChange(!verEventos)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border self-center mt-1 ${verEventos
                            ? 'bg-amber-100 text-amber-700 border-amber-300'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                            }`}
                    >
                        <span>{verEventos ? '📅' : '🗓️'}</span>
                        Eventos
                    </button>
                )}
            </div>

            {/* Grouping Selector */}
            <GroupingSelector
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                startDate={startDate}
                endDate={endDate}
            />

            {loading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    <span className="ml-2 text-gray-500 text-sm">Actualizando datos...</span>
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Interactive Chart with Brush */}
                    <InteractiveBrushChart
                        periods={data.periods}
                        kpi={filterKpi}
                        onBrushChange={handleBrushChange}
                        verEventos={verEventos}
                        eventosByYear={eventosByYear}
                    />

                    {/* Multi-KPI Summary Cards */}
                    {data.resumenMultiKpi && (
                        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 rounded-2xl p-4 shadow-lg border border-indigo-100">

                            {/* Ventas */}
                            {data.resumenMultiKpi.Ventas && (
                                <div className="mb-3">
                                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Ventas</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Presupuesto</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Ventas.totalPresupuesto, 'Ventas')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">P. Acumulado</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Ventas.totalPresupuestoAcum, 'Ventas')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Real</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Ventas.totalReal, 'Ventas')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ppto</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.Ventas.pctPresupuesto >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.Ventas.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.Ventas.pctPresupuesto)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Año Anterior</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Ventas.totalAnterior, 'Ventas')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ant.</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.Ventas.pctAnterior >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.Ventas.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.Ventas.pctAnterior)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Transacciones */}
                            {data.resumenMultiKpi.Transacciones && (
                                <div className="mt-3 pt-3 border-t border-indigo-200/50">
                                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Transacciones</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Presupuesto</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Transacciones.totalPresupuesto, 'Transacciones')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">P. Acumulado</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Transacciones.totalPresupuestoAcum, 'Transacciones')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Real</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Transacciones.totalReal, 'Transacciones')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ppto</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.Transacciones.pctPresupuesto >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.Transacciones.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.Transacciones.pctPresupuesto)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Año Anterior</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.Transacciones.totalAnterior, 'Transacciones')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ant.</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.Transacciones.pctAnterior >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.Transacciones.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.Transacciones.pctAnterior)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TQP */}
                            {data.resumenMultiKpi.TQP && (
                                <div className="mt-3 pt-3 border-t border-indigo-200/50">
                                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Tiquete Promedio</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Presupuesto</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.TQP.totalPresupuesto, 'TQP')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">P. Acumulado</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.TQP.totalPresupuestoAcum, 'TQP')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Real</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.TQP.totalReal, 'TQP')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ppto</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.TQP.pctPresupuesto >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.TQP.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.TQP.pctPresupuesto)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Año Anterior</p>
                                            <p className="text-sm font-bold text-gray-900 font-mono">{formatCurrency(data.resumenMultiKpi.TQP.totalAnterior, 'TQP')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ant.</p>
                                            <p className={`text-lg font-extrabold ${data.resumenMultiKpi.TQP.pctAnterior >= 1.0 ? 'text-green-600' : data.resumenMultiKpi.TQP.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(data.resumenMultiKpi.TQP.pctAnterior)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs Navigation */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex border-b border-gray-200">
                            <button
                                onClick={() => setActiveTab('evaluacion')}
                                className={`flex-1 px-4 py-3 text-sm font-semibold transition-all ${activeTab === 'evaluacion'
                                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                📋 Evaluación
                            </button>
                            <button
                                onClick={() => setActiveTab('canal')}
                                className={`flex-1 px-4 py-3 text-sm font-semibold transition-all ${activeTab === 'canal'
                                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                📊 Resumen Canal
                            </button>
                            <button
                                onClick={() => setActiveTab('top5')}
                                className={`flex-1 px-4 py-3 text-sm font-semibold transition-all ${activeTab === 'top5'
                                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                🏆 Top 5
                            </button>
                        </div>

                        <div className="p-4">
                            {/* Evaluación Tab */}
                            {activeTab === 'evaluacion' && (
                                <DynamicGrid
                                    periods={data.periods}
                                    totals={data.totals}
                                    kpi={filterKpi}
                                    groupBy={groupBy}
                                />
                            )}

                            {/* Canal Tab */}
                            {activeTab === 'canal' && (
                                <div className="overflow-x-auto">
                                    {!canalData ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                            <span className="ml-2 text-gray-500 text-sm">Cargando resumen de canales...</span>
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Canal</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Real</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Presupuesto</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">% Ppto</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">% Crec</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Contrib.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {canalData.canales.map((canal, idx) => (
                                                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                        <td className="px-3 py-2 font-medium text-gray-800">{canal.canal}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">
                                                            {formatCurrency(canal.real, filterKpi)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">{formatCurrency(canal.presupuesto, filterKpi)}</td>
                                                        <td className={`px-3 py-2 text-right font-bold ${canal.pctPresupuesto >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {formatPct(canal.pctPresupuesto)}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right font-bold ${canal.pctCrecimiento >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {formatPct(canal.pctCrecimiento)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">{formatPct(canal.contribucion)}</td>
                                                    </tr>
                                                ))}
                                                {/* Totals Row */}
                                                <tr className="bg-indigo-50 font-bold">
                                                    <td className="px-3 py-2 text-gray-800">TOTAL</td>
                                                    <td className="px-3 py-2 text-right text-indigo-700">
                                                        {formatCurrency(canalData.totals.real, filterKpi)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{formatCurrency(canalData.totals.presupuesto, filterKpi)}</td>
                                                    <td className={`px-3 py-2 text-right ${canalData.totals.pctPresupuesto >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatPct(canalData.totals.pctPresupuesto)}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right ${canalData.totals.pctCrecimiento >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatPct(canalData.totals.pctCrecimiento)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{formatPct(canalData.totals.contribucion)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* Top 5 Tab */}
                            {activeTab === 'top5' && (
                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Top 5 Best */}
                                        <div>
                                            <h4 className="text-md font-bold text-green-700 mb-3 flex items-center gap-2">
                                                <TrendingUp className="w-5 h-5" />
                                                Top 5 Mejores
                                            </h4>
                                            <div className="space-y-2">
                                                {top5.best.map((period, idx) => (
                                                    <div key={idx} className="bg-green-50 rounded-lg p-3 border border-green-200">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-semibold text-gray-800">#{idx + 1} {period.periodo}</span>
                                                            <span className="font-bold text-green-700">{formatPct(period.pctAlcance)}</span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            Real: {formatCurrency(period.real, filterKpi)} / Ppto: {formatCurrency(period.presupuesto, filterKpi)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Top 5 Worst */}
                                        <div>
                                            <h4 className="text-md font-bold text-red-700 mb-3 flex items-center gap-2">
                                                <TrendingDown className="w-5 h-5" />
                                                Top 5 Peores
                                            </h4>
                                            <div className="space-y-2">
                                                {top5.worst.map((period, idx) => (
                                                    <div key={idx} className="bg-red-50 rounded-lg p-3 border border-red-200">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-semibold text-gray-800">#{idx + 1} {period.periodo}</span>
                                                            <span className="font-bold text-red-700">{formatPct(period.pctAlcance)}</span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            Real: {formatCurrency(period.real, filterKpi)} / Ppto: {formatCurrency(period.presupuesto, filterKpi)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rankings adicionales */}
                                    <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                                        {/* Ranking por Real */}
                                        <div>
                                            <h4 className="text-md font-bold text-blue-700 mb-3">📊 Ranking por Ventas Real</h4>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-blue-200">
                                                        <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">#</th>
                                                        <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Período</th>
                                                        <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Real</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(data?.periods || []).sort((a, b) => b.real - a.real).slice(0, 10).map((period, idx) => (
                                                        <tr key={idx} className="border-b border-blue-50 hover:bg-blue-50">
                                                            <td className="py-2 px-2 text-xs font-bold text-blue-600">#{idx + 1}</td>
                                                            <td className="py-2 px-2 text-sm font-medium text-gray-800">{period.periodo}</td>
                                                            <td className="py-2 px-2 text-sm text-right font-mono font-semibold text-gray-900">{formatCurrency(period.real, filterKpi)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Ranking por % Año Anterior */}
                                        <div>
                                            <h4 className="text-md font-bold text-purple-700 mb-3">📈 Ranking por % Año Anterior</h4>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-purple-200">
                                                        <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">#</th>
                                                        <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Período</th>
                                                        <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">% Ant.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(data?.periods || []).sort((a, b) => b.pctAnterior - a.pctAnterior).slice(0, 10).map((period, idx) => (
                                                        <tr key={idx} className="border-b border-purple-50 hover:bg-purple-50">
                                                            <td className="py-2 px-2 text-xs font-bold text-purple-600">#{idx + 1}</td>
                                                            <td className="py-2 px-2 text-sm font-medium text-gray-800">{period.periodo}</td>
                                                            <td className="py-2 px-2 text-right">
                                                                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${period.pctAnterior >= 1 ? 'bg-green-100 text-green-800' : period.pctAnterior >= 0.9 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                                    {formatPct(period.pctAnterior)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
