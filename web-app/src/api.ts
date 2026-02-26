import type { BudgetRecord } from './mockData';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface User {
    id: number;
    email: string;
    nombre: string;
    clave?: string;
    activo: boolean;
    accesoTendencia: boolean;
    accesoTactica: boolean;
    accesoEventos: boolean;
    accesoPresupuesto: boolean;
    accesoPresupuestoMensual: boolean;
    accesoPresupuestoAnual: boolean;
    accesoPresupuestoRangos: boolean;
    accesoTiempos: boolean;
    accesoEvaluaciones: boolean;
    accesoInventarios: boolean;
    accesoPersonal: boolean;
    accesoModeloPresupuesto: boolean;
    accesoReportes: boolean;
    verConfigModelo: boolean;
    verConsolidadoMensual: boolean;
    verAjustePresupuesto: boolean;
    verVersiones: boolean;
    verBitacora: boolean;
    verReferencias: boolean;
    editarConsolidado: boolean;
    ejecutarRecalculo: boolean;
    ajustarCurva: boolean;
    restaurarVersiones: boolean;
    accesoAsignaciones: boolean;
    accesoGruposAlmacen: boolean;
    accesoNotificaciones?: boolean;
    crearNotificaciones?: boolean;
    esAdmin: boolean;
    esProtegido: boolean;
    allowedStores: string[];
    allowedCanales: string[];
    permitirEnvioClave?: boolean;
    perfilId?: number | null;
    offlineAdmin?: boolean;
    cedula?: string | null;
    telefono?: string | null;
    impersonatedBy?: string;
}


// ==========================================
// Token management
// ==========================================

export function getToken(): string | null {
    // Check sessionStorage first (for superadmin)
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

export function setToken(token: string, user?: any): void {
    // Don't store token for superadmin or impersonated sessions (must always login manually)
    if (user && (user.email === 'soporte@rostipolloscr.com' || user.impersonatedBy)) {
        // Store in sessionStorage instead (cleared when browser closes)
        sessionStorage.setItem('auth_token', token);
        return;
    }
    localStorage.setItem('auth_token', token);
}

export function clearToken(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_token'); // Also clear sessionStorage
    sessionStorage.removeItem('auth_user');
}

export function getUser(): User | null {
    const userStr = sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
    return userStr ? JSON.parse(userStr) : null;
}

export function setUser(user: User): void {
    // Don't store user for superadmin or impersonated sessions (must always login manually)
    if (user.email === 'soporte@rostipolloscr.com' || user.impersonatedBy) {
        sessionStorage.setItem('auth_user', JSON.stringify(user));
        return;
    }
    localStorage.setItem('auth_user', JSON.stringify(user));
}

function authHeaders(): HeadersInit {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ==========================================
// Auth API
// ==========================================

export async function login(email: string, clave: string): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, clave })
    });

    const data = await response.json();

    if (!response.ok) {
        return { success: false, error: data.error };
    }

    // Store token and user
    setToken(data.token, data.user); // Pass user for superadmin detection
    setUser(data.user);

    return { success: true, token: data.token, user: data.user };
}

export async function adminLogin(password: string): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
        return { success: false, error: data.error };
    }

    // Store token and user in sessionStorage (admin offline sessions should not persist)
    sessionStorage.setItem('auth_token', data.token);
    sessionStorage.setItem('auth_user', JSON.stringify(data.user));

    return { success: true };
}

export async function fetchImpersonateUsers(email: string, clave: string): Promise<{ id: number; email: string; nombre: string }[]> {
    const response = await fetch(`${API_BASE}/auth/impersonate/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, clave })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Error al obtener usuarios');
    }

    return data;
}

export async function impersonateLogin(email: string, clave: string, targetUserId: number): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    const response = await fetch(`${API_BASE}/auth/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, clave, targetUserId })
    });

    const data = await response.json();

    if (!response.ok) {
        return { success: false, error: data.error };
    }

    // Store token and user (sessionStorage for impersonated sessions)
    setToken(data.token, data.user);
    setUser(data.user);

    return { success: true, token: data.token, user: data.user };
}

export async function verifyToken(): Promise<boolean> {
    const token = getToken();
    if (!token) return false;

    try {
        const response = await fetch(`${API_BASE}/auth/verify`, {
            method: 'POST',
            headers: authHeaders()
        });
        return response.ok;
    } catch {
        return false;
    }
}

export function logout(): void {
    clearToken();
}

// ==========================================
// Admin API
// ==========================================

export async function verifyAdminPassword(password: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    return response.ok;
}

export async function fetchAdminUsers(): Promise<User[]> {
    console.log('🔍 Fetching admin users from:', `${API_BASE}/admin/users`);
    console.log('📤 Headers:', authHeaders());
    const response = await fetch(`${API_BASE}/admin/users`, {
        headers: authHeaders()
    });
    console.log('📥 Response status:', response.status, response.statusText);
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ fetchAdminUsers failed:', { status: response.status, error: errorText });
        throw new Error(`Error fetching users: ${response.status} - ${errorText}`);
    }
    return response.json();
}

export async function createAdminUser(
    email: string,
    nombre: string,
    clave: string,
    stores: string[],
    canales: string[],
    accesoTendencia: boolean = false,
    accesoTactica: boolean = false,
    accesoEventos: boolean = false,
    accesoPresupuesto: boolean = true,
    accesoPresupuestoMensual: boolean = true,
    accesoPresupuestoAnual: boolean = true,
    accesoPresupuestoRangos: boolean = true,
    accesoTiempos: boolean = false,
    accesoEvaluaciones: boolean = false,
    accesoInventarios: boolean = false,
    accesoPersonal: boolean = false,
    esAdmin: boolean = false,
    modeloPerms: { accesoModeloPresupuesto?: boolean; verConfigModelo?: boolean; verConsolidadoMensual?: boolean; verAjustePresupuesto?: boolean; verVersiones?: boolean; verBitacora?: boolean; verReferencias?: boolean; editarConsolidado?: boolean; ejecutarRecalculo?: boolean; ajustarCurva?: boolean; restaurarVersiones?: boolean } = {},
    perfilId: number | null = null,
    cedula: string | null = null,
    telefono: string | null = null,
    accesoAsignaciones: boolean = false,
    accesoGruposAlmacen: boolean = false
): Promise<{ success: boolean; userId: number; clave: string }> {
    const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email, nombre, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, perfilId, cedula, telefono, accesoAsignaciones, accesoGruposAlmacen, ...modeloPerms })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error creating user');
    }
    return response.json();
}

