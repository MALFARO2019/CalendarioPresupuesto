// ============================================================
// Vista de Ajuste — Helpers y utilidades
// ============================================================

import type { AjusteEstado, AjustePresupuesto, BudgetSeriesPoint, DatosAjusteDia, EventosByDate, EventoCurva } from './types';

// ── Formateo de montos ──

export function fmt$(v: number): string {
    if (Math.abs(v) >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `₡${(v / 1_000).toFixed(0)}K`;
    return `₡${Math.round(v).toLocaleString('es-CR')}`;
}

export function fmtFull(v: number): string {
    return `₡${Math.round(v).toLocaleString('es-CR')}`;
}

export function fmtPct(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
}

export function fmtDelta(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${fmtFull(v)}`;
}

// ── ID formateado ──

export function formatAjusteId(ano: number, mes: number, id: number): string {
    return `AJ-${ano}-${String(mes).padStart(2, '0')}-${String(id).padStart(4, '0')}`;
}

// ── Fecha helpers ──

export function dateKey(d: string | Date): string {
    if (d instanceof Date) return d.toISOString().substring(0, 10);
    return typeof d === 'string' ? d.substring(0, 10) : String(d).substring(0, 10);
}

/** Normalize a fecha value (could be Date object or string from SQL) to ISO string */
export function normalizeFecha(d: any): string {
    if (d instanceof Date) return d.toISOString();
    if (typeof d === 'string') return d;
    return String(d);
}

export function formatFecha(d: string): string {
    return new Date(d).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

export function formatFechaCorta(d: string | Date): string {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
    });
}

export function esDiaPasado(fecha: string): boolean {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const dia = new Date(fecha);
    dia.setHours(0, 0, 0, 0);
    return dia < hoy;
}

export function getDiasDelMes(ano: number, mes: number): number {
    return new Date(ano, mes, 0).getDate();
}

// ── Color por estado ──

export function getEstadoColor(estado: AjusteEstado): { bg: string; text: string; border: string } {
    switch (estado) {
        case 'Aplicado':
            return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
        case 'Pendiente':
            return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
        case 'Asociado':
            return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
        case 'Rechazado':
            return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
        default:
            return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
    }
}

// ── Badge por estado ──

export function getEstadoBadgeClass(estado: AjusteEstado): string {
    const c = getEstadoColor(estado);
    return `${c.bg} ${c.text} ${c.border} border`;
}

// ── Transformar datos de API a series de gráfica ──

export function buildSeriesData(
    dailyData: DatosAjusteDia[],
    ajustes: AjustePresupuesto[],
    eventosActual: EventosByDate,
    eventosAA: EventosByDate,
    eventosAjuste: EventosByDate,
): BudgetSeriesPoint[] {
    // Calculate adjusted values: base presupuesto + sum of active adjustments
    // For now, adjusted = presupuesto (adjustments modify on backend)
    return dailyData.map(d => {
        const dk = dateKey(d.Fecha);

        const mapEventos = (evs: EventosByDate, tipo: 'actual' | 'anterior' | 'ajuste'): EventoCurva[] => {
            const items = evs[dk];
            if (!items) return [];
            return items.map(e => ({
                id: e.id,
                nombre: e.evento,
                tipo,
                esFeriado: e.esFeriado,
                color: tipo === 'actual' ? '#6366f1' : tipo === 'anterior' ? '#f97316' : '#ec4899',
            }));
        };

        // Force numeric conversion — SQL Server money/decimal types may arrive as strings
        const real = Number(d.RealValor) || 0;
        const presupuesto = Number(d.Presupuesto) || 0;
        const anoAnterior = Number(d.AnoAnterior) || 0;
        const anoAnteriorAjustado = Number(d.AnoAnteriorAjustado) || 0;

        return {
            dia: d.Dia,
            fecha: normalizeFecha(d.Fecha),
            real,
            presupuesto,
            ajustado: presupuesto, // Backend already applies adjustments to the data
            anoAnterior,
            anoAnteriorAjustado,
            eventos: mapEventos(eventosActual, 'actual'),
            eventosAA: mapEventos(eventosAA, 'anterior'),
            eventosAjuste: mapEventos(eventosAjuste, 'ajuste'),
        };
    });
}

// ── Cálculo de resumen ──

export function calcResumen(
    seriesData: BudgetSeriesPoint[],
    ajustes: AjustePresupuesto[],
): { presupuestoBase: number; presupuestoAjustado: number; deltaNeto: number; totalAjustes: number; countPendiente: number; countAplicado: number; countAsociado: number } {
    const presupuestoBase = seriesData.reduce((s, p) => s + p.presupuesto, 0);
    const presupuestoAjustado = seriesData.reduce((s, p) => s + p.ajustado, 0);
    const deltaNeto = presupuestoAjustado - presupuestoBase;

    const countPendiente = ajustes.filter(a => a.estado === 'Pendiente').length;
    const countAplicado = ajustes.filter(a => a.estado === 'Aplicado').length;
    const countAsociado = ajustes.filter(a => a.estado === 'Asociado').length;

    return {
        presupuestoBase,
        presupuestoAjustado,
        deltaNeto,
        totalAjustes: ajustes.length,
        countPendiente,
        countAplicado,
        countAsociado,
    };
}

// ── Redistribución proporcional canal "Todos" ──

export function redistribuirPorCanal(
    valorTotal: number,
    canalTotales: Record<string, number>,
): Record<string, number> {
    const total = Object.values(canalTotales).reduce((s, v) => s + v, 0);
    if (total === 0) return {};

    const result: Record<string, number> = {};
    for (const [canal, val] of Object.entries(canalTotales)) {
        result[canal] = (val / total) * valorTotal;
    }
    return result;
}

// ── Validaciones ──

export function validarAjusteForm(data: {
    fecha: string;
    valor: number;
    comentario: string;
}): string[] {
    const errors: string[] = [];

    if (!data.fecha) errors.push('La fecha es requerida');
    if (isNaN(data.valor) || data.valor === 0) errors.push('El valor debe ser un número distinto de cero');
    if (!data.comentario.trim()) errors.push('El comentario/motivo es requerido');

    return errors;
}
