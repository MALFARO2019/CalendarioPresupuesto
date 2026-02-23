import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchAjustes, aplicarAjuste, desactivarAjuste, fetchModeloConfig,
    fetchStoresWithNames, fetchDatosAjuste, fetchEventosPorMes, fetchEventosAjuste,
    getUser, type AjustePresupuesto, type StoreItem, type DatosAjusteDia,
    type EventosByDate, type EventoItem, type ModeloConfig
} from '../../api';

interface Props { anoModelo: number; nombrePresupuesto: string; }

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CANALES = ['Todos', 'Salón', 'Llevar', 'AutoPollo', 'Express', 'ECommerce', 'UberEats', 'WhatsApp'];

type CurveKey = 'real' | 'ppto' | 'anterior' | 'anteriorAjust';
interface CurveDef { key: CurveKey; label: string; short: string; color: string; fill: string; field: keyof DatosAjusteDia; default: boolean; }
const CURVES: CurveDef[] = [
    { key: 'real', label: 'Real', short: 'Real', color: '#22c55e', fill: 'rgba(34,197,94,0.08)', field: 'RealValor', default: true },
    { key: 'ppto', label: 'Presupuesto', short: 'Pres.', color: '#3b82f6', fill: 'rgba(59,130,246,0.06)', field: 'Presupuesto', default: true },
    { key: 'anterior', label: 'Año Anterior', short: 'Ant.', color: '#f97316', fill: 'rgba(249,115,22,0.06)', field: 'AnoAnterior', default: false },
    { key: 'anteriorAjust', label: 'Año Ant. Ajust.', short: 'Ajust.', color: '#a855f7', fill: 'rgba(168,85,247,0.06)', field: 'AnoAnteriorAjustado', default: false },
];