export async function updateAdminUser(
    userId: number,
    email: string,
    nombre: string,
    activo: boolean,
    clave: string | null,
    stores: string[],
    canales: string[],
    accesoTendencia: boolean,
    accesoTactica: boolean,
    accesoEventos: boolean,
    accesoPresupuesto: boolean,
    accesoPresupuestoMensual: boolean,
    accesoPresupuestoAnual: boolean,
    accesoPresupuestoRangos: boolean,
    accesoTiempos: boolean,
    accesoEvaluaciones: boolean,
    accesoInventarios: boolean,
    accesoPersonal: boolean,
    esAdmin: boolean,
    permitirEnvioClave: boolean = true,
    perfilId: number | null = null,
    modeloPerms: { accesoModeloPresupuesto?: boolean; verConfigModelo?: boolean; verConsolidadoMensual?: boolean; verAjustePresupuesto?: boolean; verVersiones?: boolean; verBitacora?: boolean; verReferencias?: boolean; editarConsolidado?: boolean; ejecutarRecalculo?: boolean; ajustarCurva?: boolean; restaurarVersiones?: boolean } = {},
    cedula: string | null = null,
    telefono: string | null = null,
    accesoAsignaciones: boolean = false,
    accesoGruposAlmacen: boolean = false
): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ email, nombre, activo, clave, stores, canales, accesoTendencia, accesoTactica, accesoEventos, accesoPresupuesto, accesoPresupuestoMensual, accesoPresupuestoAnual, accesoPresupuestoRangos, accesoTiempos, accesoEvaluaciones, accesoInventarios, accesoPersonal, esAdmin, permitirEnvioClave, perfilId, cedula, telefono, accesoAsignaciones, accesoGruposAlmacen, ...modeloPerms })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error updating user');
    }
    return response.json();
}

export async function deleteAdminUser(userId: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error deleting user');
    }
    return response.json();
}

export async function fetchAllStores(): Promise<string[]> {
    console.log('🔍 Fetching all stores from:', `${API_BASE}/all-stores`);
    console.log('📤 Headers:', authHeaders());
    const response = await fetch(`${API_BASE}/all-stores`, {
        headers: authHeaders()
    });
    console.log('📥 Response status:', response.status, response.statusText);
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ fetchAllStores failed:', { status: response.status, error: errorText });
        throw new Error(`Error fetching stores: ${response.status} - ${errorText}`);
    }
    return response.json();
}

// GET /api/available-canales - Fetch canales allowed for current user
export async function fetchAvailableCanales(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/available-canales`, {
        headers: authHeaders()
    });
    if (!response.ok) {
        console.error('Error fetching available canales:', response.statusText);
        return ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];
    }
    const data = await response.json();
    return data.canales || [];
}

// GET /api/admin/grupos-almacen - Fetch configured store groups
export interface GrupoAlmacen {
    IDGRUPO: number;
    DESCRIPCION: string;
    CODVISIBLE: number;
    Activo: boolean;
    TotalMiembros: number;
}

export async function fetchGruposAlmacen(): Promise<GrupoAlmacen[]> {
    try {
        const response = await fetch(`${API_BASE}/admin/grupos-almacen`, {
            headers: authHeaders()
        });
        if (!response.ok) return [];
        return response.json();
    } catch {
        return [];
    }
}

// ==========================================
// Data API (authenticated)
// ==========================================

// GET /api/fecha-limite - Returns the last date with real data (MontoReal > 0)
export async function fetchFechaLimite(year: number = 2026): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE}/fecha-limite?year=${year}`, {
            headers: authHeaders()
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.fechaLimite || null;
    } catch {
        return null;
    }
}

export async function fetchBudgetData(
    year: number = 2026,
    local?: string,
    canal: string = 'Todos',
    tipo: string = 'Ventas',
    startDate?: string,
    endDate?: string
): Promise<BudgetRecord[]> {
    const params = new URLSearchParams({ year: year.toString(), canal, tipo });
    if (local) {
        params.set('local', local);
    }
    if (startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
    }

    const response = await fetch(`${API_BASE}/budget?${params}`, {
        headers: authHeaders()
    });

    if (response.status === 401) {
        clearToken();
        window.location.reload();
        return [];
    }

    if (!response.ok) {
        throw new Error(`Error fetching budget data: ${response.statusText}`);
    }

    const rawData = await response.json();

    return rawData.map((row: any) => ({
        Fecha: row.Fecha || '',
        Año: parseInt(row.Año) || parseInt(row.AÑO) || year,
        Mes: parseInt(row.Mes) || parseInt(row.MES) || 0,
        Dia: parseInt(row.Dia) || parseInt(row.dia) || parseInt(row.DIA) || 0,
        DiaSemana: parseInt(row.idDia) || parseInt(row.iddia) || parseInt(row.DiaSemana) || 0,
        MontoReal: parseFloat(row.MontoReal) || 0,
        Monto: parseFloat(row.Monto) || 0,
        MontoDiasConDatos: parseFloat(row.MontoDiasConDatos) || 0,
        MontoAcumulado: parseFloat(row.Monto_Acumulado) || parseFloat(row.MontoAcumulado) || 0,
        MontoAnterior: parseFloat(row.MontoAnterior) || 0,
        AnteriorDiasConDatos: parseFloat(row.AnteriorDiasConDatos) || 0,
        MontoAnteriorAcumulado: parseFloat(row.MontoAnterior_Acumulado) || parseFloat(row.MontoAnteriorAcumulado) || 0,
        MontoAnteriorAjustado: parseFloat(row.MontoAnteriorAjustado) || 0,
        AnteriorAjustadoDiasConDatos: parseFloat(row.AnteriorAjustadoDiasConDatos) || 0,
        MontoAnteriorAjustadoAcumulado: parseFloat(row.MontoAnteriorAjustado_Acumulado) || parseFloat(row.MontoAnteriorAjustadoAcumulado) || 0,
    }));
}

export interface ComparableDayRecord {
    Fecha: string;
    Dia: number;
    idDia: number;
    Serie: string;
    MontoReal: number;
    Monto: number;
    MontoAnterior: number;
    MontoAnteriorAjustado: number;
    FechaAnterior: string;
    FechaAnteriorAjustada: string;
}

export async function fetchComparableDays(
    year: number,
    month: number,
    local: string,
    canal: string = 'Todos',
    tipo: string = 'Ventas'
): Promise<ComparableDayRecord[]> {
    const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        local,
        canal,
        tipo
    });

    const response = await fetch(`${API_BASE}/comparable-days?${params}`, {
        headers: authHeaders()
    });

    if (response.status === 401) {
        clearToken();
        window.location.reload();
        return [];
    }

    if (!response.ok) {
        throw new Error(`Error fetching comparable days: ${response.statusText}`);
    }

    const rawData = await response.json();

    return rawData.map((row: any) => ({
        Fecha: row.Fecha || '',
        Dia: parseInt(row.Dia) || 0,
        idDia: parseInt(row.idDia) || parseInt(row.iddia) || 0,
        Serie: row.Serie || '',
        MontoReal: parseFloat(row.MontoReal) || 0,
        Monto: parseFloat(row.Monto) || 0,
        MontoAnterior: parseFloat(row.MontoAnterior) || 0,
        MontoAnteriorAjustado: parseFloat(row.MontoAnteriorAjustado) || 0,
        FechaAnterior: row.FechaAnterior || '',
        FechaAnteriorAjustada: row.FechaAnteriorAjustada || '',
    }));
}

export async function fetchStores(): Promise<{ groups: string[]; individuals: string[] }> {
    const response = await fetch(`${API_BASE}/stores-v2`, {
        headers: authHeaders()
    });

    if (response.status === 401) {
        clearToken();
        window.location.reload();
        return { groups: [], individuals: [] };
    }

    if (!response.ok) {
        throw new Error(`Error fetching stores: ${response.statusText}`);
    }
    return response.json();
}

