import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getToken, API_BASE } from '../api';

interface TendenciaAlcanceProps {
    year: number;
    startDate: string;
    endDate: string;
    groups?: string[];
    individualStores?: string[];
}

interface EvaluacionRecord {
    local: string;
    presupuesto: number;
    presupuestoAcum: number;
    real: number;
    anterior: number;
    pctPresupuesto: number;
    pctAnterior: number;
}

interface ResumenData {
    totalPresupuesto: number;
    totalPresupuestoAcum: number;
    totalReal: number;
    totalAnterior: number;
    pctPresupuesto: number;
    pctAnterior: number;
}

type SortColumn = 'local' | 'presupuesto' | 'presupuestoAcum' | 'real' | 'pctPresupuesto' | 'anterior' | 'pctAnterior';
type SortDir = 'asc' | 'desc';

export const TendenciaAlcance: React.FC<TendenciaAlcanceProps> = ({ year, startDate, endDate, groups = [], individualStores = [] }) => {
    const [activeTab, setActiveTab] = useState<'evaluacion' | 'resumen' | 'top10'>('evaluacion');
    const [kpi, setKpi] = useState<string>('Ventas');
    const [channel, setChannel] = useState<string>('Total');
    const [selectedLocal, setSelectedLocal] = useState<string>('Corporativo');
    const [yearType, setYearType] = useState<string>('anterior');
    const [data, setData] = useState<{ evaluacion: EvaluacionRecord[], resumen: ResumenData } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortCol, setSortCol] = useState<SortColumn>('pctPresupuesto');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = getToken();
                if (!token) { setError('No hay sesión activa'); return; }

                const params = new URLSearchParams({ startDate, endDate, kpi, channel, yearType });
                if (selectedLocal) params.set('local', selectedLocal);

                const url = `${API_BASE}/tendencia?${params}`;
                console.log('📡 Fetching tendencia:', url);

                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });

                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);

                const result = await response.json();
                console.log('✅ Tendencia data:', result.evaluacion?.length, 'records');
                setData(result);
            } catch (err: any) {
                setError(err.message);
                console.error('Error fetching tendencia:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [startDate, endDate, kpi, channel, selectedLocal, yearType]);

    const handleSort = (col: SortColumn) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir(col === 'local' ? 'asc' : 'desc');
        }
    };

    const sortedEvaluacion = useMemo(() => {
        if (!data?.evaluacion) return [];
        const sorted = [...data.evaluacion].sort((a, b) => {
            let cmp: number;
            if (sortCol === 'local') {
                cmp = a.local.localeCompare(b.local);
            } else {
                cmp = (a[sortCol] as number) - (b[sortCol] as number);
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [data, sortCol, sortDir]);

    const getAlcanceBadge = (pct: number) => {
        if (pct >= 1.0) return 'bg-green-100 text-green-800';
        if (pct >= 0.9) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    const formatPct = (pct: number) => `${(pct * 100).toFixed(1)}%`;

    const yearTypeLabel = yearType === 'ajustado' ? 'Año Ant. Ajust.' : 'Año Anterior';
    const yearTypePctLabel = yearType === 'ajustado' ? '% Ajust.' : '% Ant.';

    const SortIcon = ({ col }: { col: SortColumn }) => {
        if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>;
        return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

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
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Tendencia Alcance {year}</h1>
                    <div className="text-sm text-gray-500">
                        {startDate} — {endDate}
                    </div>
                </div>

                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">KPI</label>
                        <select value={kpi} onChange={(e) => setKpi(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="Ventas">Ventas</option>
                            <option value="Transacciones">Transacciones</option>
                            <option value="TQP">TQP</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Canal</label>
                        <select value={channel} onChange={(e) => setChannel(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="Total">Total</option>
                            <option value="Salón">Salón</option>
                            <option value="Llevar">Llevar</option>
                            <option value="UberEats">UberEats</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grupo / Local</label>
                        <select value={selectedLocal} onChange={(e) => setSelectedLocal(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[180px]">
                            {groups.length > 0 && (
                                <optgroup label="Grupos">
                                    {groups.map(g => (<option key={g} value={g}>{g}</option>))}
                                </optgroup>
                            )}
                            {individualStores.length > 0 && (
                                <optgroup label="Locales">
                                    {individualStores.map(s => (<option key={s} value={s}>{s}</option>))}
                                </optgroup>
                            )}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo Año</label>
                        <select value={yearType} onChange={(e) => setYearType(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="anterior">Natural</option>
                            <option value="ajustado">Ajustado</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* TOTAL Summary Card */}
            {data?.resumen && (
                <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 rounded-3xl p-6 shadow-lg border border-indigo-100">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Resumen Total</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">Presupuesto</p>
                            <p className="text-lg font-bold text-gray-900 font-mono">{formatCurrency(data.resumen.totalPresupuesto, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">P. Acumulado</p>
                            <p className="text-lg font-bold text-gray-900 font-mono">{formatCurrency(data.resumen.totalPresupuestoAcum, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">Real</p>
                            <p className="text-lg font-bold text-gray-900 font-mono">{formatCurrency(data.resumen.totalReal, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">% Ppto</p>
                            <p className={`text-xl font-extrabold ${data.resumen.pctPresupuesto >= 1.0 ? 'text-green-600' : data.resumen.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {formatPct(data.resumen.pctPresupuesto)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">{yearTypeLabel}</p>
                            <p className="text-lg font-bold text-gray-900 font-mono">{formatCurrency(data.resumen.totalAnterior, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">{yearTypePctLabel}</p>
                            <p className={`text-xl font-extrabold ${data.resumen.pctAnterior >= 1.0 ? 'text-green-600' : data.resumen.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {formatPct(data.resumen.pctAnterior)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-t-3xl shadow-lg border-b border-gray-200">
                <div className="flex gap-2 px-6 pt-6">
                    {(['evaluacion', 'top10'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors ${activeTab === tab
                                ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {tab === 'evaluacion' ? 'Evaluación' : 'Top 10'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-3xl shadow-lg border border-gray-100 p-6">
                {activeTab === 'evaluacion' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800">Evaluación por Restaurante</h2>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-500 uppercase">Ordenar por</label>
                                <select value={`${sortCol}-${sortDir}`}
                                    onChange={(e) => {
                                        const [col, dir] = e.target.value.split('-') as [SortColumn, SortDir];
                                        setSortCol(col);
                                        setSortDir(dir);
                                    }}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="pctPresupuesto-desc">% Ppto ↓</option>
                                    <option value="pctPresupuesto-asc">% Ppto ↑</option>
                                    <option value="pctAnterior-desc">% Ant. ↓</option>
                                    <option value="pctAnterior-asc">% Ant. ↑</option>
                                    <option value="real-desc">Real ↓</option>
                                    <option value="real-asc">Real ↑</option>
                                    <option value="presupuesto-desc">Presupuesto ↓</option>
                                    <option value="presupuesto-asc">Presupuesto ↑</option>
                                    <option value="presupuestoAcum-desc">P. Acumulado ↓</option>
                                    <option value="presupuestoAcum-asc">P. Acumulado ↑</option>
                                    <option value="anterior-desc">Año Anterior ↓</option>
                                    <option value="anterior-asc">Año Anterior ↑</option>
                                    <option value="local-asc">Restaurante A-Z</option>
                                    <option value="local-desc">Restaurante Z-A</option>
                                </select>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-gray-200">
                                        <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('local')}>
                                            Restaurante <SortIcon col="local" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('presupuesto')}>
                                            Presupuesto <SortIcon col="presupuesto" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('presupuestoAcum')}>
                                            P. Acumulado <SortIcon col="presupuestoAcum" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('real')}>
                                            Real <SortIcon col="real" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('pctPresupuesto')}>
                                            % Ppto <SortIcon col="pctPresupuesto" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('anterior')}>
                                            {yearTypeLabel} <SortIcon col="anterior" />
                                        </th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-indigo-600 select-none"
                                            onClick={() => handleSort('pctAnterior')}>
                                            {yearTypePctLabel} <SortIcon col="pctAnterior" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedEvaluacion.map((row, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-3 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{formatCurrency(row.presupuesto, kpi)}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{formatCurrency(row.presupuestoAcum, kpi)}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono font-semibold text-gray-900">{formatCurrency(row.real, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctPresupuesto)}`}>
                                                    {formatPct(row.pctPresupuesto)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{formatCurrency(row.anterior, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctAnterior)}`}>
                                                    {formatPct(row.pctAnterior)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'top10' && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-6">Top 10 Restaurantes</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-md font-semibold text-green-700 mb-3">🏆 Top 5 Mejores (% Ppto)</h3>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-green-200">
                                            <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data?.evaluacion || []).sort((a, b) => b.pctPresupuesto - a.pctPresupuesto).slice(0, 5).map((row, idx) => (
                                            <tr key={idx} className="border-b border-green-100 bg-green-50">
                                                <td className="py-2 px-2 text-sm font-medium text-gray-800">{row.local}</td>
                                                <td className="py-2 px-2 text-sm text-right font-mono text-gray-600">{formatCurrency(row.presupuestoAcum, kpi)}</td>
                                                <td className="py-2 px-2 text-sm text-right font-mono text-gray-800 font-semibold">{formatCurrency(row.real, kpi)}</td>
                                                <td className="py-2 px-2 text-right">
                                                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctPresupuesto)}`}>
                                                        {formatPct(row.pctPresupuesto)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <h3 className="text-md font-semibold text-red-700 mb-3">⚠️ Top 5 Peores (% Ppto)</h3>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-red-200">
                                            <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data?.evaluacion || []).sort((a, b) => a.pctPresupuesto - b.pctPresupuesto).slice(0, 5).map((row, idx) => (
                                            <tr key={idx} className="border-b border-red-100 bg-red-50">
                                                <td className="py-2 px-2 text-sm font-medium text-gray-800">{row.local}</td>
                                                <td className="py-2 px-2 text-sm text-right font-mono text-gray-600">{formatCurrency(row.presupuestoAcum, kpi)}</td>
                                                <td className="py-2 px-2 text-sm text-right font-mono text-gray-800 font-semibold">{formatCurrency(row.real, kpi)}</td>
                                                <td className="py-2 px-2 text-right">
                                                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-red-100 text-red-800">
                                                        {formatPct(row.pctPresupuesto)}
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
    );
};
