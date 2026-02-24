import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchLoginAudit, fetchAdminUsers, type LoginAuditEntry, type User } from '../api';
import { Calendar, CheckCircle, XCircle, Loader2, RefreshCw, Shield, Users, AlertTriangle, X, BarChart3 } from 'lucide-react';

type ReportType = 'detalle' | 'diaSemana' | 'mes';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const LoginAuditPanel: React.FC = () => {
    const [entries, setEntries] = useState<LoginAuditEntry[]>([]);
    const [systemUsers, setSystemUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Default: last 7 days
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [desde, setDesde] = useState(weekAgo.toISOString().split('T')[0]);
    const [hasta, setHasta] = useState(today.toISOString().split('T')[0]);
    const [emailFilter, setEmailFilter] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [reportType, setReportType] = useState<ReportType>('detalle');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchLoginAudit(desde, hasta, emailFilter || undefined);
            setEntries(data);
        } catch (err: any) {
            setError(err.message || 'Error al cargar bitácora');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // Load system users for the dropdown
        fetchAdminUsers().then(users => setSystemUsers(users)).catch(() => { });
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Filter users by search text (name or email)
    const filteredUsers = useMemo(() => {
        const q = userSearch.toLowerCase();
        return systemUsers
            .filter(u => u.activo)
            .filter(u => !q || (u.nombre || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [systemUsers, userSearch]);

    // Summary stats
    const stats = useMemo(() => {
        const total = entries.length;
        const exitosos = entries.filter(e => e.exito).length;
        const fallidos = total - exitosos;
        const uniqueUsers = new Set(entries.filter(e => e.exito).map(e => e.email)).size;
        return { total, exitosos, fallidos, uniqueUsers };
    }, [entries]);

    // Grouped data for reports
    const groupedByDiaSemana = useMemo(() => {
        const exitosos = entries.filter(e => e.exito);
        const userMap = new Map<string, { nombre: string; counts: number[] }>();
        exitosos.forEach(e => {
            const key = e.email;
            if (!userMap.has(key)) {
                userMap.set(key, { nombre: e.nombre || e.email, counts: new Array(7).fill(0) });
            }
            const dayIdx = new Date(e.fecha).getDay();
            userMap.get(key)!.counts[dayIdx]++;
        });
        const rows = Array.from(userMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
        const totals = new Array(7).fill(0);
        rows.forEach(r => r.counts.forEach((c, i) => totals[i] += c));
        return { rows, totals };
    }, [entries]);

    const groupedByMes = useMemo(() => {
        const exitosos = entries.filter(e => e.exito);
        const userMap = new Map<string, { nombre: string; counts: number[] }>();
        exitosos.forEach(e => {
            const key = e.email;
            if (!userMap.has(key)) {
                userMap.set(key, { nombre: e.nombre || e.email, counts: new Array(12).fill(0) });
            }
            const monthIdx = new Date(e.fecha).getMonth();
            userMap.get(key)!.counts[monthIdx]++;
        });
        const rows = Array.from(userMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
        const totals = new Array(12).fill(0);
        rows.forEach(r => r.counts.forEach((c, i) => totals[i] += c));
        return { rows, totals };
    }, [entries]);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CR', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const parseBrowser = (ua: string | null): string => {
        if (!ua) return '—';
        if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        return 'Otro';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-100 rounded-xl">
                        <Shield className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Bitácora de Ingreso</h2>
                        <p className="text-sm text-gray-500">Historial de inicios de sesión del sistema</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="date"
                                value={desde}
                                onChange={(e) => setDesde(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="date"
                                value={hasta}
                                onChange={(e) => setHasta(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[180px] relative" ref={dropdownRef}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
                            <input
                                type="text"
                                value={userSearch}
                                onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); if (!e.target.value) setEmailFilter(''); }}
                                onFocus={() => setShowUserDropdown(true)}
                                placeholder="Todos — buscar por nombre o correo..."
                                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                            />
                            {emailFilter && (
                                <button
                                    onClick={() => { setEmailFilter(''); setUserSearch(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {showUserDropdown && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                <button
                                    onClick={() => { setEmailFilter(''); setUserSearch(''); setShowUserDropdown(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 transition-colors ${!emailFilter ? 'bg-amber-50 font-semibold text-amber-700' : 'text-gray-700'}`}
                                >
                                    Todos
                                </button>
                                {filteredUsers.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => { setEmailFilter(u.email); setUserSearch(`${u.nombre || u.email}`); setShowUserDropdown(false); }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 transition-colors border-t border-gray-50 ${emailFilter === u.email ? 'bg-amber-50 font-semibold text-amber-700' : 'text-gray-700'}`}
                                    >
                                        <span className="font-medium">{u.nombre || u.email}</span>
                                        <span className="text-gray-400 ml-2 text-xs">{u.email}</span>
                                    </button>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <div className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-lg"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Buscar
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-500">Total</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-600">Exitosos</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">{stats.exitosos}</p>
                </div>
                <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-medium text-red-600">Fallidos</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{stats.fallidos}</p>
                </div>
                <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium text-blue-600">Usuarios únicos</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{stats.uniqueUsers}</p>
                </div>
            </div>

            {/* Report Type Selector */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo de Reporte</span>
                </div>
                <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
                    {[
                        { key: 'detalle' as ReportType, label: 'Detalle' },
                        { key: 'diaSemana' as ReportType, label: 'Día de Semana' },
                        { key: 'mes' as ReportType, label: 'Mes' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setReportType(tab.key)}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${reportType === tab.key
                                    ? 'bg-white text-amber-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Table / Report Content */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No hay registros en este período</p>
                    </div>
                ) : reportType === 'detalle' ? (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuario</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Resultado</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Motivo</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">IP</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Navegador</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map((entry) => (
                                        <tr
                                            key={entry.id}
                                            className={`border-b border-gray-50 transition-colors ${entry.exito
                                                ? 'hover:bg-emerald-50/50'
                                                : 'bg-red-50/30 hover:bg-red-50/60'
                                                }`}
                                        >
                                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(entry.fecha)}</td>
                                            <td className="px-4 py-3 font-medium text-gray-900">{entry.nombre || '—'}</td>
                                            <td className="px-4 py-3 text-gray-600">{entry.email}</td>
                                            <td className="px-4 py-3 text-center">
                                                {entry.exito ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                                                        <CheckCircle className="w-3.5 h-3.5" /> Éxito
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                                        <XCircle className="w-3.5 h-3.5" /> Fallido
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{entry.motivo || '—'}</td>
                                            <td className="px-4 py-3 text-gray-400 text-xs font-mono">{entry.ip || '—'}</td>
                                            <td className="px-4 py-3 text-gray-400 text-xs">{parseBrowser(entry.userAgent)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-gray-100">
                            {entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={`p-4 ${entry.exito ? '' : 'bg-red-50/30'}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-gray-400">{formatDate(entry.fecha)}</span>
                                        {entry.exito ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                                                <CheckCircle className="w-3 h-3" /> Éxito
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                                <XCircle className="w-3 h-3" /> Fallido
                                            </span>
                                        )}
                                    </div>
                                    <p className="font-semibold text-gray-900 text-sm">{entry.nombre || entry.email}</p>
                                    {entry.nombre && <p className="text-xs text-gray-500">{entry.email}</p>}
                                    {entry.motivo && entry.motivo !== 'Login exitoso' && (
                                        <p className="text-xs text-red-500 mt-1">{entry.motivo}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                        <span>{entry.ip || '—'}</span>
                                        <span>{parseBrowser(entry.userAgent)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    /* Grouped Report Table (Día de Semana / Mes) */
                    (() => {
                        const isDia = reportType === 'diaSemana';
                        const headers = isDia ? DIAS_SEMANA : MESES;
                        const data = isDia ? groupedByDiaSemana : groupedByMes;
                        const grandTotal = data.totals.reduce((a, b) => a + b, 0);
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="text-left px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[160px]">Usuario</th>
                                            {headers.map(h => (
                                                <th key={h} className="text-center px-3 py-3 font-semibold text-gray-600 min-w-[60px]">{h}</th>
                                            ))}
                                            <th className="text-center px-4 py-3 font-bold text-gray-800 bg-amber-50 min-w-[70px]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map((row, idx) => {
                                            const rowTotal = row.counts.reduce((a, b) => a + b, 0);
                                            return (
                                                <tr key={idx} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white z-10">{row.nombre}</td>
                                                    {row.counts.map((c, ci) => (
                                                        <td key={ci} className={`text-center px-3 py-3 tabular-nums ${c === 0 ? 'text-gray-300' : 'text-gray-700 font-medium'}`}>
                                                            {c || '—'}
                                                        </td>
                                                    ))}
                                                    <td className="text-center px-4 py-3 font-bold text-amber-700 bg-amber-50/50 tabular-nums">{rowTotal}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-gray-100 border-t-2 border-gray-200">
                                            <td className="px-4 py-3 font-bold text-gray-800 sticky left-0 bg-gray-100 z-10">Total</td>
                                            {data.totals.map((t, ti) => (
                                                <td key={ti} className={`text-center px-3 py-3 font-bold tabular-nums ${t === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
                                                    {t || '—'}
                                                </td>
                                            ))}
                                            <td className="text-center px-4 py-3 font-extrabold text-amber-800 bg-amber-100 tabular-nums">{grandTotal}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                {data.rows.length === 0 && (
                                    <div className="text-center py-12 text-gray-400">
                                        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No hay conexiones exitosas en este período</p>
                                    </div>
                                )}
                            </div>
                        );
                    })()
                )}
            </div>
        </div>
    );
};

export default LoginAuditPanel;