export async function fetchGroupStores(groupName: string): Promise<{ stores: string[] }> {
    const response = await fetch(`${API_BASE}/group-stores/${encodeURIComponent(groupName)}`, {
        headers: authHeaders()
    });

    if (response.status === 401) {
        clearToken();
        window.location.reload();
        return { stores: [] };
    }

    if (!response.ok) {
        throw new Error(`Error fetching group stores: ${response.statusText}`);
    }
    return response.json();
}

// ==========================================
// Eventos API (admin only)
// ==========================================

export interface Evento {
    IDEVENTO: number;
    EVENTO: string;
    ESFERIADO: string;
    USARENPRESUPUESTO: string;
    ESINTERNO: string;
}

export interface EventoFecha {
    ID: number;
    IDEVENTO: number;
    FECHA: string;
    FECHA_EFECTIVA: string;
    Canal: string;
    GrupoAlmacen: number | null;
    USUARIO_MODIFICACION: string | null;
    FECHA_MODIFICACION: string | null;
}

export async function fetchEventos(): Promise<Evento[]> {
    const response = await fetch(`${API_BASE}/eventos`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching eventos');
    return response.json();
}

export async function createEvento(data: Omit<Evento, 'IDEVENTO'>): Promise<{ success: boolean; id: number }> {
    const response = await fetch(`${API_BASE}/eventos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error creating evento');
    }
    return response.json();
}

export async function updateEvento(id: number, data: Omit<Evento, 'IDEVENTO'>): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error updating evento');
    return response.json();
}

export async function deleteEvento(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error deleting evento');
    return response.json();
}

export async function reorderEventos(order: number[]): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos/reorder`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ order })
    });
    if (!response.ok) throw new Error('Error reordering eventos');
    return response.json();
}

export async function fetchEventoFechas(idEvento: number): Promise<EventoFecha[]> {
    const response = await fetch(`${API_BASE}/eventos/${idEvento}/fechas`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching evento fechas');
    return response.json();
}

export async function createEventoFecha(data: {
    idEvento: number;
    fecha: string;
    fechaEfectiva: string;
    canal: string;
    grupoAlmacen: number | null;
    usuario: string;
}): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos-fechas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error creating evento fecha');
    return response.json();
}

export async function updateEventoFecha(data: {
    idEvento: number;
    oldFecha: string;
    newFecha: string;
    fechaEfectiva: string;
    canal: string;
    grupoAlmacen: number | null;
    usuario: string;
}): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos-fechas`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error updating evento fecha');
    return response.json();
}

export async function deleteEventoFecha(idEvento: number, fecha: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/eventos-fechas?idEvento=${idEvento}&fecha=${fecha}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error deleting evento fecha');
    return response.json();
}

// Lightweight type for event overlays on charts (read-only, any authenticated user)
export interface EventoItem {
    id: number;
    evento: string;
    esFeriado: boolean;
    esInterno: boolean;
    usarEnPresupuesto?: boolean;
    ubicacion?: string;
    categoria?: string;
    todoElDia?: boolean;
    descripcion?: string;
    canal?: string | null;
    local?: number | string | null;
    fechaEfectiva?: string | null;
}

export type EventosByDate = Record<string, EventoItem[]>;

// GET /api/eventos/por-mes - events grouped by date for a given month
export async function fetchEventosPorMes(year: number, month: number): Promise<EventosByDate> {
    try {
        const response = await fetch(`${API_BASE}/eventos/por-mes?year=${year}&month=${month}`, {
            headers: authHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.byDate || {};
    } catch {
        return {};
    }
}

// GET /api/eventos/por-ano - all events grouped by date for a given year
export async function fetchEventosPorAno(year: number): Promise<EventosByDate> {
    try {
        const response = await fetch(`${API_BASE}/eventos/por-ano?year=${year}`, {
            headers: authHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.byDate || {};
    } catch {
        return {};
    }
}

// ==========================================
// SharePoint Eventos Rosti (cached)
// ==========================================

// GET /api/sp-eventos/por-mes - SharePoint events for a given month (from cache)
export async function fetchSPEventosPorMes(year: number, month: number): Promise<EventosByDate> {
    try {
        const response = await fetch(`${API_BASE}/sp-eventos/por-mes?year=${year}&month=${month}`, {
            headers: authHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.byDate || {};
    } catch {
        return {};
    }
}

// GET /api/sp-eventos/por-ano - SharePoint events for an entire year (from cache)
export async function fetchSPEventosPorAno(year: number): Promise<EventosByDate> {
    try {
        const response = await fetch(`${API_BASE}/sp-eventos/por-ano?year=${year}`, {
            headers: authHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.byDate || {};
    } catch {
        return {};
    }
}

// GET /api/eventos-ajuste/all - All adjustment events (USARENPRESUPUESTO) without year filter
export async function fetchEventosAjuste(): Promise<EventosByDate> {
    try {
        const response = await fetch(`${API_BASE}/eventos-ajuste/all`, {
            headers: authHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.byDate || {};
    } catch {
        return {};
    }
}

// Evento ajuste item with event details for period view
export interface EventoAjustePeriodo {
    IDEVENTO: number;
    EVENTO: string;
    ESFERIADO: string;
    ESINTERNO: string;
    USARENPRESUPUESTO: string;
    FECHA: string;
    FECHA_EFECTIVA: string | null;
    Canal: string;
    GrupoAlmacen: number | null;
    USUARIO_MODIFICACION: string | null;
    FECHA_MODIFICACION: string | null;
}

// GET /api/eventos-ajuste/periodo - adjustment events in a date range
export async function fetchEventosPeriodo(desde: string, hasta: string): Promise<EventoAjustePeriodo[]> {
    const response = await fetch(`${API_BASE}/eventos-ajuste/periodo?desde=${desde}&hasta=${hasta}`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching eventos del período');
    return response.json();
}

// POST /api/eventos-ajuste/send-email - send adjustment report email
export async function sendEventosEmail(payload: {
    to: string;
    desde: string;
    hasta: string;
    items: any[];
    chartImage?: string;
}): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/eventos-ajuste/send-email`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Error enviando correo' }));
        throw new Error(err.error || 'Error enviando correo');
    }
    return response.json();
}

export async function fetchTactica(data: {
    storeName: string;
    year: number;
    kpi: string;
    monthlyData: any[];
    annualTotals: any;
}): Promise<{ analysis: string }> {
    const response = await fetch(`${API_BASE}/tactica`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (response.status === 401) {
        clearToken();
        window.location.reload();
        return { analysis: '' };
    }

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al generar análisis táctico');
    }

    return response.json();
}

// ==========================================
// Config API (admin only)
// ==========================================

export async function fetchConfig(key: string): Promise<{ Valor: string; FechaModificacion: string | null; UsuarioModificacion: string | null }> {
    const response = await fetch(`${API_BASE}/admin/config/${encodeURIComponent(key)}`, {
        headers: authHeaders()
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error fetching config');
    }
    return response.json();
}

export async function saveConfig(key: string, valor: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/config/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ valor })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error saving config');
    }
    return response.json();
}

// ==========================================
// User Dashboard Config API
// ==========================================

