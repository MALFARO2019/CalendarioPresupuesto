import React, { useState, useEffect } from 'react';
import {
    fetchAdminUsers,
    createAdminUser,
    updateAdminUser,
    deleteAdminUser,
    fetchAllStores,
    type User
} from '../api';
import {
    ArrowLeft, UserPlus, Trash2, Loader2, AlertCircle,
    CheckCircle, Users, Store, Calendar, Edit2, X, Check, Shield
} from 'lucide-react';
import { EventsManagement } from './EventsManagement';

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
    const [activeTab, setActiveTab] = useState<'users' | 'events'>(defaultTab);
    const [users, setUsers] = useState<User[]>([]);
    const [allStores, setAllStores] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // New user form
    const [showForm, setShowForm] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newNombre, setNewNombre] = useState('');
    const [newClave, setNewClave] = useState('');
    const [newStores, setNewStores] = useState<string[]>([]);
    const [newAccesoTendencia, setNewAccesoTendencia] = useState(false);
    const [newAccesoEventos, setNewAccesoEventos] = useState(false);
    const [newEsAdmin, setNewEsAdmin] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Edit user
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editEmail, setEditEmail] = useState('');
    const [editNombre, setEditNombre] = useState('');
    const [editClave, setEditClave] = useState('');
    const [editStores, setEditStores] = useState<string[]>([]);
    const [editActivo, setEditActivo] = useState(true);
    const [editAccesoTendencia, setEditAccesoTendencia] = useState(false);
    const [editAccesoEventos, setEditAccesoEventos] = useState(false);
    const [editEsAdmin, setEditEsAdmin] = useState(false);

    const [serverError, setServerError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setServerError('');
        try {
            console.log('🔍 AdminPage: Loading users and stores...');
            const [userList, storeList] = await Promise.all([
                fetchAdminUsers(),
                fetchAllStores()
            ]);
            console.log('✅ AdminPage: Data loaded successfully', { users: userList.length, stores: storeList.length });
            setUsers(userList);
            setAllStores(storeList);
        } catch (err: any) {
            console.error('❌ AdminPage loadData error:', err);
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

        try {
            const result = await createAdminUser(
                newEmail,
                newNombre,
                newClave,
                newStores,
                newAccesoTendencia,
                newAccesoEventos,
                newEsAdmin
            );
            setFormSuccess(`Usuario ${newEmail} creado. Clave: ${result.clave}`);
            setNewEmail('');
            setNewNombre('');
            setNewClave('');
            setNewStores([]);
            setNewAccesoTendencia(false);
            setNewAccesoEventos(false);
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
        setEditActivo(user.activo);
        setEditAccesoTendencia(user.accesoTendencia);
        setEditAccesoEventos(user.accesoEventos);
        setEditEsAdmin(user.esAdmin);
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        setFormError('');
        setFormSuccess('');

        try {
            await updateAdminUser(
                editingUser.id,
                editEmail,
                editNombre,
                editActivo,
                editClave || null,
                editStores,
                editAccesoTendencia,
                editAccesoEventos,
                editEsAdmin
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
                    </div>
                </div>

                {/* Content */}
                {activeTab === 'users' ? (
                    <>
                        {/* Add User Button */}
                        <div className="mb-6 flex justify-end">
                            <button
                                onClick={() => setShowForm(!showForm)}
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
                                        <div className="flex flex-wrap gap-3">
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
                            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">Email</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">Nombre</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">Clave</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">Permisos</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">Estado</th>
                                            <th className="text-right px-6 py-4 text-xs font-bold text-gray-500 uppercase">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-12 text-gray-400">
                                                    No hay usuarios registrados. Haga clic en "Agregar Usuario" para crear uno.
                                                </td>
                                            </tr>
                                        ) : (
                                            users.map(user => (
                                                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-gray-800">{user.email}</span>
                                                            {user.esProtegido && (
                                                                <div title="Usuario protegido (no editable)">
                                                                    <Shield className="w-4 h-4 text-amber-500" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">{user.nombre || '—'}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-mono text-sm text-indigo-600 bg-indigo-50 px-2 py-1 rounded tracking-wider">{user.clave || '—'}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {user.esAdmin && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                                                            {user.accesoTendencia && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Tendencia</span>}
                                                            {user.accesoEventos && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Eventos</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${user.activo
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {user.activo ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
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
                            </div>
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
                                                <div className="flex flex-wrap gap-3">
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
                ) : (
                    <EventsManagement />
                )}
            </div>
        </div>
    );
};

