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
    esAdmin: boolean;
    esProtegido: boolean;
    allowedStores: string[];
}


// ==========================================
// Token management
// ==========================================

export function getToken(): string | null {
    // Check sessionStorage first (for superadmin)
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

export function setToken(token: string, user?: any): void {
    // Don't store token for superadmin user (must always login manually)
    if (user && user.email === 'soporte@rostipolloscr.com') {
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
    // Don't store user for superadmin (must always login manually)
    if (user.email === 'soporte@rostipolloscr.com') {
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
    accesoTendencia: boolean = false,
    accesoTactica: boolean = false,
    accesoEventos: boolean = false,
    esAdmin: boolean = false
): Promise<{ success: boolean; userId: number; clave: string }> {
    const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email, nombre, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin })
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
    accesoTendencia: boolean,
    accesoTactica: boolean,
    accesoEventos: boolean,
    esAdmin: boolean
): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ email, nombre, activo, clave, stores, accesoTendencia, accesoTactica, accesoEventos, esAdmin })
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

// ==========================================
// Data API (authenticated)
// ==========================================

export async function fetchBudgetData(year: number = 2026, local?: string, canal: string = 'Todos', tipo: string = 'Ventas'): Promise<BudgetRecord[]> {
    const params = new URLSearchParams({ year: year.toString(), canal, tipo });
    if (local) {
        params.set('local', local);
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
        MontoAcumulado: parseFloat(row.Monto_Acumulado) || parseFloat(row.MontoAcumulado) || 0,
        MontoAnterior: parseFloat(row.MontoAnterior) || 0,
        MontoAnteriorAcumulado: parseFloat(row.MontoAnterior_Acumulado) || parseFloat(row.MontoAnteriorAcumulado) || 0,
        MontoAnteriorAjustado: parseFloat(row.MontoAnteriorAjustado) || 0,
        MontoAnteriorAjustadoAcumulado: parseFloat(row.MontoAnteriorAjustado_Acumulado) || parseFloat(row.MontoAnteriorAjustadoAcumulado) || 0,
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
