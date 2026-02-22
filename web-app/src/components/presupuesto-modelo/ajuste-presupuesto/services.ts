// ============================================================
// Vista de Ajuste — Servicios / API layer
// ============================================================
// Wraps existing API functions and provides stubs for new endpoints.
// Functions marked with TODO need backend implementation.
// ============================================================

import {
    fetchModeloConfig,
    fetchStoresWithNames,
    fetchDatosAjuste,
    fetchAjustes as fetchAjustesApi,
    aplicarAjuste as aplicarAjusteApi,
    previewAjuste as previewAjusteApi,
    desactivarAjuste,
    fetchEventosPorMes,
    fetchEventosAjuste,
    getUser,
    type ModeloConfig,
    type StoreItem,
    type DatosAjusteDia,
    type EventosByDate,
    type AjustePresupuesto as AjustePresupuestoBase,
} from '../../../api';
import type {
    AjustePresupuesto,
    AjusteFormData,
    CopiarLocalesData,
    GrupoLocal,
    PresupuestoItem,
} from './types';
import { formatAjusteId } from './helpers';

// Re-export user helper
export { getUser };

// ── Presupuesto configs ──

export async function getPresupuestos(): Promise<PresupuestoItem[]> {
    const configs = await fetchModeloConfig();
    return configs
        .filter(c => c.activo)
        .map(c => ({
            id: c.id,
            nombre: c.nombrePresupuesto,
            ano: c.anoModelo,
            activo: c.activo,
        }));
}

export async function getModeloConfigs(): Promise<ModeloConfig[]> {
    return fetchModeloConfig();
}

// ── Locales ──

export async function getLocales(): Promise<StoreItem[]> {
    const stores = await fetchStoresWithNames();
    // Filter out group codes (start with G)
    return stores.filter(s => !s.code.startsWith('G'));
}

// ── Datos del modelo ──

export async function getModeloPresupuesto(params: {
    nombrePresupuesto: string;
    codAlmacen: string;
    mes: number;
    canal: string;
    ano: number;
}): Promise<DatosAjusteDia[]> {
    return fetchDatosAjuste(
        params.nombrePresupuesto,
        params.codAlmacen,
        params.canal,
        'Ventas',
        params.mes,
        params.ano,
    );
}

// ── Eventos ──

export async function getEventosMes(ano: number, mes: number): Promise<EventosByDate> {
    return fetchEventosPorMes(ano, mes);
}

export async function getEventosAnoAnterior(ano: number, mes: number): Promise<EventosByDate> {
    return fetchEventosPorMes(ano - 1, mes);
}

export async function getEventosAjuste(): Promise<EventosByDate> {
    return fetchEventosAjuste();
}

// ── Ajustes ──

export async function getAjustesMes(
    nombrePresupuesto: string,
    codAlmacen: string,
    mes: number,
    ano: number,
): Promise<AjustePresupuesto[]> {
    const raw = await fetchAjustesApi(nombrePresupuesto);
    return raw
        .filter(a => a.mes === mes && a.codAlmacen === codAlmacen && a.activo)
        .map(a => transformAjuste(a, ano));
}

function transformAjuste(a: AjustePresupuestoBase, ano: number): AjustePresupuesto {
    return {
        ...a,
        estado: 'Aplicado', // TODO: Backend debe retornar estado real
        ajustePrincipalId: null,
        idFormateado: formatAjusteId(ano, a.mes, a.id),
        comentario: a.motivo,
        redistribucion: mapDistribucion(a.metodoDistribucion),
    };
}

function mapDistribucion(metodo: string): 'TodosLosDias' | 'Semana' | 'MismoDiaSemana' {
    switch (metodo) {
        case 'Semana': return 'Semana';
        case 'MismoDiaSemana': return 'MismoDiaSemana';
        default: return 'TodosLosDias';
    }
}

// ── Guardar ajuste (pendiente, sin aplicar) ──

