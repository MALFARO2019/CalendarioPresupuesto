// ============================================================
// AjusteGrafica — Recharts chart with per-day drag + distribution
// ============================================================

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useToast } from '../../ui/Toast';
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { CURVE_DEFS, EVENT_TOGGLE_DEFS, REDISTRIBUCION_LABELS } from './types';
import type { CurveKey, EventToggleKey, BudgetSeriesPoint, AjustePresupuesto, RedistribucionTipo } from './types';
import { fmt$, fmtFull, formatFechaCorta, dateKey } from './helpers';
import { fetchCanalTotals, type CanalTotal } from '../../../api';

// ── Helpers ──

const fmtCompact = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `₡${Math.round(v / 1_000)}k`;
    return `₡${Math.round(v)}`;
};

/** Get Monday-based week key for a date (weeks start Monday) */
function getMondayWeekKey(fecha: string): string {
    const dateStr = fecha.substring(0, 10);
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = day === 0 ? -6 : 1 - day; // offset to Monday
    const monday = new Date(d);
    monday.setUTCDate(monday.getUTCDate() + diff);
    return monday.toISOString().substring(0, 10);
}

/** Get day-of-week (0=Mon, 1=Tue, ..., 6=Sun) */
function getDayOfWeekMondayBased(fecha: string): number {
    const dateStr = fecha.substring(0, 10);
    const d = new Date(dateStr + 'T00:00:00Z');
    const jsDay = d.getUTCDay(); // 0=Sun, 1=Mon
    return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, 6=Sun
}

/** Check if a day index should be affected by the distribution */
function isAffectedByDistribution(
    redistribucion: RedistribucionTipo,
    anchorFecha: string,
    targetFecha: string,
): boolean {
    switch (redistribucion) {
        case 'TodosLosDias':
            return true;
        case 'Semana':
            return getMondayWeekKey(anchorFecha) === getMondayWeekKey(targetFecha);
        case 'MismoDiaSemana':
            return getDayOfWeekMondayBased(anchorFecha) === getDayOfWeekMondayBased(targetFecha);
        default:
            return true;
    }
}

// ── Custom Tooltip ──

