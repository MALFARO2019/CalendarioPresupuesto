// ============================================================
// Vista de Ajuste del Modelo de Presupuesto — Tipos
// ============================================================

import type {
    AjustePresupuesto as AjustePresupuestoBase,
    DatosAjusteDia,
    StoreItem,
    ModeloConfig,
    EventoItem,
    EventosByDate,
} from '../../../api';

// Re-export for convenience
export type { DatosAjusteDia, StoreItem, ModeloConfig, EventoItem, EventosByDate };

// ── Enums / Union types ──

export type AjusteEstado = 'Pendiente' | 'Aplicado' | 'Asociado';
export type AjusteTipo = 'Monto' | 'Porcentaje';
export type RedistribucionTipo = 'TodosLosDias' | 'Semana' | 'MismoDiaSemana';

export const REDISTRIBUCION_LABELS: Record<RedistribucionTipo, string> = {
    TodosLosDias: 'Todos los días',
    Semana: 'Semana',
    MismoDiaSemana: 'Mismo día de semana',
};

export const CANALES = ['Todos', 'Salón', 'Llevar', 'Express', 'ECommerce', 'UberEats'] as const;
export type CanalType = (typeof CANALES)[number];

export const MESES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

// ── Ajuste extendido ──

export interface AjustePresupuesto extends AjustePresupuestoBase {
    estado: AjusteEstado;
    ajustePrincipalId: string | null;
    idFormateado: string;
    comentario: string | null;
    redistribucion: RedistribucionTipo;
}

// ── Series de la gráfica ──

export interface BudgetSeriesPoint {
    dia: number;
    fecha: string;
    real: number;
    presupuesto: number;
    ajustado: number;
    anoAnterior: number;
    anoAnteriorAjustado: number;
    eventos: EventoCurva[];
    eventosAA: EventoCurva[];
    eventosAjuste: EventoCurva[];
}

export interface EventoCurva {
    id: number;
    nombre: string;
    tipo: 'actual' | 'anterior' | 'ajuste';
    esFeriado: boolean;
    color: string;
}

// ── Curvas toggleables ──

export type CurveKey = 'real' | 'presupuesto' | 'ajustado' | 'anoAnterior' | 'anoAnteriorAjust';
export type EventToggleKey = 'eventos' | 'eventosAA' | 'eventosAjuste';

export interface CurveDef {
    key: CurveKey;
    label: string;
    color: string;
    strokeDasharray?: string;
    defaultVisible: boolean;
}

export const CURVE_DEFS: CurveDef[] = [
    { key: 'real', label: 'Real', color: '#22c55e', defaultVisible: false },
    { key: 'presupuesto', label: 'Presupuesto', color: '#3b82f6', defaultVisible: false },
    { key: 'ajustado', label: 'Ajustado', color: '#f59e0b', strokeDasharray: '8 4', defaultVisible: true },
    { key: 'anoAnterior', label: 'Año anterior', color: '#f97316', defaultVisible: false },
    { key: 'anoAnteriorAjust', label: 'Año anterior Ajust.', color: '#a855f7', strokeDasharray: '4 2', defaultVisible: false },
];

export const EVENT_TOGGLE_DEFS: { key: EventToggleKey; label: string; color: string }[] = [
    { key: 'eventos', label: 'Eventos', color: '#6366f1' },
    { key: 'eventosAA', label: 'Eventos AA', color: '#f97316' },
    { key: 'eventosAjuste', label: 'Eventos Ajuste', color: '#ec4899' },
];

// ── Formulario ──

export interface AjusteFormData {
    fecha: string;
    tipoAjuste: AjusteTipo;
    canal: CanalType;
    valor: number;
    redistribucion: RedistribucionTipo;
    comentario: string;
}

// ── Copiar a locales ──

export interface CopiarLocalesData {
    ajusteId: string;
    grupoLocal: string;
    localesSeleccionados: string[];
    aplicarComo: AjusteTipo;
}

export interface GrupoLocal {
    nombre: string;
    locales: StoreItem[];
}

// ── Presupuesto item (para select) ──

export interface PresupuestoItem {
    id: number;
    nombre: string;
    ano: number;
    activo: boolean;
}

// ── Resumen mensual ──

export interface ResumenMes {
    presupuestoBase: number;
    presupuestoAjustado: number;
    deltaNeto: number;
    totalAjustes: number;
    countPendiente: number;
    countAplicado: number;
    countAsociado: number;
}

// ── UI State ──

export interface FiltrosState {
    presupuestoId: number | null;
    nombrePresupuesto: string;
    codAlmacen: string;
    mes: number;
    ano: number;
    canal: CanalType;
}

export type ModalType = 'copiar' | 'aplicar' | null;
