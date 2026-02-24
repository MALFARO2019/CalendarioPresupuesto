import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    fetchEventosPeriodo,
    updateEventoFecha,
    createEventoFecha,
    fetchEventos,
    fetchAvailableCanales,
    fetchGruposAlmacen,
    sendEventosEmail,
    getUser,
    type EventoAjustePeriodo,
    type Evento,
    type GrupoAlmacen
} from '../api';
import { SearchableCombobox, type ComboboxOption } from './ui/SearchableCombobox';
import {
    Calendar, Search, Loader2, Save, Check, X, ChevronDown, ChevronUp, Plus, Mail
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Scatter, ScatterChart,
    ZAxis, Cell
} from 'recharts';

const COLORS = {
    identity: '#e2e8f0',
    scatter: '#6366f1',
    positive: '#22c55e',
    negative: '#ef4444',
    neutral: '#94a3b8',
};

const getDiff = (fecha: string, fechaEfectiva: string | null): number => {
    if (!fechaEfectiva) return 0;
    const d1 = parseISO(fecha.split('T')[0]);
    const d2 = parseISO(fechaEfectiva.split('T')[0]);
    return differenceInDays(d2, d1);
};

export const EventosPeriodView: React.FC = () => {
    const now = new Date();
    const [desde, setDesde] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
    const [hasta, setHasta] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
    const [data, setData] = useState<EventoAjustePeriodo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Inline editing state
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editRef, setEditRef] = useState('');
    const [saving, setSaving] = useState(false);

    // Add reference state
    const [showAddForm, setShowAddForm] = useState(false);
    const [eventos, setEventos] = useState<Evento[]>([]);
    const [addForm, setAddForm] = useState({ idEvento: 0, fecha: '', fechaEfectiva: '', canal: 'Todos', grupoAlmacen: null as number | null });
    const [addSaving, setAddSaving] = useState(false);

    // Combobox options
    const [canalesOptions, setCanalesOptions] = useState<ComboboxOption[]>([]);
    const [gruposOptions, setGruposOptions] = useState<ComboboxOption[]>([]);

    // Email state
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSending, setEmailSending] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    const user = getUser();

    // Load eventos, canales, and grupos on mount
    useEffect(() => {
        fetchEventos().then(setEventos).catch(() => { });
        fetchAvailableCanales().then(canales => {
            const opts: ComboboxOption[] = [{ value: 'Todos', label: 'Todos' }];
            canales.forEach(c => {
                if (c !== 'Todos') opts.push({ value: c, label: c });
            });
            setCanalesOptions(opts);
        }).catch(() => { });
        fetchGruposAlmacen().then(grupos => {
            setGruposOptions(grupos.map(g => ({ value: String(g.IDGRUPO), label: g.DESCRIPCION })));
        }).catch(() => { });
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await fetchEventosPeriodo(desde, hasta);
            setData(result);
            setHasLoaded(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [desde, hasta]);

    const handleExpand = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !hasLoaded) {
            loadData();
        }
    };

    const startEdit = (idx: number) => {
        setEditingIdx(idx);
        setEditRef(data[idx].FECHA_EFECTIVA || data[idx].FECHA);
    };

    const cancelEdit = () => {
        setEditingIdx(null);
        setEditRef('');
    };

    const saveEdit = async (idx: number) => {
        const item = data[idx];
        setSaving(true);
        setError('');
        try {
            await updateEventoFecha({
                idEvento: item.IDEVENTO,
                oldFecha: item.FECHA,
                newFecha: item.FECHA,
                fechaEfectiva: editRef,
                canal: item.Canal,
                grupoAlmacen: item.GrupoAlmacen,
                usuario: user?.email || 'admin'
            });
            // Update local state
            const updated = [...data];
            updated[idx] = { ...item, FECHA_EFECTIVA: editRef };
            setData(updated);
            setEditingIdx(null);
            setSuccess('Referencia actualizada');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const dayLetters = ['D', 'L', 'K', 'M', 'J', 'V', 'S']; // Dom=0 to Sab=6
    const safeFormat = (dateStr: string | null | undefined) => {
        if (!dateStr) return '—';
        try {
            const d = parseISO(dateStr.split('T')[0]);
            const formatted = format(d, 'd MMM yyyy', { locale: es });
            const letter = dayLetters[d.getDay()];
            return `${formatted} (${letter})`;
        } catch {
            return dateStr;
        }
    };

    const getDiff = (fecha: string, ref: string | null) => {
        if (!ref) return 0;
        try {
            return differenceInDays(parseISO(ref.split('T')[0]), parseISO(fecha.split('T')[0]));
        } catch {
            return 0;
        }
    };

    // Chart data: scatter plot of Fecha vs FECHA_EFECTIVA as day-of-month
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        return data.map(item => {
            const fechaDate = parseISO(item.FECHA.split('T')[0]);
            const refDate = item.FECHA_EFECTIVA ? parseISO(item.FECHA_EFECTIVA.split('T')[0]) : fechaDate;
            const diff = differenceInDays(refDate, fechaDate);
            return {
                fecha: format(fechaDate, 'd MMM yyyy', { locale: es }),
                fechaNum: fechaDate.getDate(),
                refNum: refDate.getDate(),
                diff,
                evento: item.EVENTO,
                refStr: format(refDate, 'd MMM yyyy', { locale: es }),
            };
        });
    }, [data]);

    // Identity line data for the chart
    const identityLine = useMemo(() => {
        if (data.length === 0) return [];
        const desdeDate = parseISO(desde);
        const hastaDate = parseISO(hasta);
        const days: { day: number; identity: number }[] = [];
        let d = desdeDate;
        while (d <= hastaDate) {
            days.push({ day: d.getDate(), identity: d.getDate() });
            d = new Date(d.getTime() + 86400000);
        }
        return days;
    }, [desde, hasta, data]);

    return (
        <div className="mt-6">
            {/* Collapsible Header */}
            <button
                onClick={handleExpand}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-2xl border-2 border-violet-200 hover:border-violet-300 transition-all group"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-100 rounded-xl group-hover:bg-violet-200 transition-colors">
                        <Calendar className="w-5 h-5 text-violet-700" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-base font-bold text-gray-800">📅 Ajustes por Período</h3>
                        <p className="text-xs text-gray-500">Consultar y editar referencias de ajuste</p>
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
            </button>

            {expanded && (
                <div className="mt-3 bg-white rounded-2xl shadow-lg border border-gray-100 p-5 space-y-5">
                    {/* Messages */}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
                            <X className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                            <button onClick={() => setError('')} className="ml-auto">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    {success && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700">
                            <Check className="w-4 h-4 flex-shrink-0" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Period Selector */}
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Desde</label>
                            <input
                                type="date"
                                value={desde}
                                onChange={e => setDesde(e.target.value)}
                                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 text-sm transition-all"
                            />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Hasta</label>
                            <input
                                type="date"
                                value={hasta}
                                onChange={e => setHasta(e.target.value)}
                                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 text-sm transition-all"
                            />
                        </div>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Consultar
                        </button>
                        {data.length > 0 && (
                            <button
                                onClick={() => { setEmailTo(user?.email || ''); setShowEmailModal(true); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all"
                            >
                                <Mail className="w-4 h-4" />
                                Enviar
                            </button>
                        )}
                    </div>

                    {/* Email Modal */}
                    {showEmailModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEmailModal(false)}>
                            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                                <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-emerald-600" />
                                    Enviar Reporte por Correo
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">Incluye el gráfico, rango ({desde} → {hasta}) y listado de {data.length} ajuste(s)</p>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Destinatario(s)</label>
                                <input
                                    type="email"
                                    value={emailTo}
                                    onChange={e => setEmailTo(e.target.value)}
                                    placeholder="correo@ejemplo.com, otro@ejemplo.com"
                                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm mb-4"
                                    autoFocus
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowEmailModal(false)}
                                        className="flex-1 px-3 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-medium transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!emailTo.trim()) { setError('Ingrese un correo destinatario'); return; }
                                            setEmailSending(true);
                                            setError('');
                                            try {
                                                // Capture chart as image
                                                let chartImage: string | undefined;
                                                if (chartRef.current) {
                                                    try {
                                                        chartImage = await toPng(chartRef.current, { backgroundColor: '#f9fafb', pixelRatio: 2 });
                                                    } catch { /* chart capture failed, send without */ }
                                                }
                                                // Prepare items with diff
                                                const itemsWithDiff = data.map(item => ({
                                                    ...item,
                                                    diff: getDiff(item.FECHA, item.FECHA_EFECTIVA)
                                                }));
                                                await sendEventosEmail({
                                                    to: emailTo.trim(),
                                                    desde,
                                                    hasta,
                                                    items: itemsWithDiff,
                                                    chartImage
                                                });
                                                setSuccess('✉️ Correo enviado exitosamente');
                                                setTimeout(() => setSuccess(''), 4000);
                                                setShowEmailModal(false);
                                            } catch (err: any) {
                                                setError(err.message);
                                            } finally {
                                                setEmailSending(false);
                                            }
                                        }}
                                        disabled={emailSending || !emailTo.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                        {emailSending ? 'Enviando...' : 'Enviar Correo'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                            <span className="ml-3 text-gray-500">Cargando ajustes...</span>
                        </div>
                    ) : hasLoaded && data.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                            No hay ajustes de presupuesto en el período seleccionado.
                        </div>
                    ) : data.length > 0 ? (
                        <>
                            {/* Reference Chart */}
                            <div ref={chartRef} className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    📊 Mapa de Referencias
                                    <span className="text-xs font-normal text-gray-400">
                                        (Fecha del evento → Fecha de referencia)
                                    </span>
                                </h4>
                                <div style={{ height: 280 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                            <XAxis
                                                type="number"
                                                dataKey="fechaNum"
                                                name="Día Evento"
                                                domain={['dataMin - 1', 'dataMax + 1']}
                                                label={{ value: 'Día del Evento', position: 'insideBottom', offset: -15, style: { fontSize: 11, fill: '#6b7280' } }}
                                                tick={{ fontSize: 11 }}
                                            />
                                            <YAxis
                                                type="number"
                                                dataKey="refNum"
                                                name="Día Referencia"
                                                domain={['dataMin - 1', 'dataMax + 1']}
                                                label={{ value: 'Día de Referencia', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#6b7280' } }}
                                                tick={{ fontSize: 11 }}
                                            />
                                            <ZAxis range={[80, 80]} />
                                            <Tooltip
                                                content={({ payload }) => {
                                                    if (!payload || payload.length === 0) return null;
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-white shadow-xl rounded-lg border border-gray-200 px-3 py-2 text-xs">
                                                            <p className="font-bold text-gray-800">{d.evento}</p>
                                                            <p className="text-gray-500">Evento: día {d.fechaNum} ({d.fecha})</p>
                                                            <p className="text-gray-500">Referencia: día {d.refNum} ({d.refStr})</p>
                                                            <p className={`font-semibold ${d.diff === 0 ? 'text-gray-500' : d.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {d.diff === 0 ? 'Sin ajuste' : `${d.diff > 0 ? '+' : ''}${d.diff} días`}
                                                            </p>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            {/* Identity line: reference = event day */}
                                            <Line
                                                data={identityLine}
                                                dataKey="identity"
                                                stroke={COLORS.identity}
                                                strokeWidth={2}
                                                strokeDasharray="6 4"
                                                dot={false}
                                                name="Sin ajuste"
                                                isAnimationActive={false}
                                            />
                                            <Scatter data={chartData} name="Ajustes">
                                                {chartData.map((entry, i) => (
                                                    <Cell
                                                        key={i}
                                                        fill={entry.diff === 0 ? COLORS.neutral : entry.diff > 0 ? COLORS.positive : COLORS.negative}
                                                        stroke={entry.diff === 0 ? COLORS.neutral : entry.diff > 0 ? COLORS.positive : COLORS.negative}
                                                    />
                                                ))}
                                            </Scatter>
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex items-center justify-center gap-6 mt-2 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-full bg-slate-300 inline-block" /> Sin ajuste (diagonal)
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Ref. posterior
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Ref. anterior
                                    </span>
                                </div>
                            </div>

                            {/* Editable Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                                            <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Evento</th>
                                            <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Referencia</th>
                                            <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Diferencia</th>
                                            <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Canal</th>
                                            <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase w-24">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((item, idx) => {
                                            const diff = getDiff(item.FECHA, item.FECHA_EFECTIVA);
                                            const isEditing = editingIdx === idx;
                                            return (
                                                <tr key={`${item.IDEVENTO}-${item.FECHA}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                    <td className="px-3 py-2 font-medium text-gray-800">{safeFormat(item.FECHA)}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-700">{item.EVENTO}</span>
                                                            {item.ESFERIADO === 'S' && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Feriado</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {isEditing ? (
                                                            <input
                                                                type="date"
                                                                value={editRef}
                                                                onChange={e => setEditRef(e.target.value)}
                                                                className="px-2 py-1 border-2 border-violet-300 rounded-lg focus:border-violet-500 text-sm w-40"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span className="text-gray-600">{safeFormat(item.FECHA_EFECTIVA)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${diff === 0 ? 'bg-gray-100 text-gray-500'
                                                            : diff > 0 ? 'bg-green-50 text-green-700 border border-green-200'
                                                                : 'bg-red-50 text-red-700 border border-red-200'
                                                            }`}>
                                                            {diff === 0 ? '0d' : `${diff > 0 ? '+' : ''}${diff}d`}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-500 text-xs">{item.Canal}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {isEditing ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button
                                                                    onClick={() => saveEdit(idx)}
                                                                    disabled={saving}
                                                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                                                                    title="Guardar"
                                                                >
                                                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                </button>
                                                                <button
                                                                    onClick={cancelEdit}
                                                                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-all"
                                                                    title="Cancelar"
                                                                >
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => startEdit(idx)}
                                                                className="p-1.5 text-violet-500 hover:bg-violet-50 rounded-lg transition-all"
                                                                title="Editar referencia"
                                                            >
                                                                <Save className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-gray-400 text-right">
                                {data.length} ajuste{data.length !== 1 ? 's' : ''} encontrado{data.length !== 1 ? 's' : ''}
                            </p>
                        </>
                    ) : null}

                    {/* Add Reference Form */}
                    {!showAddForm ? (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-semibold rounded-xl text-sm transition-all border-2 border-violet-200 hover:border-violet-300 w-full justify-center"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Referencia
                        </button>
                    ) : (
                        <div className="bg-violet-50 rounded-xl border-2 border-violet-200 p-4">
                            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Plus className="w-4 h-4 text-violet-600" />
                                Nueva Referencia de Ajuste
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Evento</label>
                                    <select
                                        value={addForm.idEvento}
                                        onChange={e => setAddForm({ ...addForm, idEvento: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-violet-500 focus:ring-2 focus:ring-violet-200 text-sm bg-white"
                                    >
                                        <option value={0}>Seleccionar...</option>
                                        {eventos.filter(e => e.USARENPRESUPUESTO === 'S').map(ev => (
                                            <option key={ev.IDEVENTO} value={ev.IDEVENTO}>{ev.EVENTO}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha del Evento</label>
                                    <input
                                        type="date"
                                        value={addForm.fecha}
                                        onChange={e => setAddForm({ ...addForm, fecha: e.target.value })}
                                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-violet-500 focus:ring-2 focus:ring-violet-200 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha Referencia</label>
                                    <input
                                        type="date"
                                        value={addForm.fechaEfectiva}
                                        onChange={e => setAddForm({ ...addForm, fechaEfectiva: e.target.value })}
                                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-violet-500 focus:ring-2 focus:ring-violet-200 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Canal</label>
                                    <SearchableCombobox
                                        options={canalesOptions}
                                        value={addForm.canal}
                                        onChange={v => setAddForm({ ...addForm, canal: v || 'Todos' })}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Grupo Almacén</label>
                                    <SearchableCombobox
                                        options={gruposOptions}
                                        value={addForm.grupoAlmacen ? String(addForm.grupoAlmacen) : ''}
                                        onChange={v => setAddForm({ ...addForm, grupoAlmacen: v ? parseInt(v) : null })}
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => { setShowAddForm(false); setAddForm({ idEvento: 0, fecha: '', fechaEfectiva: '', canal: 'Todos', grupoAlmacen: null }); }}
                                    className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!addForm.idEvento || !addForm.fecha || !addForm.fechaEfectiva) {
                                            setError('Seleccione evento, fecha y referencia');
                                            return;
                                        }
                                        setAddSaving(true);
                                        setError('');
                                        try {
                                            await createEventoFecha({
                                                idEvento: addForm.idEvento,
                                                fecha: addForm.fecha,
                                                fechaEfectiva: addForm.fechaEfectiva,
                                                canal: addForm.canal,
                                                grupoAlmacen: addForm.grupoAlmacen,
                                                usuario: user?.email || 'admin'
                                            });
                                            setSuccess('Referencia creada exitosamente');
                                            setTimeout(() => setSuccess(''), 3000);
                                            setShowAddForm(false);
                                            setAddForm({ idEvento: 0, fecha: '', fechaEfectiva: '', canal: 'Todos', grupoAlmacen: null });
                                            loadData();
                                        } catch (err: any) {
                                            setError(err.message);
                                        } finally {
                                            setAddSaving(false);
                                        }
                                    }}
                                    disabled={addSaving || !addForm.idEvento || !addForm.fecha || !addForm.fechaEfectiva}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                >
                                    {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Crear Referencia
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