export async function getDashboardConfig(): Promise<{ dashboardLocales: string[]; comparativePeriod: string }> {
    const response = await fetch(`${API_BASE}/user/dashboard-config`, {
        headers: authHeaders()
    });

    if (!response.ok) {
        console.error('Error fetching dashboard config:', response.statusText);
        return { dashboardLocales: [], comparativePeriod: 'Month' };
    }

    const result = await response.json();
    return {
        dashboardLocales: result.dashboardLocales || [],
        comparativePeriod: result.comparativePeriod || 'Month'
    };
}

export async function saveDashboardConfig(config: { dashboardLocales?: string[]; comparativePeriod?: string }): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/user/dashboard-config`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(config)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error saving dashboard config');
    }

    return response.json();
}

// ==========================================
// AUXILIARY DATABASE API
// ==========================================

export interface AuxiliaryDBConfig {
    server: string;
    database: string;
    username: string;
    password?: string;
    port?: string; // optional direct port — avoid SQL Server Browser UDP lookup
}

export interface DBStatus {
    activeMode: 'primary' | 'auxiliary';
    primaryHealthy: boolean;
    auxiliaryConfigured: boolean;
    lastHealthCheck: string | null;
}

export interface SyncStats {
    RSM_ALCANCE_DIARIO?: number;
    APP_USUARIOS?: number;
    [key: string]: number | undefined;
}

export async function saveAuxiliaryDBConfig(config: AuxiliaryDBConfig): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/admin/db-config/auxiliary`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(config)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar configuración');
    }

    return response.json();
}

export async function getAuxiliaryDBConfig(): Promise<Partial<AuxiliaryDBConfig>> {
    const response = await fetch(`${API_BASE}/admin/db-config/auxiliary`, {
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });

    if (!response.ok) {
        throw new Error('Error al obtener configuración');
    }

    return response.json();
}

export async function testAuxiliaryDBConnection(config: AuxiliaryDBConfig): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/admin/db-config/test-auxiliary`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(config)
    });

    if (!response.ok) {
        throw new Error('Error al probar conexión');
    }

    return response.json();
}

export async function getDBStatus(): Promise<DBStatus> {
    const response = await fetch(`${API_BASE}/admin/db-status`, {
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });

    if (!response.ok) {
        throw new Error('Error al obtener estado de BD');
    }

    return response.json();
}

export async function syncDatabases(): Promise<{ success: boolean; message: string; stats: SyncStats }> {
    const response = await fetch(`${API_BASE}/admin/db-sync`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al sincronizar datos');
    }

    return response.json();
}

// ==========================================
// PROFILES API (admin only)
// ==========================================

export interface Profile {
    id: number;
    nombre: string;
    descripcion: string | null;
    accesoTendencia: boolean;
    accesoTactica: boolean;
    accesoEventos: boolean;
    accesoPresupuesto: boolean;
    accesoPresupuestoMensual: boolean;
    accesoPresupuestoAnual: boolean;
    accesoPresupuestoRangos: boolean;
    accesoTiempos: boolean;
    accesoEvaluaciones: boolean;
    accesoInventarios: boolean;
    accesoPersonal: boolean;
    accesoModeloPresupuesto: boolean;
    verConfigModelo: boolean;
    verConsolidadoMensual: boolean;
    verAjustePresupuesto: boolean;
    verVersiones: boolean;
    verBitacora: boolean;
    verReferencias: boolean;
    editarConsolidado: boolean;
    ejecutarRecalculo: boolean;
    ajustarCurva: boolean;
    restaurarVersiones: boolean;
    esAdmin: boolean;
    permitirEnvioClave: boolean;
    apareceEnTituloAlcance: boolean;
    apareceEnTituloMensual: boolean;
    apareceEnTituloAnual: boolean;
    apareceEnTituloTendencia: boolean;
    apareceEnTituloRangos: boolean;
    accesoAsignaciones: boolean;
    accesoGruposAlmacen: boolean;
    usuariosAsignados: number;
    fechaCreacion: string;
    fechaModificacion: string | null;
    usuarioCreador: string | null;
}

export async function fetchProfiles(): Promise<Profile[]> {
    const response = await fetch(`${API_BASE}/admin/profiles`, {
        headers: authHeaders()
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error fetching profiles');
    }
    return response.json();
}

export async function createProfile(data: {
    nombre: string;
    descripcion: string;
    permisos: {
        accesoTendencia: boolean;
        accesoTactica: boolean;
        accesoEventos: boolean;
        accesoPresupuesto: boolean;
        accesoPresupuestoMensual: boolean;
        accesoPresupuestoAnual: boolean;
        accesoPresupuestoRangos: boolean;
        accesoTiempos: boolean;
        accesoEvaluaciones: boolean;
        accesoInventarios: boolean;
        accesoPersonal: boolean;
        accesoModeloPresupuesto?: boolean;
        verConfigModelo?: boolean;
        verConsolidadoMensual?: boolean;
        verAjustePresupuesto?: boolean;
        verVersiones?: boolean;
        verBitacora?: boolean;
        verReferencias?: boolean;
        editarConsolidado?: boolean;
        ejecutarRecalculo?: boolean;
        ajustarCurva?: boolean;
        restaurarVersiones?: boolean;
        esAdmin: boolean;
        permitirEnvioClave: boolean;
        apareceEnTituloAlcance?: boolean;
        apareceEnTituloMensual?: boolean;
        apareceEnTituloAnual?: boolean;
        apareceEnTituloTendencia?: boolean;
        apareceEnTituloRangos?: boolean;
        accesoAsignaciones?: boolean;
        accesoGruposAlmacen?: boolean;
    };
}): Promise<{ success: boolean; profileId: number }> {
    const response = await fetch(`${API_BASE}/admin/profiles`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error creating profile');
    }
    return response.json();
}

export async function updateProfile(
    profileId: number,
    data: {
        nombre: string;
        descripcion: string;
        permisos: {
            accesoTendencia: boolean;
            accesoTactica: boolean;
            accesoEventos: boolean;
            accesoPresupuesto: boolean;
            accesoPresupuestoMensual: boolean;
            accesoPresupuestoAnual: boolean;
            accesoPresupuestoRangos: boolean;
            accesoTiempos: boolean;
            accesoEvaluaciones: boolean;
            accesoInventarios: boolean;
            accesoPersonal: boolean;
            accesoModeloPresupuesto?: boolean;
            verConfigModelo?: boolean;
            verConsolidadoMensual?: boolean;
            verAjustePresupuesto?: boolean;
            verVersiones?: boolean;
            verBitacora?: boolean;
            verReferencias?: boolean;
            editarConsolidado?: boolean;
            ejecutarRecalculo?: boolean;
            ajustarCurva?: boolean;
            restaurarVersiones?: boolean;
            esAdmin: boolean;
            permitirEnvioClave: boolean;
            apareceEnTituloAlcance?: boolean;
            apareceEnTituloMensual?: boolean;
            apareceEnTituloAnual?: boolean;
            apareceEnTituloTendencia?: boolean;
            apareceEnTituloRangos?: boolean;
            accesoAsignaciones?: boolean;
            accesoGruposAlmacen?: boolean;
        };
    }
): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/profiles/${profileId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error updating profile');
    }
    return response.json();
}

export async function deleteProfile(profileId: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/profiles/${profileId}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error deleting profile');
    }
    return response.json();
}

export async function assignProfileToUsers(
    profileId: number,
    userIds: number[],
    syncPermissions: boolean = true
): Promise<{ success: boolean; assigned: number }> {
    const response = await fetch(`${API_BASE}/admin/profiles/${profileId}/assign`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userIds, syncPermissions })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error assigning profile');
    }
    return response.json();
}

export async function syncProfilePermissions(profileId: number): Promise<{ success: boolean; updatedCount: number }> {
    const response = await fetch(`${API_BASE}/admin/profiles/${profileId}/sync`, {
        method: 'POST',
        headers: authHeaders()
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error syncing profile permissions');
    }
    return response.json();
}


// ==========================================
// PERSONAL MODULE API
// ==========================================

export interface PersonalItem {
    ID: number;
    NOMBRE: string;
    CORREO: string | null;
    CEDULA: string | null;
    TELEFONO: string | null;
    ACTIVO: boolean;
    TotalAsignaciones: number;
}

export interface Asignacion {
    ID: number;
    USUARIO_ID: number;
    USUARIO_NOMBRE: string;
    LOCAL: string;
    PERFIL: string;
    PERFIL_ID: number | null;
    PERFIL_ACTUAL: string;
    FECHA_INICIO: string;
    FECHA_FIN: string | null;
    NOTAS: string | null;
    ACTIVO: boolean;
}

export async function fetchPersonal(): Promise<PersonalItem[]> {
    const response = await fetch(`${API_BASE}/personal`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching personal');
    return response.json();
}

export async function fetchAsignaciones(usuarioId?: number, month?: number, year?: number): Promise<Asignacion[]> {
    const params = new URLSearchParams();
    if (usuarioId) params.append('usuarioId', usuarioId.toString());
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const response = await fetch(`${API_BASE}/personal/asignaciones?${params.toString()}`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching asignaciones');
    return response.json();
}

export async function createAsignacion(usuarioId: number, local: string, perfil: string, fechaInicio: string, fechaFin?: string, notas?: string, perfilId?: number): Promise<Asignacion> {
    const response = await fetch(`${API_BASE}/personal/asignaciones`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ usuarioId, local, perfil, fechaInicio, fechaFin, notas, perfilId })
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error creating asignacion');
    }
    return response.json();
}

export async function updateAsignacion(id: number, local: string, perfil: string, fechaInicio: string, fechaFin?: string, notas?: string, perfilId?: number): Promise<Asignacion> {
    const response = await fetch(`${API_BASE}/personal/asignaciones/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ local, perfil, fechaInicio, fechaFin, notas, perfilId })
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error updating asignacion');
    }
    return response.json();
}

