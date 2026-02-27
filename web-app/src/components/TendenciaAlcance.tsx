import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFormatCurrency } from '../utils/formatters';
import { getToken, API_BASE, fetchAdminPorLocal, type PersonalAsignado, type EventosByDate } from '../api';
import { useUserPreferences } from '../context/UserPreferences';
import { exportTendenciaExcel } from '../utils/excelExporter';
import { TrendIndicator } from '../shared/components/TrendIndicator';
import { SearchableLocalSelect } from './SearchableLocalSelect';

interface TendenciaAlcanceProps {
    year: number;
    startDate: string;
    endDate: string;
    groups?: string[];
    individualStores?: string[];
    onExportExcel?: (exportFn: () => void) => void;
    availableCanales?: string[];
    verEventos?: boolean;
    onVerEventosChange?: (v: boolean) => void;
    eventosByYear?: EventosByDate;
    filterLocal?: string;
    onFilterLocalChange?: (local: string) => void;
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
    trendPresupuesto?: { direction: 'up' | 'down' | 'neutral'; percentage: number; previousValue?: number };
    trendAnterior?: { direction: 'up' | 'down' | 'neutral'; percentage: number; previousValue?: number };
}

interface CanalRecord {
    canal: string;
    real: number;
    presupuesto: number;
    anterior: number;
    pctPresupuesto: number;
    pctCrecimiento: number;
    contribucion: number;
}

interface CanalTotals {
    real: number;
    presupuesto: number;
    anterior: number;
    pctPresupuesto: number;
    pctCrecimiento: number;
    contribucion: number;
}

type SortColumn = 'local' | 'presupuesto' | 'presupuestoAcum' | 'real' | 'pctPresupuesto' | 'anterior' | 'pctAnterior';
type SortDir = 'asc' | 'desc';

// Memoized row component for better performance
interface EvaluacionRowProps {
    row: EvaluacionRecord;
    kpi: string;
    fc: (value: number, type: string) => string;
    formatPct: (pct: number) => string;
    getAlcanceBadge: (pct: number) => string;
}

const EvaluacionRow = React.memo(({ row, kpi, fc, formatPct, getAlcanceBadge }: EvaluacionRowProps) => (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-3 px-3 text-sm font-medium text-gray-800">{row.local}</td>
        <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.presupuesto, kpi)}</td>
        <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.presupuestoAcum, kpi)}</td>
        <td className="py-3 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
        <td className="py-3 px-3 text-right">
            <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctPresupuesto)}`}>
                {formatPct(row.pctPresupuesto)}
            </span>
        </td>
        <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.anterior, kpi)}</td>
        <td className="py-3 px-3 text-right">
            <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctAnterior)}`}>
                {formatPct(row.pctAnterior)}
            </span>
        </td>
    </tr>
));
EvaluacionRow.displayName = 'EvaluacionRow';

