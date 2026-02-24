import React, { useState, useEffect } from 'react';
import { useToast } from './ui/Toast';
import { Shield, Plus, Users, Trash2, Edit2, RefreshCw, X, Check, Search } from 'lucide-react';
import type { Profile, User } from '../api';
import { fetchProfiles, createProfile, updateProfile, deleteProfile, assignProfileToUsers, syncProfilePermissions } from '../api';

interface ProfilesManagementProps {
    users: User[];
    onUserUpdate: () => void;
}

export function ProfilesManagement({ users, onUserUpdate }: ProfilesManagementProps) {
    const { showToast, showConfirm } = useToast();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showViewUsersModal, setShowViewUsersModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
    const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [syncOnAssign, setSyncOnAssign] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        accesoTendencia: false,
        accesoTactica: false,
        accesoEventos: false,
        accesoPresupuesto: true,
        accesoPresupuestoMensual: true,
        accesoPresupuestoAnual: true,
        accesoPresupuestoRangos: true,
        accesoTiempos: false,
        accesoEvaluaciones: false,
        accesoInventarios: false,
        accesoPersonal: false,
        accesoModeloPresupuesto: false,
        verConfigModelo: false,
        verConsolidadoMensual: false,
        verAjustePresupuesto: false,
        verVersiones: false,
        verBitacora: false,
        verReferencias: false,
        editarConsolidado: false,
        ejecutarRecalculo: false,
        ajustarCurva: false,
        restaurarVersiones: false,
        esAdmin: false,
        permitirEnvioClave: true,
        apareceEnTituloAlcance: true,
        apareceEnTituloMensual: true,
        apareceEnTituloAnual: true,
        apareceEnTituloTendencia: true,
        apareceEnTituloRangos: true,
    });

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        setLoading(true);
        try {
            const data = await fetchProfiles();
            setProfiles(data);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Error cargando perfiles');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        try {
            await createProfile({
                nombre: formData.nombre,
                descripcion: formData.descripcion,
                permisos: {
                    accesoTendencia: formData.accesoTendencia,
                    accesoTactica: formData.accesoTactica,
                    accesoEventos: formData.accesoEventos,
                    accesoPresupuesto: formData.accesoPresupuesto,
                    accesoPresupuestoMensual: formData.accesoPresupuestoMensual,
                    accesoPresupuestoAnual: formData.accesoPresupuestoAnual,
                    accesoPresupuestoRangos: formData.accesoPresupuestoRangos,
                    accesoTiempos: formData.accesoTiempos,
                    accesoEvaluaciones: formData.accesoEvaluaciones,
                    accesoInventarios: formData.accesoInventarios,
                    accesoPersonal: formData.accesoPersonal,
                    accesoModeloPresupuesto: formData.accesoModeloPresupuesto,
                    verConfigModelo: formData.verConfigModelo,
                    verConsolidadoMensual: formData.verConsolidadoMensual,
                    verAjustePresupuesto: formData.verAjustePresupuesto,
                    verVersiones: formData.verVersiones,
                    verBitacora: formData.verBitacora,
                    verReferencias: formData.verReferencias,
                    editarConsolidado: formData.editarConsolidado,
                    ejecutarRecalculo: formData.ejecutarRecalculo,
                    ajustarCurva: formData.ajustarCurva,
                    restaurarVersiones: formData.restaurarVersiones,
                    esAdmin: formData.esAdmin,
                    permitirEnvioClave: formData.permitirEnvioClave,
                    apareceEnTituloAlcance: formData.apareceEnTituloAlcance,
                    apareceEnTituloMensual: formData.apareceEnTituloMensual,
                    apareceEnTituloAnual: formData.apareceEnTituloAnual,
                    apareceEnTituloTendencia: formData.apareceEnTituloTendencia,
                    apareceEnTituloRangos: formData.apareceEnTituloRangos,
                }
            });
            setShowCreateModal(false);
            resetForm();
            loadProfiles();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleUpdate = async () => {
        if (!editingProfile) return;
        try {
            await updateProfile(editingProfile.id, {
                nombre: formData.nombre,
                descripcion: formData.descripcion,
                permisos: {
                    accesoTendencia: formData.accesoTendencia,
                    accesoTactica: formData.accesoTactica,
                    accesoEventos: formData.accesoEventos,
                    accesoPresupuesto: formData.accesoPresupuesto,
                    accesoPresupuestoMensual: formData.accesoPresupuestoMensual,
                    accesoPresupuestoAnual: formData.accesoPresupuestoAnual,
                    accesoPresupuestoRangos: formData.accesoPresupuestoRangos,
                    accesoTiempos: formData.accesoTiempos,
                    accesoEvaluaciones: formData.accesoEvaluaciones,
                    accesoInventarios: formData.accesoInventarios,
                    accesoPersonal: formData.accesoPersonal,
                    accesoModeloPresupuesto: formData.accesoModeloPresupuesto,
                    verConfigModelo: formData.verConfigModelo,
                    verConsolidadoMensual: formData.verConsolidadoMensual,
                    verAjustePresupuesto: formData.verAjustePresupuesto,
                    verVersiones: formData.verVersiones,
                    verBitacora: formData.verBitacora,
                    verReferencias: formData.verReferencias,
                    editarConsolidado: formData.editarConsolidado,
                    ejecutarRecalculo: formData.ejecutarRecalculo,
                    ajustarCurva: formData.ajustarCurva,
                    restaurarVersiones: formData.restaurarVersiones,
                    esAdmin: formData.esAdmin,
                    permitirEnvioClave: formData.permitirEnvioClave,
                    apareceEnTituloAlcance: formData.apareceEnTituloAlcance,
                    apareceEnTituloMensual: formData.apareceEnTituloMensual,
                    apareceEnTituloAnual: formData.apareceEnTituloAnual,
                    apareceEnTituloTendencia: formData.apareceEnTituloTendencia,
                    apareceEnTituloRangos: formData.apareceEnTituloRangos,
                }
            });
            setEditingProfile(null);
            resetForm();
            loadProfiles();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!await showConfirm({ message: '¿Está seguro de eliminar este perfil?', destructive: true })) return;
        try {
            await deleteProfile(id);
            loadProfiles();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const handleAssign = async () => {
        if (!selectedProfile || selectedUsers.length === 0) return;
        try {
            await assignProfileToUsers(selectedProfile.id, selectedUsers, syncOnAssign);
            setShowAssignModal(false);
            setSelectedUsers([]);
            setSearchTerm('');
            loadProfiles();
            onUserUpdate();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleSync = async (profileId: number) => {
        if (!await showConfirm({ message: '¿Sincronizar permisos del perfil a todos los usuarios asignados?' })) return;
        try {
            const result = await syncProfilePermissions(profileId);
            showToast(`${result.updatedCount} usuario(s) actualizados`, 'success');
            onUserUpdate();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const resetForm = () => {
        setFormData({
            nombre: '',
            descripcion: '',
            accesoTendencia: false,
            accesoTactica: false,
            accesoEventos: false,
            accesoPresupuesto: true,
            accesoPresupuestoMensual: true,
            accesoPresupuestoAnual: true,
            accesoPresupuestoRangos: true,
            accesoTiempos: false,
            accesoEvaluaciones: false,
            accesoInventarios: false,
            accesoPersonal: false,
            accesoModeloPresupuesto: false,
            verConfigModelo: false,
            verConsolidadoMensual: false,
            verAjustePresupuesto: false,
            verVersiones: false,
            verBitacora: false,
            verReferencias: false,
            editarConsolidado: false,
            ejecutarRecalculo: false,
            ajustarCurva: false,
            restaurarVersiones: false,
            esAdmin: false,
            permitirEnvioClave: true,
            apareceEnTituloAlcance: true,
            apareceEnTituloMensual: true,
            apareceEnTituloAnual: true,
            apareceEnTituloTendencia: true,
            apareceEnTituloRangos: true,
        });
    };

    const openEditModal = (profile: Profile) => {
        setEditingProfile(profile);
        setFormData({
            nombre: profile.nombre,
            descripcion: profile.descripcion || '',
            accesoTendencia: profile.accesoTendencia,
            accesoTactica: profile.accesoTactica,
            accesoEventos: profile.accesoEventos,
            accesoPresupuesto: profile.accesoPresupuesto,
            accesoPresupuestoMensual: profile.accesoPresupuestoMensual ?? true,
            accesoPresupuestoAnual: profile.accesoPresupuestoAnual ?? true,
            accesoPresupuestoRangos: profile.accesoPresupuestoRangos ?? true,
            accesoTiempos: profile.accesoTiempos,
            accesoEvaluaciones: profile.accesoEvaluaciones,
            accesoInventarios: profile.accesoInventarios,
            accesoPersonal: profile.accesoPersonal,
            accesoModeloPresupuesto: profile.accesoModeloPresupuesto || false,
            verConfigModelo: profile.verConfigModelo || false,
            verConsolidadoMensual: profile.verConsolidadoMensual || false,
            verAjustePresupuesto: profile.verAjustePresupuesto || false,
            verVersiones: profile.verVersiones || false,
            verBitacora: profile.verBitacora || false,
            verReferencias: profile.verReferencias || false,
            editarConsolidado: profile.editarConsolidado || false,
            ejecutarRecalculo: profile.ejecutarRecalculo || false,
            ajustarCurva: profile.ajustarCurva || false,
            restaurarVersiones: profile.restaurarVersiones || false,
            esAdmin: profile.esAdmin,
            permitirEnvioClave: profile.permitirEnvioClave,
            apareceEnTituloAlcance: profile.apareceEnTituloAlcance ?? true,
            apareceEnTituloMensual: profile.apareceEnTituloMensual ?? true,
            apareceEnTituloAnual: profile.apareceEnTituloAnual ?? true,
            apareceEnTituloTendencia: profile.apareceEnTituloTendencia ?? true,
            apareceEnTituloRangos: profile.apareceEnTituloRangos ?? true,
        });
    };

    if (loading) return <div className="text-center py-8">Cargando perfiles...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Perfiles de Usuario</h2>
                    <p className="text-sm text-gray-500 mt-1">Gestiona plantillas de permisos reutilizables</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Perfil
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            {/* Profiles List */}
            <div className="grid gap-4">
                {profiles.map(profile => (
                    <div key={profile.id} className="bg-white border-2 border-gray-200 rounded-xl p-6">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <Shield className="w-6 h-6 text-indigo-600" />
                                    <h3 className="text-lg font-bold text-gray-800">{profile.nombre}</h3>
                                    <span className="text-sm text-gray-500">
                                        <Users className="w-4 h-4 inline mr-1" />
                                        {profile.usuariosAsignados} usuario(s)
                                    </span>
                                </div>
                                {profile.descripcion && (
                                    <p className="text-sm text-gray-600 mt-2 ml-9">{profile.descripcion}</p>
                                )}

                                {/* Permissions Grid */}
                                <div className="mt-4 ml-9 flex flex-wrap gap-2">
                                    {profile.accesoPresupuesto && <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">Presupuesto</span>}
                                    {profile.accesoPresupuestoMensual && <span className="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] rounded border border-orange-100">P. Mensual</span>}
                                    {profile.accesoPresupuestoAnual && <span className="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] rounded border border-orange-100">P. Anual</span>}
                                    {profile.accesoPresupuestoRangos && <span className="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] rounded border border-orange-100">P. Rangos</span>}
                                    {profile.accesoTendencia && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Tendencia</span>}
                                    {profile.accesoTactica && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Táctica</span>}
                                    {profile.accesoEventos && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Eventos</span>}
                                    {profile.accesoTiempos && <span className="px-2 py-1 bg-pink-100 text-pink-700 text-xs rounded">Tiempos</span>}
                                    {profile.accesoEvaluaciones && <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">Evaluaciones</span>}
                                    {profile.accesoEvaluaciones && <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">Evaluaciones</span>}
                                    {profile.accesoInventarios && <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded">Inventarios</span>}
                                    {profile.accesoPersonal && <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs rounded">Personal</span>}
                                    {profile.accesoModeloPresupuesto && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">Modelo P.</span>}
                                    {profile.esAdmin && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-bold">Admin</span>}
                                    {!profile.permitirEnvioClave && <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">Sin envío de clave</span>}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setViewingProfile(profile);
                                        setShowViewUsersModal(true);
                                    }}
                                    className="p-2 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Ver usuarios asignados"
                                >
                                    <Users className="w-5 h-5 text-indigo-600" />
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedProfile(profile);
                                        setShowAssignModal(true);
                                    }}
                                    className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Asignar a usuarios"
                                >
                                    <Users className="w-5 h-5 text-blue-600" />
                                </button>
                                <button
                                    onClick={() => handleSync(profile.id)}
                                    className="p-2 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Sincronizar permisos"
                                >
                                    <RefreshCw className="w-5 h-5 text-green-600" />
                                </button>
                                <button
                                    onClick={() => openEditModal(profile)}
                                    className="p-2 hover:bg-yellow-50 rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 className="w-5 h-5 text-yellow-600" />
                                </button>
                                <button
                                    onClick={() => handleDelete(profile.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 className="w-5 h-5 text-red-600" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingProfile) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">
                            {editingProfile ? 'Editar Perfil' : 'Nuevo Perfil'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Nombre</label>
                                <input
                                    type="text"
                                    value={formData.nombre}
                                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Descripción</label>
                                <textarea
                                    value={formData.descripcion}
                                    onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">Permisos</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: 'accesoPresupuesto', label: 'Presupuesto' },
                                        { key: 'accesoTendencia', label: 'Tendencia' },
                                        { key: 'accesoTactica', label: 'Táctica' },
                                        { key: 'accesoEventos', label: 'Eventos' },
                                        { key: 'accesoTiempos', label: 'Tiempos' },
                                        { key: 'accesoEvaluaciones', label: 'Evaluaciones' },
                                        { key: 'accesoInventarios', label: 'Inventarios' },
                                        { key: 'accesoPersonal', label: 'Personal' },
                                        { key: 'accesoModeloPresupuesto', label: 'Modelo Presupuesto' },
                                        { key: 'esAdmin', label: 'Administrador' },
                                        { key: 'permitirEnvioClave', label: 'Envío de clave' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                            <input
                                                type="checkbox"
                                                checked={formData[key as keyof typeof formData] as boolean}
                                                onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm">{label}</span>
                                        </label>
                                    ))}
                                    {formData.accesoPresupuesto && (
                                        <>
                                            <label className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 ml-4 border-l-2 border-orange-300">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.accesoPresupuestoMensual}
                                                    onChange={e => setFormData({ ...formData, accesoPresupuestoMensual: e.target.checked })}
                                                    className="w-4 h-4 text-orange-600"
                                                />
                                                <span className="text-sm font-medium text-orange-800">Mensual</span>
                                            </label>
                                            <label className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 ml-4 border-l-2 border-orange-300">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.accesoPresupuestoAnual}
                                                    onChange={e => setFormData({ ...formData, accesoPresupuestoAnual: e.target.checked })}
                                                    className="w-4 h-4 text-orange-600"
                                                />
                                                <span className="text-sm font-medium text-orange-800">Anual</span>
                                            </label>
                                            <label className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 ml-4 border-l-2 border-orange-300">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.accesoPresupuestoRangos}
                                                    onChange={e => setFormData({ ...formData, accesoPresupuestoRangos: e.target.checked })}
                                                    className="w-4 h-4 text-orange-600"
                                                />
                                                <span className="text-sm font-medium text-orange-800">Rangos</span>
                                            </label>
                                        </>
                                    )}
                                    {formData.accesoModeloPresupuesto && (
                                        <>
                                            {[
                                                { key: 'verConfigModelo', label: 'Ver Config' },
                                                { key: 'verConsolidadoMensual', label: 'Ver Consolidado' },
                                                { key: 'verAjustePresupuesto', label: 'Ver Ajustes' },
                                                { key: 'verVersiones', label: 'Ver Versiones' },
                                                { key: 'verBitacora', label: 'Ver Bitácora' },
                                                { key: 'verReferencias', label: 'Ver Referencias' },
                                                { key: 'editarConsolidado', label: 'Editar Consolidado' },
                                                { key: 'ejecutarRecalculo', label: 'Ejecutar Recálculo' },
                                                { key: 'ajustarCurva', label: 'Ajustar Curva' },
                                                { key: 'restaurarVersiones', label: 'Restaurar Versiones' },
                                            ].map(({ key, label }) => (
                                                <label key={key} className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100 ml-4 border-l-2 border-emerald-300">
                                                    <input type="checkbox"
                                                        checked={formData[key as keyof typeof formData] as boolean}
                                                        onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                                                        className="w-4 h-4 text-emerald-600" />
                                                    <span className="text-sm font-medium text-emerald-800">{label}</span>
                                                </label>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">📌 Aparece en títulos de vista</label>
                                <p className="text-xs text-gray-500 mb-2">Controla si el nombre de este perfil aparece en el encabezado de cada vista</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: 'apareceEnTituloAlcance', label: 'Alcance de Presupuesto' },
                                        { key: 'apareceEnTituloMensual', label: 'Mensual' },
                                        { key: 'apareceEnTituloAnual', label: 'Anual' },
                                        { key: 'apareceEnTituloTendencia', label: 'Tendencia' },
                                        { key: 'apareceEnTituloRangos', label: 'Rangos' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className="flex items-center gap-2 p-3 bg-teal-50 rounded-lg cursor-pointer hover:bg-teal-100 border-l-2 border-teal-400">
                                            <input
                                                type="checkbox"
                                                checked={formData[key as keyof typeof formData] as boolean}
                                                onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                                                className="w-4 h-4 text-teal-600"
                                            />
                                            <span className="text-sm font-medium text-teal-800">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={editingProfile ? handleUpdate : handleCreate}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                {editingProfile ? 'Actualizar' : 'Crear'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingProfile(null);
                                    resetForm();
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Modal */}
            {showAssignModal && selectedProfile && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">
                            Asignar perfil "{selectedProfile.nombre}"
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                                <input
                                    type="checkbox"
                                    checked={syncOnAssign}
                                    onChange={e => setSyncOnAssign(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <label className="text-sm">
                                    Sincronizar permisos inmediatamente (recomendado)
                                </label>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o correo..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                                />
                            </div>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {users
                                    .filter(user => {
                                        const search = searchTerm.toLowerCase();
                                        return (
                                            user.nombre?.toLowerCase().includes(search) ||
                                            user.email.toLowerCase().includes(search)
                                        );
                                    })
                                    .map(user => (
                                        <label key={user.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.includes(user.id)}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedUsers([...selectedUsers, user.id]);
                                                    } else {
                                                        setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                                    }
                                                }}
                                                className="w-4 h-4"
                                            />
                                            <div>
                                                <div className="font-medium">{user.nombre || user.email}</div>
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </label>
                                    ))}
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleAssign}
                                disabled={selectedUsers.length === 0}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                Asignar a {selectedUsers.length} usuario(s)
                            </button>
                            <button
                                onClick={() => {
                                    setShowAssignModal(false);
                                    setSelectedUsers([]);
                                    setSearchTerm('');
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Users Modal */}
            {
                showViewUsersModal && viewingProfile && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-gray-800">
                                    Usuarios con perfil "{viewingProfile.nombre}"
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowViewUsersModal(false);
                                        setViewingProfile(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    <X className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                {users
                                    .filter(user => user.perfilId === viewingProfile.id)
                                    .map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-800">{user.nombre || user.email}</div>
                                                <div className="text-sm text-gray-500">{user.email}</div>
                                            </div>
                                            <span className={`px-2 py-1 text-xs rounded-full font-semibold ${user.activo
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                                }`}>
                                                {user.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                    ))}
                                {users.filter(user => user.perfilId === viewingProfile.id).length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        No hay usuarios asignados a este perfil
                                    </div>
                                )}
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={() => {
                                        setShowViewUsersModal(false);
                                        setViewingProfile(null);
                                    }}
                                    className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