export async function saveAjuste(
    nombrePresupuesto: string,
    codAlmacen: string,
    mes: number,
    data: AjusteFormData,
): Promise<{ success: boolean; id: number }> {
    // Compute day-of-week (1=Mon, ..., 7=Sun) from fecha for Semana/MismoDiaSemana filtering
    let dia: number | undefined;
    if (data.fecha && data.redistribucion !== 'TodosLosDias') {
        const dateStr = data.fecha.substring(0, 10);
        const d = new Date(dateStr + 'T00:00:00Z');
        const jsDay = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        dia = jsDay === 0 ? 7 : jsDay; // 1=Mon, ..., 7=Sun (matches idDia in DB)
    }

    const result = await aplicarAjusteApi({
        nombrePresupuesto,
        codAlmacen,
        mes,
        canal: data.canal,
        tipo: 'Ventas',
        fecha: data.fecha,
        dia,
        metodoAjuste: data.tipoAjuste === 'Porcentaje' ? 'Porcentaje' : 'MontoAbsoluto',
        valorAjuste: data.valor,
        metodoDistribucion: data.redistribucion === 'Semana' ? 'Semana'
            : data.redistribucion === 'MismoDiaSemana' ? 'MismoDiaSemana'
                : 'Mes',
        motivo: data.comentario,
    });
    return { success: result.success, id: 0 };
}

// ── Eliminar ajuste ──

export async function deleteAjuste(id: number): Promise<{ success: boolean }> {
    return desactivarAjuste(id);
}

// ── Preview de impacto ──

export async function previewImpacto(params: {
    nombrePresupuesto: string;
    codAlmacen: string;
    mes: number;
    canal: string;
    tipoAjuste: string;
    valor: number;
    redistribucion: string;
}): Promise<{ preview: any[] }> {
    return previewAjusteApi({
        nombrePresupuesto: params.nombrePresupuesto,
        codAlmacen: params.codAlmacen,
        mes: params.mes,
        canal: params.canal,
        tipo: 'Ventas',
        metodoAjuste: params.tipoAjuste === 'Porcentaje' ? 'Porcentaje' : 'MontoAbsoluto',
        valorAjuste: params.valor,
        metodoDistribucion: params.redistribucion,
    });
}

// ── Aplicar todos los ajustes pendientes ──

export async function applyAjustes(
    nombrePresupuesto: string,
    _codAlmacen: string,
    _mes: number,
): Promise<{ success: boolean; recalculatedCount: number }> {
    // TODO: Backend endpoint — POST /api/modelo-presupuesto/ajustes/aplicar-todos
    // Should apply all pending adjustments and recalculate the budget
    // For now this is a no-op since saveAjuste already applies
    console.warn('[TODO] applyAjustes: Backend endpoint not implemented. Ajustes already applied on save.');
    return { success: true, recalculatedCount: 0 };
}

// ── Copiar ajuste a otros locales ──

export async function copyAjusteToLocales(
    data: CopiarLocalesData,
): Promise<{ success: boolean; copiedCount: number }> {
    // TODO: Backend endpoint — POST /api/modelo-presupuesto/ajustes/copiar
    // Body: { ajusteId, locales: string[], aplicarComo: 'Monto' | 'Porcentaje' }
    // Should create associated adjustments in target stores
    console.warn('[TODO] copyAjusteToLocales: Not implemented', data);
    return { success: true, copiedCount: data.localesSeleccionados.length };
}

// ── Desasociar ajuste ──

export async function disassociateAjuste(
    ajusteId: number,
): Promise<{ success: boolean }> {
    // TODO: Backend endpoint — PUT /api/modelo-presupuesto/ajustes/:id/desasociar
    // Should remove the association but keep the adjustment
    console.warn('[TODO] disassociateAjuste: Not implemented', ajusteId);
    return { success: true };
}

// ── Grupos de locales ──

export async function getGruposLocales(): Promise<GrupoLocal[]> {
    // TODO: Backend endpoint — GET /api/modelo-presupuesto/grupos-locales
    // For now return static groups
    const stores = await getLocales();
    return [
        { nombre: 'Todos', locales: stores },
        { nombre: 'Mall', locales: stores.filter(s => s.name.toLowerCase().includes('mall') || s.name.toLowerCase().includes('plaza') || s.name.toLowerCase().includes('multiplaza') || s.name.toLowerCase().includes('oxígeno') || s.name.toLowerCase().includes('lincoln')) },
        { nombre: 'Freestand', locales: stores.filter(s => !s.name.toLowerCase().includes('mall') && !s.name.toLowerCase().includes('plaza')) },
    ];
}