export async function deleteAsignacion(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/personal/asignaciones/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error deleting asignacion');
    }
}

export async function fetchLocalesSinCobertura(perfil?: string, month?: number, year?: number): Promise<{ Local: string, PerfilesFaltantes: string }[]> {
    const params = new URLSearchParams();
    if (perfil) params.append('perfil', perfil);
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const response = await fetch(`${API_BASE}/personal/locales-sin-cobertura?${params.toString()}`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching locales sin cobertura');
    return response.json();
}

// --- Almacenes individuales (sin grupos) ---

export async function fetchPersonalStores(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/personal/stores`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching stores');
    return response.json();
}

export interface Cargo {
    ID: number;
    NOMBRE: string;
    ACTIVO: boolean;
    MostrarEnAlcance: boolean;
    MostrarEnMensual: boolean;
    MostrarEnAnual: boolean;
    MostrarEnTendencia: boolean;
    MostrarEnRangos: boolean;
}

export async function fetchCargos(): Promise<Cargo[]> {
    const response = await fetch(`${API_BASE}/personal/cargos`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error fetching cargos');
    return response.json();
}

export async function createCargo(nombre: string): Promise<void> {
    const response = await fetch(`${API_BASE}/personal/cargos`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error creating cargo');
    }
}

export async function deleteCargo(id: number, reassignTo?: string): Promise<void> {
    const response = await fetch(`${API_BASE}/personal/cargos/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignTo })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error deleting cargo');
    }
}

