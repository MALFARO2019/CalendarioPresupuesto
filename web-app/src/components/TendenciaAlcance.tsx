import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';

interface TendenciaAlcanceProps {
    year: number;
    startDate: string;
    endDate: string;
}

interface EvaluacionRecord {
    codAlmacen: string;
    codAgrupacion: string;
    canal: string;
    real2025: number;
    real2026: number;
    presupuesto2026: number;
    pctVs2025: number;
    pctVsPresupuesto: number;
    daysWithData: number;
}

interface ResumenData {
    totalReal2025: number;
    totalReal2026: number;
    totalPresupuesto2026: number;
    pctVs2025: number;
    pctVsPresupuesto: number;
}

export const TendenciaAlcance: React.FC<TendenciaAlcanceProps> = ({ year, startDate, endDate }) => {
    const [activeTab, setActiveTab] = useState<'evaluacion' | 'resumen' | 'top10'>('evaluacion');
    const [kpi, setKpi] = useState<string>('Ventas');
    const [channel, setChannel] = useState<string>('Total');
    const [data, setData] = useState<{ evaluacion: EvaluacionRecord[], resumen: ResumenData } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [topFilter, setTopFilter] = useState<'all' | 'top5' | 'bottom5'>('all');

    // Fetch data from API
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('auth_token');
                console.log('🔑 Token from localStorage:', token ? 'EXISTS' : 'NULL');

                const url = `/api/tendencia?startDate=${startDate}&endDate=${endDate}&kpi=${kpi}&channel=${channel}`;
                console.log('📡 Fetching:', url);

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                console.log('📊 Response status:', response.status);
                console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

                if (response.status === 401) {
                    // Token is invalid/expired - force logout
                    console.error('🚫 Token invalid - forcing logout');
                    localStorage.clear();
                    window.location.reload();
                    return;
                }

                if (!response.ok) {
                    const text = await response.text();
                    console.error('❌ Error response:', text.substring(0, 200));
                    throw new Error(`Error fetching tendencia data: ${response.status}`);
                }

                const result = await response.json();
                console.log('✅ Data received:', result);
                setData(result);
            } catch (err: any) {
                setError(err.message);
                console.error('Error fetching tendencia data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [startDate, endDate, kpi, channel]);

    // Filter evaluacion data for top/bottom filter
    const filteredEvaluacion = useMemo(() => {
        if (!data?.evaluacion) return [];

        const sorted = [...data.evaluacion].sort((a, b) => b.pctVs2025 - a.pctVs2025);

        if (topFilter === 'top5') {
            return sorted.slice(0, 5);
        } else if (topFilter === 'bottom5') {
            return sorted.slice(-5).reverse();
        }

        return sorted;
    }, [data, topFilter]);

    // Get performance badge color based on threshold
    const getPerformanceBadge = (pct: number) => {
        if (pct >= -0.01) return 'bg-green-100 text-green-800'; // Muy Bien
        if (pct >= -0.05) return 'bg-yellow-100 text-yellow-800'; // Bien
        return 'bg-red-100 text-red-800'; // Mal
    };

    const formatPct = (pct: number) => `${(pct * 100).toFixed(1)}%`;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando tendencias...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
                <span className="text-red-600 text-sm">⚠️ Error: {error}</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with filters */}
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Tendencia Alcance</h1>
                    <div className="text-sm text-gray-500">
                        {startDate} — {endDate}
                    </div>
                </div>

                <div className="flex flex-wrap gap-4">
                    <select
                        value={kpi}
                        onChange={(e) => setKpi(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="Ventas">Ventas</option>
                        <option value="Transacciones">Transacciones</option>
                        <option value="TQP">TQP</option>
                    </select>

                    <select
                        value={channel}
                        onChange={(e) => setChannel(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="Total">Total</option>
                        <option value="Salón">Salón</option>
                        <option value="Llevar">Llevar</option>
                        <option value="UberEats">UberEats</option>
                    </select>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-t-3xl shadow-lg border-b border-gray-200">
                <div className="flex gap-2 px-6 pt-6">
                    <button
                        onClick={() => setActiveTab('evaluacion')}
                        className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors ${activeTab === 'evaluacion'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Evaluación
                    </button>
                    <button
                        onClick={() => setActiveTab('resumen')}
                        className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors ${activeTab === 'resumen'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Resumen
                    </button>
                    <button
                        onClick={() => setActiveTab('top10')}
                        className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors ${activeTab === 'top10'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Top 10
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-3xl shadow-lg border border-gray-100 p-6">
                {activeTab === 'evaluacion' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800">Evaluación por Restaurante</h2>
                            <select
                                value={topFilter}
                                onChange={(e) => setTopFilter(e.target.value as any)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium"
                            >
                                <option value="all">Todos</option>
                                <option value="top5">Top 5 Mejores</option>
                                <option value="bottom5">Top 5 Peores</option>
                            </select>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Restaurante</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">CREF</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">2025</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">2026</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">% vs 2025</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Presupuesto</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">% vs PRE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEvaluacion.map((row, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-3 px-4 text-sm font-medium text-gray-800">{row.codAlmacen}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600">{row.codAgrupacion || '—'}</td>
                                            <td className="py-3 px-4 text-sm text-right font-mono text-gray-700">{formatCurrency(row.real2025, kpi)}</td>
                                            <td className="py-3 px-4 text-sm text-right font-mono text-gray-700">{formatCurrency(row.real2026, kpi)}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getPerformanceBadge(row.pctVs2025)}`}>
                                                    {formatPct(row.pctVs2025)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-right font-mono text-gray-700">{formatCurrency(row.presupuesto2026, kpi)}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getPerformanceBadge(row.pctVsPresupuesto)}`}>
                                                    {formatPct(row.pctVsPresupuesto)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'resumen' && data?.resumen && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-6">Resumen Corporativo</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl p-6 border border-indigo-200">
                                <p className="text-sm font-semibold text-indigo-600 uppercase mb-2">Año 2025</p>
                                <p className="text-3xl font-bold text-indigo-900">{formatCurrency(data.resumen.totalReal2025, kpi)}</p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
                                <p className="text-sm font-semibold text-blue-600 uppercase mb-2">Año 2026</p>
                                <p className="text-3xl font-bold text-blue-900">{formatCurrency(data.resumen.totalReal2026, kpi)}</p>
                                <p className={`text-sm font-semibold mt-2 ${data.resumen.pctVs2025 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPct(data.resumen.pctVs2025)} vs 2025
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
                                <p className="text-sm font-semibold text-purple-600 uppercase mb-2">Presupuesto</p>
                                <p className="text-3xl font-bold text-purple-900">{formatCurrency(data.resumen.totalPresupuesto2026, kpi)}</p>
                                <p className={`text-sm font-semibold mt-2 ${data.resumen.pctVsPresupuesto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPct(data.resumen.pctVsPresupuesto)} vs PRE
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'top10' && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-6">Top 10 Restaurantes</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Top 5 Mejores */}
                            <div>
                                <h3 className="text-md font-semibold text-green-700 mb-3">🏆 Top 5 Mejores</h3>
                                <div className="space-y-2">
                                    {filteredEvaluacion.slice(0, 5).map((row, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
                                            <span className="text-sm font-medium text-gray-800">{row.codAlmacen}</span>
                                            <span className={`text-sm font-bold ${row.pctVs2025 >= 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                {formatPct(row.pctVs2025)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top 5 Peores */}
                            <div>
                                <h3 className="text-md font-semibold text-red-700 mb-3">⚠️ Top 5 Peores</h3>
                                <div className="space-y-2">
                                    {filteredEvaluacion.slice(-5).reverse().map((row, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-red-50 p-3 rounded-lg border border-red-200">
                                            <span className="text-sm font-medium text-gray-800">{row.codAlmacen}</span>
                                            <span className="text-sm font-bold text-red-600">
                                                {formatPct(row.pctVs2025)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
