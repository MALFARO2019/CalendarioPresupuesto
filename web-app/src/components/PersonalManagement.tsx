import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getToken, fetchPersonalStores, fetchLocalesSinCobertura, fetchCargos, createCargo, deleteCargo, fetchAsignaciones } from '../api';
import { Plus, Edit2, Trash2, UserCheck, MapPin, RefreshCw, X, ChevronDown, ChevronUp, Calendar, AlertTriangle, Shield, Search, Briefcase, Settings } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Persona {
    ID: number;
    NOMBRE: string;
    CORREO: string | null;
    CEDULA: string | null;
    TELEFONO: string | null;
    ACTIVO: boolean;
    TotalAsignaciones: number;
}

interface Asignacion {
    ID: number;
    PERSONAL_ID: number;
    PERSONAL_NOMBRE: string;
    LOCAL: string;
    PERFIL: string;
    FECHA_INICIO: string;
    FECHA_FIN: string | null;
    NOTAS: string | null;
    ACTIVO: boolean;
}

interface Cargo {
    ID: number;
    NOMBRE: string;
    ACTIVO: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PersonalManagement: React.FC = () => {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'personas' | 'asignaciones' | 'gestionar' | 'cobertura'>('asignaciones');
    const [allStores, setAllStores] = useState<string[]>([]);
    const [localesSinCobertura, setLocalesSinCobertura] = useState<{ Local: string, PerfilesFaltantes: string }[]>([]);
    const [loadingCobertura, setLoadingCobertura] = useState(false);

    // Persona form
    const [showPersonaForm, setShowPersonaForm] = useState(false);
    const [editPersona, setEditPersona] = useState<Persona | null>(null);
    const [pNombre, setPNombre] = useState('');
    const [pCorreo, setPCorreo] = useState('');
    const [pCedula, setPCedula] = useState('');
    const [pTelefono, setPTelefono] = useState('');
    const [savingPersona, setSavingPersona] = useState(false);

    // Asignacion form
    const [showAsigForm, setShowAsigForm] = useState(false);
    const [editAsig, setEditAsig] = useState<Asignacion | null>(null);
    const [aPersonalId, setAPersonalId] = useState('');
    const [aLocal, setALocal] = useState('');
    const [aPerfil, setAPerfil] = useState('');
    const [aFechaInicio, setAFechaInicio] = useState('');
    const [aFechaFin, setAFechaFin] = useState('');
    const [aNotas, setANotas] = useState('');
    const [savingAsig, setSavingAsig] = useState(false);

    // Cargos Manager
    const [showCargosModal, setShowCargosModal] = useState(false);
    const [newCargoName, setNewCargoName] = useState('');
    const [showDeleteCargoModal, setShowDeleteCargoModal] = useState(false);
    const [cargoToDelete, setCargoToDelete] = useState<Cargo | null>(null);
    const [cargoReassignTo, setCargoReassignTo] = useState('');

    // Filters
    const [filterPersona, setFilterPersona] = useState('');
    const [filterLocal, setFilterLocal] = useState('');
    const [filterPerfil, setFilterPerfil] = useState('');
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [coberturaPerfil, setCoberturaPerfil] = useState('Supervisor');
    const [coberturaMonth, setCoberturaMonth] = useState(new Date().getMonth() + 1);
    const [coberturaYear, setCoberturaYear] = useState(new Date().getFullYear());
    const [expandedPersona, setExpandedPersona] = useState<number | null>(null);

    const [error, setError] = useState<string | null>(null);

    const activeCargos = cargos.map(c => c.NOMBRE);

    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    // ─── Load ─────────────────────────────────────────────────────────────────

    const loadCargos = useCallback(async () => {
        try {
            const data = await fetchCargos();
            setCargos(data);
        } catch (e: any) { console.error('Error loading cargos', e); }
    }, []);

    const loadPersonas = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API_BASE}/personal`, { headers: headers() });
            const d = await r.json();
            setPersonas(Array.isArray(d) ? d : []);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const loadAsignaciones = useCallback(async () => {
        try {
            // Can pass month/year here later if needed
            const d = await fetchAsignaciones();
            setAsignaciones(d);
        } catch (e: any) { setError(e.message); }
    }, []);

    const loadStores = useCallback(async () => {
        try {
            const stores = await fetchPersonalStores();
            setAllStores(stores);
        } catch (e: any) { console.error('Error loading stores', e); }
    }, []);

    const loadCobertura = useCallback(async () => {
        if (activeTab !== 'cobertura') return;
        setLoadingCobertura(true);
        setError(null);
        try {
            const data = await fetchLocalesSinCobertura(coberturaPerfil, coberturaMonth, coberturaYear);
            setLocalesSinCobertura(data);
        } catch (e: any) {
            console.error(e);
            setError(e.message);
            setLocalesSinCobertura([]);
        }
        finally { setLoadingCobertura(false); }
    }, [activeTab, coberturaPerfil, coberturaMonth, coberturaYear]);

    useEffect(() => {
        loadCargos();
        loadPersonas();
        loadAsignaciones();
        loadStores();
    }, [loadCargos, loadPersonas, loadAsignaciones, loadStores]);

    useEffect(() => {
        loadCobertura();
    }, [loadCobertura]);

    // ─── Persona CRUD ─────────────────────────────────────────────────────────

    const openPersonaForm = (p?: Persona) => {
        setEditPersona(p || null);
        setPNombre(p?.NOMBRE || '');
        setPCorreo(p?.CORREO || '');
        setPCedula(p?.CEDULA || '');
        setPTelefono(p?.TELEFONO || '');
        setShowPersonaForm(true);
    };

    const savePersona = async () => {
        if (!pNombre.trim()) { setError('El nombre es requerido'); return; }
        setSavingPersona(true);
        setError(null);
        try {
            const url = editPersona ? `${API_BASE}/personal/${editPersona.ID}` : `${API_BASE}/personal`;
            const method = editPersona ? 'PUT' : 'POST';
            const r = await fetch(url, { method, headers: headers(), body: JSON.stringify({ nombre: pNombre, correo: pCorreo, cedula: pCedula, telefono: pTelefono }) });
            if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error al guardar'); }
            setShowPersonaForm(false);
            await loadPersonas();
        } catch (e: any) { setError(e.message); }
        finally { setSavingPersona(false); }
    };

    const deletePersona = async (p: Persona) => {
        if (!confirm(`¿Desactivar a "${p.NOMBRE}"?`)) return;
        try {
            await fetch(`${API_BASE}/personal/${p.ID}`, { method: 'DELETE', headers: headers() });
            await loadPersonas();
        } catch (e: any) { setError(e.message); }
    };

    // ─── Asignacion CRUD ──────────────────────────────────────────────────────

    const openAsigForm = (a?: Asignacion) => {
        setEditAsig(a || null);
        setAPersonalId(a?.PERSONAL_ID?.toString() || '');
        setALocal(a?.LOCAL || '');
        setAPerfil(a?.PERFIL || '');
        setAFechaInicio(a?.FECHA_INICIO?.split('T')[0] || '');
        setAFechaFin(a?.FECHA_FIN?.split('T')[0] || '');
        setANotas(a?.NOTAS || '');
        setShowAsigForm(true);
    };

    const saveAsig = async () => {
        if (!aPersonalId || !aLocal || !aPerfil || !aFechaInicio) { setError('Persona, local, perfil y fecha inicio son requeridos'); return; }
        setSavingAsig(true);
        setError(null);
        try {
            const url = editAsig ? `${API_BASE}/personal/asignaciones/${editAsig.ID}` : `${API_BASE}/personal/asignaciones`;
            const method = editAsig ? 'PUT' : 'POST';
            const r = await fetch(url, {
                method, headers: headers(),
                body: JSON.stringify({ personalId: parseInt(aPersonalId), local: aLocal, perfil: aPerfil, fechaInicio: aFechaInicio, fechaFin: aFechaFin || null, notas: aNotas || null })
            });
            if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error al guardar'); }
            setShowAsigForm(false);
            await loadAsignaciones(); await loadPersonas();
        } catch (e: any) { setError(e.message); }
        finally { setSavingAsig(false); }
    };

    const deleteAsig = async (a: Asignacion) => {
        if (!confirm(`¿Eliminar asignación de "${a.PERSONAL_NOMBRE}" en ${a.LOCAL}?`)) return;
        try {
            await fetch(`${API_BASE}/personal/asignaciones/${a.ID}`, { method: 'DELETE', headers: headers() });
            await loadAsignaciones(); await loadPersonas();
        } catch (e: any) { setError(e.message); }
    };

    // ─── Derived ──────────────────────────────────────────────────────────────

    const filteredAsig = asignaciones.filter(a => {
        const q = filterPersona.toLowerCase();
        const ql = filterLocal.toLowerCase();
        const qp = filterPerfil.toLowerCase();

        // Date filter: Active within range
        const start = filterDateStart ? new Date(filterDateStart) : null;
        const end = filterDateEnd ? new Date(filterDateEnd) : null;
        const aStart = new Date(a.FECHA_INICIO);
        const aEnd = a.FECHA_FIN ? new Date(a.FECHA_FIN) : null;

        const inDateRange = (!start || (!aEnd || aEnd >= start)) &&
            (!end || aStart <= end);

        return (!q || a.PERSONAL_NOMBRE.toLowerCase().includes(q))
            && (!ql || a.LOCAL.toLowerCase().includes(ql))
            && (!qp || a.PERFIL.toLowerCase().includes(qp))
            && inDateRange;
    }).sort((a, b) => new Date(b.FECHA_INICIO).getTime() - new Date(a.FECHA_INICIO).getTime());

    const fmtDate = (d: string | null) => !d ? '—' : new Date(d).toLocaleDateString('es-CR', { timeZone: 'UTC' });
    const isVigente = (a: Asignacion) => !a.FECHA_FIN || new Date(a.FECHA_FIN) >= new Date();



    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">👥 Control de Personal</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Asignaciones de personal a locales por perfil</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { loadPersonas(); loadAsignaciones(); loadCargos(); }} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Actualizar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-red-700 text-sm">{error}</span>
                    <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-500" /></button>
                </div>
            )}

            <div className="flex items-center gap-1 sm:gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
                {(['asignaciones', 'personas', 'gestionar', 'cobertura'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab === 'asignaciones' ? `📋 Asignaciones (${asignaciones.length})` : tab === 'personas' ? `👤 Personal (${personas.length})` : tab === 'gestionar' ? `⚙️ Perfiles (${cargos.length})` : '🛡️ Cobertura'}
                    </button>
                ))}
            </div>

            {/* ── TAB: Asignaciones ── */}
            {activeTab === 'asignaciones' && (
                <div>
                    {/* Toolbar */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        <button onClick={() => openAsigForm()} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                            <Plus className="w-4 h-4" /> Nueva Asignación
                        </button>
                        <input type="text" value={filterPersona} onChange={e => setFilterPersona(e.target.value)} placeholder="🔍 Persona..." className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 min-w-[120px] max-w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        <select value={filterLocal} onChange={e => setFilterLocal(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">Todos los locales</option>
                            {allStores.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select value={filterPerfil} onChange={e => setFilterPerfil(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">Todos los perfiles</option>
                            {activeCargos.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="py-2 text-sm border-none focus:ring-0 w-32" placeholder="Desde" />
                            <span className="text-gray-400">-</span>
                            <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="py-2 text-sm border-none focus:ring-0 w-32" placeholder="Hasta" />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Persona</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Local</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Perfil</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Inicio</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Fin</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredAsig.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay asignaciones. Haz clic en "Nueva Asignación" para comenzar.</td></tr>
                                    ) : filteredAsig.map(a => (
                                        <tr key={a.ID} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800">{a.PERSONAL_NOMBRE}</div>
                                                {a.NOTAS && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{a.NOTAS}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="flex items-center gap-1 text-gray-700"><MapPin className="w-3 h-3 text-gray-400" />{a.LOCAL}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{a.PERFIL}</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{fmtDate(a.FECHA_INICIO)}</td>
                                            <td className="px-4 py-3 text-gray-600">{fmtDate(a.FECHA_FIN)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isVigente(a) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {isVigente(a) ? 'Vigente' : 'Vencida'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1">
                                                    <button onClick={() => openAsigForm(a)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => deleteAsig(a)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: Personal ── */}
            {activeTab === 'personas' && (
                <div>
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => openPersonaForm()} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                            <Plus className="w-4 h-4" /> Nueva Persona
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-center py-10 text-gray-400">Cargando...</div>
                    ) : (
                        <div className="space-y-2">
                            {personas.filter(p => p.ACTIVO).map(p => (
                                <div key={p.ID} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                {p.NOMBRE.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-800">{p.NOMBRE}</div>
                                                <div className="text-xs text-gray-400">{p.CORREO || p.CEDULA || '—'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                <UserCheck className="w-3 h-3 inline mr-1" />{p.TotalAsignaciones} asig.
                                            </span>
                                            <button onClick={() => openPersonaForm(p)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => deletePersona(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setExpandedPersona(expandedPersona === p.ID ? null : p.ID)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
                                                {expandedPersona === p.ID ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    {expandedPersona === p.ID && (
                                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                                            <p className="text-xs font-semibold text-gray-500 mb-2">ASIGNACIONES ACTIVAS</p>
                                            {asignaciones.filter(a => a.PERSONAL_ID === p.ID && isVigente(a)).length === 0 ? (
                                                <p className="text-xs text-gray-400">Sin asignaciones activas</p>
                                            ) : asignaciones.filter(a => a.PERSONAL_ID === p.ID && isVigente(a)).map(a => (
                                                <div key={a.ID} className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                                                    <MapPin className="w-3 h-3 text-gray-400" />
                                                    <span className="font-medium">{a.LOCAL}</span>
                                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{a.PERFIL}</span>
                                                    <span className="text-gray-400">desde {fmtDate(a.FECHA_INICIO)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: Cobertura ── */}
            {activeTab === 'cobertura' && (
                <div>
                    <div className="flex flex-wrap gap-4 mb-6 bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-orange-800 uppercase mb-2">Perfil a analizar</label>
                            <select
                                value={coberturaPerfil}
                                onChange={e => setCoberturaPerfil(e.target.value)}
                                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 bg-white text-orange-900 font-semibold"
                            >
                                {activeCargos.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-orange-800 uppercase mb-2">Mes</label>
                            <select
                                value={coberturaMonth}
                                onChange={e => setCoberturaMonth(parseInt(e.target.value))}
                                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 bg-white text-orange-900 font-semibold"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('es-CR', { month: 'long' })}</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-24">
                            <label className="block text-xs font-bold text-orange-800 uppercase mb-2">Año</label>
                            <select
                                value={coberturaYear}
                                onChange={e => setCoberturaYear(parseInt(e.target.value))}
                                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 bg-white text-orange-900 font-semibold"
                            >
                                {[2024, 2025, 2026, 2027].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={loadCobertura}
                                disabled={loadingCobertura}
                                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingCobertura ? 'animate-spin' : ''}`} />
                                Analizar
                            </button>
                        </div>
                    </div>

                    {localesSinCobertura.length === 0 && !loadingCobertura && !error ? (
                        <div className="text-center py-12 bg-green-50 rounded-xl border border-green-100">
                            <Shield className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-green-800">¡Cobertura Completa!</h3>
                            <p className="text-green-600">Todos los locales tienen el perfil <strong>{coberturaPerfil}</strong> asignado.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {localesSinCobertura.map((item, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-red-100 hover:shadow-md transition-shadow flex items-start gap-4">
                                    <div className="p-3 bg-red-50 rounded-full flex-shrink-0">
                                        <AlertTriangle className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800 text-lg mb-1">{item.Local}</h4>
                                        <p className="text-sm text-red-600 bg-red-50 px-2 py-0.5 rounded inline-block">Falta: {item.PerfilesFaltantes}</p>
                                        <button
                                            onClick={() => {
                                                setALocal(item.Local);
                                                setAPerfil(coberturaPerfil);
                                                setAFechaInicio(new Date().toISOString().split('T')[0]);
                                                setShowAsigForm(true);
                                            }}
                                            className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Asignar ahora
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: Gestionar Perfiles ── */}
            {activeTab === 'gestionar' && (
                <div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-indigo-600" /> Gestión de Perfiles
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">Administra los perfiles disponibles para asignar al personal.</p>

                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newCargoName}
                                onChange={e => setNewCargoName(e.target.value)}
                                placeholder="Nuevo perfil..."
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && newCargoName.trim()) {
                                        (async () => {
                                            try { await createCargo(newCargoName); setNewCargoName(''); loadCargos(); } catch (err: any) { setError(err.message); }
                                        })();
                                    }
                                }}
                            />
                            <button
                                onClick={async () => {
                                    if (!newCargoName.trim()) return;
                                    try { await createCargo(newCargoName); setNewCargoName(''); loadCargos(); } catch (e: any) { setError(e.message); }
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" /> Agregar
                            </button>
                        </div>

                        {cargos.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
                                <p className="text-sm">No hay perfiles definidos.</p>
                                <p className="text-xs mt-1">Agrega uno usando el campo de arriba.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cargos.map(c => (
                                    <div key={c.ID} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                            <span className="font-medium text-gray-700">{c.NOMBRE}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setCargoToDelete(c);
                                                setCargoReassignTo('');
                                                setShowDeleteCargoModal(true);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title={`Eliminar ${c.NOMBRE}`}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Modal: Persona ── */}
            {showPersonaForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPersonaForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800 mb-4">{editPersona ? '✏️ Editar Persona' : '👤 Nueva Persona'}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                                <input type="text" value={pNombre} onChange={e => setPNombre(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Nombre completo" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Correo</label>
                                <input type="email" value={pCorreo} onChange={e => setPCorreo(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="correo@empresa.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className='col-span-1'>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Cédula</label>
                                    <input type="text" value={pCedula} onChange={e => setPCedula(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <div className='col-span-1'>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                                    <input type="text" value={pTelefono} onChange={e => setPTelefono(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button onClick={savePersona} disabled={savingPersona} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                {savingPersona ? 'Guardando...' : '💾 Guardar'}
                            </button>
                            <button onClick={() => setShowPersonaForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Asignación ── */}
            {showAsigForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAsigForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800 mb-4">{editAsig ? '✏️ Editar Asignación' : '📋 Nueva Asignación'}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Persona *</label>
                                <select value={aPersonalId} onChange={e => setAPersonalId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                    <option value="">Seleccionar persona...</option>
                                    {personas.filter(p => p.ACTIVO).map(p => <option key={p.ID} value={p.ID}>{p.NOMBRE}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Local *</label>
                                <select value={aLocal} onChange={e => setALocal(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                    <option value="">Seleccionar local...</option>
                                    {allStores.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Perfil *</label>
                                <select value={aPerfil} onChange={e => setAPerfil(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                    <option value="">Seleccionar perfil...</option>
                                    {activeCargos.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Inicio *</label>
                                    <input type="date" value={aFechaInicio} onChange={e => setAFechaInicio(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Fin</label>
                                    <input type="date" value={aFechaFin} onChange={e => setAFechaFin(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Notas</label>
                                <textarea value={aNotas} onChange={e => setANotas(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" placeholder="Observaciones opcionales..." />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button onClick={saveAsig} disabled={savingAsig} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                {savingAsig ? 'Guardando...' : '💾 Guardar'}
                            </button>
                            <button onClick={() => setShowAsigForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}



            {/* ── Modal: Eliminar Cargo ── */}
            {showDeleteCargoModal && cargoToDelete && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 text-center mb-2">¿Eliminar perfil?</h3>
                        <p className="text-sm text-gray-500 text-center mb-6">
                            Estás a punto de eliminar el perfil <strong>"{cargoToDelete.NOMBRE}"</strong>.
                            Si hay asignaciones activas con este perfil, debes reasignarlas.
                        </p>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Reasignar a (Opcional)</label>
                            <select
                                value={cargoReassignTo}
                                onChange={e => setCargoReassignTo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="">-- No reasignar (Mantener historial) --</option>
                                {cargos.filter(c => c.ID !== cargoToDelete.ID).map(c => (
                                    <option key={c.ID} value={c.NOMBRE}>{c.NOMBRE}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        await deleteCargo(cargoToDelete.ID, cargoReassignTo || undefined);
                                        setShowDeleteCargoModal(false);
                                        setShowCargosModal(false); // Close parent too to refresh
                                        loadCargos();
                                        loadAsignaciones(); // Refresh assignments too as they might have changed
                                    } catch (e: any) {
                                        alert(e.message);
                                    }
                                }}
                                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
                            >
                                Eliminar
                            </button>
                            <button
                                onClick={() => setShowDeleteCargoModal(false)}
                                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
