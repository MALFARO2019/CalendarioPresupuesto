import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from './ui/Toast';
import { API_BASE, getToken, fetchPersonalStores, fetchLocalesSinCobertura, fetchAsignaciones, fetchProfiles, fetchPersonal, createAsignacion, updateAsignacion, deleteAsignacion as apiDeleteAsignacion, fetchCargos, updateCargo } from '../api';
import type { Profile, PersonalItem, Asignacion, Cargo } from '../api';
import { Plus, Edit2, Trash2, MapPin, RefreshCw, X, Calendar, AlertTriangle, Shield, Search } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';

// ─── Component ────────────────────────────────────────────────────────────────

export const PersonalManagement: React.FC = () => {
    const { showConfirm } = useToast();
    const [usuarios, setUsuarios] = useState<PersonalItem[]>([]);
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'asignaciones' | 'cobertura' | 'cargos'>('asignaciones');
    const [allStores, setAllStores] = useState<string[]>([]);
    const [localesSinCobertura, setLocalesSinCobertura] = useState<{ Local: string, PerfilesFaltantes: string }[]>([]);
    const [loadingCobertura, setLoadingCobertura] = useState(false);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [savingCargo, setSavingCargo] = useState<number | null>(null);

    // Asignacion form
    const [showAsigForm, setShowAsigForm] = useState(false);
    const [editAsig, setEditAsig] = useState<Asignacion | null>(null);
    const [aUsuarioId, setAUsuarioId] = useState('');
    const [aLocal, setALocal] = useState('');
    const [aPerfil, setAPerfil] = useState('');
    const [aFechaInicio, setAFechaInicio] = useState('');
    const [aFechaFin, setAFechaFin] = useState('');
    const [aNotas, setANotas] = useState('');
    const [savingAsig, setSavingAsig] = useState(false);

    // Filters
    const [filterUsuario, setFilterUsuario] = useState('');
    const [filterLocal, setFilterLocal] = useState('');
    const [filterPerfil, setFilterPerfil] = useState('');
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [coberturaPerfil, setCoberturaPerfil] = useState('Supervisor');
    const [coberturaMonth, setCoberturaMonth] = useState(new Date().getMonth() + 1);
    const [coberturaYear, setCoberturaYear] = useState(new Date().getFullYear());


    const [error, setError] = useState<string | null>(null);

    const activeProfileNames = profiles.map(p => p.nombre);

    // Memoized options for SearchableSelect
    const usuarioOptions = useMemo(() => usuarios.filter(u => u.ACTIVO).map(u => ({ value: u.ID.toString(), label: u.NOMBRE })), [usuarios]);
    const localOptions = useMemo(() => allStores.map(l => ({ value: l, label: l })), [allStores]);
    const perfilOptions = useMemo(() => profiles.map(p => ({ value: p.id.toString(), label: p.nombre })), [profiles]);

    // ─── Load ─────────────────────────────────────────────────────────────────

    const loadProfiles = useCallback(async () => {
        try {
            const data = await fetchProfiles();
            setProfiles(data);
        } catch (e: any) { console.error('Error loading profiles', e); }
    }, []);

    const loadUsuarios = useCallback(async () => {
        setLoading(true);
        try {
            const d = await fetchPersonal();
            setUsuarios(Array.isArray(d) ? d : []);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const loadAsignaciones = useCallback(async () => {
        try {
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

    const loadCargos = useCallback(async () => {
        try {
            const data = await fetchCargos();
            setCargos(data);
        } catch (e: any) { console.error('Error loading cargos', e); }
    }, []);

    const toggleCargoVisibility = async (cargoId: number, field: string, currentValue: boolean) => {
        setSavingCargo(cargoId);
        try {
            await updateCargo(cargoId, { [field]: !currentValue });
            await loadCargos();
        } catch (e: any) { setError(e.message); }
        finally { setSavingCargo(null); }
    };

    useEffect(() => {
        loadProfiles();
        loadUsuarios();
        loadAsignaciones();
        loadStores();
        loadCargos();
    }, [loadProfiles, loadUsuarios, loadAsignaciones, loadStores, loadCargos]);

    useEffect(() => {
        loadCobertura();
    }, [loadCobertura]);

    // ─── Asignacion CRUD ──────────────────────────────────────────────────────

    const openAsigForm = (a?: Asignacion) => {
        setEditAsig(a || null);
        setAUsuarioId(a?.USUARIO_ID?.toString() || '');
        setALocal(a?.LOCAL || '');
        setAPerfil(a?.PERFIL_ID?.toString() || '');
        setAFechaInicio(a?.FECHA_INICIO?.split('T')[0] || '');
        setAFechaFin(a?.FECHA_FIN?.split('T')[0] || '');
        setANotas(a?.NOTAS || '');
        setShowAsigForm(true);
    };

    const saveAsig = async () => {
        if (!aUsuarioId || !aLocal || !aPerfil || !aFechaInicio) { setError('Usuario, local, perfil y fecha inicio son requeridos'); return; }
        setSavingAsig(true);
        setError(null);
        const perfilId = parseInt(aPerfil);
        const perfilObj = profiles.find(p => p.id === perfilId);
        const perfilNombre = perfilObj?.nombre || '';
        try {
            if (editAsig) {
                await updateAsignacion(editAsig.ID, aLocal, perfilNombre, aFechaInicio, aFechaFin || undefined, aNotas || undefined, perfilId);
            } else {
                await createAsignacion(parseInt(aUsuarioId), aLocal, perfilNombre, aFechaInicio, aFechaFin || undefined, aNotas || undefined, perfilId);
            }
            setShowAsigForm(false);
            await loadAsignaciones(); await loadUsuarios();
        } catch (e: any) { setError(e.message); }
        finally { setSavingAsig(false); }
    };

    const deleteAsig = async (a: Asignacion) => {
        if (!await showConfirm({ message: `¿Eliminar asignación de "${a.USUARIO_NOMBRE}" en ${a.LOCAL}?`, destructive: true })) return;
        try {
            await apiDeleteAsignacion(a.ID);
            await loadAsignaciones(); await loadUsuarios();
        } catch (e: any) { setError(e.message); }
    };

    // ─── Derived ──────────────────────────────────────────────────────────────

    const filteredAsig = asignaciones.filter(a => {
        const q = filterUsuario.toLowerCase();
        const ql = filterLocal.toLowerCase();
        const qp = filterPerfil.toLowerCase();

        const start = filterDateStart ? new Date(filterDateStart) : null;
        const end = filterDateEnd ? new Date(filterDateEnd) : null;
        const aStart = new Date(a.FECHA_INICIO);
        const aEnd = a.FECHA_FIN ? new Date(a.FECHA_FIN) : null;

        const inDateRange = (!start || (!aEnd || aEnd >= start)) &&
            (!end || aStart <= end);

        return (!q || a.USUARIO_NOMBRE.toLowerCase().includes(q))
            && (!ql || a.LOCAL.toLowerCase().includes(ql))
            && (!qp || (a.PERFIL_ACTUAL || a.PERFIL).toLowerCase().includes(qp))
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
                    <h2 className="text-xl font-bold text-gray-800">👥 Asignaciones de Usuarios</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Asignaciones de usuarios a locales por perfil</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { loadUsuarios(); loadAsignaciones(); loadProfiles(); }} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Actualizar">
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
                {(['asignaciones', 'cobertura', 'cargos'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab === 'asignaciones' ? `📋 Asignaciones (${asignaciones.length})` : tab === 'cobertura' ? '🛡️ Cobertura' : '🏷️ Cargos'}
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
                        <input type="text" value={filterUsuario} onChange={e => setFilterUsuario(e.target.value)} placeholder="🔍 Usuario..." className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 min-w-[120px] max-w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        <SearchableSelect
                            options={[{ value: '', label: 'Todos los locales' }, ...localOptions]}
                            value={filterLocal}
                            onChange={setFilterLocal}
                            placeholder="Todos los locales"
                            className="min-w-[160px]"
                        />
                        <SearchableSelect
                            options={[{ value: '', label: 'Todos los perfiles' }, ...perfilOptions]}
                            value={filterPerfil}
                            onChange={setFilterPerfil}
                            placeholder="Todos los perfiles"
                            className="min-w-[160px]"
                        />
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
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuario</th>
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
                                                <div className="font-medium text-gray-800">{a.USUARIO_NOMBRE}</div>
                                                {a.NOTAS && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{a.NOTAS}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="flex items-center gap-1 text-gray-700"><MapPin className="w-3 h-3 text-gray-400" />{a.LOCAL}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{a.PERFIL_ACTUAL || a.PERFIL}</span>
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
                                {activeProfileNames.map(p => <option key={p} value={p}>{p}</option>)}
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

            {/* ── TAB: Cargos (Visibility per View) ── */}
            {activeTab === 'cargos' && (
                <div>
                    <p className="text-sm text-gray-500 mb-4">Configura en cuáles vistas se muestra cada cargo/perfil junto al nombre del local.</p>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Cargo</th>
                                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Alcance</th>
                                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Mensual</th>
                                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Anual</th>
                                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Tendencia</th>
                                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Rangos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {cargos.filter(c => c.ACTIVO).map(cargo => (
                                        <tr key={cargo.ID} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-800">
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{cargo.NOMBRE}</span>
                                            </td>
                                            {[
                                                { field: 'mostrarEnAlcance', value: cargo.MostrarEnAlcance },
                                                { field: 'mostrarEnMensual', value: cargo.MostrarEnMensual },
                                                { field: 'mostrarEnAnual', value: cargo.MostrarEnAnual },
                                                { field: 'mostrarEnTendencia', value: cargo.MostrarEnTendencia },
                                                { field: 'mostrarEnRangos', value: cargo.MostrarEnRangos },
                                            ].map(({ field, value }) => (
                                                <td key={field} className="text-center px-2 py-3">
                                                    <button
                                                        onClick={() => toggleCargoVisibility(cargo.ID, field, value)}
                                                        disabled={savingCargo === cargo.ID}
                                                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${value
                                                            ? 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600'
                                                            : 'bg-white border-gray-300 text-transparent hover:border-indigo-300'
                                                            } ${savingCargo === cargo.ID ? 'opacity-50' : ''}`}
                                                    >
                                                        {value && <span className="text-xs font-bold">✓</span>}
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {cargos.filter(c => c.ACTIVO).length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay cargos configurados.</td></tr>
                                    )}
                                </tbody>
                            </table>
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
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Usuario *</label>
                                <SearchableSelect
                                    options={usuarioOptions}
                                    value={aUsuarioId}
                                    onChange={setAUsuarioId}
                                    placeholder="Seleccionar usuario..."
                                    disabled={!!editAsig}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Local *</label>
                                <SearchableSelect
                                    options={localOptions}
                                    value={aLocal}
                                    onChange={setALocal}
                                    placeholder="Seleccionar local..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Perfil *</label>
                                <SearchableSelect
                                    options={perfilOptions}
                                    value={aPerfil}
                                    onChange={setAPerfil}
                                    placeholder="Seleccionar perfil..."
                                />
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

        </div>
    );
};