export async function updateCargo(id: number, data: Partial<{
    nombre: string;
    mostrarEnAlcance: boolean;
    mostrarEnMensual: boolean;
    mostrarEnAnual: boolean;
    mostrarEnTendencia: boolean;
    mostrarEnRangos: boolean;
}>): Promise<void> {
    const response = await fetch(`${API_BASE}/personal/cargos/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error updating cargo');
    }
}

// GET /api/personal/admin-por-local — Returns all active personal assigned to a local
export interface PersonalAsignado { nombre: string; perfil: string; }

export async function fetchAdminPorLocal(local: string, vista?: string): Promise<PersonalAsignado[]> {
    try {
        if (!local || local === 'Todos' || local === 'Corporativo') return [];
        const params = new URLSearchParams({ local });
        if (vista) params.append('vista', vista);
        const response = await fetch(`${API_BASE}/personal/admin-por-local?${params.toString()}`, {
            headers: authHeaders()
        });
        if (!response.ok) return [];
        const data = await response.json();
        // Map server field names (USUARIO_NOMBRE, PERFIL) to interface fields (nombre, perfil)
        return (data || []).map((d: any) => ({
            nombre: d.USUARIO_NOMBRE || d.nombre || '',
            perfil: d.PERFIL || d.perfil || ''
        }));
    } catch {
        return [];
    }
}

// ==========================================
// DEPLOY MANAGEMENT API
// ==========================================

export interface DeployLogEntry {
    id: number;
    version: string;
    date: string;
    notes: string;
    servers: string[];
    deployedBy: string;
    status: 'pending' | 'deploying' | 'success' | 'error';
    steps?: { step: string; status: string; detail?: string }[];
}

export interface DeployLog {
    entries: DeployLogEntry[];
}

export interface SetupGuideCommand {
    label: string;
    command: string;
    automatable: boolean;
    manualReason?: string;
}

export interface SetupGuideSection {
    title: string;
    description: string;
    target: 'remote' | 'local';
    commands: SetupGuideCommand[];
}

export interface SetupGuide {
    title: string;
    sections: SetupGuideSection[];
}

export async function fetchDeployLog(): Promise<DeployLog> {
    const response = await fetch(`${API_BASE}/deploy/log`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener bitácora');
    return response.json();
}

export async function addDeployLogEntry(version: string, notes: string, servers: string[]): Promise<{ success: boolean; entry: DeployLogEntry }> {
    const response = await fetch(`${API_BASE}/deploy/log`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ version, notes, servers })
    });
    if (!response.ok) throw new Error('Error al guardar entrada');
    return response.json();
}

export async function deployToServer(
    serverIp: string,
    user: string,
    password: string,
    appDir: string,
    version: string,
    notes: string,
    branch?: string,
): Promise<{ success: boolean; steps: { step: string; status: string; detail?: string }[]; entryId: number; timing?: { startTime: string; endTime: string; durationMinutes: number } }> {
    const response = await fetch(`${API_BASE}/deploy/publish`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ serverIp, user, password, appDir, version, notes, branch: branch || 'main' })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al publicar');
    }
    return response.json();
}

export interface ServerVersionInfo {
    version: string | null;
    date: string | null;
    deployedBy: string | null;
}

export async function fetchServerVersion(ip: string): Promise<ServerVersionInfo> {
    const response = await fetch(`${API_BASE}/deploy/server-version?ip=${encodeURIComponent(ip)}`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener versión del servidor');
    return response.json();
}

export async function fetchSetupGuide(): Promise<SetupGuide> {
    const response = await fetch(`${API_BASE}/deploy/setup-guide`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener guía');
    return response.json();
}

export async function runSetupRemote(
    serverIp: string,
    user: string,
    password: string
): Promise<{ success: boolean; steps: { step: string; status: string; detail?: string }[] }> {
    const response = await fetch(`${API_BASE}/deploy/setup-remote`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ serverIp, user, password })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al ejecutar configuración remota');
    }
    return response.json();
}

export async function runSetupLocal(
    serverIp: string
): Promise<{ success: boolean; steps: { step: string; status: string; detail?: string }[] }> {
    const response = await fetch(`${API_BASE}/deploy/setup-local`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ serverIp })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al ejecutar configuración local');
    }
    return response.json();
}

// Git operations
export interface GitStatus {
    currentBranch: string;
    uncommittedCount: number;
    uncommittedFiles: string[];
    unpushedCount: number;
    unpushedCommits: string[];
    needsCommit: boolean;
    needsPush: boolean;
    error?: string;
}

export async function fetchGitBranches(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/deploy/branches`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener branches');
    const data = await response.json();
    return data.branches || ['main'];
}

export async function fetchGitStatus(branch?: string): Promise<GitStatus> {
    const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
    const response = await fetch(`${API_BASE}/deploy/git-status${params}`, {
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener estado git');
    return response.json();
}

export async function commitAndPush(branch: string, message: string): Promise<{ success: boolean; steps: { step: string; status: string; detail?: string }[] }> {
    const response = await fetch(`${API_BASE}/deploy/commit-push`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ branch, message })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al subir cambios');
    }
    return response.json();
}

// ==========================================
// MODELO DE PRESUPUESTO API
// ==========================================

export interface ModeloConfig {
    id: number;
    nombrePresupuesto: string;
    anoModelo: number;
    tablaDestino: string;
    horaCalculo: string;
    ultimoCalculo: string | null;
    ultimoUsuario: string | null;
    duracionUltimoCalculo: number;
    activo: boolean;
    ejecutarEnJob: boolean;
}

export interface ConsolidadoRow {
    id?: number;
    codAlmacen: string;
    local: string;
    ano: number;
    mes: number;
    tipo: string;
    salon: number;
    llevar: number;
    auto: number;
    express: number;
    ecommerce: number;
    ubereats: number;
    total: number;
}

export interface AjustePresupuesto {
    id: number;
    nombrePresupuesto: string;
    codAlmacen: string;
    mes: number;
    canal: string;
    tipo: string;
    metodoAjuste: string;
    valorAjuste: number;
    metodoDistribucion: string;
    motivo: string | null;
    fechaAplicacion: string;
    usuario: string;
    activo: boolean;
}

export interface VersionPresupuesto {
    id: number;
    nombrePresupuesto: string;
    numeroVersion: number;
    nombreTabla: string;
    fechaCreacion: string;
    usuario: string;
    origen: string;
    totalRegistros: number;
    notas: string | null;
}

export interface BitacoraEntry {
    id: number;
    nombrePresupuesto: string;
    usuario: string;
    fechaHora: string;
    accion: string;
    codAlmacen: string | null;
    local: string | null;
    mes: number | null;
    canal: string | null;
    tipo: string | null;
    valorAnterior: string | null;
    valorNuevo: string | null;
    motivo: string | null;
    origen: string;
    detalle: string | null;
}

export interface ReferenciaLocal {
    id: number;
    codAlmacenNuevo: string;
    nombreAlmacenNuevo: string | null;
    codAlmacenReferencia: string;
    nombreAlmacenReferencia: string | null;
    canal: string | null;
    ano: number;
    nombrePresupuesto: string;
    activo: boolean;
}

export interface StoreItem {
    code: string;
    name: string;
}

export async function fetchStoresWithNames(): Promise<StoreItem[]> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/stores`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching stores');
    return response.json();
}

export interface ValidacionResult {
    codAlmacen: string;
    local: string;
    ano: number;
    mes: number;
    canal: string;
    tipo: string;
    consolidado: number;
    sumaDiaria: number;
    diferencia: number;
    match: boolean;
}

// Config
export async function fetchModeloConfig(): Promise<ModeloConfig[]> {
    try {
        const response = await fetch(`${API_BASE}/modelo-presupuesto/config`, { headers: authHeaders() });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : (data ? [data] : []);
    } catch { return []; }
}

export async function saveModeloConfig(data: Partial<ModeloConfig>): Promise<{ success: boolean; id: number }> {
    const url = data.id
        ? `${API_BASE}/modelo-presupuesto/config/${data.id}`
        : `${API_BASE}/modelo-presupuesto/config`;
    const response = await fetch(url, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export async function deleteModeloConfig(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/config/${id}`, {
        method: 'DELETE', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

// Calculation
export async function ejecutarRecalculo(nombrePresupuesto?: string, codAlmacen?: string, mes?: number): Promise<{ success: boolean; totalRegistros?: number; duracionSegundos?: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min timeout
    try {
        const response = await fetch(`${API_BASE}/modelo-presupuesto/calcular`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ nombrePresupuesto, codAlmacen, mes }),
            signal: controller.signal
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
        return response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

// Consolidado Mensual
export async function fetchConsolidadoMensual(ano: number, codAlmacen?: string, tipo?: string): Promise<ConsolidadoRow[]> {
    const params = new URLSearchParams({ ano: ano.toString() });
    if (codAlmacen) params.set('codAlmacen', codAlmacen);
    if (tipo) params.set('tipo', tipo);
    const response = await fetch(`${API_BASE}/modelo-presupuesto/consolidado?${params}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching consolidado');
    return response.json();
}

export async function saveConsolidadoMensual(rows: ConsolidadoRow[]): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/consolidado`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ rows })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export async function initializeConsolidadoYear(ano: number): Promise<{ success: boolean; inserted: number }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/consolidado/inicializar`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ ano })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

// Resumen Mensual (monthly totals from budget table — for AjusteChart)
export async function fetchResumenMensual(nombrePresupuesto: string, codAlmacen?: string, tipo?: string): Promise<{ mes: number; total: number }[]> {
    const params = new URLSearchParams({ nombrePresupuesto });
    if (codAlmacen) params.set('codAlmacen', codAlmacen);
    if (tipo) params.set('tipo', tipo);
    const response = await fetch(`${API_BASE}/modelo-presupuesto/resumen-mensual?${params}`, { headers: authHeaders() });
    if (!response.ok) return [];
    return response.json();
}

// Daily data for adjustment chart
export interface DatosAjusteDia {
    Fecha: string;
    idDia: number;
    Dia: number;
    Presupuesto: number;
    RealValor: number;
    AnoAnterior: number;
    AnoAnteriorAjustado: number;
    PresupuestoAcum: number;
    AnoAnteriorAcum: number;
    AnoAnteriorAjustadoAcum: number;
    DiferenciaPresupuesto: number;
    DiferenciaAnoAnterior: number;
}

export async function fetchDatosAjuste(
    nombrePresupuesto: string, codAlmacen: string, canal: string, tipo: string, mes?: number, ano?: number
): Promise<DatosAjusteDia[]> {
    const params = new URLSearchParams({ nombrePresupuesto, codAlmacen, canal, tipo });
    if (mes) params.set('mes', mes.toString());
    if (ano) params.set('ano', ano.toString());
    const response = await fetch(`${API_BASE}/modelo-presupuesto/datos-ajuste?${params}`, { headers: authHeaders() });
    if (!response.ok) return [];
    return response.json();
}

// Adjustments
export async function fetchAjustes(nombrePresupuesto: string): Promise<AjustePresupuesto[]> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/ajustes?nombrePresupuesto=${encodeURIComponent(nombrePresupuesto)}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching ajustes');
    return response.json();
}

export async function aplicarAjuste(data: {
    nombrePresupuesto: string; codAlmacen: string; mes: number; canal: string; tipo: string;
    metodoAjuste: string; valorAjuste: number; metodoDistribucion: string; motivo: string;
    fecha?: string; dia?: number;
}): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/ajustes/aplicar`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export interface CanalTotal {
    Canal: string;
    Total: number;
}

export async function fetchCanalTotals(
    nombrePresupuesto: string, codAlmacen: string, mes: number, ano: number
): Promise<CanalTotal[]> {
    const params = new URLSearchParams({
        nombrePresupuesto, codAlmacen,
        mes: mes.toString(), ano: ano.toString(), tipo: 'Ventas'
    });
    const response = await fetch(`${API_BASE}/modelo-presupuesto/canal-totals?${params}`, { headers: authHeaders() });
    if (!response.ok) return [];
    return response.json();
}

export async function previewAjuste(data: {
    nombrePresupuesto: string; codAlmacen: string; mes: number; canal: string; tipo: string;
    metodoAjuste: string; valorAjuste: number; metodoDistribucion: string;
}): Promise<{ preview: any[] }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/ajustes/preview`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export async function desactivarAjuste(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/ajustes/${id}/desactivar`, {
        method: 'PUT', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

// Versions
export async function fetchVersiones(nombrePresupuesto: string): Promise<VersionPresupuesto[]> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/versiones?nombrePresupuesto=${encodeURIComponent(nombrePresupuesto)}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching versiones');
    return response.json();
}

export async function restaurarVersion(versionId: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/versiones/${versionId}/restaurar`, {
        method: 'POST', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export async function eliminarVersion(versionId: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/versiones/${versionId}`, {
        method: 'DELETE', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error al eliminar versión'); }
    return response.json();
}

// Bitacora
export async function fetchBitacora(filtros: {
    nombrePresupuesto: string; usuario?: string; mes?: number; desde?: string; hasta?: string;
}): Promise<BitacoraEntry[]> {
    const params = new URLSearchParams({ nombrePresupuesto: filtros.nombrePresupuesto });
    if (filtros.usuario) params.set('usuario', filtros.usuario);
    if (filtros.mes) params.set('mes', filtros.mes.toString());
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    const response = await fetch(`${API_BASE}/modelo-presupuesto/bitacora?${params}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching bitacora');
    return response.json();
}

// Referencias
export async function fetchReferencias(nombrePresupuesto: string, ano?: number): Promise<ReferenciaLocal[]> {
    const params = new URLSearchParams({ nombrePresupuesto });
    if (ano) params.set('ano', ano.toString());
    const response = await fetch(`${API_BASE}/modelo-presupuesto/referencias?${params}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching referencias');
    return response.json();
}

export async function saveReferencia(data: Partial<ReferenciaLocal>): Promise<{ success: boolean }> {
    const method = data.id ? 'PUT' : 'POST';
    const url = data.id ? `${API_BASE}/modelo-presupuesto/referencias/${data.id}` : `${API_BASE}/modelo-presupuesto/referencias`;
    const response = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(data) });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

export async function deleteReferencia(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/referencias/${id}`, {
        method: 'DELETE', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error'); }
    return response.json();
}

// Validation
export async function fetchValidacion(nombrePresupuesto: string): Promise<ValidacionResult[]> {
    const response = await fetch(`${API_BASE}/modelo-presupuesto/validacion?nombrePresupuesto=${encodeURIComponent(nombrePresupuesto)}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching validacion');
    return response.json();
}

// ==========================================
// LOGIN AUDIT LOG API (admin only)
// ==========================================

export interface LoginAuditEntry {
    id: number;
    email: string;
    nombre: string | null;
    exito: boolean;
    motivo: string | null;
    ip: string | null;
    userAgent: string | null;
    fecha: string;
}

export async function fetchLoginAudit(desde?: string, hasta?: string, email?: string): Promise<LoginAuditEntry[]> {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    if (email) params.set('email', email);
    const response = await fetch(`${API_BASE}/admin/login-log?${params}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching login audit');
    return response.json();
}

// ==========================================
// REPORTS MODULE API
// ==========================================

export interface ReportColumn {
    field: string;
    label: string;
    format: 'text' | 'currency' | 'number' | 'percent';
}

export interface Report {
    ID: number;
    Nombre: string;
    Descripcion: string | null;
    Icono: string;
    Categoria: string;
    QuerySQL: string;
    columnas: ReportColumn[];
    parametros: string[];
    Frecuencia: string;
    HoraEnvio: string;
    DiaSemana: number | null;
    DiaMes: number | null;
    FormatoSalida: string;
    TemplateAsunto: string | null;
    TemplateEncabezado: string | null;
    Activo: boolean;
    Orden: number;
    CreadoPor: string | null;
    FechaCreacion: string;
    TotalSuscriptores?: number;
    Suscrito?: number;
    SuscripcionActiva?: number;
    SuscripcionID?: number;
}

export interface ReportSubscription {
    ID: number;
    ReporteID: number;
    UsuarioID: number;
    Activo: boolean;
    EmailDestino: string | null;
    FrecuenciaPersonal: string | null;
    HoraEnvioPersonal: string | null;
    DiaSemanaPersonal: number | null;
    DiaMesPersonal: number | null;
    ParametrosFijos: string | null;
    UltimoEnvio: string | null;
    TotalEnvios: number;
    FechaSuscripcion: string;
    Nombre: string;
    Descripcion: string | null;
    Icono: string;
    Categoria: string;
    FrecuenciaDefault: string;
    HoraEnvioDefault: string;
    DiaSemanaDefault: number | null;
    DiaMesDefault: number | null;
}

export interface ReportAccess {
    ID: number;
    ReporteID: number;
    PerfilID: number;
    ReporteNombre: string;
    PerfilNombre: string;
}

export interface ReportPreviewResult {
    columns: ReportColumn[] | null;
    data: Record<string, any>[];
    rowCount: number;
}

// Catalog
export async function fetchReports(): Promise<Report[]> {
    const response = await fetch(`${API_BASE}/reports`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching reports');
    return response.json();
}

export async function createReport(data: Partial<Report>): Promise<{ success: boolean; id: number }> {
    const response = await fetch(`${API_BASE}/reports`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error creating report'); }
    return response.json();
}

export async function updateReport(id: number, data: Partial<Report>): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/reports/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error updating report'); }
    return response.json();
}

export async function deleteReport(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/reports/${id}`, {
        method: 'DELETE', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error deleting report'); }
    return response.json();
}

// Preview
export async function previewReport(id: number, params?: Record<string, string>): Promise<ReportPreviewResult> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const response = await fetch(`${API_BASE}/reports/${id}/preview${qs}`, { headers: authHeaders() });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error previewing report'); }
    return response.json();
}

// Subscriptions
export async function fetchReportSubscriptions(): Promise<ReportSubscription[]> {
    const response = await fetch(`${API_BASE}/reports/subscriptions`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching subscriptions');
    return response.json();
}

export async function subscribeToReport(id: number, config?: Record<string, any>): Promise<{ success: boolean; subscriptionId: number }> {
    const response = await fetch(`${API_BASE}/reports/${id}/subscribe`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(config || {})
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error subscribing'); }
    return response.json();
}

export async function unsubscribeFromReport(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/reports/${id}/subscribe`, {
        method: 'DELETE', headers: authHeaders()
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error unsubscribing'); }
    return response.json();
}

export async function updateReportSubscription(id: number, config: Record<string, any>): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/reports/${id}/subscribe`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(config)
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error updating subscription'); }
    return response.json();
}

// Access Control
export async function fetchReportAccess(): Promise<ReportAccess[]> {
    const response = await fetch(`${API_BASE}/reports/access`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Error fetching report access');
    return response.json();
}

export async function setReportAccess(reportId: number, perfilIds: number[]): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/reports/${reportId}/access`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ perfilIds })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error setting access'); }
    return response.json();
}

// Generate Now
export async function generateReport(id: number, params?: Record<string, string>, emailTo?: string): Promise<{ success: boolean; message: string; rowCount: number }> {
    const response = await fetch(`${API_BASE}/reports/${id}/generate`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ params: params || {}, emailTo })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error generating report'); }
    return response.json();
}

// ==========================================
// NOTIFICACIONES API
// ==========================================

export interface ClasificacionNotif {
    Id: number;
    Nombre: string;
    Color: string;
    Orden: number;
}

export interface NotificacionAdmin {
    Id: number;
    Titulo: string;
    Texto: string;
    ImagenUrl?: string | null;
    ClasificacionId: number;
    ClasificacionNombre: string;
    ClasificacionColor: string;
    NRepeticiones: number;
    RequiereComentario: 'none' | 'opcional' | 'obligatorio';
    RequiereCodigoEmpleado: boolean;
    ComunicarConFlamia: boolean;
    Activo: boolean;
    VistasCount?: number; // solo en pendientes
    FechaCreacion?: string;
}

export interface NotificacionVersion {
    Id: number;
    VersionId: string;
    Titulo: string;
    Texto: string;
    Tipo: string;
    Orden: number;
    Activo: boolean;
    FechaPublicacion?: string;
    FechaCreacion?: string;
}

export interface NotifLogEntry {
    Id: number;
    FechaVista: string;
    NumRepeticion: number;
    Comentario?: string;
    CodigoEmpleado?: string;
    Usuario: string;
    NombreUsuario: string;
    NotifTitulo: string;
    Tipo: string;
}

export interface NotifReporteAgrupado {
    Usuario: string;
    NombreUsuario: string;
    Ano: number;
    Mes: number;
    TotalVistas: number;
    NotifDistintas: number;
}

// GET clasificaciones
export async function fetchClasificaciones(): Promise<ClasificacionNotif[]> {
    const r = await fetch(`${API_BASE}/notificaciones/clasificaciones`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

// GET notificaciones pendientes (campana)
export async function fetchNotificacionesPendientes(versionActual?: string): Promise<{
    admin: NotificacionAdmin[];
    versiones: { VersionId: string; TotalNotif: number }[];
    total: number;
}> {
    const q = versionActual ? `?versionActual=${encodeURIComponent(versionActual)}` : '';
    const r = await fetch(`${API_BASE}/notificaciones/pendientes${q}`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

// POST revisar una notificación admin
export async function revisarNotificacion(id: number, comentario?: string, codigoEmpleado?: string): Promise<void> {
    const r = await fetch(`${API_BASE}/notificaciones/${id}/revisar`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ comentario, codigoEmpleado })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
}

// POST marcar versión como leída
export async function marcarVersionLeida(versionId: string): Promise<void> {
    const r = await fetch(`${API_BASE}/notificaciones/versiones/${encodeURIComponent(versionId)}/leer`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({})
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
}

// GET CRUD notificaciones admin
export async function fetchNotificacionesAdmin(): Promise<NotificacionAdmin[]> {
    const r = await fetch(`${API_BASE}/notificaciones`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

export async function saveNotificacionAdmin(data: Partial<NotificacionAdmin> & { id?: number }): Promise<number> {
    const isNew = !data.id;
    const r = await fetch(`${API_BASE}/notificaciones${isNew ? '' : `/${data.id}`}`, {
        method: isNew ? 'POST' : 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    const res = await r.json();
    return res.id || data.id!;
}

export async function deleteNotificacionAdmin(id: number): Promise<void> {
    const r = await fetch(`${API_BASE}/notificaciones/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
}

// GET CRUD notificaciones de versión
export async function fetchNotificacionesVersiones(versionId?: string): Promise<NotificacionVersion[]> {
    const q = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    const r = await fetch(`${API_BASE}/notificaciones/versiones${q}`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

export async function fetchVersionesDisponibles(): Promise<string[]> {
    const r = await fetch(`${API_BASE}/notificaciones/versiones-disponibles`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

export async function saveNotificacionVersion(data: Partial<NotificacionVersion> & { id?: number }): Promise<number> {
    const isNew = !data.id;
    const r = await fetch(`${API_BASE}/notificaciones/versiones${isNew ? '' : `/${data.id}`}`, {
        method: isNew ? 'POST' : 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    const res = await r.json();
    return res.id || data.id!;
}

export async function deleteNotificacionVersion(id: number): Promise<void> {
    const r = await fetch(`${API_BASE}/notificaciones/versiones/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
}

// GET Ruta (notificaciones de versiones futuras)
export async function fetchRuta(versionActual: string): Promise<NotificacionVersion[]> {
    const r = await fetch(`${API_BASE}/notificaciones/ruta?versionActual=${encodeURIComponent(versionActual)}`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

// GET reportes
export async function fetchNotifReporteLineal(filtros?: { desde?: string; hasta?: string; notifId?: number; usuarioId?: number }): Promise<NotifLogEntry[]> {
    const params = new URLSearchParams({ tipo: 'lineal', ...(filtros || {}) as any });
    const r = await fetch(`${API_BASE}/notificaciones/reportes?${params}`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}

export async function fetchNotifReporteAgrupado(filtros?: { desde?: string; hasta?: string }): Promise<NotifReporteAgrupado[]> {
    const params = new URLSearchParams({ tipo: 'agrupado', ...(filtros || {}) as any });
    const r = await fetch(`${API_BASE}/notificaciones/reportes?${params}`, { headers: authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Error'); }
    return r.json();
}