function fmt$(v: number): string {
    if (Math.abs(v) >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `₡${(v / 1_000).toFixed(0)}K`;
    return `₡${Math.round(v).toLocaleString()}`;
}
function fmtFull(v: number): string { return `₡${Math.round(v).toLocaleString()}`; }
function dateKey(d: string): string { return d.substring(0, 10); }

function catmullRomPath(pts: { x: number; y: number }[], tension = 0.4): string {
    if (!pts.length) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
        const cp1x = p1.x + (p2.x - p0.x) * tension / 3, cp1y = p1.y + (p2.y - p0.y) * tension / 3;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 3, cp2y = p2.y - (p3.y - p1.y) * tension / 3;
        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
}
function catmullRomArea(pts: { x: number; y: number }[], bottomY: number): string {
    if (!pts.length) return '';
    return `${catmullRomPath(pts)} L${pts[pts.length - 1].x},${bottomY} L${pts[0].x},${bottomY} Z`;
}

export const AjusteChart: React.FC<Props> = ({ anoModelo: initAno, nombrePresupuesto: initConfig }) => {
    const { showConfirm } = useToast();
    const user = getUser();
    const canAdjust = user?.esAdmin || (user as any)?.ajustarCurva;

    // Config selector
    const [configs, setConfigs] = useState<ModeloConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
    const currentConfig = configs.find(c => c.id === selectedConfigId) || null;
    const nombrePresupuesto = currentConfig?.nombrePresupuesto || initConfig;
    const anoModelo = currentConfig?.anoModelo || initAno;

    const [stores, setStores] = useState<StoreItem[]>([]);
    const [dailyData, setDailyData] = useState<DatosAjusteDia[]>([]);
    const [ajustes, setAjustes] = useState<AjustePresupuesto[]>([]);
    const [eventos, setEventos] = useState<EventosByDate>({});
    const [eventosAjuste, setEventosAjuste] = useState<EventosByDate>({});
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);

    const [codAlmacen, setCodAlmacen] = useState('');
    const [mes, setMes] = useState(new Date().getMonth() + 1);
    const [canal, setCanal] = useState('Todos');

    // Curve toggles
    const [activeCurves, setActiveCurves] = useState<Record<CurveKey, boolean>>(
        Object.fromEntries(CURVES.map(c => [c.key, c.default])) as Record<CurveKey, boolean>
    );
    const [labelCurves, setLabelCurves] = useState<Record<CurveKey, boolean>>(
        { real: true, ppto: false, anterior: false, anteriorAjust: false }
    );
    const toggleCurve = (k: CurveKey) => setActiveCurves(p => ({ ...p, [k]: !p[k] }));
    const toggleLabel = (k: CurveKey) => setLabelCurves(p => ({ ...p, [k]: !p[k] }));

    const [showEventos, setShowEventos] = useState(false);
    const [showEventosAjuste, setShowEventosAjuste] = useState(false);
    const [showAjustesTooltip, setShowAjustesTooltip] = useState(true);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // Scroll/zoom
    const [zoomStart, setZoomStart] = useState(0);
    const [zoomEnd, setZoomEnd] = useState(1);

    // Drag
    const [dragOffsets, setDragOffsets] = useState<number[]>([]);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
    const [hasDrag, setHasDrag] = useState(false);

    // Adjustment panel
    const [adjPanelOpen, setAdjPanelOpen] = useState(false);
    const [adjMethod, setAdjMethod] = useState<'Porcentaje' | 'MontoAbsoluto' | 'Factor'>('Porcentaje');
    const [adjValue, setAdjValue] = useState('');
    const [adjDist, setAdjDist] = useState('Mes');
    const [adjMotivo, setAdjMotivo] = useState('');
    const [applying, setApplying] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // History panel
    const [historyOpen, setHistoryOpen] = useState(false);

    const H = 380;
    const P = { t: 30, r: 80, b: 20, l: 75 };

    // ── Load configs + stores ──
    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [cfgs, sts] = await Promise.all([
                    fetchModeloConfig().catch(() => [] as ModeloConfig[]),
                    fetchStoresWithNames().catch(() => [] as StoreItem[])
                ]);
                setConfigs(cfgs.filter(c => c.activo));
                const ind = sts.filter(s => !s.code.startsWith('G'));
                setStores(ind);
                if (ind.length > 0 && !codAlmacen) setCodAlmacen(ind[0].code);
                const match = cfgs.find(c => c.nombrePresupuesto === initConfig && c.activo);
                if (match) setSelectedConfigId(match.id);
                else if (cfgs.length > 0) setSelectedConfigId(cfgs.filter(c => c.activo)[0]?.id || null);
            } finally { setLoading(false); }
        })();
    }, []);

    useEffect(() => { if (codAlmacen && nombrePresupuesto) loadData(); }, [codAlmacen, canal, nombrePresupuesto, mes, anoModelo]);
    useEffect(() => {
        fetchEventosPorMes(anoModelo, mes).then(setEventos).catch(() => setEventos({}));
        fetchEventosAjuste().then(setEventosAjuste).catch(() => setEventosAjuste({}));
    }, [anoModelo, mes]);
    useEffect(() => { if (nombrePresupuesto) refreshAjustes(); }, [nombrePresupuesto]);

    const refreshAjustes = () => fetchAjustes(nombrePresupuesto).then(setAjustes).catch(() => setAjustes([]));

    const loadData = async () => {
        setChartLoading(true);
        try {
            const d = await fetchDatosAjuste(nombrePresupuesto, codAlmacen, canal, 'Ventas', mes, anoModelo);
            setDailyData(d);
            setDragOffsets(new Array(d.length).fill(0));
            setHasDrag(false);
            setZoomStart(0); setZoomEnd(1);
        } catch { setDailyData([]); }
        finally { setChartLoading(false); }
    };

    // ── Visible window (zoom) ──
    const visibleData = useMemo(() => {
        if (!dailyData.length) return [];
        const s = Math.floor(zoomStart * dailyData.length);
        const e = Math.ceil(zoomEnd * dailyData.length);
        return dailyData.slice(s, e);
    }, [dailyData, zoomStart, zoomEnd]);
    const visibleOffset = useMemo(() => Math.floor(zoomStart * dailyData.length), [dailyData.length, zoomStart]);

    // ── Computed ──
    const adjusted = useMemo(() => dailyData.map((d, i) => (d.Presupuesto || 0) + (dragOffsets[i] || 0)), [dailyData, dragOffsets]);
    const origTotal = useMemo(() => dailyData.reduce((s, d) => s + (d.Presupuesto || 0), 0), [dailyData]);
    const adjTotal = useMemo(() => adjusted.reduce((s, v) => s + v, 0), [adjusted]);
    const mesAjustes = useMemo(() => ajustes.filter(a => a.mes === mes && a.codAlmacen === codAlmacen && a.activo), [ajustes, mes, codAlmacen]);

    // ── Y scale ──
    const { yMin, yMax, ticks } = useMemo(() => {
        if (!visibleData.length) return { yMin: 0, yMax: 1e6, ticks: [0, 5e5, 1e6] };
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < visibleData.length; i++) {
            const gi = i + visibleOffset;
            const vals: number[] = [];
            for (const c of CURVES) { if (activeCurves[c.key]) vals.push((visibleData[i] as any)[c.field] || 0); }
            if (hasDrag) vals.push(adjusted[gi]);
            for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        if (!isFinite(lo)) { lo = 0; hi = 1e6; }
        const pad = (hi - lo) * 0.12 || hi * 0.1 || 1000;
        lo = Math.max(0, lo - pad); hi += pad;
        const step = (hi - lo) / 5;
        return { yMin: lo, yMax: hi, ticks: Array.from({ length: 6 }, (_, i) => lo + step * i) };
    }, [visibleData, visibleOffset, activeCurves, hasDrag, adjusted]);

    const [W, setW] = useState(800);
    const cRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const o = new ResizeObserver(e => { for (const r of e) setW(r.contentRect.width); });
        if (cRef.current) o.observe(cRef.current);
        return () => o.disconnect();
    }, []);

    const pw = W - P.l - P.r;
    const ph = H - P.t - P.b;
    const xOf = useCallback((i: number) => P.l + (i / Math.max(visibleData.length - 1, 1)) * pw, [visibleData.length, pw]);
    const yOf = useCallback((v: number) => P.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph, [ph, yMin, yMax]);
    const vOf = useCallback((sy: number) => yMin + (P.t + ph - sy) / ph * (yMax - yMin), [ph, yMin, yMax]);

    const curvePoints = useMemo(() => {
        const out: Record<string, { x: number; y: number }[]> = {};
        for (const c of CURVES) {
            if (!activeCurves[c.key]) continue;
            out[c.key] = visibleData.map((d, i) => ({ x: xOf(i), y: yOf((d as any)[c.field] || 0) }));
        }
        if (hasDrag) {
            out['adjusted'] = visibleData.map((_, i) => ({ x: xOf(i), y: yOf(adjusted[i + visibleOffset]) }));
        }
        return out;
    }, [visibleData, visibleOffset, activeCurves, hasDrag, adjusted, xOf, yOf]);

    const getEvs = useCallback((f: string): EventoItem[] => {
        const k = dateKey(f); const r: EventoItem[] = [];
        if (showEventos && eventos[k]) r.push(...eventos[k]);
        if (showEventosAjuste && eventosAjuste[k]) r.push(...eventosAjuste[k]);
        return r;
    }, [eventos, eventosAjuste, showEventos, showEventosAjuste]);

    // ── Hover ──
    const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || !visibleData.length || draggingIdx !== null) return;
        const r = svgRef.current.getBoundingClientRect();
        const x = e.clientX - r.left;
        const i = Math.round(((x - P.l) / pw) * (visibleData.length - 1));
        setHoverIdx(Math.max(0, Math.min(i, visibleData.length - 1)));
    }, [visibleData.length, pw, draggingIdx]);

    // ── Drag (mouse) ──
    const startDrag = useCallback((e: React.MouseEvent, i: number) => {
        if (!canAdjust) return;
        e.preventDefault(); e.stopPropagation();
        setDraggingIdx(i + visibleOffset);
    }, [canAdjust, visibleOffset]);

    useEffect(() => {
        if (draggingIdx === null) return;
        const move = (e: MouseEvent) => {
            if (!svgRef.current) return;
            const r = svgRef.current.getBoundingClientRect();
            const nv = vOf(e.clientY - r.top);
            const orig = dailyData[draggingIdx].Presupuesto || 0;
            setDragOffsets(p => { const n = [...p]; n[draggingIdx] = Math.max(-orig, nv - orig); return n; });
            setHasDrag(true);
        };
        const up = () => setDraggingIdx(null);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [draggingIdx, vOf, dailyData]);

    // Drag (touch)
    const startTouch = useCallback((e: React.TouchEvent, i: number) => {
        if (!canAdjust) return;
        e.preventDefault(); e.stopPropagation();
        setDraggingIdx(i + visibleOffset);
    }, [canAdjust, visibleOffset]);

    useEffect(() => {
        if (draggingIdx === null) return;
        const move = (e: TouchEvent) => {
            if (!svgRef.current) return; e.preventDefault();
            const r = svgRef.current.getBoundingClientRect();
            const nv = vOf(e.touches[0].clientY - r.top);
            const orig = dailyData[draggingIdx].Presupuesto || 0;
            setDragOffsets(p => { const n = [...p]; n[draggingIdx] = Math.max(-orig, nv - orig); return n; });
            setHasDrag(true);
        };
        const end = () => setDraggingIdx(null);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end);
        return () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
    }, [draggingIdx, vOf, dailyData]);

    const resetDrag = () => { setDragOffsets(new Array(dailyData.length).fill(0)); setHasDrag(false); };

    const applyAdjustment = async (motivo: string, metodo: string, valor: number) => {
        if (!motivo.trim()) { setMsg({ ok: false, text: 'Ingrese un motivo' }); return; }
        try {
            setApplying(true); setMsg(null);
            await aplicarAjuste({
                nombrePresupuesto, codAlmacen, mes, canal, tipo: 'Ventas',
                metodoAjuste: metodo, valorAjuste: valor, metodoDistribucion: adjDist, motivo
            });
            setMsg({ ok: true, text: 'Ajuste aplicado' });
            setAdjValue(''); setAdjMotivo('');
            loadData(); refreshAjustes();
        } catch (e: any) { setMsg({ ok: false, text: e.message }); }
        finally { setApplying(false); }
    };

    const applyDrag = async () => {
        const diff = adjTotal - origTotal;
        const pct = origTotal ? parseFloat(((diff / origTotal) * 100).toFixed(2)) : 0;
        if (!await showConfirm({ message: `¿Aplicar ajuste de ${pct >= 0 ? '+' : ''}${pct}% (${fmtFull(diff)}) a ${MESES[mes]}?` })) return;
        await applyAdjustment(adjMotivo || 'Ajuste por curva', 'Porcentaje', pct);
    };

    const applyPanel = async () => {
        const v = parseFloat(adjValue);
        if (isNaN(v)) { setMsg({ ok: false, text: 'Ingrese un valor numérico' }); return; }
        await applyAdjustment(adjMotivo, adjMethod, v);
    };

    const deleteAjuste = async (id: number) => {
        if (!await showConfirm({ message: '¿Desactivar este ajuste?', destructive: true })) return;
        try {
            await desactivarAjuste(id);
            setMsg({ ok: true, text: 'Ajuste desactivado' });
            loadData(); refreshAjustes();
        } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    };

    const storeName = stores.find(s => s.code === codAlmacen)?.name || codAlmacen;

    // Date range label
    const dateRange = useMemo(() => {
        if (!visibleData.length) return '';
        const f = (d: string) => new Date(d).toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
        return `${f(visibleData[0].Fecha)} — ${f(visibleData[visibleData.length - 1].Fecha)}`;
    }, [visibleData]);

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h2 className="text-xl font-bold text-gray-900">Tendencia Diaria</h2>
                <p className="text-sm text-gray-400">
                    {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Configuración</label>
                        <select value={selectedConfigId ?? ''} onChange={e => setSelectedConfigId(parseInt(e.target.value) || null)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {configs.map(c => <option key={c.id} value={c.id}>{c.nombrePresupuesto} ({c.anoModelo})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Mes</label>
                        <select value={mes} onChange={e => setMes(parseInt(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Local</label>
                        <select value={codAlmacen} onChange={e => setCodAlmacen(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {stores.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Canal</label>
                        <select value={canal} onChange={e => setCanal(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Chart Card ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" ref={cRef}>
                {/* Curve toggles + labels */}
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {CURVES.map(c => (
                        <label key={c.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={activeCurves[c.key]} onChange={() => toggleCurve(c.key)}
                                className="w-3.5 h-3.5 rounded" style={{ accentColor: c.color }} />
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                            <span className="text-xs font-medium text-gray-700">{c.label}</span>
                        </label>
                    ))}
                    {hasDrag && (
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span className="text-xs font-medium text-emerald-700">Ajustado</span>
                        </span>
                    )}
                    <span className="text-gray-200 hidden sm:inline">|</span>
                    <span className="text-[10px] text-gray-400 hidden sm:inline">Etiquetar:</span>
                    {CURVES.map(c => (
                        <label key={`lb-${c.key}`} className="hidden sm:flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" checked={labelCurves[c.key]} onChange={() => toggleLabel(c.key)}
                                className="w-3 h-3 rounded accent-gray-400" />
                            <span className="text-[10px] text-gray-500">{c.short}</span>
                        </label>
                    ))}
                </div>

                {/* Event buttons + date range */}
                <div className="px-4 py-2 border-b border-gray-50 flex flex-wrap items-center gap-2 text-xs">
                    <button onClick={() => setShowEventos(!showEventos)}
                        className={`px-3 py-1 rounded-full font-medium border transition-all ${showEventos
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        📅 Ver Eventos
                    </button>
                    <button onClick={() => setShowEventosAjuste(!showEventosAjuste)}
                        className={`px-3 py-1 rounded-full font-medium border transition-all ${showEventosAjuste
                            ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        🌙 Eventos Ajuste
                    </button>
                    <button onClick={() => setShowAjustesTooltip(!showAjustesTooltip)}
                        className={`px-3 py-1 rounded-full font-medium border transition-all ${showAjustesTooltip
                            ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        📐 Ajustes en Tooltip
                    </button>
                    <span className="text-gray-400 ml-auto">{dateRange}</span>
                    {canAdjust && (
                        <span className="text-[10px] text-blue-400 italic hidden sm:inline">↕ Arrastra la curva azul para ajustar</span>
                    )}
                </div>

                {/* SVG Chart */}
                {chartLoading ? (
                    <div className="flex justify-center items-center" style={{ height: H }}>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    </div>
                ) : visibleData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-gray-400" style={{ height: H }}>
                        <span className="text-4xl mb-2 opacity-30">📊</span>
                        <p className="text-sm">Sin datos de presupuesto</p>
                    </div>
                ) : (
                    <svg ref={svgRef} width={W} height={H}
                        onMouseMove={onMove} onMouseLeave={() => { if (draggingIdx === null) setHoverIdx(null); }}
                        className={draggingIdx !== null ? 'cursor-grabbing' : 'cursor-crosshair'}
                        style={{ touchAction: 'none' }}>

                        {/* Weekend bands */}
                        {visibleData.map((d, i) => {
                            const dow = new Date(d.Fecha).getUTCDay();
                            if (dow !== 0 && dow !== 6) return null;
                            const x = xOf(i), hs = pw / Math.max(visibleData.length - 1, 1) / 2;
                            return <rect key={`w${i}`} x={x - hs} y={P.t} width={hs * 2} height={ph} fill="rgba(0,0,0,0.02)" />;
                        })}

                        {/* Grid */}
                        {ticks.map((t, i) => {
                            const y = yOf(t);
                            return (
                                <g key={i}>
                                    <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#f0f0f0" />
                                    <text x={P.l - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{fmt$(t)}</text>
                                </g>
                            );
                        })}

                        {/* Event markers */}
                        {(showEventos || showEventosAjuste) && visibleData.map((d, i) => {
                            const evs = getEvs(d.Fecha);
                            if (!evs.length) return null;
                            const x = xOf(i);
                            const col = evs.some(e => e.usarEnPresupuesto) ? '#f59e0b' : '#ef4444';
                            return (
                                <g key={`ev${i}`}>
                                    <line x1={x} y1={P.t} x2={x} y2={P.t + ph} stroke={col} strokeWidth={1.2} strokeDasharray="4,3" opacity={0.5} />
                                    <circle cx={x} cy={P.t - 6} r={5} fill={col} stroke="white" strokeWidth={1.5} />
                                    <text x={x} y={P.t - 3} textAnchor="middle" fontSize={6} fill="white" fontWeight="bold">
                                        {evs.length > 1 ? evs.length : '!'}
                                    </text>
                                </g>
                            );
                        })}

                        {/* ── Curves (area + line) ── */}
                        {CURVES.map(c => {
                            if (!activeCurves[c.key] || !curvePoints[c.key]) return null;
                            const pts = curvePoints[c.key];
                            return (
                                <g key={c.key}>
                                    <path d={catmullRomArea(pts, P.t + ph)} fill={c.fill} />
                                    <path d={catmullRomPath(pts)} fill="none" stroke={c.color} strokeWidth={2.5}
                                        strokeLinecap="round" strokeLinejoin="round" />
                                </g>
                            );
                        })}

                        {/* Adjusted curve (green, from drag) */}
                        {hasDrag && curvePoints['adjusted'] && (
                            <g>
                                <path d={catmullRomArea(curvePoints['adjusted'], P.t + ph)} fill="rgba(16,185,129,0.08)" />
                                <path d={catmullRomPath(curvePoints['adjusted'])} fill="none" stroke="#10b981" strokeWidth={2.5}
                                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8,4" />
                            </g>
                        )}

                        {/* Labels */}
                        {CURVES.map(c => {
                            if (!activeCurves[c.key] || !labelCurves[c.key] || !curvePoints[c.key]) return null;
                            const pts = curvePoints[c.key];
                            const every = Math.max(Math.floor(visibleData.length / 10), 1);
                            return pts.map((p, i) => {
                                if (i % every !== 0 && i !== pts.length - 1) return null;
                                return (
                                    <text key={`l-${c.key}-${i}`} x={p.x} y={p.y - 8} textAnchor="middle"
                                        fontSize={9} fontWeight="600" fill={c.color}>
                                        {fmt$((visibleData[i] as any)[c.field] || 0)}
                                    </text>
                                );
                            });
                        })}

                        {/* Draggable dots on ppto curve */}
                        {canAdjust && activeCurves.ppto && curvePoints['ppto'] && curvePoints['ppto'].map((p, i) => {
                            const gi = i + visibleOffset;
                            const active = draggingIdx === gi || hoverIdx === i;
                            const hasOff = dragOffsets[gi] !== 0;
                            const cy = hasDrag && curvePoints['adjusted'] ? curvePoints['adjusted'][i].y : p.y;
                            return (
                                <circle key={`d${i}`} cx={p.x} cy={cy}
                                    r={active ? 7 : hasOff ? 5 : 3}
                                    fill={hasOff ? '#10b981' : '#3b82f6'}
                                    stroke="white" strokeWidth={active ? 2.5 : 1.5}
                                    className="cursor-grab"
                                    style={{ filter: active ? 'drop-shadow(0 0 4px rgba(16,185,129,0.6))' : undefined }}
                                    onMouseDown={e => startDrag(e, i)}
                                    onTouchStart={e => startTouch(e, i)} />
                            );
                        })}

                        {/* Hover crosshair + tooltip */}
                        {hoverIdx !== null && hoverIdx < visibleData.length && draggingIdx === null && (() => {
                            const x = xOf(hoverIdx);
                            const d = visibleData[hoverIdx];
                            const evs = getEvs(d.Fecha);
                            const activeDefs = CURVES.filter(c => activeCurves[c.key]);

                            const dateStr = new Date(d.Fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

                            const real = d.RealValor || 0;
                            const ppto = d.Presupuesto || 0;
                            const ajustado = d.AnoAnteriorAjustado || 0;
                            const diff = real - ppto;
                            const diffPct = ppto ? ((diff / ppto) * 100).toFixed(1) : '0';

                            // Per canal ajustes for this month
                            const canalAjustes = showAjustesTooltip ? mesAjustes : [];
                            // Group by canal
                            const canalMap = new Map<string, { pct: number; monto: number; id: string }[]>();
                            for (const a of canalAjustes) {
                                const key = a.canal || 'Todos';
                                if (!canalMap.has(key)) canalMap.set(key, []);
                                const pctVal = a.metodoAjuste === 'Porcentaje' ? a.valorAjuste : 0;
                                const montoVal = a.metodoAjuste === 'MontoAbsoluto' ? a.valorAjuste : (pctVal / 100) * ppto;
                                canalMap.get(key)!.push({ pct: pctVal, monto: montoVal, id: `AJ-${anoModelo}-${String(mes).padStart(2, '0')}-${String(a.id).padStart(4, '0')}` });
                            }

                            // Tooltip sizing
                            const ttW = 380;
                            const ttH = 'auto';
                            const flipX = x + 14 + ttW > W;
                            const tx = flipX ? Math.max(2, x - ttW - 14) : x + 14;
                            const ty = Math.max(2, Math.min(P.t, P.t + ph / 2 - 120));

                            return (
                                <g>
                                    <line x1={x} y1={P.t} x2={x} y2={P.t + ph} stroke="#6b7280" strokeWidth={1} strokeDasharray="4,3" opacity={0.4} />
                                    {activeDefs.map(c => {
                                        const pts = curvePoints[c.key];
                                        return pts ? <circle key={`hc-${c.key}`} cx={x} cy={pts[hoverIdx].y} r={5} fill={c.color} stroke="white" strokeWidth={2} /> : null;
                                    })}
                                    {hasDrag && curvePoints['adjusted'] && (
                                        <circle cx={x} cy={curvePoints['adjusted'][hoverIdx].y} r={5} fill="#10b981" stroke="white" strokeWidth={2} />
                                    )}

                                    {/* Rich HTML tooltip */}
                                    <foreignObject x={tx} y={ty} width={ttW} height={ph} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                                        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid #e5e7eb', padding: 0, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif', maxWidth: ttW, overflow: 'hidden' }}>
                                            {/* Header */}
                                            <div style={{ padding: '10px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                                <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{dateStr}</span>
                                                {canalAjustes.length > 0 && (
                                                    <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid #fde68a' }}>
                                                        {`AJ-${anoModelo}-${String(mes).padStart(2, '0')}-${String(canalAjustes[0].id).padStart(4, '0')}`}
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: 0 }}>
                                                {/* LEFT: Ajuste per canal */}
                                                {showAjustesTooltip && canalMap.size > 0 && (
                                                    <div style={{ flex: 1, padding: '8px 12px', borderRight: '1px solid #f3f4f6' }}>
                                                        <div style={{ fontWeight: 700, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Ajuste</div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                            <tbody>
                                                                {Array.from(canalMap.entries()).map(([canalName, items]) => (
                                                                    items.map((item, ji) => (
                                                                        <tr key={`${canalName}-${ji}`} style={{ borderBottom: '1px solid #f9fafb' }}>
                                                                            <td style={{ padding: '3px 0', color: '#374151', fontWeight: 600, fontSize: 11 }}>{canalName}</td>
                                                                            <td style={{ padding: '3px 4px', textAlign: 'right', color: item.pct >= 0 ? '#059669' : '#dc2626', fontWeight: 700, fontFamily: 'monospace', fontSize: 11 }}>
                                                                                {item.pct > 0 ? '+' : ''}{item.pct.toFixed(1)}%
                                                                            </td>
                                                                            <td style={{ padding: '3px 0', textAlign: 'right', color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>
                                                                                / {fmt$(Math.abs(item.monto))}
                                                                            </td>
                                                                        </tr>
                                                                    ))
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* RIGHT: Sin ajuste values */}
                                                <div style={{ flex: 1, padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                                                        {showAjustesTooltip && canalMap.size > 0 ? 'Sin ajuste' : 'Valores'}
                                                    </div>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                        <tbody>
                                                            {activeDefs.map(c => (
                                                                <tr key={c.key} style={{ borderBottom: '1px solid #f9fafb' }}>
                                                                    <td style={{ padding: '3px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
                                                                        <span style={{ color: '#374151', fontWeight: 500, fontSize: 11 }}>{c.short}</span>
                                                                    </td>
                                                                    <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', fontSize: 11 }}>
                                                                        {fmtFull((d as any)[c.field] || 0)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            {activeCurves.real && activeCurves.ppto && (
                                                                <tr>
                                                                    <td style={{ padding: '4px 0', fontWeight: 600, fontSize: 11, color: '#6b7280' }}>Dif.</td>
                                                                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: diff >= 0 ? '#059669' : '#dc2626' }}>
                                                                        {diff >= 0 ? '+' : ''}{fmtFull(diff)} ({diff >= 0 ? '+' : ''}{diffPct}%)
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Events section */}
                                            {evs.length > 0 && (
                                                <div style={{ background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: 10, color: '#92400e', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>Eventos</div>
                                                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                                                        {evs.map((ev, idx) => (
                                                            <li key={idx} style={{ color: '#78350f', fontSize: 11, lineHeight: 1.4, listStyleType: 'disc' }}>
                                                                <span style={{ fontWeight: 500 }}>
                                                                    {ev.usarEnPresupuesto ? 'Evento año: ' : 'Evento: '}
                                                                </span>
                                                                {ev.evento}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </foreignObject>
                                </g>
                            );
                        })()}

                        {/* Curve labels at right edge */}
                        {visibleData.length > 0 && (() => {
                            const lastX = xOf(visibleData.length - 1);
                            return CURVES.filter(c => activeCurves[c.key] && curvePoints[c.key]).map(c => (
                                <text key={`el-${c.key}`} x={lastX + 8} y={curvePoints[c.key][curvePoints[c.key].length - 1].y + 4}
                                    fontSize={10} fontWeight="bold" fill={c.color}>{c.short}</text>
                            ));
                        })()}
                        {hasDrag && curvePoints['adjusted'] && visibleData.length > 0 && (
                            <text x={xOf(visibleData.length - 1) + 8} y={curvePoints['adjusted'][curvePoints['adjusted'].length - 1].y + 4}
                                fontSize={10} fontWeight="bold" fill="#10b981">Ajust.</text>
                        )}
                    </svg>
                )}

                {/* ── Scroll/Zoom slider ── */}
                {dailyData.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 shrink-0">Zoom</span>
                            <input type="range" min={0} max={0.8} step={0.01}
                                value={zoomStart}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    setZoomStart(Math.min(v, zoomEnd - 0.15));
                                }}
                                className="flex-1 h-1.5 accent-blue-500" />
                            <input type="range" min={0.2} max={1} step={0.01}
                                value={zoomEnd}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    setZoomEnd(Math.max(v, zoomStart + 0.15));
                                }}
                                className="flex-1 h-1.5 accent-blue-500" />
                            <button onClick={() => { setZoomStart(0); setZoomEnd(1); }}
                                className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0">Reset</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Adjustment Panel (collapsible) ── */}
            {canAdjust && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button onClick={() => setAdjPanelOpen(!adjPanelOpen)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            📐 Panel de Ajuste — {storeName} · {MESES[mes]} · {canal}
                        </h3>
                        <span className={`text-gray-400 transition-transform ${adjPanelOpen ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                    {adjPanelOpen && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                            {hasDrag && (
                                <div className="mt-3 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                                    <p className="text-sm text-emerald-800">
                                        <span className="font-bold">Ajuste por curva:</span>{' '}
                                        {fmtFull(origTotal)} → <span className="font-bold">{fmtFull(adjTotal)}</span>
                                        <span className={`ml-2 font-bold ${adjTotal - origTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            ({origTotal ? ((adjTotal - origTotal) / origTotal * 100).toFixed(1) : '0'}%)
                                        </span>
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <input value={adjMotivo} onChange={e => setAdjMotivo(e.target.value)}
                                            className="flex-1 min-w-[160px] px-3 py-1.5 border border-emerald-200 rounded-lg text-sm"
                                            placeholder="Motivo del ajuste..." />
                                        <button onClick={applyDrag} disabled={applying}
                                            className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                                            {applying ? '⏳' : '✅'} Aplicar Curva
                                        </button>
                                        <button onClick={resetDrag}
                                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                                            ↩ Reset
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Método</label>
                                    <select value={adjMethod} onChange={e => setAdjMethod(e.target.value as any)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                        <option value="Porcentaje">Porcentaje (%)</option>
                                        <option value="MontoAbsoluto">Monto Absoluto (₡)</option>
                                        <option value="Factor">Factor (×)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Valor</label>
                                    <input type="number" value={adjValue} onChange={e => setAdjValue(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        placeholder={adjMethod === 'Porcentaje' ? 'ej: 5' : adjMethod === 'Factor' ? 'ej: 1.05' : 'ej: 500000'} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Distribución</label>
                                    <select value={adjDist} onChange={e => setAdjDist(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                        <option value="Mes">Mes completo</option>
                                        <option value="Proporcional">Proporcional</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Motivo</label>
                                    <input value={adjMotivo} onChange={e => setAdjMotivo(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        placeholder="Razón del ajuste..." />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={applyPanel} disabled={applying}
                                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                    {applying ? '⏳ Aplicando...' : '✅ Aplicar Ajuste'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── History Panel (collapsible) ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setHistoryOpen(!historyOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        📋 Historial de Ajustes
                        <span className="text-xs text-gray-400 font-normal bg-gray-100 px-2 py-0.5 rounded-full">{mesAjustes.length}</span>
                    </h3>
                    <span className={`text-gray-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {historyOpen && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                        {mesAjustes.length === 0 ? (
                            <p className="py-4 text-center text-gray-400 text-sm">No hay ajustes activos para {MESES[mes]}</p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {mesAjustes.map((a, idx) => (
                                    <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 hover:bg-gray-100 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="font-bold text-gray-700">Ajuste {idx + 1}</span>
                                                <span className="text-gray-300">·</span>
                                                <span className="text-[10px] text-gray-400 font-mono">
                                                    {new Date(a.fechaAplicacion).toLocaleDateString('es-CR')}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                                                <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 font-medium">{a.canal}</span>
                                                {a.metodoAjuste === 'Porcentaje' ? (
                                                    <span className={`font-mono font-bold ${a.valorAjuste >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {a.valorAjuste > 0 ? '+' : ''}{a.valorAjuste}%
                                                    </span>
                                                ) : (
                                                    <span className={`font-mono font-bold ${a.valorAjuste >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {fmtFull(a.valorAjuste)}
                                                    </span>
                                                )}
                                                {a.motivo && <span className="text-gray-400 italic truncate max-w-[200px]">"{a.motivo}"</span>}
                                                <span className="text-[10px] text-gray-400">por {a.usuario}</span>
                                            </div>
                                        </div>
                                        {canAdjust && (
                                            <button onClick={() => deleteAjuste(a.id)}
                                                className="text-red-400 hover:text-red-600 text-xs hover:bg-red-50 px-2 py-1 rounded shrink-0"
                                                title="Desactivar">🗑️</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Messages */}
            {msg && (
                <div className={`p-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {msg.ok ? '✅' : '❌'} {msg.text}
                </div>
            )}
        </div>
    );
};
