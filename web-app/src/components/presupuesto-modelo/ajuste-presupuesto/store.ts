// ============================================================
// Vista de Ajuste — Zustand Store
// ============================================================

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
    AjustePresupuesto,
    BudgetSeriesPoint,
    CurveKey,
    EventToggleKey,
    FiltrosState,
    ModalType,
    AjusteFormData,
    CopiarLocalesData,
    StoreItem,
    GrupoLocal,
    PresupuestoItem,
    EventosByDate,
} from './types';
import { CURVE_DEFS } from './types';
import { buildSeriesData, calcResumen } from './helpers';
import * as services from './services';

// ── Store interface ──

interface AjusteStoreState {
    // Auth
    isAdmin: boolean;
    canAdjust: boolean;
    canApprove: boolean;

    // Data lists
    presupuestos: PresupuestoItem[];
    locales: StoreItem[];
    gruposLocales: GrupoLocal[];

    // Filters
    filtros: FiltrosState;

    // Data
    seriesData: BudgetSeriesPoint[];
    ajustesAno: AjustePresupuesto[];
    ajustes: AjustePresupuesto[];

    // Events (raw, for building series)
    eventosActual: EventosByDate;
    eventosAA: EventosByDate;
    eventosAjuste: EventosByDate;

    // UI
    loading: boolean;
    chartLoading: boolean;
    error: string | null;
    message: { ok: boolean; text: string } | null;

    // Curve visibility
    visibleCurves: Record<CurveKey, boolean>;
    visibleEvents: Record<EventToggleKey, boolean>;

    // Selection & modals
    selectedAjusteId: number | null;
    formMode: 'crear' | 'editar' | null;
    formData: AjusteFormData | null;
    formDate: string | null; // When clicking a chart point
    activeModal: ModalType;
    pendingChanges: boolean;

    // Chart adjustment state (shared with form card)
    chartDragPct: number;
    chartRedistribucion: import('./types').RedistribucionTipo;
    chartSelectedDate: string | null;
    formComentario: string;

    // Actions
    init: () => Promise<void>;
    setFiltro: <K extends keyof FiltrosState>(key: K, value: FiltrosState[K]) => void;
    loadChartData: () => Promise<void>;
    refreshAjustes: () => Promise<void>;
    toggleCurve: (key: CurveKey) => void;
    toggleEvent: (key: EventToggleKey) => void;

    // Ajuste CRUD
    selectAjuste: (id: number | null) => void;
    openCreateForm: (fecha?: string) => void;
    openEditForm: (ajuste: AjustePresupuesto) => void;
    closeForm: () => void;
    setChartState: (dragPct: number, redistribucion: import('./types').RedistribucionTipo, selectedDate: string | null) => void;
    setFormComentario: (c: string) => void;
    saveAjuste: (data: AjusteFormData) => Promise<void>;
    deleteAjuste: (id: number) => Promise<void>;
    disassociateAjuste: (id: number) => Promise<void>;
    aprobarRechazarAjuste: (id: number, estado: 'Aprobado' | 'Rechazado', motivoRechazo?: string) => Promise<void>;

    // Bulk actions
    openModal: (modal: ModalType) => void;
    closeModal: () => void;
    applyAllAjustes: (tablaDestino: string) => Promise<void>;
    copyToLocales: (data: CopiarLocalesData) => Promise<void>;

    setMessage: (msg: { ok: boolean; text: string } | null) => void;
    clearError: () => void;
}

