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
    type User
} from '../api';
import {
    ArrowLeft, UserPlus, Trash2, Loader2, AlertCircle,
    CheckCircle, Users, Store, Calendar, Edit2, X, Check, Shield, Bot, Save, RotateCcw
} from 'lucide-react';
import { EventsManagement } from './EventsManagement';
import { DatabaseConfigPanel } from './DatabaseConfigPanel';
import { AuxiliaryDBAdminPanel } from './AuxiliaryDBAdminPanel';

interface AdminPageProps {
    onBack: () => void;
    currentUser: User | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, currentUser }) => {
    // Security check: require admin OR eventos access
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
    const defaultTab = canAccessUsers ? 'users' : 'events';
    const [activeTab, setActiveTab] = useState<'users' | 'events' | 'ia' | 'database' | 'auxiliarydb'>(defaultTab);
    const [users, setUsers] = useState<User[]>([]);
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
    const [newAccesoTiempos, setNewAccesoTiempos] = useState(false);
    const [newAccesoEvaluaciones, setNewAccesoEvaluaciones] = useState(false);
    const [newAccesoInventarios, setNewAccesoInventarios] = useState(false);
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
    const [editAccesoTiempos, setEditAccesoTiempos] = useState(false);
    const [editAccesoEvaluaciones, setEditAccesoEvaluaciones] = useState(false);
    const [editAccesoInventarios, setEditAccesoInventarios] = useState(false);
    const [editEsAdmin, setEditEsAdmin] = useState(false);
    const [editPermitirEnvioClave, setEditPermitirEnvioClave] = useState(true);

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

    // IA Prompt state
    const [promptValue, setPromptValue] = useState('');
    const [promptOriginal, setPromptOriginal] = useState('');
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptSaving, setPromptSaving] = useState(false);
    const [promptMessage, setPromptMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [promptMeta, setPromptMeta] = useState<{ fecha: string | null; usuario: string | null }>({ fecha: null, usuario: null });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (activeTab === 'ia') {
            loadPrompt();
        }
    }, [activeTab]);

    const loadPrompt = async () => {
        setPromptLoading(true);
        setPromptMessage(null);
        try {
            const config = await fetchConfig('TACTICA_PROMPT');
            setPromptValue(config.Valor);
            setPromptOriginal(config.Valor);
            setPromptMeta({ fecha: config.FechaModificacion, usuario: config.UsuarioModificacion });
        } catch (err: any) {
            setPromptMessage({ type: 'error', text: 'No se pudo cargar el prompt: ' + (err.message || 'Error desconocido') });
        } finally {
            setPromptLoading(false);
        }
    };

    const handleSavePrompt = async () => {
        setPromptSaving(true);
        setPromptMessage(null);
        try {
            await saveConfig('TACTICA_PROMPT', promptValue);
            setPromptOriginal(promptValue);
            setPromptMessage({ type: 'success', text: 'Prompt guardado exitosamente' });
            loadPrompt(); // refresh metadata
        } catch (err: any) {
            setPromptMessage({ type: 'error', text: 'Error al guardar: ' + (err.message || 'Error desconocido') });
        } finally {
            setPromptSaving(false);
        }
    };

    const handleResetPrompt = () => {
        setPromptValue(promptOriginal);
        setPromptMessage(null);
    };

    const loadData = async () => {
        setLoading(true);
        setServerError('');
        try {
            console.log('?? AdminPage: Loading users and stores...');
            const [userList, storeList] = await Promise.all([
                fetchAdminUsers(),
                fetchAllStores()
            ]);
            console.log('? AdminPage: Data loaded successfully', { users: userList.length, stores: storeList.length });
            setUsers(userList);
            setAllStores(storeList);
        } catch (err: any) {
            console.error('? AdminPage loadData error:', err);
            console.error('Error details:', { message: err.message, stack: err.stack });
            setServerError(`No se pudo conectar al servidor. Error: ${err.message || 'Desconocido'}`);
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
                newAccesoTiempos,
                newAccesoEvaluaciones,
                newAccesoInventarios,
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
            setNewAccesoTiempos(false);
            setNewAccesoEvaluaciones(false);
            setNewAccesoInventarios(false);
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
        setEditAccesoTiempos(user.accesoTiempos);
        setEditAccesoEvaluaciones(user.accesoEvaluaciones);
        setEditAccesoInventarios(user.accesoInventarios);
        setEditEsAdmin(user.esAdmin);
        setEditPermitirEnvioClave(user.permitirEnvioClave !== undefined ? user.permitirEnvioClave : true);
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
                editAccesoTiempos,
                editAccesoEvaluaciones,
                editAccesoInventarios,
                editEsAdmin,
                editPermitirEnvioClave
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
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 bg-white rounded-xl shadow hover:shadow-md transition-all"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Panel de Configuración</h1>
                            <p className="text-sm text-gray-500">Administrar usuarios y eventos</p>
                        </div>
                    </div>

                    {/* Tab selector */}
                    <div className="flex items-center bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
                        {canAccessUsers && (
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'users'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Users className="w-4 h-4" />
                                Usuarios
                            </button>
                        )}
                        {canAccessEvents && (
                            <button
                                onClick={() => setActiveTab('events')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'events'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Calendar className="w-4 h-4" />
                                Eventos
                            </button>
                        )}
                        {canAccessUsers && (
                            <button
                                onClick={() => setActiveTab('ia')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ia'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Bot className="w-4 h-4" />
                                IA Táctica
                            </button>
                        )}
                        {canAccessUsers && (
                            <button
                                onClick={() => setActiveTab('database')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'database'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Store className="w-4 h-4" />
                                Base de Datos
                            </button>
                        )}
                        {canAccessUsers && (
                            <button
                                onClick={() => setActiveTab('auxiliarydb')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'auxiliarydb'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Store className="w-4 h-4" />
                                BD Auxiliar
                            </button>
                        )}
                    </div>
                </div>

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
                                                <span className="text-sm font-medium text-gray-700">Acceso a Táctica IA</span>
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
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Permisos</label>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editAccesoTendencia}
                                                            onChange={e => setEditAccesoTendencia(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso a Tendencia</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editAccesoTactica}
                                                            onChange={e => setEditAccesoTactica(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso a Táctica IA</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editAccesoEventos}
                                                            onChange={e => setEditAccesoEventos(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Acceso a Eventos</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editEsAdmin}
                                                            onChange={e => setEditEsAdmin(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
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
                ) : activeTab === 'auxiliarydb' ? (
                    <AuxiliaryDBAdminPanel />
                ) : (
                    /* IA Táctica Tab */
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-cyan-100 rounded-xl">
                                <Bot className="w-5 h-5 text-cyan-700" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Configuración IA Táctica</h2>
                                <p className="text-sm text-gray-500">Personalizar el prompt de análisis estratégico</p>
                            </div>
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
                                <span className={`text-sm font-medium ${promptMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
                                    }`}>
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
                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">
                                        Prompt del Sistema
                                    </label>
                                    <textarea
                                        value={promptValue}
                                        onChange={e => setPromptValue(e.target.value)}
                                        className="w-full h-64 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm font-mono resize-none transition-all"
                                        placeholder="Escribe el prompt para el análisis de la IA..."
                                    />
                                    {promptMeta.fecha && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            Última modificación: {new Date(promptMeta.fecha).toLocaleString('es-CR')}
                                            {promptMeta.usuario && ` por ${promptMeta.usuario}`}
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={handleResetPrompt}
                                        disabled={promptValue === promptOriginal || promptSaving}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Revertir
                                    </button>
                                    <button
                                        onClick={handleSavePrompt}
                                        disabled={promptValue === promptOriginal || promptSaving}
                                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                    >
                                        {promptSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Guardando...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Guardar Cambios
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
    );
};
