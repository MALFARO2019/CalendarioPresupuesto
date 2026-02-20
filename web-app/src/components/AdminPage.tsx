import React, { useState, useEffect } from 'react';
import {
    fetchAdminUsers,
    createAdminUser,
    updateAdminUser,
    deleteAdminUser,
    fetchAllStores,
    fetchAvailableCanales,
    fetchConfig,
    saveConfig,
    fetchProfiles,
    type User,
    type Profile
} from '../api';
import {
    ArrowLeft, UserPlus, Trash2, Loader2, AlertCircle,
    CheckCircle, Users, Store, Calendar, Edit2, X, Check, Shield, Bot, Save, RotateCcw, Ticket
} from 'lucide-react';
import { EventsManagement } from './EventsManagement';
import { DatabaseConfigPanel } from './DatabaseConfigPanel';

import { ProfilesManagement } from './ProfilesManagement';
import { InvgateAdmin } from './invgate/InvgateAdmin';
import { FormsAdmin } from './forms/FormsAdmin';
import { PersonalManagement } from './PersonalManagement';
import { UberEatsAdmin } from './uber-eats/UberEatsAdmin';
import { KpiAdminPage } from './KpiAdminPage';

interface AdminPageProps {
    onBack: () => void;
    currentUser: User | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, currentUser }) => {
    // Security check: require admin OR eventos access
    const isOfflineAdmin = currentUser?.offlineAdmin === true;
    const canAccessEvents = currentUser?.accesoEventos || currentUser?.esAdmin;
    const canAccessUsers = currentUser?.esAdmin;

    if (!currentUser || (!canAccessUsers && !canAccessEvents)) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 p-6">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-2xl shadow-xl p-8 border border-red-100">
                        <div className="flex items-center gap-3 mb-6">
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                title="Volver"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-800">Acceso Denegado</h1>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <h2 className="text-lg font-semibold text-red-900 mb-2">Permisos Insuficientes</h2>
                                <p className="text-red-700">
                                    No tiene permisos para acceder a esta sección.
                                    Solo los usuarios con rol de <strong>Administrador</strong> o <strong>Acceso a Eventos</strong> pueden acceder.
                                </p>
                                <p className="text-red-600 text-sm mt-3">
                                    Si necesita acceso, contacte al administrador del sistema.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Auto-select tab based on permissions: if user has eventos but not admin, default to eventos
    const defaultTab = isOfflineAdmin ? 'database' : (canAccessUsers ? 'users' : 'events');
    const [activeTab, setActiveTab] = useState<'users' | 'events' | 'ia' | 'database' | 'profiles' | 'invgate' | 'forms' | 'personal' | 'uber-eats' | 'kpi-admin'>(defaultTab);
    const [users, setUsers] = useState<User[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [allStores, setAllStores] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // New user form
    const [showForm, setShowForm] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newNombre, setNewNombre] = useState('');
    const [newClave, setNewClave] = useState('');
    const [newStores, setNewStores] = useState<string[]>([]);
    const [newCanales, setNewCanales] = useState<string[]>([]);
    const [newAccesoTendencia, setNewAccesoTendencia] = useState(false);
    const [newAccesoTactica, setNewAccesoTactica] = useState(false);
    const [newAccesoEventos, setNewAccesoEventos] = useState(false);
    const [newAccesoPresupuesto, setNewAccesoPresupuesto] = useState(true);
    const [newAccesoPresupuestoMensual, setNewAccesoPresupuestoMensual] = useState(true);
    const [newAccesoPresupuestoAnual, setNewAccesoPresupuestoAnual] = useState(true);
    const [newAccesoPresupuestoRangos, setNewAccesoPresupuestoRangos] = useState(true);
    const [newAccesoTiempos, setNewAccesoTiempos] = useState(false);
    const [newAccesoEvaluaciones, setNewAccesoEvaluaciones] = useState(false);
    const [newAccesoInventarios, setNewAccesoInventarios] = useState(false);
    const [newAccesoPersonal, setNewAccesoPersonal] = useState(false);
    const [newEsAdmin, setNewEsAdmin] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Edit user
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editEmail, setEditEmail] = useState('');
    const [editNombre, setEditNombre] = useState('');
    const [editClave, setEditClave] = useState('');
    const [editStores, setEditStores] = useState<string[]>([]);
    const [editCanales, setEditCanales] = useState<string[]>([]);
    const [editActivo, setEditActivo] = useState(true);
    const [editAccesoTendencia, setEditAccesoTendencia] = useState(false);
    const [editAccesoTactica, setEditAccesoTactica] = useState(false);
    const [editAccesoEventos, setEditAccesoEventos] = useState(false);
    const [editAccesoPresupuesto, setEditAccesoPresupuesto] = useState(true);
    const [editAccesoPresupuestoMensual, setEditAccesoPresupuestoMensual] = useState(true);
    const [editAccesoPresupuestoAnual, setEditAccesoPresupuestoAnual] = useState(true);
    const [editAccesoPresupuestoRangos, setEditAccesoPresupuestoRangos] = useState(true);
    const [editAccesoTiempos, setEditAccesoTiempos] = useState(false);
    const [editAccesoEvaluaciones, setEditAccesoEvaluaciones] = useState(false);
    const [editAccesoInventarios, setEditAccesoInventarios] = useState(false);
    const [editAccesoPersonal, setEditAccesoPersonal] = useState(false);
    const [editEsAdmin, setEditEsAdmin] = useState(false);
    const [editPermitirEnvioClave, setEditPermitirEnvioClave] = useState(true);
    const [editPerfilId, setEditPerfilId] = useState<number | null>(null);

    // Search functionality
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 10;

    // Reset page when search changes
    useEffect(() => { setCurrentPage(1); }, [searchTerm]);

    // Filter users based on search term
    const filteredUsers = users.filter(user => {
        if (!searchTerm) return true;

        const term = searchTerm.toLowerCase();
        return (
            user.email?.toLowerCase().includes(term) ||
            user.nombre?.toLowerCase().includes(term)
        );
    });

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIdx = (currentPage - 1) * usersPerPage;
    const paginatedUsers = filteredUsers.slice(startIdx, startIdx + usersPerPage);

    const [serverError, setServerError] = useState('');

    // T&E Prompt state - per KPI
    type KpiKey = 'Global' | 'Ventas' | 'Transacciones' | 'TQP';
    const KPI_TABS: KpiKey[] = ['Global', 'Ventas', 'Transacciones', 'TQP'];
    const GEMINI_MODELS = [
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (más rápido)' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (más preciso)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Premium)' },
    ];
    const [activeKpiTab, setActiveKpiTab] = useState<KpiKey>('Global');
    const [promptValues, setPromptValues] = useState<Record<KpiKey, string>>({ Global: '', Ventas: '', Transacciones: '', TQP: '' });
    const [promptOriginals, setPromptOriginals] = useState<Record<KpiKey, string>>({ Global: '', Ventas: '', Transacciones: '', TQP: '' });
    const [modelValues, setModelValues] = useState<Record<KpiKey, string>>({ Global: 'gemini-2.5-flash-lite', Ventas: '', Transacciones: '', TQP: '' });
    const [modelOriginals, setModelOriginals] = useState<Record<KpiKey, string>>({ Global: 'gemini-2.5-flash-lite', Ventas: '', Transacciones: '', TQP: '' });
    const [promptMetas, setPromptMetas] = useState<Record<KpiKey, { fecha: string | null; usuario: string | null }>>({ Global: { fecha: null, usuario: null }, Ventas: { fecha: null, usuario: null }, Transacciones: { fecha: null, usuario: null }, TQP: { fecha: null, usuario: null } });
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptSaving, setPromptSaving] = useState(false);
    const [promptMessage, setPromptMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (activeTab === 'ia') {
            loadAllPrompts();
        }
    }, [activeTab]);

    const getConfigKey = (kpi: KpiKey, type: 'PROMPT' | 'MODEL') => {
        if (kpi === 'Global') return `TACTICA_${type}`;
        return `TACTICA_${type}_${kpi.toUpperCase()}`;
    };

    const loadAllPrompts = async () => {
        setPromptLoading(true);
        setPromptMessage(null);
        try {
            const results = await Promise.allSettled(
                (['Global', 'Ventas', 'Transacciones', 'TQP'] as KpiKey[]).flatMap(kpi => [
                    fetchConfig(getConfigKey(kpi, 'PROMPT')).catch(() => null),
                    fetchConfig(getConfigKey(kpi, 'MODEL')).catch(() => null),
                ])
            );
            const newPrompts: Record<KpiKey, string> = { Global: '', Ventas: '', Transacciones: '', TQP: '' };
            const newModels: Record<KpiKey, string> = { Global: 'gemini-2.5-flash-lite', Ventas: '', Transacciones: '', TQP: '' };
            const newMetas: Record<KpiKey, { fecha: string | null; usuario: string | null }> = { Global: { fecha: null, usuario: null }, Ventas: { fecha: null, usuario: null }, Transacciones: { fecha: null, usuario: null }, TQP: { fecha: null, usuario: null } };
            const kpis: KpiKey[] = ['Global', 'Ventas', 'Transacciones', 'TQP'];
            kpis.forEach((kpi, i) => {
                const promptResult = results[i * 2];
                const modelResult = results[i * 2 + 1];
                if (promptResult.status === 'fulfilled' && promptResult.value) {
                    newPrompts[kpi] = (promptResult.value as any).Valor || '';
                    newMetas[kpi] = { fecha: (promptResult.value as any).FechaModificacion, usuario: (promptResult.value as any).UsuarioModificacion };
                }
                if (modelResult.status === 'fulfilled' && modelResult.value) {
                    newModels[kpi] = (modelResult.value as any).Valor || '';
                }
            });
            setPromptValues(newPrompts);
            setPromptOriginals(newPrompts);
            setModelValues(newModels);
            setModelOriginals(newModels);
            setPromptMetas(newMetas);
        } catch (err: any) {
            setPromptMessage({ type: 'error', text: 'No se pudo cargar la configuración: ' + (err.message || 'Error desconocido') });
        } finally {
            setPromptLoading(false);
        }
    };

    const handleSavePrompt = async () => {
        setPromptSaving(true);
        setPromptMessage(null);
        try {
            const kpi = activeKpiTab;
            const promptKey = getConfigKey(kpi, 'PROMPT');
            const modelKey = getConfigKey(kpi, 'MODEL');
            const promptVal = promptValues[kpi];
            const modelVal = modelValues[kpi];
            if (promptVal) await saveConfig(promptKey, promptVal);
            if (modelVal) await saveConfig(modelKey, modelVal);
            setPromptOriginals(prev => ({ ...prev, [kpi]: promptVal }));
            setModelOriginals(prev => ({ ...prev, [kpi]: modelVal }));
            setPromptMessage({ type: 'success', text: `Configuración de ${kpi} guardada exitosamente` });
            loadAllPrompts();
        } catch (err: any) {
            setPromptMessage({ type: 'error', text: 'Error al guardar: ' + (err.message || 'Error desconocido') });
        } finally {
            setPromptSaving(false);
        }
    };

    const handleResetPrompt = () => {
        const kpi = activeKpiTab;
        setPromptValues(prev => ({ ...prev, [kpi]: promptOriginals[kpi] }));
        setModelValues(prev => ({ ...prev, [kpi]: modelOriginals[kpi] }));
        setPromptMessage(null);
    };

    const loadData = async () => {
        if (isOfflineAdmin) {
            // In offline admin mode, skip DB-dependent data loading
            console.log('⚠️ AdminPage: Offline admin mode — skipping DB data loading');
            setLoading(false);
            return;
        }
        setLoading(true);
        setServerError('');
        try {
            console.log('🔄 AdminPage: Loading users and stores...');
            const [userList, storeList, profileList] = await Promise.all([
                fetchAdminUsers(),
                fetchAllStores(),
                fetchProfiles()
            ]);
            console.log('✅ AdminPage: Data loaded successfully', { users: userList.length, stores: storeList.length, profiles: profileList.length });
            setUsers(userList);
            setAllStores(storeList);
            setProfiles(profileList);
        } catch (err: any) {
            console.error('❌ AdminPage loadData error:', err);
            console.error('Error details:', { message: err.message, stack: err.stack });
            setServerError(`No se pudo conectar al servidor. Revisar conexión al VPN de Rosti. Error: ${err.message || 'Desconocido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        if (!newEmail.trim()) {
            setFormError('El email es requerido');
            return;
        }

        if (newCanales.length === 0) {
            setFormError('Debe seleccionar al menos un canal');
            return;
        }

        try {
            const result = await createAdminUser(
                newEmail,
                newNombre,
                newClave,
                newStores,
                newCanales,
                newAccesoTendencia,
                newAccesoTactica,
                newAccesoEventos,
                newAccesoPresupuesto,
                newAccesoPresupuestoMensual,
                newAccesoPresupuestoAnual,
                newAccesoPresupuestoRangos,
                newAccesoTiempos,
                newAccesoEvaluaciones,
                newAccesoInventarios,
                newAccesoPersonal,
                newEsAdmin
            );
            setFormSuccess(`Usuario ${newEmail} creado. Clave: ${result.clave}`);
            setNewEmail('');
            setNewNombre('');
            setNewClave('');
            setNewStores([]);
            setNewCanales(ALL_CANALES);
            setNewAccesoTendencia(false);
            setNewAccesoTactica(false);
            setNewAccesoEventos(false);
            setNewAccesoPresupuesto(true);
            setNewAccesoPresupuestoMensual(true);
            setNewAccesoPresupuestoAnual(true);
            setNewAccesoPresupuestoRangos(true);
            setNewAccesoTiempos(false);
            setNewAccesoEvaluaciones(false);
            setNewAccesoInventarios(false);
            setNewAccesoPersonal(false);
            setNewEsAdmin(false);
            setShowForm(false);
            loadData();
        } catch (err: any) {
            setFormError(err.message);
        }
    };

    const startEditUser = (user: User) => {
        setEditingUser(user);
        setEditEmail(user.email);
        setEditNombre(user.nombre);
        setEditClave('');
        setEditStores(user.allowedStores || []);
        setEditCanales(user.allowedCanales || ALL_CANALES);
        setEditActivo(user.activo);
        setEditAccesoTendencia(user.accesoTendencia);
        setEditAccesoTactica(user.accesoTactica);
        setEditAccesoEventos(user.accesoEventos);
        setEditAccesoPresupuesto(user.accesoPresupuesto);
        setEditAccesoPresupuestoMensual(user.accesoPresupuestoMensual ?? true);
        setEditAccesoPresupuestoAnual(user.accesoPresupuestoAnual ?? true);
        setEditAccesoPresupuestoRangos(user.accesoPresupuestoRangos ?? true);
        setEditAccesoTiempos(user.accesoTiempos);
        setEditAccesoEvaluaciones(user.accesoEvaluaciones);
        setEditAccesoInventarios(user.accesoInventarios);
        setEditAccesoPersonal(user.accesoPersonal || false);
        setEditEsAdmin(user.esAdmin);
        setEditPermitirEnvioClave(user.permitirEnvioClave !== undefined ? user.permitirEnvioClave : true);
        setEditPerfilId(user.perfilId ?? null);
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        setFormError('');
        setFormSuccess('');

        try {
            if (editCanales.length === 0) {
                setFormError('Debe seleccionar al menos un canal');
                return;
            }
            await updateAdminUser(
                editingUser.id,
                editEmail,
                editNombre,
                editActivo,
                editClave || null,
                editStores,
                editCanales,
                editAccesoTendencia,
                editAccesoTactica,
                editAccesoEventos,
                editAccesoPresupuesto,
                editAccesoPresupuestoMensual,
                editAccesoPresupuestoAnual,
                editAccesoPresupuestoRangos,
                editAccesoTiempos,
                editAccesoEvaluaciones,
                editAccesoInventarios,
                editAccesoPersonal,
                editEsAdmin,
                editPermitirEnvioClave,
                editPerfilId
            );
            setFormSuccess(`Usuario ${editEmail} actualizado exitosamente`);
            setEditingUser(null);
            loadData();
        } catch (err: any) {
            setFormError(err.message);
        }
    };

    const handleDeleteUser = async (userId: number, email: string) => {
        if (!confirm(`¿Eliminar usuario ${email}?`)) return;
        try {
            await deleteAdminUser(userId);
            loadData();
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    const toggleStore = (store: string, isNew: boolean = true) => {
        if (isNew) {
            setNewStores(prev =>
                prev.includes(store)
                    ? prev.filter(s => s !== store)
                    : [...prev, store]
            );
        } else {
            setEditStores(prev =>
                prev.includes(store)
                    ? prev.filter(s => s !== store)
                    : [...prev, store]
            );
        }
    };

    const selectAllStores = (isNew: boolean = true) => {
        const currentStores = isNew ? newStores : editStores;
        const setStores = isNew ? setNewStores : setEditStores;
        setStores(currentStores.length === allStores.length ? [] : [...allStores]);
    };

    const ALL_CANALES = ['Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];

    const toggleCanal = (canal: string, isNew: boolean = true) => {
        if (isNew) {
            setNewCanales(prev =>
                prev.includes(canal)
                    ? prev.filter(c => c !== canal)
                    : [...prev, canal]
            );
        } else {
            setEditCanales(prev =>
                prev.includes(canal)
                    ? prev.filter(c => c !== canal)
                    : [...prev, canal]
            );
        }
    };

    const selectAllCanales = (isNew: boolean = true) => {
        const currentCanales = isNew ? newCanales : editCanales;
        const setCanales = isNew ? setNewCanales : setEditCanales;
        setCanales(currentCanales.length === ALL_CANALES.length ? [] : [...ALL_CANALES]);
    };

    // Admin Panel
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <div className="max-w-6xl mx-auto">
                {/* Sticky Header */}
                <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
                    <div className="px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-xl transition-all text-gray-600"
                            title="Volver"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight">Panel de Configuración</h1>
                            <p className="text-xs text-gray-400">Administrar usuarios, integraciones y sistema</p>
                        </div>
                    </div>

                    {/* Vertical sidebar nav — collapses to select on mobile */}
                    <div className="px-4 pb-2 md:hidden">
                        <select
                            value={activeTab}
                            onChange={e => setActiveTab(e.target.value as typeof activeTab)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white text-gray-700"
                        >
                            {canAccessUsers && <option value="users">👤 Usuarios</option>}
                            {canAccessUsers && <option value="profiles">🛡️ Perfiles</option>}
                            {canAccessUsers && <option value="personal">👥 Personal</option>}
                            {canAccessEvents && <option value="events">📅 Eventos</option>}
                            {canAccessUsers && <option value="ia">🤖 IA Táctica</option>}
                            {canAccessUsers && <option value="database">🗄️ Base de Datos</option>}
                            {canAccessUsers && <option value="invgate">🎫 InvGate</option>}
                            {canAccessUsers && <option value="forms">📋 Forms</option>}
                            {canAccessUsers && <option value="uber-eats">🍔 Uber Eats</option>}
                            {canAccessUsers && <option value="kpi-admin">📊 Admin KPIs</option>}
                        </select>
                    </div>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Sidebar — hidden on mobile */}
                    <nav className="hidden md:flex flex-col w-52 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 py-3 px-2 gap-0.5 overflow-y-auto">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-1 pb-1.5">Personas</div>
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('users')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Users className="w-4 h-4 flex-shrink-0" /> Usuarios
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('profiles')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'profiles' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Shield className="w-4 h-4 flex-shrink-0" /> Perfiles
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('personal')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'personal' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                Personal
                            </button>
                        )}

                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1.5">Integraciones</div>
                        {canAccessEvents && (
                            <button onClick={() => setActiveTab('events')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'events' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Calendar className="w-4 h-4 flex-shrink-0" /> Eventos
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('invgate')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'invgate' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Ticket className="w-4 h-4 flex-shrink-0" /> InvGate
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('forms')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'forms' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Forms
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('uber-eats')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'uber-eats' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
                                Uber Eats
                            </button>
                        )}

                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1.5">Sistema</div>
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('ia')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'ia' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Bot className="w-4 h-4 flex-shrink-0" /> IA Táctica
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('database')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <Store className="w-4 h-4 flex-shrink-0" /> Base de Datos
                            </button>
                        )}
                        {canAccessUsers && (
                            <button onClick={() => setActiveTab('kpi-admin')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'kpi-admin' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                Admin KPIs
                            </button>
                        )}
                    </nav>

                    {/* Main Content */}
                    <div className="flex-1 px-6 py-6 overflow-y-auto">

                        {/* Offline Admin Banner */}
                        {isOfflineAdmin && (
                            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
                                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <div>
                                    <p className="text-amber-800 text-sm font-semibold">Modo Administrador sin conexión a BD</p>
                                    <p className="text-amber-600 text-xs">Solo las secciones que no requieren base de datos están disponibles (Base de Datos, InvGate, etc.)</p>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        {activeTab === 'users' ? (
                            <>
                                {/* Add User Button */}
                                <div className="mb-6 flex justify-end">
                                    <button
                                        onClick={() => { setShowForm(!showForm); if (!showForm) setNewCanales(ALL_CANALES); }}
                                        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all text-sm"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        Agregar Usuario
                                    </button>
                                </div>

                                {/* Server connection error */}
                                {serverError && (
                                    <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-6">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-5 h-5 text-red-500" />
                                            <span className="text-red-700 text-sm font-medium">{serverError}</span>
                                        </div>
                                        <button
                                            onClick={loadData}
                                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition-all"
                                        >
                                            Reintentar
                                        </button>
                                    </div>
                                )}

                                {/* Success message */}
                                {formSuccess && (
                                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                        <span className="text-green-700 text-sm font-medium">{formSuccess}</span>
                                    </div>
                                )}

                                {/* Error message */}
                                {formError && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                        <span className="text-red-700 text-sm font-medium">{formError}</span>
                                    </div>
                                )}

                                {/* New User Form */}
                                {showForm && (
                                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
                                        <h2 className="text-lg font-bold text-gray-800 mb-4">Nuevo Usuario</h2>
                                        <form onSubmit={handleCreateUser} className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Email *</label>
                                                    <input
                                                        type="email"
                                                        value={newEmail}
                                                        onChange={e => setNewEmail(e.target.value)}
                                                        placeholder="usuario@empresa.com"
                                                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre</label>
                                                    <input
                                                        type="text"
                                                        value={newNombre}
                                                        onChange={e => setNewNombre(e.target.value)}
                                                        placeholder="Nombre del usuario"
                                                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Clave (6 dígitos)</label>
                                                    <input
                                                        type="text"
                                                        value={newClave}
                                                        onChange={e => setNewClave(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                        placeholder="Auto-generada si vacía"
                                                        maxLength={6}
                                                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all tracking-[0.3em] font-mono"
                                                    />
                                                </div>
                                            </div>

                                            {/* Permissions */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Permisos</label>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoTendencia}
                                                            onChange={e => setNewAccesoTendencia(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso a Tendencia</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoTactica}
                                                            onChange={e => setNewAccesoTactica(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso T&amp;E</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoEventos}
                                                            onChange={e => setNewAccesoEventos(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso a Eventos</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newEsAdmin}
                                                            onChange={e => setNewEsAdmin(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Es Administrador</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Module Permissions */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Módulos KPI</label>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer bg-orange-50 p-2 rounded-lg border border-orange-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoPresupuesto}
                                                            onChange={e => setNewAccesoPresupuesto(e.target.checked)}
                                                            className="w-4 h-4 text-orange-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Presupuesto</span>
                                                    </label>
                                                    {newAccesoPresupuesto && (
                                                        <div className="col-span-1 md:col-span-2 pl-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={newAccesoPresupuestoMensual}
                                                                    onChange={e => setNewAccesoPresupuestoMensual(e.target.checked)}
                                                                    className="w-4 h-4 text-orange-600 rounded"
                                                                />
                                                                <span className="text-xs font-medium text-gray-600">Ver Mensual</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={newAccesoPresupuestoAnual}
                                                                    onChange={e => setNewAccesoPresupuestoAnual(e.target.checked)}
                                                                    className="w-4 h-4 text-orange-600 rounded"
                                                                />
                                                                <span className="text-xs font-medium text-gray-600">Ver Anual</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={newAccesoPresupuestoRangos}
                                                                    onChange={e => setNewAccesoPresupuestoRangos(e.target.checked)}
                                                                    className="w-4 h-4 text-orange-600 rounded"
                                                                />
                                                                <span className="text-xs font-medium text-gray-600">Ver Rangos</span>
                                                            </label>
                                                        </div>
                                                    )}
                                                    <label className="flex items-center gap-2 cursor-pointer bg-blue-50 p-2 rounded-lg border border-blue-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoTiempos}
                                                            onChange={e => setNewAccesoTiempos(e.target.checked)}
                                                            className="w-4 h-4 text-blue-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Tiempos</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer bg-green-50 p-2 rounded-lg border border-green-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoEvaluaciones}
                                                            onChange={e => setNewAccesoEvaluaciones(e.target.checked)}
                                                            className="w-4 h-4 text-green-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Evaluaciones</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer bg-purple-50 p-2 rounded-lg border border-purple-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoInventarios}
                                                            onChange={e => setNewAccesoInventarios(e.target.checked)}
                                                            className="w-4 h-4 text-purple-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Inventarios</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer bg-rose-50 p-2 rounded-lg border border-rose-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={newAccesoPersonal}
                                                            onChange={e => setNewAccesoPersonal(e.target.checked)}
                                                            className="w-4 h-4 text-rose-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Personal</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Store selection */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                                                        <Store className="w-3.5 h-3.5" />
                                                        Almacenes con Acceso
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectAllStores(true)}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                                    >
                                                        {newStores.length === allStores.length ? 'Quitar todos' : 'Seleccionar todos'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto border-2 border-gray-100 rounded-xl p-3">
                                                    {allStores.map(store => (
                                                        <label
                                                            key={store}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all ${newStores.includes(store)
                                                                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                                                : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={newStores.includes(store)}
                                                                onChange={() => toggleStore(store, true)}
                                                                className="sr-only"
                                                            />
                                                            <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${newStores.includes(store) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                                                                }`}>
                                                                {newStores.includes(store) && (
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            {store}
                                                        </label>
                                                    ))}
                                                </div>
                                                {newStores.length === 0 && (
                                                    <p className="text-xs text-gray-400 mt-1">Sin almacenes = acceso a todos</p>
                                                )}
                                            </div>
                                            {/* Canal selection (required) */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                                                        Canales con Acceso <span className="text-red-500">*</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectAllCanales(true)}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                                    >
                                                        {newCanales.length === ALL_CANALES.length ? 'Quitar todos' : 'Seleccionar todos'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 border-2 border-gray-100 rounded-xl p-3">
                                                    {ALL_CANALES.map(canal => (
                                                        <label
                                                            key={canal}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all ${newCanales.includes(canal)
                                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                                : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={newCanales.includes(canal)}
                                                                onChange={() => toggleCanal(canal, true)}
                                                                className="sr-only"
                                                            />
                                                            <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${newCanales.includes(canal) ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'
                                                                }`}>
                                                                {newCanales.includes(canal) && (
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            {canal}
                                                        </label>
                                                    ))}
                                                </div>
                                                {newCanales.length === 0 && (
                                                    <p className="text-xs text-red-500 mt-1 font-medium"> Debe seleccionar al menos un canal</p>
                                                )}
                                            </div>

                                            <div className="flex gap-3 justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowForm(false)}
                                                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-all"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="submit"
                                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all"
                                                >
                                                    Crear Usuario
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* Users Table */}
                                {loading ? (
                                    <div className="flex items-center justify-center py-20">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                        <span className="ml-3 text-gray-500">Cargando usuarios...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-6">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Buscar por nombre o correo..."
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                    className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                />
                                                <svg
                                                    className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                                {searchTerm && (
                                                    <button
                                                        onClick={() => setSearchTerm('')}
                                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                        title="Limpiar búsqueda"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            {searchTerm && (
                                                <p className="text-xs text-gray-500 mt-2">
                                                    {filteredUsers.length} de {users.length} usuario{users.length !== 1 ? 's' : ''}
                                                </p>
                                            )}
                                        </div>
                                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200">
                                                        <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[22%]">Email</th>
                                                        <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[14%]">Nombre</th>
                                                        <th className="text-center px-2 py-3 text-xs font-bold text-gray-500 uppercase w-[8%]">Clave</th>
                                                        <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase">Permisos / Canales</th>
                                                        <th className="text-center px-2 py-3 text-xs font-bold text-gray-500 uppercase w-[8%]">Estado</th>
                                                        <th className="text-right px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[7%]"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredUsers.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={6} className="text-center py-12 text-gray-400">
                                                                {searchTerm
                                                                    ? `No se encontraron usuarios que coincidan con "${searchTerm}"`
                                                                    : 'No hay usuarios registrados. Haga clic en "Agregar Usuario" para crear uno.'}
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        paginatedUsers.map(user => (
                                                            <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]" title={user.email}>{user.email}</span>
                                                                        {user.esProtegido && (
                                                                            <div title="Usuario protegido (no editable)">
                                                                                <Shield className="w-4 h-4 text-amber-500" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-xs text-gray-600">{user.nombre || '—'}</td>
                                                                <td className="px-3 py-2">
                                                                    <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded tracking-wider">{user.clave || '—'}</span>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {user.esAdmin && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Admin</span>}
                                                                        {user.accesoTendencia && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Tendencia</span>}
                                                                        {user.accesoTactica && <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-medium">Táctica</span>}
                                                                        {user.accesoEventos && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Eventos</span>}
                                                                        {user.accesoPresupuesto && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">Presupuesto</span>}
                                                                        {user.accesoTiempos && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Tiempos</span>}
                                                                        {user.accesoEvaluaciones && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Evaluaciones</span>}
                                                                        {user.accesoInventarios && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Inventarios</span>}
                                                                        {user.accesoPersonal && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">Personal</span>}
                                                                    </div>
                                                                    {user.allowedCanales && user.allowedCanales.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {user.allowedCanales.map((canal: string) => (
                                                                                <span key={canal} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{canal}</span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.activo
                                                                        ? 'bg-green-100 text-green-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                        }`}>
                                                                        {user.activo ? 'Activo' : 'Inactivo'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        {!user.esProtegido && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => startEditUser(user)}
                                                                                    className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                                                    title="Editar usuario"
                                                                                >
                                                                                    <Edit2 className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                                    title="Eliminar usuario"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                                                    <span className="text-xs text-gray-500">
                                                        {startIdx + 1}-{Math.min(startIdx + usersPerPage, filteredUsers.length)} de {filteredUsers.length}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                            disabled={currentPage === 1}
                                                            className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                        >
                                                            Ant
                                                        </button>
                                                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                                            let page;
                                                            if (totalPages <= 7) { page = i + 1; }
                                                            else if (currentPage <= 4) { page = i + 1; }
                                                            else if (currentPage >= totalPages - 3) { page = totalPages - 6 + i; }
                                                            else { page = currentPage - 3 + i; }
                                                            return (
                                                                <button
                                                                    key={page}
                                                                    onClick={() => setCurrentPage(page)}
                                                                    className={"px-2.5 py-1 text-xs rounded-lg border transition-all " + (currentPage === page ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 hover:bg-white")}
                                                                >
                                                                    {page}
                                                                </button>
                                                            );
                                                        })}
                                                        <button
                                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                            disabled={currentPage === totalPages}
                                                            className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                        >
                                                            Sig
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Edit User Modal */}
                                {editingUser && (
                                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                                            <div className="p-6">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h2 className="text-xl font-bold text-gray-800">Editar Usuario</h2>
                                                    <button
                                                        onClick={() => setEditingUser(null)}
                                                        className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                                    >
                                                        <X className="w-5 h-5 text-gray-600" />
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Email *</label>
                                                            <input
                                                                type="email"
                                                                value={editEmail}
                                                                onChange={e => setEditEmail(e.target.value)}
                                                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre</label>
                                                            <input
                                                                type="text"
                                                                value={editNombre}
                                                                onChange={e => setEditNombre(e.target.value)}
                                                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nueva Clave (6 dígitos, dejar vacío para no cambiar)</label>
                                                        <input
                                                            type="text"
                                                            value={editClave}
                                                            onChange={e => setEditClave(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                            placeholder="Dejar vacío para mantener la actual"
                                                            maxLength={6}
                                                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring border-indigo-200 text-sm transition-all tracking-[0.3em] font-mono"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-1 text-xs font-bold text-gray-600 uppercase mb-2">
                                                            <Shield className="w-3.5 h-3.5" />
                                                            Perfil
                                                        </label>
                                                        <select
                                                            value={editPerfilId ?? ''}
                                                            onChange={e => setEditPerfilId(e.target.value ? Number(e.target.value) : null)}
                                                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all"
                                                        >
                                                            <option value="">(Ninguno)</option>
                                                            {profiles.map(profile => (
                                                                <option key={profile.id} value={profile.id}>
                                                                    {profile.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {editPerfilId ? (
                                                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                                <Shield className="w-3 h-3" />
                                                                Los permisos son controlados por el perfil asignado
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                Asignar un perfil facilita la gestión de permisos
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Active toggle */}
                                                    <div>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={editActivo}
                                                                onChange={e => setEditActivo(e.target.checked)}
                                                                className="w-4 h-4 text-indigo-600 rounded"
                                                            />
                                                            <span className="text-sm font-medium text-gray-700">Usuario Activo</span>
                                                        </label>
                                                    </div>

                                                    {/* Permissions */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="block text-xs font-bold text-gray-600 uppercase">Permisos</label>
                                                            {editPerfilId && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Controlado por perfil</span>
                                                            )}
                                                        </div>
                                                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${editPerfilId ? 'opacity-50 pointer-events-none' : ''}`}>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoTendencia}
                                                                    onChange={e => setEditAccesoTendencia(e.target.checked)}
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                    disabled={!!editPerfilId}
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Acceso a Tendencia</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoTactica}
                                                                    onChange={e => setEditAccesoTactica(e.target.checked)}
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                    disabled={!!editPerfilId}
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Acceso T&amp;E</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoEventos}
                                                                    onChange={e => setEditAccesoEventos(e.target.checked)}
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                    disabled={!!editPerfilId}
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Acceso a Eventos</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editEsAdmin}
                                                                    onChange={e => setEditEsAdmin(e.target.checked)}
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                    disabled={!!editPerfilId}
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Es Administrador</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editPermitirEnvioClave}
                                                                    onChange={e => setEditPermitirEnvioClave(e.target.checked)}
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Permitir envío de clave</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Module Permissions */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Módulos KPI</label>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <label className="flex items-center gap-2 cursor-pointer bg-orange-50 p-2 rounded-lg border border-orange-200">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoPresupuesto}
                                                                    onChange={e => setEditAccesoPresupuesto(e.target.checked)}
                                                                    className="w-4 h-4 text-orange-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Presupuesto</span>
                                                            </label>
                                                            {editAccesoPresupuesto && (
                                                                <div className="col-span-1 md:col-span-2 pl-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={editAccesoPresupuestoMensual}
                                                                            onChange={e => setEditAccesoPresupuestoMensual(e.target.checked)}
                                                                            className="w-4 h-4 text-orange-600 rounded"
                                                                            disabled={!!editPerfilId}
                                                                        />
                                                                        <span className="text-xs font-medium text-gray-600">Ver Mensual</span>
                                                                    </label>
                                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={editAccesoPresupuestoAnual}
                                                                            onChange={e => setEditAccesoPresupuestoAnual(e.target.checked)}
                                                                            className="w-4 h-4 text-orange-600 rounded"
                                                                            disabled={!!editPerfilId}
                                                                        />
                                                                        <span className="text-xs font-medium text-gray-600">Ver Anual</span>
                                                                    </label>
                                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={editAccesoPresupuestoRangos}
                                                                            onChange={e => setEditAccesoPresupuestoRangos(e.target.checked)}
                                                                            className="w-4 h-4 text-orange-600 rounded"
                                                                            disabled={!!editPerfilId}
                                                                        />
                                                                        <span className="text-xs font-medium text-gray-600">Ver Rangos</span>
                                                                    </label>
                                                                </div>
                                                            )}
                                                            <label className="flex items-center gap-2 cursor-pointer bg-blue-50 p-2 rounded-lg border border-blue-200">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoTiempos}
                                                                    onChange={e => setEditAccesoTiempos(e.target.checked)}
                                                                    className="w-4 h-4 text-blue-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Tiempos</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-green-50 p-2 rounded-lg border border-green-200">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoEvaluaciones}
                                                                    onChange={e => setEditAccesoEvaluaciones(e.target.checked)}
                                                                    className="w-4 h-4 text-green-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Evaluaciones</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-purple-50 p-2 rounded-lg border border-purple-200">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoInventarios}
                                                                    onChange={e => setEditAccesoInventarios(e.target.checked)}
                                                                    className="w-4 h-4 text-purple-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Inventarios</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-rose-50 p-2 rounded-lg border border-rose-200">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editAccesoPersonal}
                                                                    onChange={e => setEditAccesoPersonal(e.target.checked)}
                                                                    className="w-4 h-4 text-rose-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700">Personal</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Store selection */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                                                                <Store className="w-3.5 h-3.5" />
                                                                Almacenes con Acceso
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => selectAllStores(false)}
                                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                                            >
                                                                {editStores.length === allStores.length ? 'Quitar todos' : 'Seleccionar todos'}
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border-2 border-gray-100 rounded-xl p-3">
                                                            {allStores.map(store => (
                                                                <label
                                                                    key={store}
                                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all ${editStores.includes(store)
                                                                        ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                                                        : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                                                                        }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editStores.includes(store)}
                                                                        onChange={() => toggleStore(store, false)}
                                                                        className="sr-only"
                                                                    />
                                                                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${editStores.includes(store) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                                                                        }`}>
                                                                        {editStores.includes(store) && (
                                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                    {store}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Canal selection (required) */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                                                                Canales con Acceso <span className="text-red-500">*</span>
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => selectAllCanales(false)}
                                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                                            >
                                                                {editCanales.length === ALL_CANALES.length ? 'Quitar todos' : 'Seleccionar todos'}
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border-2 border-gray-100 rounded-xl p-3">
                                                            {ALL_CANALES.map(canal => (
                                                                <label
                                                                    key={canal}
                                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all ${editCanales.includes(canal)
                                                                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                                        : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                                                                        }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editCanales.includes(canal)}
                                                                        onChange={() => toggleCanal(canal, false)}
                                                                        className="sr-only"
                                                                    />
                                                                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${editCanales.includes(canal) ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'
                                                                        }`}>
                                                                        {editCanales.includes(canal) && (
                                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                    {canal}
                                                                </label>
                                                            ))}
                                                        </div>
                                                        {editCanales.length === 0 && (
                                                            <p className="text-xs text-red-500 mt-1 font-medium"> Debe seleccionar al menos un canal</p>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-3 justify-end pt-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingUser(null)}
                                                            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-all"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleUpdateUser}
                                                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                            Guardar Cambios
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : activeTab === 'events' ? (
                            <EventsManagement />
                        ) : activeTab === 'database' ? (
                            <DatabaseConfigPanel />
                        ) : activeTab === 'profiles' ? (
                            <ProfilesManagement users={users} onUserUpdate={loadData} />
                        ) : activeTab === 'invgate' ? (
                            <InvgateAdmin />
                        ) : activeTab === 'forms' ? (
                            <FormsAdmin />
                        ) : activeTab === 'personal' ? (
                            <PersonalManagement />
                        ) : activeTab === 'uber-eats' ? (
                            <UberEatsAdmin />
                        ) : activeTab === 'kpi-admin' ? (
                            <KpiAdminPage />
                        ) : (
                            /* T&E (Táctica y Estrategia) Tab */
                            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-cyan-100 rounded-xl">
                                        <Bot className="w-5 h-5 text-cyan-700" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Configuración T&amp;E (Táctica y Estrategia)</h2>
                                        <p className="text-sm text-gray-500">Personalizar el prompt y modelo de IA por KPI</p>
                                    </div>
                                </div>

                                {/* KPI Sub-tabs */}
                                <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
                                    {KPI_TABS.map(kpi => (
                                        <button
                                            key={kpi}
                                            onClick={() => { setActiveKpiTab(kpi); setPromptMessage(null); }}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeKpiTab === kpi
                                                ? 'bg-cyan-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {kpi === 'Global' ? '🌐 Global' : kpi === 'Ventas' ? '💰 Ventas' : kpi === 'Transacciones' ? '🧾 Transacciones' : '📊 TQP'}
                                        </button>
                                    ))}
                                </div>

                                {promptMessage && (
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-4 ${promptMessage.type === 'success'
                                        ? 'bg-green-50 border border-green-200'
                                        : 'bg-red-50 border border-red-200'
                                        }`}>
                                        {promptMessage.type === 'success' ? (
                                            <CheckCircle className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <AlertCircle className="w-5 h-5 text-red-600" />
                                        )}
                                        <span className={`text-sm font-medium ${promptMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                                            {promptMessage.text}
                                        </span>
                                    </div>
                                )}

                                {promptLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                        <span className="ml-3 text-gray-600">Cargando configuración...</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Model Selector */}
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Modelo de IA</label>
                                            <select
                                                value={modelValues[activeKpiTab]}
                                                onChange={e => setModelValues(prev => ({ ...prev, [activeKpiTab]: e.target.value }))}
                                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 text-sm transition-all bg-white"
                                            >
                                                <option value="">-- Usar modelo global / default --</option>
                                                {GEMINI_MODELS.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                            {activeKpiTab !== 'Global' && (
                                                <p className="text-xs text-gray-400 mt-1">Si está vacío, se usa el modelo Global o el default (Flash Lite)</p>
                                            )}
                                        </div>

                                        {/* Prompt Textarea */}
                                        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-2">
                                                Prompt del Sistema{activeKpiTab !== 'Global' && <span className="ml-2 text-xs font-normal text-cyan-600 lowercase normal-case">(específico para {activeKpiTab})</span>}
                                            </label>
                                            <textarea
                                                value={promptValues[activeKpiTab]}
                                                onChange={e => setPromptValues(prev => ({ ...prev, [activeKpiTab]: e.target.value }))}
                                                className="w-full h-64 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 text-sm font-mono resize-none transition-all"
                                                placeholder={activeKpiTab === 'Global' ? 'Escribe el prompt global (aplica a todos los KPIs sin config específica)...' : `Escribe el prompt para ${activeKpiTab}. Si está vacío, se usa el prompt global...`}
                                            />
                                            {promptMetas[activeKpiTab].fecha && (
                                                <p className="text-xs text-gray-500 mt-2">
                                                    Última modificación: {new Date(promptMetas[activeKpiTab].fecha!).toLocaleString('es-CR')}
                                                    {promptMetas[activeKpiTab].usuario && ` por ${promptMetas[activeKpiTab].usuario}`}
                                                </p>
                                            )}
                                            {/* Template variables helper */}
                                            <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                                <p className="text-xs font-bold text-blue-700 mb-1">Variables disponibles en el prompt:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {['{{storeName}}', '{{year}}', '{{kpi}}', '{{monthlyTable}}', '{{annualSummary}}'].map(v => (
                                                        <code key={v} className="text-xs bg-white border border-blue-200 text-blue-800 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-100"
                                                            onClick={() => setPromptValues(prev => ({ ...prev, [activeKpiTab]: (prev[activeKpiTab] || '') + v }))}>
                                                            {v}
                                                        </code>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 justify-end">
                                            <button
                                                onClick={handleResetPrompt}
                                                disabled={(promptValues[activeKpiTab] === promptOriginals[activeKpiTab] && modelValues[activeKpiTab] === modelOriginals[activeKpiTab]) || promptSaving}
                                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                                Revertir
                                            </button>
                                            <button
                                                onClick={handleSavePrompt}
                                                disabled={(promptValues[activeKpiTab] === promptOriginals[activeKpiTab] && modelValues[activeKpiTab] === modelOriginals[activeKpiTab]) || promptSaving}
                                                className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                            >
                                                {promptSaving ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Guardando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="w-4 h-4" />
                                                        Guardar {activeKpiTab}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};