export const useAjusteStore = create<AjusteStoreState>((set, get) => ({
    // Initial state
    isAdmin: false,
    canAdjust: false,
    canApprove: false,
    presupuestos: [],
    locales: [],
    gruposLocales: [],
    filtros: {
        presupuestoId: null,
        nombrePresupuesto: '',
        codAlmacen: '',
        mes: new Date().getMonth() + 1,
        ano: new Date().getFullYear(),
        canal: 'Todos',
    },
    seriesData: [],
    ajustesAno: [],
    ajustes: [],
    eventosActual: {},
    eventosAA: {},
    eventosAjuste: {},
    loading: true,
    chartLoading: false,
    error: null,
    message: null,
    visibleCurves: Object.fromEntries(CURVE_DEFS.map(c => [c.key, c.defaultVisible])) as Record<CurveKey, boolean>,
    visibleEvents: { eventos: true, eventosAA: false, eventosAjuste: true },
    selectedAjusteId: null,
    formMode: null,
    formData: null,
    formDate: null,
    activeModal: null,
    pendingChanges: false,
    chartDragPct: 0,
    chartRedistribucion: 'TodosLosDias' as import('./types').RedistribucionTipo,
    chartSelectedDate: null,
    formComentario: '',

    // ── Init ──
    init: async () => {
        try {
            set({ loading: true, error: null });

            const user = services.getUser();
            const isAdmin = !!user?.esAdmin;
            const canAdjust = !!(isAdmin || (user as any)?.ajustarCurva);
            const canApprove = !!(isAdmin || (user as any)?.aprobarAjustes);


            const [presupuestos, locales, gruposLocales] = await Promise.all([
                services.getPresupuestos(),
                services.getLocales(),
                services.getGruposLocales(),
            ]);


            const firstPpto = presupuestos[0];
            const firstLocal = locales[0];


            set({
                isAdmin,
                canAdjust,
                canApprove,
                presupuestos,
                locales,
                gruposLocales,
                filtros: {
                    ...get().filtros,
                    presupuestoId: firstPpto?.id ?? null,
                    nombrePresupuesto: firstPpto?.nombre ?? '',
                    ano: firstPpto?.ano ?? new Date().getFullYear(),
                    codAlmacen: firstLocal?.code ?? '',
                },
                loading: false,
            });

            // Load chart data after init
            if (firstPpto && firstLocal) {

                await get().loadChartData();

            } else {

            }
        } catch (e: any) {
            console.error('[AjusteStore] init() ERROR:', e);
            set({ error: e.message || 'Error al inicializar', loading: false });
        }
    },


    // ── Filtros ──
    setFiltro: (key, value) => {
        const prev = get().filtros;
        const updated = { ...prev, [key]: value };

        // If changing presupuesto, update nombre and ano
        if (key === 'presupuestoId') {
            const ppto = get().presupuestos.find(p => p.id === value);
            if (ppto) {
                updated.nombrePresupuesto = ppto.nombre;
                updated.ano = ppto.ano;
            }
        }

        set({ filtros: updated });
        // Defer loadChartData to avoid synchronous cascading state updates
        // that cause "Maximum update depth exceeded"
        setTimeout(() => get().loadChartData(), 0);
    },

    // ── Load chart data ──
    loadChartData: async () => {
        const { filtros } = get();
        if (!filtros.nombrePresupuesto || !filtros.codAlmacen) return;

        try {
            set({ chartLoading: true, error: null });


            const [dailyData, eventosActual, eventosAA, eventosAjuste] = await Promise.all([
                services.getModeloPresupuesto({
                    nombrePresupuesto: filtros.nombrePresupuesto,
                    codAlmacen: filtros.codAlmacen,
                    mes: filtros.mes,
                    canal: filtros.canal,
                    ano: filtros.ano,
                }),
                services.getEventosMes(filtros.ano, filtros.mes),
                services.getEventosAnoAnterior(filtros.ano, filtros.mes),
                services.getEventosAjuste(),
            ]);



            const ajustesAno = await services.getAjustesAno(
                filtros.nombrePresupuesto,
                filtros.codAlmacen,
                filtros.ano,
            );

            const ajustes = ajustesAno.filter(a => a.mes === filtros.mes);

            const seriesData = buildSeriesData(dailyData, ajustes, eventosActual, eventosAA, eventosAjuste);

            set({
                seriesData,
                ajustesAno,
                ajustes,
                eventosActual,
                eventosAA,
                eventosAjuste,
                chartLoading: false,
            });
        } catch (e: any) {
            console.error('[AjusteStore] loadChartData ERROR:', e);
            set({ error: e.message || 'Error cargando datos', chartLoading: false });
        }
    },

    // ── Refresh ajustes only ──
    refreshAjustes: async () => {
        const { filtros } = get();
        if (!filtros.nombrePresupuesto || !filtros.codAlmacen) return;
        try {
            const ajustesAno = await services.getAjustesAno(
                filtros.nombrePresupuesto,
                filtros.codAlmacen,
                filtros.ano,
            );
            const ajustes = ajustesAno.filter(a => a.mes === filtros.mes);
            set({ ajustesAno, ajustes });
        } catch { /* silent */ }
    },

    // ── Curve toggles ──
    toggleCurve: (key) => set(s => ({
        visibleCurves: { ...s.visibleCurves, [key]: !s.visibleCurves[key] },
    })),

    toggleEvent: (key) => set(s => ({
        visibleEvents: { ...s.visibleEvents, [key]: !s.visibleEvents[key] },
    })),

    // ── Selection ──
    selectAjuste: (id) => set({ selectedAjusteId: id }),

    // ── Form ──
    openCreateForm: (fecha) => set({
        formMode: 'crear',
        formData: {
            fecha: fecha || new Date().toISOString().substring(0, 10),
            tipoAjuste: 'Porcentaje',
            canal: 'Todos',
            valor: 0,
            redistribucion: 'TodosLosDias',
            comentario: '',
        },
        formDate: fecha || null,
        selectedAjusteId: null,
    }),

    openEditForm: (ajuste) => set({
        formMode: 'editar',
        formData: {
            fecha: ajuste.fechaAplicacion?.substring(0, 10) || '',
            tipoAjuste: ajuste.metodoAjuste === 'Porcentaje' ? 'Porcentaje' : 'Monto',
            canal: (ajuste.canal || 'Todos') as any,
            valor: ajuste.valorAjuste,
            redistribucion: ajuste.redistribucion,
            comentario: ajuste.comentario || '',
        },
        selectedAjusteId: ajuste.id,
    }),

    closeForm: () => set({
        formMode: null,
        formData: null,
        formDate: null,
        chartDragPct: 0,
        chartSelectedDate: null,
        formComentario: '',
    }),

    setChartState: (dragPct, redistribucion, selectedDate) => set({
        chartDragPct: dragPct,
        chartRedistribucion: redistribucion,
        chartSelectedDate: selectedDate,
    }),

    setFormComentario: (c) => set({ formComentario: c }),

    // ── CRUD ──
    saveAjuste: async (data) => {
        const { filtros } = get();
        try {
            set({ chartLoading: true });
            await services.saveAjuste(
                filtros.nombrePresupuesto,
                filtros.codAlmacen,
                filtros.mes,
                data,
            );
            set({ message: { ok: true, text: 'Ajuste guardado correctamente' }, formMode: null, formData: null, pendingChanges: true });
            await get().loadChartData();
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || 'Error guardando ajuste' }, chartLoading: false });
        }
    },

    deleteAjuste: async (id) => {
        try {
            set({ chartLoading: true });
            await services.deleteAjuste(id);
            set({ message: { ok: true, text: 'Ajuste eliminado' }, selectedAjusteId: null });
            await get().loadChartData();
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || 'Error eliminando ajuste' }, chartLoading: false });
        }
    },

    disassociateAjuste: async (id) => {
        try {
            await services.disassociateAjuste(id);
            set({ message: { ok: true, text: 'Ajuste desasociado' } });
            await get().refreshAjustes();
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || 'Error desasociando' } });
        }
    },

    // ── Modals ──
    openModal: (modal) => set({ activeModal: modal }),
    closeModal: () => set({ activeModal: null }),

    applyAllAjustes: async (tablaDestino: string) => {
        const { filtros } = get();
        try {
            set({ chartLoading: true, activeModal: null });
            await services.applyAjustes(filtros.nombrePresupuesto, tablaDestino);
            set({ message: { ok: true, text: 'Ajustes aplicados correctamente' }, pendingChanges: false });
            await get().loadChartData();
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || 'Error aplicando ajustes' }, chartLoading: false });
        }
    },

    aprobarRechazarAjuste: async (id: number, estado: 'Aprobado' | 'Rechazado', motivoRechazo?: string) => {
        try {
            set({ chartLoading: true, activeModal: null });
            await services.aprobarRechazarAjuste(id, estado, motivoRechazo);
            set({ message: { ok: true, text: `Ajuste ${estado.toLowerCase()}` } });
            await get().loadChartData();
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || `Error cambiando estado a ${estado}` }, chartLoading: false });
        }
    },

    copyToLocales: async (data) => {
        try {
            set({ chartLoading: true, activeModal: null });
            const result = await services.copyAjusteToLocales(data);
            set({
                message: { ok: true, text: `Ajuste copiado a ${result.copiedCount} locales` },
                chartLoading: false,
            });
        } catch (e: any) {
            set({ message: { ok: false, text: e.message || 'Error copiando' }, chartLoading: false });
        }
    },

    setMessage: (msg) => set({ message: msg }),
    clearError: () => set({ error: null }),
}));

// ── Selector helpers ──
// useShallow prevents infinite re-renders when selectors return new object references

export const useResumen = () => useAjusteStore(
    useShallow(s => calcResumen(s.seriesData, s.ajustes))
);
export const useSelectedAjuste = () => useAjusteStore(
    s => s.ajustes.find(a => a.id === s.selectedAjusteId) || null
);