export const TendenciaAlcance: React.FC<TendenciaAlcanceProps> = ({ year, startDate, endDate, groups = [], individualStores = [], onExportExcel, availableCanales, verEventos = false, onVerEventosChange, filterLocal: filterLocalProp, onFilterLocalChange }) => {
    const fc = useFormatCurrency();
    const { preferences } = useUserPreferences();
    const [activeTab, setActiveTab] = useState<'evaluacion' | 'resumenCanal' | 'resumenGrupos' | 'top10'>('evaluacion');
    const [kpi, setKpi] = useState<string>('Ventas');
    const [channel, setChannel] = useState<string>('Todos');
    const [selectedTable, setSelectedTable] = useState<string>('RSM_ALCANCE_DIARIO');
    const [selectedLocalInternal, setSelectedLocalInternal] = useState<string>('Corporativo');
    // Use prop if provided (synchronized with global state), otherwise use internal state
    const selectedLocal = filterLocalProp !== undefined && filterLocalProp !== '' ? filterLocalProp : selectedLocalInternal;
    const setSelectedLocal = (val: string) => {
        setSelectedLocalInternal(val);
        if (onFilterLocalChange) onFilterLocalChange(val);
    };
    const [yearType, setYearType] = useState<string>('anterior');
    // Selector de rango de fechas
    const [rangoFecha, setRangoFecha] = useState<'anual' | 'mes' | 'trimestre' | 'semestre' | 'personalizado'>('anual');
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-indexed
    const [data, setData] = useState<{ evaluacion: EvaluacionRecord[], resumen: ResumenData, resumenMultiKpi?: Record<string, { totalPresupuesto: number, totalPresupuestoAcum: number, totalReal: number, totalAnterior: number, pctPresupuesto: number, pctAnterior: number, trendPresupuesto?: { direction: 'up' | 'down' | 'neutral'; percentage: number; previousValue?: number }, trendAnterior?: { direction: 'up' | 'down' | 'neutral'; percentage: number; previousValue?: number } }> } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortCol, setSortCol] = useState<SortColumn>('pctPresupuesto');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [canalData, setCanalData] = useState<{ canales: CanalRecord[], totals: CanalTotals } | null>(null);
    const [canalLoading, setCanalLoading] = useState(false);
    const [gruposData, setGruposData] = useState<{ grupo: string; presupuestoAcum: number; real: number; anterior: number; pctPresupuesto: number; pctAnterior: number; memberCount: number }[] | null>(null);
    const [gruposLoading, setGruposLoading] = useState(false);
    const [gruposError, setGruposError] = useState<string | null>(null);
    const [adminName, setAdminName] = useState<PersonalAsignado[]>([]);

    // Calcular fechas efectivas basadas en el rango seleccionado
    const { effectiveStart, effectiveEnd } = React.useMemo(() => {
        const yearNum = year;
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        void monthNames;
        const pad = (n: number) => String(n).padStart(2, '0');
        if (rangoFecha === 'anual') return { effectiveStart: startDate, effectiveEnd: endDate };
        if (rangoFecha === 'mes') {
            const m = selectedMonth + 1;
            const lastDay = new Date(yearNum, m, 0).getDate();
            return { effectiveStart: `${yearNum}-${pad(m)}-01`, effectiveEnd: `${yearNum}-${pad(m)}-${pad(lastDay)}` };
        }
        if (rangoFecha === 'trimestre') {
            const q = Math.floor(selectedMonth / 3);
            const qStart = q * 3 + 1;
            const qEnd = qStart + 2;
            const lastDay = new Date(yearNum, qEnd, 0).getDate();
            return { effectiveStart: `${yearNum}-${pad(qStart)}-01`, effectiveEnd: `${yearNum}-${pad(qEnd)}-${pad(lastDay)}` };
        }
        if (rangoFecha === 'semestre') {
            const s = selectedMonth < 6 ? 1 : 2;
            const sStart = s === 1 ? 1 : 7;
            const sEnd = s === 1 ? 6 : 12;
            const lastDay = new Date(yearNum, sEnd, 0).getDate();
            return { effectiveStart: `${yearNum}-${pad(sStart)}-01`, effectiveEnd: `${yearNum}-${pad(sEnd)}-${pad(lastDay)}` };
        }
        return { effectiveStart: startDate, effectiveEnd: endDate };
    }, [rangoFecha, selectedMonth, year, startDate, endDate]);

    // Fetch personal for selected local when rango=mes and it's an individual store
    useEffect(() => {
        if (rangoFecha !== 'mes' || !selectedLocal || groups.includes(selectedLocal) || selectedLocal === 'Corporativo') {
            setAdminName([]);
            return;
        }
        let cancelled = false;
        fetchAdminPorLocal(selectedLocal).then(lista => {
            if (!cancelled) setAdminName(lista);
        });
        return () => { cancelled = true; };
    }, [rangoFecha, selectedLocal, groups]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = getToken();
                if (!token) { setError('No hay sesión activa'); return; }

                const params = new URLSearchParams({ startDate: effectiveStart, endDate: effectiveEnd, kpi, channel, yearType, table: selectedTable });
                if (selectedLocal) params.set('local', selectedLocal);
                params.set('comparativePeriod', preferences.comparativePeriod);

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
    }, [effectiveStart, effectiveEnd, kpi, channel, selectedLocal, yearType, preferences.comparativePeriod, selectedTable]);

    // Fetch canal breakdown data when resumenCanal tab is active
    useEffect(() => {
        if (activeTab !== 'resumenCanal') return;
        const fetchCanalData = async () => {
            setCanalLoading(true);
            try {
                const token = getToken();
                if (!token) return;
                const params = new URLSearchParams({ startDate: effectiveStart, endDate: effectiveEnd, kpi, yearType, table: selectedTable });
                if (selectedLocal) params.set('local', selectedLocal);
                const url = `${API_BASE}/tendencia/resumen-canal?${params}`;
                console.log('📡 Fetching resumen canal:', url);
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);
                const result = await response.json();
                console.log('✅ Resumen canal data:', result.canales?.length, 'channels');
                setCanalData(result);
            } catch (err: any) {
                console.error('Error fetching resumen canal:', err);
            } finally {
                setCanalLoading(false);
            }
        };
        fetchCanalData();
    }, [activeTab, effectiveStart, effectiveEnd, kpi, selectedLocal, yearType, selectedTable]);

    // Fetch resumen de grupos when tab is active and groups exist
    useEffect(() => {
        if (activeTab !== 'resumenGrupos' || groups.length === 0) return;
        const token = getToken();
        if (!token) return;
        const fetchGruposData = async () => {
            setGruposLoading(true);
            setGruposError(null);
            try {
                const params = new URLSearchParams({
                    startDate: effectiveStart,
                    endDate: effectiveEnd,
                    kpi,
                    yearType,
                    channel,
                    groups: groups.join(','),
                    table: selectedTable
                });
                const response = await fetch(`${API_BASE}/tendencia/resumen-grupos?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
                const result = await response.json();
                console.log('✅ Grupos data:', result.grupos?.length, 'groups');
                setGruposData(result.grupos || []);
            } catch (err: any) {
                console.error('Error fetching resumen grupos:', err);
                setGruposError(err.message || 'Error desconocido');
                setGruposData([]);
            } finally {
                setGruposLoading(false);
            }
        };
        fetchGruposData();
    }, [activeTab, effectiveStart, effectiveEnd, kpi, yearType, channel, groups, selectedTable]);

    // Register export function with parent
    useEffect(() => {
        if (data && onExportExcel) {
            onExportExcel(() => {
                exportTendenciaExcel(
                    data.evaluacion,
                    data.resumen,
                    year,
                    `${effectiveStart} - ${effectiveEnd}`,
                    kpi,
                    channel
                );
            });
        }
    }, [data, kpi, channel, year, effectiveStart, effectiveEnd, onExportExcel]);

    const handleSort = useCallback((col: SortColumn) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir(col === 'local' ? 'asc' : 'desc');
        }
    }, [sortCol]);

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

    const { formatPctValue } = useUserPreferences();

    const getAlcanceBadge = useCallback((pct: number) => {
        if (pct >= 1.0) return 'bg-green-100 text-green-800';
        if (pct >= 0.9) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    }, []);

    const formatPct = useCallback((pct: number) => formatPctValue(pct), [formatPctValue]);

    const yearTypeLabel = yearType === 'ajustado' ? 'Año Ant. Ajust.' : 'Año Anterior';
    const yearTypePctLabel = yearType === 'ajustado' ? '% Ajust.' : '% Ant.';

    const SortIcon = React.memo(({ col }: { col: SortColumn }) => {
        if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>;
        return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    });
    SortIcon.displayName = 'SortIcon';

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
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
                        Tendencia Alcance {year}
                        {rangoFecha === 'mes' && selectedLocal && !groups.includes(selectedLocal) && (
                            <span className="ml-2 font-semibold text-gray-700 text-xl">
                                {selectedLocal}
                                {adminName.length > 0 && (
                                    <span className="ml-2 inline-flex flex-wrap gap-x-3 items-baseline">
                                        {adminName.map((p, i) => (
                                            <span key={i} className="text-gray-600 font-semibold text-base">
                                                {p.nombre}{' '}
                                                <span className="text-gray-400 font-normal text-xs italic">({p.perfil})</span>
                                            </span>
                                        ))}
                                    </span>
                                )}
                            </span>
                        )}
                    </h1>
                    <div className="text-right">
                        <div className="text-sm text-gray-500">
                            {startDate} — {endDate}
                        </div>
                        {groups.includes(selectedLocal) && data?.evaluacion && (
                            <div className="text-xs text-indigo-500 font-medium mt-0.5">
                                {data.evaluacion.length} {data.evaluacion.length === 1 ? 'local' : 'locales'}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-4">
                    {/* Year Filter */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Año</label>
                        <input
                            type="number"
                            value={year}
                            readOnly
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 cursor-not-allowed w-24"
                        />
                    </div>
                    {/* Local/Group Filter */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Local</label>
                        <SearchableLocalSelect
                            value={selectedLocal}
                            onChange={setSelectedLocal}
                            groups={groups}
                            individualStores={individualStores}
                            className="min-w-[180px]"
                        />
                    </div>
                    {/* KPI Filter */}
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
                            <option value="Todos">Todos</option>
                            {(availableCanales || ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp']).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                    {/* COMPARAR CON Filter */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Comparar Con</label>
                        <select value="presupuesto" disabled
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 cursor-not-allowed">
                            <option value="presupuesto">Presupuesto</option>
                        </select>
                    </div>
                    {/* TIPO AÑO Filter */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo Año</label>
                        <select value={yearType} onChange={(e) => setYearType(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="anterior">Natural</option>
                            <option value="ajustado">Ajustado</option>
                        </select>
                    </div>
                    {/* Tabla de Origen (Database) */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tabla de Origen</label>
                        <div className="relative">
                            <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}
                                className="pl-8 pr-4 py-2 border border-indigo-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-700 w-full sm:w-auto min-w-[150px]">
                                <option value="RSM_ALCANCE_DIARIO">Producción</option>
                                <option value="PRESUPUESTO_BETA">BETA (Sandbox)</option>
                                <option value="PRESUPUESTO_TEST">TEST</option>
                            </select>
                            <svg className="w-4 h-4 text-indigo-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                        </div>
                    </div>
                    {/* Rango de Fechas */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rango</label>
                        <select value={rangoFecha} onChange={(e) => setRangoFecha(e.target.value as any)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="anual">Acum. Anual</option>
                            <option value="trimestre">Acum. Trimestre</option>
                            <option value="semestre">Acum. Semestre</option>
                            <option value="mes">Mes</option>
                        </select>
                    </div>
                    {/* Mes (solo cuando rango es Mes, Trimestre o Semestre) */}
                    {rangoFecha !== 'anual' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mes Ref.</label>
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* TOTAL Summary Card - Compact Version */}
            {data?.resumen && (
                <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 rounded-2xl p-4 shadow-lg border border-indigo-100">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ventas</h2>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-semibold">
                            <span className="flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(startDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                            </span>
                            <span>-</span>
                            <span>{new Date(endDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Presupuesto</p>
                            <p className="text-sm font-bold text-gray-900 font-mono">{fc(data.resumen.totalPresupuesto, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">P. Acumulado</p>
                            <p className="text-sm font-bold text-gray-900 font-mono">{fc(data.resumen.totalPresupuestoAcum, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Real</p>
                            <p className="text-sm font-bold text-gray-900 font-mono">{fc(data.resumen.totalReal, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ppto</p>
                            <div className="flex items-center justify-center gap-1.5">
                                <p className={`text-lg font-extrabold ${data.resumen.pctPresupuesto >= 1.0 ? 'text-green-600' : data.resumen.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {formatPct(data.resumen.pctPresupuesto)}
                                </p>
                                {data.resumen.trendPresupuesto && (
                                    <TrendIndicator trend={data.resumen.trendPresupuesto} size="sm" />
                                )}
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">{yearTypeLabel}</p>
                            <p className="text-sm font-bold text-gray-900 font-mono">{fc(data.resumen.totalAnterior, kpi)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">{yearTypePctLabel}</p>
                            <div className="flex items-center justify-center gap-1.5">
                                <p className={`text-lg font-extrabold ${data.resumen.pctAnterior >= 1.0 ? 'text-green-600' : data.resumen.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {formatPct(data.resumen.pctAnterior)}
                                </p>
                                {data.resumen.trendAnterior && (
                                    <TrendIndicator trend={data.resumen.trendAnterior} size="sm" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Extra KPI rows: Transacciones & TQP */}
                    {data.resumenMultiKpi && (['Transacciones', 'TQP'] as const).map(tipo => {
                        const mkpi = data.resumenMultiKpi?.[tipo];
                        if (!mkpi) return null;
                        return (
                            <div key={tipo} className="mt-3 pt-3 border-t border-indigo-200/50">
                                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                                    {tipo === 'TQP' ? 'Tiquete Promedio' : tipo}
                                </h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Presupuesto</p>
                                        <p className="text-sm font-bold text-gray-900 font-mono">{fc(mkpi.totalPresupuesto, tipo)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">P. Acumulado</p>
                                        <p className="text-sm font-bold text-gray-900 font-mono">{fc(mkpi.totalPresupuestoAcum, tipo)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Real</p>
                                        <p className="text-sm font-bold text-gray-900 font-mono">{fc(mkpi.totalReal, tipo)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">% Ppto</p>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <p className={`text-lg font-extrabold ${mkpi.pctPresupuesto >= 1.0 ? 'text-green-600' : mkpi.pctPresupuesto >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(mkpi.pctPresupuesto)}
                                            </p>
                                            {mkpi.trendPresupuesto && (
                                                <TrendIndicator trend={mkpi.trendPresupuesto} size="sm" />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">{yearTypeLabel}</p>
                                        <p className="text-sm font-bold text-gray-900 font-mono">{fc(mkpi.totalAnterior, tipo)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">{yearTypePctLabel}</p>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <p className={`text-lg font-extrabold ${mkpi.pctAnterior >= 1.0 ? 'text-green-600' : mkpi.pctAnterior >= 0.9 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {formatPct(mkpi.pctAnterior)}
                                            </p>
                                            {mkpi.trendAnterior && (
                                                <TrendIndicator trend={mkpi.trendAnterior} size="sm" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-t-3xl shadow-lg border-b border-gray-200">
                <div className="flex gap-2 px-6 pt-6 overflow-x-auto">
                    {(['evaluacion', 'resumenCanal', 'resumenGrupos', 'top10'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors whitespace-nowrap ${activeTab === tab
                                ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {tab === 'evaluacion' ? 'Evaluación' : tab === 'resumenCanal' ? 'Resumen Canal' : tab === 'resumenGrupos' ? 'Resumen Grupos' : 'Top 5'}
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
                                    {sortedEvaluacion.map((row) => (
                                        <EvaluacionRow
                                            key={row.local}
                                            row={row}
                                            kpi={kpi}
                                            fc={fc}
                                            formatPct={formatPct}
                                            getAlcanceBadge={getAlcanceBadge}
                                        />
                                    ))}
                                </tbody>
                                {data?.resumen && sortedEvaluacion.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                                            <td className="py-3 px-3 text-sm text-gray-900">TOTAL</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(data.resumen.totalPresupuesto, kpi)}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(data.resumen.totalPresupuestoAcum, kpi)}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(data.resumen.totalReal, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${getAlcanceBadge(data.resumen.pctPresupuesto)}`}>
                                                    {formatPct(data.resumen.pctPresupuesto)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(data.resumen.totalAnterior, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${getAlcanceBadge(data.resumen.pctAnterior)}`}>
                                                    {formatPct(data.resumen.pctAnterior)}
                                                </span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'resumenCanal' && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-4">Resumen por Canal</h2>
                        {canalLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <svg className="w-6 h-6 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="ml-2 text-gray-500 text-sm">Cargando canales...</span>
                            </div>
                        ) : canalData ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b-2 border-gray-200">
                                            <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Canal</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Real</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Presupuesto</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">% Ppto</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">{yearTypeLabel}</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">% Crec.</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Contribución</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {canalData.canales.map((row, idx) => (
                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-3 px-3 text-sm font-semibold text-gray-800">{row.canal}</td>
                                                <td className="py-3 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.presupuesto, kpi)}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctPresupuesto)}`}>
                                                        {formatPct(row.pctPresupuesto)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.anterior, kpi)}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${row.pctCrecimiento >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {row.pctCrecimiento >= 0 ? '+' : ''}{(row.pctCrecimiento * 100).toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 bg-gray-200 rounded-full h-2">
                                                            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(row.contribucion * 100, 100)}%` }}></div>
                                                        </div>
                                                        <span className="text-xs font-mono text-gray-600 w-12 text-right">{(row.contribucion * 100).toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                                            <td className="py-3 px-3 text-sm text-gray-900">TOTAL</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(canalData.totals.real, kpi)}</td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(canalData.totals.presupuesto, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${getAlcanceBadge(canalData.totals.pctPresupuesto)}`}>
                                                    {formatPct(canalData.totals.pctPresupuesto)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-sm text-right font-mono text-gray-900">{fc(canalData.totals.anterior, kpi)}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${canalData.totals.pctCrecimiento >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {canalData.totals.pctCrecimiento >= 0 ? '+' : ''}{(canalData.totals.pctCrecimiento * 100).toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right text-xs font-mono text-gray-600">100.0%</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">Sin datos disponibles.</p>
                        )}
                    </div>
                )}

                {activeTab === 'resumenGrupos' && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-4">Resumen por Grupo</h2>
                        {groups.length === 0 ? (
                            <p className="text-gray-500 text-sm">No hay grupos configurados para mostrar.</p>
                        ) : gruposLoading ? (
                            <div className="flex items-center gap-2 py-8 text-gray-400"><span className="animate-spin">⟳</span> Cargando datos de grupos...</div>
                        ) : gruposData && gruposData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b-2 border-gray-200">
                                            <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Grupo</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">P. Acum</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Real</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">% Ppto</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">{yearTypeLabel}</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">{yearTypePctLabel}</th>
                                            <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase"># Locals</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gruposData.map(row => (
                                            <tr key={row.grupo} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-3 px-3 text-sm font-semibold text-gray-800">{row.grupo}</td>
                                                <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.presupuestoAcum, kpi)}</td>
                                                <td className="py-3 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctPresupuesto)}`}>
                                                        {formatPct(row.pctPresupuesto)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-sm text-right font-mono text-gray-700">{fc(row.anterior, kpi)}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getAlcanceBadge(row.pctAnterior)}`}>
                                                        {formatPct(row.pctAnterior)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-xs text-right text-gray-400">{row.memberCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : gruposError ? (
                            <div className="py-4">
                                <p className="text-red-500 text-sm font-medium">⚠️ Error cargando grupos</p>
                                <p className="text-gray-400 text-xs mt-1">{gruposError}</p>
                                <p className="text-gray-400 text-xs mt-1">Asegúrate de que el servidor esté actualizado y reiniciado.</p>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">No hay datos de grupos disponibles para el período seleccionado.</p>
                        )}
                    </div>
                )}

                {activeTab === 'top10' && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-6">Top 5 Restaurantes</h2>

                        {/* Sección: VENTAS REALES */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">💰 Ventas Reales</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Mejores por Ventas Real */}
                                <div className="border border-green-200 rounded-xl overflow-hidden">
                                    <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                                        <h3 className="text-sm font-bold text-green-700">🏆 Top 5 Mejores</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local)).sort((a, b) => b.real - a.real).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-green-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.presupuestoAcum, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctPresupuesto)}`}>{formatPct(row.pctPresupuesto)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Peores por Ventas Real */}
                                <div className="border border-red-200 rounded-xl overflow-hidden">
                                    <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                                        <h3 className="text-sm font-bold text-red-700">⚠️ Top 5 Peores</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local)).sort((a, b) => a.real - b.real).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-red-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.presupuestoAcum, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctPresupuesto)}`}>{formatPct(row.pctPresupuesto)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Sección: % PPTO */}
                        <div className="mb-8 pt-6 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">📊 % Presupuesto</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="border border-green-200 rounded-xl overflow-hidden">
                                    <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                                        <h3 className="text-sm font-bold text-green-700">🏆 Top 5 Mejores</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local)).sort((a, b) => b.pctPresupuesto - a.pctPresupuesto).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-green-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.presupuestoAcum, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctPresupuesto)}`}>{formatPct(row.pctPresupuesto)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="border border-red-200 rounded-xl overflow-hidden">
                                    <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                                        <h3 className="text-sm font-bold text-red-700">⚠️ Top 5 Peores</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">P. Acum</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">% Ppto</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local)).sort((a, b) => a.pctPresupuesto - b.pctPresupuesto).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-red-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.presupuestoAcum, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctPresupuesto)}`}>{formatPct(row.pctPresupuesto)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Sección: % AÑO ANTERIOR */}
                        <div className="pt-6 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">📈 {yearTypePctLabel} — {yearTypeLabel}</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="border border-green-200 rounded-xl overflow-hidden">
                                    <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                                        <h3 className="text-sm font-bold text-green-700">🏆 Top 5 Mejores ({yearTypePctLabel})</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{yearTypeLabel}</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{yearTypePctLabel}</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local) && r.anterior > 0).sort((a, b) => b.pctAnterior - a.pctAnterior).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-green-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.anterior, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctAnterior)}`}>{formatPct(row.pctAnterior)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="border border-red-200 rounded-xl overflow-hidden">
                                    <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                                        <h3 className="text-sm font-bold text-red-700">⚠️ Top 5 Peores ({yearTypePctLabel})</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Restaurante</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{yearTypeLabel}</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Real</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{yearTypePctLabel}</th>
                                        </tr></thead>
                                        <tbody>
                                            {(data?.evaluacion || []).filter(r => !groups.includes(r.local) && r.anterior > 0).sort((a, b) => a.pctAnterior - b.pctAnterior).slice(0, 5).map((row, idx) => (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-red-50">
                                                    <td className="py-2 px-3 text-sm font-medium text-gray-800">{row.local}</td>
                                                    <td className="py-2 px-3 text-xs text-right font-mono text-gray-500">{fc(row.anterior, kpi)}</td>
                                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-900">{fc(row.real, kpi)}</td>
                                                    <td className="py-2 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getAlcanceBadge(row.pctAnterior)}`}>{formatPct(row.pctAnterior)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