const CustomTooltip: React.FC<{
    active?: boolean;
    payload?: any[];
    point?: BudgetSeriesPoint;
    visibleCurves: Record<CurveKey, boolean>;
    ajustes: AjustePresupuesto[];
    ano: number;
    mes: number;
    isSelectedDay?: boolean;
    dragPct?: number;
    isAffected?: boolean;
    isAdjusting?: boolean;
}> = ({ active, point, visibleCurves, ajustes, ano, mes, isSelectedDay, dragPct, isAffected, isAdjusting }) => {
    if (!active || !point) return null;

    const dateStr = new Date(point.fecha).toLocaleDateString('es-CR', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });

    const allEvents = [...point.eventos, ...point.eventosAA, ...point.eventosAjuste];
    const diff = point.ajustado - point.presupuesto;
    const diffPct = point.presupuesto ? ((diff / point.presupuesto) * 100).toFixed(1) : '0';

    // Per-canal adjustment breakdown
    const ajustesByCanal: Record<string, { pct: number; monto: number }> = {};
    for (const a of ajustes) {
        const canal = a.canal || 'Todos';
        if (!ajustesByCanal[canal]) ajustesByCanal[canal] = { pct: 0, monto: 0 };
        if (a.metodoAjuste === 'Porcentaje') {
            ajustesByCanal[canal].pct += a.valorAjuste;
            ajustesByCanal[canal].monto += (point.presupuesto * a.valorAjuste) / 100;
        } else {
            ajustesByCanal[canal].monto += a.valorAjuste;
            ajustesByCanal[canal].pct += point.presupuesto ? (a.valorAjuste / point.presupuesto) * 100 : 0;
        }
    }
    const canalKeys = Object.keys(ajustesByCanal);
    const hasAjustes = canalKeys.length > 0;

    return (
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-w-[420px] text-xs" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* Header */}
            <div className={`px-3 py-2 border-b flex items-center justify-between ${isSelectedDay ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                <div className="flex items-center gap-2">
                    {isSelectedDay && <span className="text-blue-600">📌</span>}
                    <span className="font-bold text-sm text-gray-800">{dateStr}</span>
                </div>
                {ajustes.length > 0 && (
                    <div className="flex items-center gap-1">
                        {ajustes.map(a => (
                            <span key={a.id} className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200">
                                {a.idFormateado || `AJ-${a.id}`}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex divide-x divide-gray-100">
                {/* Ajuste per-canal panel */}
                {hasAjustes && (
                    <div className="flex-1 px-3 py-2 min-w-[140px]">
                        <p className="font-bold text-[10px] text-gray-400 uppercase tracking-wide mb-1">Ajuste por canal</p>
                        {canalKeys.map(canal => {
                            const info = ajustesByCanal[canal];
                            return (
                                <div key={canal} className="flex items-center justify-between py-0.5">
                                    <span className="text-gray-700 font-medium">{canal}</span>
                                    <span className={`font-bold font-mono ${info.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {info.pct >= 0 ? '+' : ''}{info.pct.toFixed(1)}% / {fmtCompact(info.monto)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Values panel */}
                <div className="flex-1 px-3 py-2 min-w-[150px]">
                    <p className="font-bold text-[10px] text-gray-400 uppercase tracking-wide mb-1">Valores</p>
                    {CURVE_DEFS.filter(c => visibleCurves[c.key]).map(c => {
                        const val = (point as any)[c.key];
                        return (
                            <div key={c.key} className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                                    <span className="text-gray-600">{c.label}</span>
                                </div>
                                <span className="font-bold font-mono text-gray-800">
                                    {val != null && val !== 0 ? fmtFull(val) : 'Sin dato'}
                                </span>
                            </div>
                        );
                    })}
                    {visibleCurves.presupuesto && (
                        <div className="flex items-center justify-between pt-1 mt-1 border-t border-gray-100">
                            <span className="text-gray-500 font-medium">Dif.</span>
                            <span className={`font-bold font-mono ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{fmtCompact(diff)} ({diff >= 0 ? '+' : ''}{diffPct}%)
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Events */}
            {allEvents.length > 0 && (
                <div className="px-3 py-2 bg-amber-50 border-t border-amber-200">
                    <p className="font-bold text-[10px] text-amber-700 uppercase tracking-wide mb-1">Eventos</p>
                    {allEvents.map((ev, i) => (
                        <div key={i} className="flex items-start gap-1.5 py-0.5">
                            <span className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ background: ev.color }} />
                            <span className="text-amber-900 text-[11px]">{ev.nombre}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Adjustment % indicator when in adjust mode */}
            {isAdjusting && (
                <div className={`px-3 py-1.5 border-t text-[11px] font-bold text-center ${!isAffected
                    ? 'bg-gray-50 border-gray-200 text-gray-400'
                    : dragPct === 0
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : dragPct >= 0
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    {!isAffected
                        ? '⊘ Sin ajuste (fuera del rango de distribución)'
                        : dragPct === 0
                            ? '● Este día será afectado por el ajuste'
                            : `${dragPct >= 0 ? '▲' : '▼'} ${dragPct >= 0 ? '+' : ''}${dragPct.toFixed(1)}% aplicado`
                    }
                </div>
            )}
        </div>
    );
};


// ── Main Chart Component ──

export const AjusteGrafica: React.FC = () => {
    const { showConfirm } = useToast();
    const { seriesData, ajustes, visibleCurves, visibleEvents, filtros, chartLoading, canAdjust } = useAjusteStore(
        useShallow(s => ({
            seriesData: s.seriesData,
            ajustes: s.ajustes,
            visibleCurves: s.visibleCurves,
            visibleEvents: s.visibleEvents,
            filtros: s.filtros,
            chartLoading: s.chartLoading,
            canAdjust: s.canAdjust,
        }))
    );
    const toggleCurve = useAjusteStore(s => s.toggleCurve);
    const toggleEvent = useAjusteStore(s => s.toggleEvent);
    const openCreateForm = useAjusteStore(s => s.openCreateForm);
    const saveAjuste = useAjusteStore(s => s.saveAjuste);
    const setChartState = useAjusteStore(s => s.setChartState);

    // ── Drag state ──
    const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null); // which day is the anchor
    const [dragPct, setDragPct] = useState(0); // percentage change from anchor
    const [redistribucion, setRedistribucion] = useState<RedistribucionTipo>('TodosLosDias');
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const chartContainerRef = useRef<HTMLDivElement>(null);

    const selectedPoint = selectedDayIdx !== null ? seriesData[selectedDayIdx] : null;

    // Sync chart state to store for the read-only form card
    useEffect(() => {
        setChartState(dragPct, redistribucion, selectedPoint?.fecha || null);
    }, [dragPct, redistribucion, selectedPoint, setChartState]);

    // ── Per-canal totals (fetched once when entering adjust mode) ──
    const [canalTotals, setCanalTotals] = useState<CanalTotal[]>([]);
    useEffect(() => {
        if (selectedDayIdx !== null) {
            fetchCanalTotals(filtros.nombrePresupuesto, filtros.codAlmacen, filtros.mes, filtros.ano)
                .then(data => setCanalTotals(data))
                .catch(() => setCanalTotals([]));
        } else {
            setCanalTotals([]);
        }
    }, [selectedDayIdx, filtros.nombrePresupuesto, filtros.codAlmacen, filtros.mes, filtros.ano]);

    // Get events for reference lines
    const eventLines = useMemo(() => {
        const lines: { fecha: string; color: string; label: string }[] = [];
        for (const point of seriesData) {
            if (visibleEvents.eventos) {
                point.eventos.forEach(ev => lines.push({ fecha: point.fecha, color: ev.color, label: ev.nombre }));
            }
            if (visibleEvents.eventosAA) {
                point.eventosAA.forEach(ev => lines.push({ fecha: point.fecha, color: ev.color, label: ev.nombre }));
            }
            if (visibleEvents.eventosAjuste) {
                point.eventosAjuste.forEach(ev => lines.push({ fecha: point.fecha, color: ev.color, label: ev.nombre }));
            }
        }
        return lines;
    }, [seriesData, visibleEvents]);

    // ── Build adjusted chart data with distribution ──
    const chartData = useMemo(() => {
        return seriesData.map((p, i) => {
            let adjustedValue = p.presupuesto;
            let affected = false;

            if (selectedDayIdx !== null && dragPct !== 0) {
                const anchorFecha = seriesData[selectedDayIdx].fecha;
                affected = isAffectedByDistribution(redistribucion, anchorFecha, p.fecha);

                if (affected) {
                    adjustedValue = p.presupuesto * (1 + dragPct / 100);
                }
            } else if (selectedDayIdx !== null) {
                // Drag is 0 but we're in adjust mode — mark affected for visual
                const anchorFecha = seriesData[selectedDayIdx].fecha;
                affected = isAffectedByDistribution(redistribucion, anchorFecha, p.fecha);
            }

            return {
                ...p,
                ajustado: adjustedValue,
                affected,
                label: formatFechaCorta(p.fecha),
                name: String(p.dia).padStart(2, '0'),
            };
        });
    }, [seriesData, selectedDayIdx, dragPct, redistribucion]);

    // Total for affected days only
    const affectedTotals = useMemo(() => {
        if (selectedDayIdx === null) return { original: 0, adjusted: 0, count: 0 };
        const anchorFecha = seriesData[selectedDayIdx].fecha;
        let original = 0, adjusted = 0, count = 0;
        for (const p of seriesData) {
            if (isAffectedByDistribution(redistribucion, anchorFecha, p.fecha)) {
                original += p.presupuesto;
                adjusted += p.presupuesto * (1 + dragPct / 100);
                count++;
            }
        }
        return { original, adjusted, count };
    }, [seriesData, selectedDayIdx, dragPct, redistribucion]);

    // ── Drag handlers (overlay-based) ──
    const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        dragStartY.current = e.clientY;
    }, []);

    const handleOverlayTouchStart = useCallback((e: React.TouchEvent) => {
        setIsDragging(true);
        dragStartY.current = e.touches[0].clientY;
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (clientY: number) => {
            const deltaY = dragStartY.current - clientY; // up = positive
            const chartHeight = chartContainerRef.current?.clientHeight || 380;
            const pct = parseFloat(((deltaY / chartHeight) * 50).toFixed(1)); // ±25%
            setDragPct(pct);
        };

        const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
        const onTouchMove = (e: TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientY); };
        const onEnd = () => setIsDragging(false);

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onEnd);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, [isDragging]);

    // ── Actions ──
    const handleChartClick = useCallback((data: any) => {
        // If already in adjust mode, ignore chart clicks
        if (selectedDayIdx !== null) return;

        const fecha = data?.activePayload?.[0]?.payload?.fecha;
        if (!fecha) return;

        // Find index of this day in seriesData
        const idx = seriesData.findIndex(p => p.fecha === fecha);
        if (idx < 0) return;

        if (canAdjust) {
            // Enter adjust mode for this day
            setSelectedDayIdx(idx);
            setDragPct(0);
        } else {
            openCreateForm(dateKey(fecha));
        }
    }, [seriesData, selectedDayIdx, canAdjust, openCreateForm]);

    const handleApply = useCallback(async () => {
        if (dragPct === 0 || selectedDayIdx === null) {
            setSelectedDayIdx(null);
            setDragPct(0);
            return;
        }

        const selectedDate = seriesData[selectedDayIdx].fecha;
        const dateFmt = dateKey(selectedDate);
        const label = redistribucion === 'TodosLosDias' ? 'mes' :
            redistribucion === 'Semana' ? 'semana' : 'día de semana';

        const confirmed = await showConfirm({
            message: `¿Aplicar ajuste de ${dragPct >= 0 ? '+' : ''}${dragPct.toFixed(1)}% ` +
                `(${fmtCompact(affectedTotals.adjusted - affectedTotals.original)}) ` +
                `a ${affectedTotals.count} días (${label})?`
        });

        if (confirmed) {
            const comentario = useAjusteStore.getState().formComentario;
            await saveAjuste({
                fecha: dateFmt,
                tipoAjuste: 'Porcentaje',
                canal: filtros.canal as any,
                valor: dragPct,
                redistribucion,
                comentario: comentario || `Ajuste por curva desde día ${new Date(selectedDate).getUTCDate()}`,
            });
        }

        setSelectedDayIdx(null);
        setDragPct(0);
    }, [dragPct, selectedDayIdx, redistribucion, affectedTotals, seriesData, saveAjuste, filtros.canal]);

    const handleCancel = useCallback(() => {
        setSelectedDayIdx(null);
        setDragPct(0);
        setIsDragging(false);
    }, []);

    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setDragPct(parseFloat(e.target.value));
    }, []);

    // Get ajustes for tooltip
    const getAjustesForDate = useCallback((fecha: string) => {
        const dk = dateKey(fecha);
        return ajustes.filter(a => a.fechaAplicacion?.substring(0, 10) === dk);
    }, [ajustes]);

    // Day-of-week label for the selected day
    const DOW_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const selectedDOW = selectedPoint ? DOW_NAMES[getDayOfWeekMondayBased(selectedPoint.fecha)] : '';

    if (chartLoading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-center items-center h-96">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                </div>
            </div>
        );
    }

    if (seriesData.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex flex-col items-center justify-center h-72 text-gray-400">
                    <span className="text-5xl mb-3 opacity-30">📊</span>
                    <p className="text-sm font-medium">Sin datos de presupuesto para este período</p>
                    <p className="text-xs text-gray-300 mt-1">Seleccione otro mes, local o canal</p>
                </div>
            </div>
        );
    }

    const isAdjusting = selectedDayIdx !== null;
    const hasDragChange = dragPct !== 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Title + toggles */}
            <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm">Tendencia diaria</h3>
                        <p className="text-[10px] text-gray-400">
                            {isAdjusting
                                ? `Ajustando desde día ${selectedPoint!.dia} (${selectedDOW})`
                                : 'Haz clic en un punto para ajustar'}
                        </p>
                    </div>
                    {isAdjusting && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-bold font-mono ${dragPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {dragPct >= 0 ? '+' : ''}{dragPct.toFixed(1)}%
                                <span className="text-xs font-normal text-gray-500 ml-1">
                                    ({fmtCompact(affectedTotals.adjusted - affectedTotals.original)})
                                </span>
                            </span>
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                ✕ Cancelar
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={!hasDragChange}
                                className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
                            >
                                ✓ Aplicar
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {CURVE_DEFS.map(c => (
                        <label key={c.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={visibleCurves[c.key]} onChange={() => toggleCurve(c.key)}
                                className="w-3.5 h-3.5 rounded" style={{ accentColor: c.color }} />
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                            <span className="text-xs font-medium text-gray-700">{c.label}</span>
                        </label>
                    ))}
                    <span className="text-gray-200 hidden sm:inline">|</span>
                    {EVENT_TOGGLE_DEFS.map(e => (
                        <label key={e.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={visibleEvents[e.key]} onChange={() => toggleEvent(e.key)}
                                className="w-3.5 h-3.5 rounded" style={{ accentColor: e.color }} />
                            <span className="text-xs font-medium text-gray-600">{e.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div
                ref={chartContainerRef}
                className="px-2 pt-2 pb-0 relative"
                style={{ height: 380, cursor: isAdjusting ? (isDragging ? 'ns-resize' : 'grab') : undefined }}
                onMouseDown={isAdjusting ? handleOverlayMouseDown : undefined}
                onTouchStart={isAdjusting ? handleOverlayTouchStart : undefined}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={chartData}
                        onClick={handleChartClick}
                        margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} interval={0} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => fmt$(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} width={65} />

                        {!isAdjusting && (
                            <Tooltip
                                content={({ active, payload }) => {
                                    const point = payload?.[0]?.payload as BudgetSeriesPoint | undefined;
                                    if (!point) return null;
                                    return (
                                        <CustomTooltip
                                            active={active}
                                            point={point}
                                            visibleCurves={visibleCurves}
                                            ajustes={getAjustesForDate(point.fecha)}
                                            ano={filtros.ano}
                                            mes={filtros.mes}
                                        />
                                    );
                                }}
                                cursor={{ stroke: '#d1d5db', strokeWidth: 1, strokeDasharray: '4 3' }}
                            />
                        )}

                        {/* Tooltip during adjustment mode — shows drag % */}
                        {isAdjusting && (
                            <Tooltip
                                content={({ active, payload }) => {
                                    const point = payload?.[0]?.payload as (BudgetSeriesPoint & { affected?: boolean }) | undefined;
                                    if (!point) return null;
                                    const isSelected = selectedDayIdx !== null && seriesData[selectedDayIdx]?.fecha === point.fecha;
                                    return (
                                        <CustomTooltip
                                            active={active}
                                            point={point}
                                            visibleCurves={visibleCurves}
                                            ajustes={getAjustesForDate(point.fecha)}
                                            ano={filtros.ano}
                                            mes={filtros.mes}
                                            isSelectedDay={isSelected}
                                            dragPct={dragPct}
                                            isAffected={point.affected}
                                            isAdjusting={true}
                                        />
                                    );
                                }}
                                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 3' }}
                            />
                        )}

                        {/* Event reference lines */}
                        {eventLines.map((ev, i) => (
                            <ReferenceLine
                                key={`ev-${i}`}
                                x={String(new Date(ev.fecha).getUTCDate()).padStart(2, '0')}
                                stroke={ev.color}
                                strokeDasharray="4 3"
                                strokeWidth={1.2}
                                label={{ value: ev.label.length > 12 ? ev.label.substring(0, 12) + '…' : ev.label, position: 'top', fill: ev.color, fontSize: 9, fontWeight: 600 }}
                            />
                        ))}

                        {/* Selected day reference */}
                        {isAdjusting && (
                            <ReferenceLine
                                x={String(selectedPoint!.dia).padStart(2, '0')}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                label={{ value: `Día ${selectedPoint!.dia}`, position: 'top', fill: '#3b82f6', fontSize: 10, fontWeight: 700 }}
                            />
                        )}

                        {/* Curves */}
                        {visibleCurves.real && <Area type="monotone" dataKey="real" fill="rgba(34,197,94,0.06)" stroke="none" />}
                        {visibleCurves.real && <Line type="monotone" dataKey="real" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} name="Real" />}
                        {visibleCurves.presupuesto && <Area type="monotone" dataKey="presupuesto" fill="rgba(59,130,246,0.05)" stroke="none" />}
                        {visibleCurves.presupuesto && (
                            <Line
                                type="monotone" dataKey="presupuesto" stroke="#3b82f6" strokeWidth={2.5}
                                dot={!isAdjusting ? false : { r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 1 }}
                                activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff', cursor: canAdjust ? 'pointer' : 'default' }}
                                name="Presupuesto"
                            />
                        )}
                        {visibleCurves.ajustado && <Area type="monotone" dataKey="ajustado" fill="rgba(245,158,11,0.05)" stroke="none" />}
                        {visibleCurves.ajustado && (
                            <Line
                                type="monotone" dataKey="ajustado" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="8 4"
                                dot={(props: any) => {
                                    const { cx, cy, payload, index } = props;
                                    if (!isAdjusting) return <circle key={`dot-empty-${index}`} cx={cx} cy={cy} r={0} />;
                                    if (!payload?.affected) {
                                        // Non-affected day: show a small gray dot
                                        return <circle key={`dot-gray-${index}`} cx={cx} cy={cy} r={3} fill="#d1d5db" stroke="#fff" strokeWidth={1} />;
                                    }
                                    // Affected day: render a prominent triangle marker
                                    const size = 8;
                                    const triangleColor = dragPct >= 0 ? '#10b981' : '#ef4444';
                                    return (
                                        <g key={`marker-g-${index}`}>
                                            {/* Base circle */}
                                            <circle cx={cx} cy={cy} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
                                            {/* Triangle above the point */}
                                            <polygon
                                                points={`${cx},${cy - size - 6} ${cx - size},${cy - 6 + size * 0.7} ${cx + size},${cy - 6 + size * 0.7}`}
                                                fill={triangleColor}
                                                stroke="#fff"
                                                strokeWidth={2}
                                                strokeLinejoin="round"
                                            />
                                        </g>
                                    );
                                }}
                                activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2, fill: '#fff' }}
                                name="Ajustado"
                            />
                        )}
                        {visibleCurves.anoAnterior && <Line type="monotone" dataKey="anoAnterior" stroke="#f97316" strokeWidth={1.8} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} name="Año anterior" />}
                        {visibleCurves.anoAnteriorAjust && <Line type="monotone" dataKey="anoAnteriorAjustado" stroke="#a855f7" strokeWidth={1.8} strokeDasharray="4 2" dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} name="Año ant. Ajust." />}
                    </ComposedChart>
                </ResponsiveContainer>

                {/* Drag instruction — pointer-events-none so tooltip still works */}
                {isAdjusting && !isDragging && dragPct === 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                        <div className="bg-blue-600/80 text-white px-5 py-2.5 rounded-2xl shadow-xl text-sm font-bold backdrop-blur-sm">
                            ↕ Arrastra arriba/abajo para ajustar — o usa el slider
                        </div>
                    </div>
                )}

                {/* Live drag badge */}
                {isDragging && (
                    <div className="absolute top-3 right-3 z-20 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl text-sm font-bold">
                        {dragPct >= 0 ? '+' : ''}{dragPct.toFixed(1)}% · {fmtCompact(affectedTotals.adjusted - affectedTotals.original)}
                    </div>
                )}
            </div>

            {/* Adjust panel: slider + distribution selector */}
            {isAdjusting && (
                <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
                    {/* Distribution selector */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="text-xs font-bold text-blue-800">Distribuir en:</span>
                        {(['TodosLosDias', 'Semana', 'MismoDiaSemana'] as RedistribucionTipo[]).map(r => (
                            <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                    type="radio"
                                    name="redistribucion"
                                    checked={redistribucion === r}
                                    onChange={() => setRedistribucion(r)}
                                    className="w-3.5 h-3.5 accent-blue-600"
                                />
                                <span className={`text-xs font-medium ${redistribucion === r ? 'text-blue-800' : 'text-gray-600'}`}>
                                    {REDISTRIBUCION_LABELS[r]}
                                    {r === 'MismoDiaSemana' && redistribucion === r && selectedPoint && (
                                        <span className="text-blue-500 ml-1">({selectedDOW}s)</span>
                                    )}
                                    {r === 'Semana' && redistribucion === r && selectedPoint && (
                                        <span className="text-blue-500 ml-1">(Lun-Dom)</span>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>

                    {/* Slider */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-blue-700 whitespace-nowrap">-25%</span>
                        <input
                            type="range" min="-25" max="25" step="0.5" value={dragPct}
                            onChange={handleSliderChange}
                            className="flex-1 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="text-xs font-medium text-blue-700 whitespace-nowrap">+25%</span>
                        <span className={`text-sm font-bold font-mono min-w-[70px] text-center ${dragPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {dragPct >= 0 ? '+' : ''}{dragPct.toFixed(1)}%
                        </span>
                    </div>

                    {/* Summary */}
                    <div className="flex items-center justify-between mt-2 text-xs text-blue-700">
                        <span>
                            {affectedTotals.count} días afectados: {fmtFull(affectedTotals.original)} → {fmtFull(affectedTotals.adjusted)}
                            <span className={`ml-1 font-bold ${dragPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                ({dragPct >= 0 ? '+' : ''}{fmtCompact(affectedTotals.adjusted - affectedTotals.original)})
                            </span>
                        </span>
                        <button onClick={() => setDragPct(0)} className="px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800 transition-colors">
                            Resetear 0%
                        </button>
                    </div>

                    {/* Per-canal breakdown — always show all canals + Todos */}
                    <div className="mt-2 pt-2 border-t border-blue-200">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Distribución por canal</p>
                        {canalTotals.length > 0 ? (
                            <div className="space-y-0.5">
                                {canalTotals.map(ct => {
                                    const base = Number(ct.Total) || 0;
                                    const adjusted = base * (1 + dragPct / 100);
                                    const delta = adjusted - base;
                                    const isActive = filtros.canal === ct.Canal;
                                    return (
                                        <div key={ct.Canal} className={`flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded ${isActive ? 'bg-red-50 border border-red-200' : ''
                                            }`}>
                                            <span className={`font-medium ${isActive ? 'text-red-700 font-bold' : 'text-blue-800'}`}>
                                                {isActive && '▸ '}{ct.Canal}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono ${isActive ? 'text-red-500' : 'text-blue-600'}`}>{fmtCompact(base)}</span>
                                                <span className="text-gray-400">→</span>
                                                <span className={`font-mono font-bold ${isActive ? 'text-red-700' : 'text-blue-800'}`}>{fmtCompact(adjusted)}</span>
                                                <span className={`font-bold font-mono min-w-[55px] text-right ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {delta >= 0 ? '+' : ''}{fmtCompact(delta)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* Todos total row */}
                                {(() => {
                                    const totalBase = canalTotals.reduce((s, ct) => s + (Number(ct.Total) || 0), 0);
                                    const totalAdj = totalBase * (1 + dragPct / 100);
                                    const totalDelta = totalAdj - totalBase;
                                    const isTodos = filtros.canal === 'Todos';
                                    return (
                                        <div className={`flex items-center justify-between text-[11px] px-1.5 py-1 rounded mt-1 border-t border-blue-200 pt-1 ${isTodos ? 'bg-red-50 border border-red-200' : ''
                                            }`}>
                                            <span className={`font-bold ${isTodos ? 'text-red-700' : 'text-blue-900'}`}>
                                                {isTodos && '▸ '}Todos
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono font-bold ${isTodos ? 'text-red-500' : 'text-blue-700'}`}>{fmtCompact(totalBase)}</span>
                                                <span className="text-gray-400">→</span>
                                                <span className={`font-mono font-bold ${isTodos ? 'text-red-700' : 'text-blue-900'}`}>{fmtCompact(totalAdj)}</span>
                                                <span className={`font-bold font-mono min-w-[55px] text-right ${totalDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {totalDelta >= 0 ? '+' : ''}{fmtCompact(totalDelta)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="text-[11px] text-blue-800 font-medium">
                                Cargando desglose por canal…
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom hint */}
            {!isAdjusting && (
                <div className="px-4 py-2 border-t border-gray-100 text-center">
                    <p className="text-[10px] text-gray-400">
                        {canAdjust
                            ? 'Haz clic en un punto de la gráfica para ajustar desde ese día'
                            : 'Haz clic en un punto del gráfico para ver detalles'}
                    </p>
                </div>
            )}
        </div>
    );
};
