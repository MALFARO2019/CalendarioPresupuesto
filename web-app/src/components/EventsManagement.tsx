import React, { useState, useEffect } from 'react';
import { useToast } from './ui/Toast';
import {
    fetchEventos,
    createEvento,
    updateEvento,
    deleteEvento,
    reorderEventos,
    fetchEventoFechas,
    createEventoFecha,
    updateEventoFecha,
    deleteEventoFecha,
    cambiarEstadoEventoFecha,
    fetchAvailableCanales,
    fetchGruposAlmacen,
    fetchAvailableAlmacenes,
    getUser,
    fetchEventosFechasResumen,
    type Evento,
    type EventoFecha,
    type EventoFechaResumen,
    type GrupoAlmacen,
    type AlmacenOption
} from '../api';
import { SearchableCombobox, type ComboboxOption } from './ui/SearchableCombobox';
import {
    Calendar, Plus, Trash2, Edit2, X, Loader2, AlertCircle,
    CheckCircle, CalendarDays, Search, ArrowUpDown, ChevronDown, ChevronRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { EventosPeriodView } from './EventosPeriodView';
import { EventReorderModal } from './EventReorderModal';

interface EventsManagementProps {
    // No props needed - authentication is handled by token
}

export const EventsManagement: React.FC<EventsManagementProps> = () => {
    const { showConfirm } = useToast();
    const [eventos, setEventos] = useState<Evento[]>([]);
    const [selectedEvento, setSelectedEvento] = useState<number | null>(null);
    const [eventoFechas, setEventoFechas] = useState<EventoFecha[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchFilter, setSearchFilter] = useState('');
    const [showReorderModal, setShowReorderModal] = useState(false);

    // Resumen Anual state
    const [resumenYear, setResumenYear] = useState(new Date().getFullYear());
    const [resumenFechas, setResumenFechas] = useState<EventoFechaResumen[]>([]);
    const [resumenLoading, setResumenLoading] = useState(false);
    const [resumenFilter, setResumenFilter] = useState<'Todos' | 'Pendiente' | 'Aprobado' | 'Rechazado'>('Todos');
    const [isResumenOpen, setIsResumenOpen] = useState(false);

    // Estado para modal de rechazo
    const [rechazoModal, setRechazoModal] = useState<{ idEvento: number, fecha: string } | null>(null);
    const [motivoRechazo, setMotivoRechazo] = useState('');

    // Event form state
    const [showEventForm, setShowEventForm] = useState(false);
    const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
    const [eventoForm, setEventoForm] = useState({
        EVENTO: '',
        ESFERIADO: 'N',
        USARENPRESUPUESTO: 'S',
        ESINTERNO: 'N'
    });

    // Event date form state
    const [showFechaForm, setShowFechaForm] = useState(false);
    const [editingFecha, setEditingFecha] = useState<EventoFecha | null>(null);
    const [fechaForm, setFechaForm] = useState({
        FECHA: '',
        FECHA_EFECTIVA: '',
        Canal: 'Todos',
        GrupoAlmacen: null as number | null,
        CodAlmacen: null as string | null
    });

    // Toggle between 'grupo' and 'almacen' selection mode
    const [storeMode, setStoreMode] = useState<'grupo' | 'almacen'>('grupo');

    const user = getUser();

    // Combobox options for Canal and Grupo Almacén
    const [canalesOptions, setCanalesOptions] = useState<ComboboxOption[]>([]);
    const [gruposOptions, setGruposOptions] = useState<ComboboxOption[]>([]);
    const [almacenesOptions, setAlmacenesOptions] = useState<ComboboxOption[]>([]);

    useEffect(() => {
        loadEventos();
        // Load combobox options
        fetchAvailableCanales().then(canales => {
            const opts: ComboboxOption[] = [{ value: 'Todos', label: 'Todos' }];
            canales.forEach(c => {
                if (c !== 'Todos') opts.push({ value: c, label: c });
            });
            setCanalesOptions(opts);
        }).catch(() => { });
        fetchGruposAlmacen().then(grupos => {
            setGruposOptions(grupos.map(g => ({ value: String(g.IDGRUPO), label: g.DESCRIPCION })));
        }).catch(() => { });
        fetchAvailableAlmacenes().then(stores => {
            setAlmacenesOptions(stores.map(s => ({ value: s.CODALMACEN, label: `${s.CODALMACEN} - ${s.NOMBRE}` })));
        }).catch(() => { });
    }, []);

    useEffect(() => {
        if (selectedEvento !== null) {
            loadEventoFechas(selectedEvento);
        }
    }, [selectedEvento]);

    useEffect(() => {
        loadResumenAnual();
    }, [resumenYear]);

    const loadResumenAnual = async () => {
        try {
            setResumenLoading(true);
            const data = await fetchEventosFechasResumen(resumenYear);
            setResumenFechas(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setResumenLoading(false);
        }
    };

    const loadEventos = async () => {
        try {
            setLoading(true);
            const data = await fetchEventos();
            setEventos(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadEventoFechas = async (idEvento: number) => {
        try {
            const data = await fetchEventoFechas(idEvento);
            setEventoFechas(data);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCreateEvento = async () => {
        try {
            setError('');
            await createEvento(eventoForm);
            setSuccess('Evento creado exitosamente');
            setShowEventForm(false);
            setEventoForm({ EVENTO: '', ESFERIADO: 'N', USARENPRESUPUESTO: 'S', ESINTERNO: 'N' });
            loadEventos();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleUpdateEvento = async () => {
        if (!editingEvento) return;
        try {
            setError('');
            await updateEvento(editingEvento.IDEVENTO, eventoForm);
            setSuccess('Evento actualizado exitosamente');
            setEditingEvento(null);
            setShowEventForm(false);
            loadEventos();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDeleteEvento = async (id: number, nombre: string) => {
        if (!await showConfirm({ message: `¿Eliminar el evento "${nombre}" y todas sus fechas asociadas?`, destructive: true })) return;
        try {
            setError('');
            await deleteEvento(id);
            setSuccess('Evento eliminado exitosamente');
            if (selectedEvento === id) {
                setSelectedEvento(null);
                setEventoFechas([]);
            }
            loadEventos();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleEditEvento = (evento: Evento) => {
        setEditingEvento(evento);
        setEventoForm({
            EVENTO: evento.EVENTO,
            ESFERIADO: evento.ESFERIADO,
            USARENPRESUPUESTO: evento.USARENPRESUPUESTO,
            ESINTERNO: evento.ESINTERNO
        });
        setShowEventForm(true);
    };

    const handleCreateFecha = async () => {
        if (!selectedEvento) return;
        try {
            setError('');
            await createEventoFecha({
                idEvento: selectedEvento,
                fecha: fechaForm.FECHA,
                fechaEfectiva: fechaForm.FECHA_EFECTIVA,
                canal: fechaForm.Canal,
                grupoAlmacen: fechaForm.GrupoAlmacen,
                codAlmacen: fechaForm.CodAlmacen,
                usuario: user?.email || 'admin'
            });
            setSuccess('Fecha agregada exitosamente');
            setShowFechaForm(false);
            setFechaForm({ FECHA: '', FECHA_EFECTIVA: '', Canal: 'Todos', GrupoAlmacen: null, CodAlmacen: null });
            loadEventoFechas(selectedEvento);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleUpdateFecha = async () => {
        if (!editingFecha || !selectedEvento) return;
        try {
            setError('');
            await updateEventoFecha({
                idEvento: selectedEvento,
                oldFecha: editingFecha.FECHA,
                newFecha: fechaForm.FECHA,
                fechaEfectiva: fechaForm.FECHA_EFECTIVA,
                canal: fechaForm.Canal,
                grupoAlmacen: fechaForm.GrupoAlmacen,
                codAlmacen: fechaForm.CodAlmacen,
                usuario: user?.email || 'admin'
            });
            setSuccess('Fecha actualizada exitosamente');
            setEditingFecha(null);
            setShowFechaForm(false);
            loadEventoFechas(selectedEvento);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDeleteFecha = async (idEvento: number, fecha: string) => {
        if (!await showConfirm({ message: `¿Eliminar esta fecha del evento?`, destructive: true })) return;
        try {
            setError('');
            await deleteEventoFecha(idEvento, fecha);
            setSuccess('Fecha eliminada exitosamente');
            if (selectedEvento) {
                loadEventoFechas(selectedEvento);
            }
            loadResumenAnual();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCambiarEstado = async (idEvento: number, fecha: string, estado: 'Aprobado' | 'Rechazado', motivo?: string) => {
        try {
            setError('');
            await cambiarEstadoEventoFecha(idEvento, fecha, estado, motivo);
            setSuccess(`Evento ${estado.toLowerCase()} exitosamente`);
            if (selectedEvento === idEvento) {
                loadEventoFechas(idEvento);
            }
            loadResumenAnual();
            setRechazoModal(null);
            setMotivoRechazo('');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleEditFecha = (fecha: EventoFecha) => {
        setEditingFecha(fecha);
        setFechaForm({
            FECHA: fecha.FECHA ? fecha.FECHA.split('T')[0] : '',
            FECHA_EFECTIVA: fecha.FECHA_EFECTIVA ? fecha.FECHA_EFECTIVA.split('T')[0] : '',
            Canal: fecha.Canal,
            GrupoAlmacen: fecha.GrupoAlmacen,
            CodAlmacen: fecha.CodAlmacen || null
        });
        // Set the correct mode based on what's stored
        if (fecha.CodAlmacen) {
            setStoreMode('almacen');
        } else {
            setStoreMode('grupo');
        }
        setShowFechaForm(true);
    };

    const cancelForm = () => {
        setShowEventForm(false);
        setShowFechaForm(false);
        setEditingEvento(null);
        setEditingFecha(null);
        setEventoForm({ EVENTO: '', ESFERIADO: 'N', USARENPRESUPUESTO: 'S', ESINTERNO: 'N' });
        setFechaForm({ FECHA: '', FECHA_EFECTIVA: '', Canal: 'Todos', GrupoAlmacen: null, CodAlmacen: null });
        setStoreMode('grupo');
    };

    const safeFormatDate = (dateStr: string | null | undefined, fallback = '(sin fecha)') => {
        if (!dateStr) return fallback;
        try {
            const clean = dateStr.split('T')[0];
            return format(parseISO(clean), 'PPP', { locale: es });
        } catch {
            return fallback;
        }
    };

    return (
        <div className="space-y-6">
            {/* Messages */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-red-700 text-sm font-medium">{error}</span>
                    <button onClick={() => setError('')} className="ml-auto">
                        <X className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            )}

            {success && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 text-sm font-medium">{success}</span>
                    <button onClick={() => setSuccess('')} className="ml-auto">
                        <X className="w-4 h-4 text-green-400" />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Eventos Section */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            <h2 className="text-lg font-bold text-gray-800">Tipos de Eventos</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowReorderModal(true)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-medium transition-all"
                                title="Reordenar eventos"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                Ordenar
                            </button>
                            <button
                                onClick={() => { setEditingEvento(null); setShowEventForm(true); }}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Nuevo
                            </button>
                        </div>
                    </div>

                    {/* Search Filter */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchFilter}
                            onChange={e => setSearchFilter(e.target.value)}
                            placeholder="Buscar evento..."
                            className="w-full pl-9 pr-8 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm transition-all"
                        />
                        {searchFilter && (
                            <button
                                onClick={() => setSearchFilter('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Event Form */}
                    {showEventForm && (
                        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">
                                {editingEvento ? 'Editar Evento' : 'Nuevo Evento'}
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre del Evento</label>
                                    <input
                                        type="text"
                                        value={eventoForm.EVENTO}
                                        onChange={(e) => setEventoForm({ ...eventoForm, EVENTO: e.target.value })}
                                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm"
                                        placeholder="Ej: Día de la Madre"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={eventoForm.ESFERIADO === 'S'}
                                            onChange={(e) => setEventoForm({ ...eventoForm, ESFERIADO: e.target.checked ? 'S' : 'N' })}
                                            className="w-4 h-4 text-indigo-600 rounded"
                                        />
                                        <span className="text-xs font-medium text-gray-700">Es Feriado</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={eventoForm.USARENPRESUPUESTO === 'S'}
                                            onChange={(e) => setEventoForm({ ...eventoForm, USARENPRESUPUESTO: e.target.checked ? 'S' : 'N' })}
                                            className="w-4 h-4 text-indigo-600 rounded"
                                        />
                                        <span className="text-xs font-medium text-gray-700">Usar en Presup.</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={eventoForm.ESINTERNO === 'S'}
                                            onChange={(e) => setEventoForm({ ...eventoForm, ESINTERNO: e.target.checked ? 'S' : 'N' })}
                                            className="w-4 h-4 text-indigo-600 rounded"
                                        />
                                        <span className="text-xs font-medium text-gray-700">Es Interno</span>
                                    </label>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={cancelForm}
                                        className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={editingEvento ? handleUpdateEvento : handleCreateEvento}
                                        className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-all"
                                    >
                                        {editingEvento ? 'Actualizar' : 'Crear'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Events List */}
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                            </div>
                        ) : eventos.length === 0 ? (
                            <p className="text-center text-gray-400 py-8 text-sm">No hay eventos registrados</p>
                        ) : (
                            [...eventos]
                                .filter(e => !searchFilter.trim() || (e.EVENTO || '').toLowerCase().includes(searchFilter.toLowerCase()))
                                .map((evento) => (
                                    <div
                                        key={evento.IDEVENTO}
                                        className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${selectedEvento === evento.IDEVENTO
                                            ? 'bg-indigo-50 border-indigo-300'
                                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        onClick={() => setSelectedEvento(evento.IDEVENTO)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-sm text-gray-800">
                                                    {evento.EVENTO || <span className="text-red-400 italic">(Sin nombre - ID: {evento.IDEVENTO})</span>}
                                                </h4>
                                                <div className="flex gap-2 mt-1">
                                                    {evento.ESFERIADO === 'S' && (
                                                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Feriado</span>
                                                    )}
                                                    {evento.USARENPRESUPUESTO === 'S' && (
                                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Presupuesto</span>
                                                    )}
                                                    {evento.ESINTERNO === 'S' && (
                                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Interno</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditEvento(evento); }}
                                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteEvento(evento.IDEVENTO, evento.EVENTO); }}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>

                {/* Event Dates Section */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            <h2 className="text-lg font-bold text-gray-800">
                                Fechas del Evento
                            </h2>
                        </div>
                        {selectedEvento && (
                            <button
                                onClick={() => { setEditingFecha(null); setShowFechaForm(true); }}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Nueva
                            </button>
                        )}
                    </div>

                    {!selectedEvento ? (
                        <p className="text-center text-gray-400 py-12 text-sm">Seleccione un evento para ver sus fechas</p>
                    ) : (
                        <>
                            {/* Date Form */}
                            {showFechaForm && (
                                <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-700 mb-3">
                                        {editingFecha ? 'Editar Fecha' : 'Nueva Fecha'}
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha Efectiva</label>
                                                <input
                                                    type="date"
                                                    value={fechaForm.FECHA}
                                                    onChange={(e) => setFechaForm({ ...fechaForm, FECHA: e.target.value })}
                                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha Referencia</label>
                                                <input
                                                    type="date"
                                                    value={fechaForm.FECHA_EFECTIVA}
                                                    onChange={(e) => setFechaForm({ ...fechaForm, FECHA_EFECTIVA: e.target.value })}
                                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Canal</label>
                                                <SearchableCombobox
                                                    options={canalesOptions}
                                                    value={fechaForm.Canal}
                                                    onChange={(v) => setFechaForm({ ...fechaForm, Canal: v || 'Todos' })}
                                                    placeholder="Todos"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Grupo / Almacén</label>
                                                {/* Mode toggle tabs */}
                                                <div className="flex mb-2 rounded-lg overflow-hidden border border-gray-200">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setStoreMode('grupo'); setFechaForm({ ...fechaForm, CodAlmacen: null }); }}
                                                        className={`flex-1 px-2 py-1 text-xs font-medium transition-all ${storeMode === 'grupo' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                                    >
                                                        Grupo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setStoreMode('almacen'); setFechaForm({ ...fechaForm, GrupoAlmacen: null }); }}
                                                        className={`flex-1 px-2 py-1 text-xs font-medium transition-all ${storeMode === 'almacen' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                                    >
                                                        Almacén
                                                    </button>
                                                </div>
                                                {storeMode === 'grupo' ? (
                                                    <SearchableCombobox
                                                        options={gruposOptions}
                                                        value={fechaForm.GrupoAlmacen ? String(fechaForm.GrupoAlmacen) : ''}
                                                        onChange={(v) => setFechaForm({ ...fechaForm, GrupoAlmacen: v ? parseInt(v) : null, CodAlmacen: null })}
                                                        placeholder="Opcional"
                                                    />
                                                ) : (
                                                    <SearchableCombobox
                                                        options={almacenesOptions}
                                                        value={fechaForm.CodAlmacen || ''}
                                                        onChange={(v) => setFechaForm({ ...fechaForm, CodAlmacen: v || null, GrupoAlmacen: null })}
                                                        placeholder="Opcional"
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={cancelForm}
                                                className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-all"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={editingFecha ? handleUpdateFecha : handleCreateFecha}
                                                className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-all"
                                            >
                                                {editingFecha ? 'Actualizar' : 'Crear'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Dates List */}
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {eventoFechas.length === 0 ? (
                                    <p className="text-center text-gray-400 py-8 text-sm">No hay fechas para este evento</p>
                                ) : (
                                    eventoFechas.map((fecha) => (
                                        <div
                                            key={`${fecha.IDEVENTO}-${fecha.FECHA}`}
                                            className={`p-3 rounded-lg border-2 transition-all ${fecha.Estado === 'Rechazado'
                                                ? 'bg-red-50/50 border-red-100 hover:bg-red-50'
                                                : fecha.Estado === 'Aprobado'
                                                    ? 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                                    : 'bg-yellow-50/50 border-yellow-100 hover:bg-yellow-50'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-sm text-gray-800">
                                                            {safeFormatDate(fecha.FECHA)}
                                                            {fecha.FECHA && (() => { try { const d = parseISO(fecha.FECHA.split('T')[0]); return <span className="ml-1.5 text-xs font-medium text-indigo-500 capitalize">({format(d, 'EEEE', { locale: es })})</span>; } catch { return null; } })()}
                                                        </span>
                                                        {fecha.Canal && (
                                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                                                {fecha.Canal}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        <div>
                                                            Referencia: {safeFormatDate(fecha.FECHA_EFECTIVA)}
                                                            {fecha.FECHA_EFECTIVA && (() => { try { const d = parseISO(fecha.FECHA_EFECTIVA.split('T')[0]); return <span className="ml-1 text-indigo-400 capitalize">({format(d, 'EEEE', { locale: es })})</span>; } catch { return null; } })()}
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <span className={`font-medium ${fecha.Estado === 'Aprobado' ? 'text-green-600' :
                                                                fecha.Estado === 'Rechazado' ? 'text-red-600' :
                                                                    'text-yellow-600'
                                                                }`}>
                                                                &#9679; {fecha.Estado || 'Pendiente'}
                                                            </span>
                                                            {(fecha.UsuarioCrea || fecha.USUARIO_MODIFICACION) && (
                                                                <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold">
                                                                    Creado por {fecha.UsuarioCrea || fecha.USUARIO_MODIFICACION}
                                                                </span>
                                                            )}
                                                            {fecha.UsuarioAprueba && (
                                                                <span className="text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border border-gray-100">
                                                                    Aprobado por {fecha.UsuarioAprueba}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {fecha.Estado === 'Rechazado' && fecha.MotivoRechazo && (
                                                            <div className="mt-1 text-red-600 italic">
                                                                "{fecha.MotivoRechazo}"
                                                            </div>
                                                        )}
                                                        {fecha.USUARIO_MODIFICACION && (
                                                            <div className="mt-1 text-gray-400">
                                                                Modificado por {fecha.USUARIO_MODIFICACION} el {fecha.FECHA_MODIFICACION && format(new Date(fecha.FECHA_MODIFICACION), 'PPpp', { locale: es })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2 ml-2">
                                                    <div className="flex gap-1">
                                                        {(user?.aprobarAjustes || user?.esAdmin) && fecha.Estado !== 'Aprobado' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleCambiarEstado(fecha.IDEVENTO, fecha.FECHA, 'Aprobado'); }}
                                                                className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                                                            >
                                                                <CheckCircle className="w-3 h-3" /> Aprobar
                                                            </button>
                                                        )}
                                                        {(user?.aprobarAjustes || user?.esAdmin) && fecha.Estado !== 'Rechazado' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setRechazoModal({ idEvento: fecha.IDEVENTO, fecha: fecha.FECHA }); }}
                                                                className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                                                            >
                                                                <X className="w-3 h-3" /> Rechazar
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleEditFecha(fecha)}
                                                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                            title="Editar"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteFecha(fecha.IDEVENTO, fecha.FECHA)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Resumen Anual Section */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none group"
                        onClick={() => setIsResumenOpen(!isResumenOpen)}
                    >
                        {isResumenOpen ? (
                            <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                        ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                        )}
                        <CalendarDays className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">Resumen Anual de Eventos</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Year Selector */}
                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setResumenYear(y => y - 1)}
                                className="px-3 py-1 text-gray-600 hover:bg-white hover:shadow-sm rounded-md transition-all text-sm font-medium"
                            >
                                {resumenYear - 1}
                            </button>
                            <span className="px-4 py-1 font-bold text-gray-800 bg-white shadow-sm rounded-md">
                                {resumenYear}
                            </span>
                            <button
                                onClick={() => setResumenYear(y => y + 1)}
                                className="px-3 py-1 text-gray-600 hover:bg-white hover:shadow-sm rounded-md transition-all text-sm font-medium"
                            >
                                {resumenYear + 1}
                            </button>
                        </div>

                        {/* Status Filter */}
                        <select
                            value={resumenFilter}
                            onChange={(e) => setResumenFilter(e.target.value as any)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block px-3 py-2"
                        >
                            <option value="Todos">Todos los Estados</option>
                            <option value="Pendiente">Pendientes</option>
                            <option value="Aprobado">Aprobados</option>
                            <option value="Rechazado">Rechazados</option>
                        </select>
                    </div>
                </div>

                {isResumenOpen && (
                    <div className="mt-6 border-t border-gray-100 pt-6">
                        {resumenLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : resumenFechas.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                No hay eventos registrados para el año {resumenYear}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-3">Fecha</th>
                                            <th className="px-4 py-3">Evento</th>
                                            <th className="px-4 py-3">Tipo</th>
                                            <th className="px-4 py-3">Alcance</th>
                                            <th className="px-4 py-3">Estado</th>
                                            <th className="px-4 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenFechas
                                            .filter(f => resumenFilter === 'Todos' || (f.Estado || 'Pendiente') === resumenFilter)
                                            .map((fecha, idx) => (
                                                <tr key={idx} className="bg-white border-b hover:bg-gray-50 whitespace-nowrap">
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        {safeFormatDate(fecha.FECHA)}
                                                        {fecha.FECHA_EFECTIVA && fecha.FECHA_EFECTIVA !== fecha.FECHA && (
                                                            <div className="text-xs text-gray-500 font-normal">
                                                                Ref: {safeFormatDate(fecha.FECHA_EFECTIVA)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-gray-800">{fecha.EVENTO}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex gap-1">
                                                            {fecha.ESFERIADO === 'S' && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Feriado</span>}
                                                            {fecha.ESINTERNO === 'S' && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Interno</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-xs">
                                                            <span className="font-semibold text-gray-700">{fecha.Canal || 'Todos'}</span>
                                                            {(fecha.CodAlmacen || fecha.GrupoAlmacen) && (
                                                                <span className="text-gray-500 ml-1">
                                                                    ({fecha.CodAlmacen ? `Almacén ${fecha.CodAlmacen}` : `Grupo ${fecha.GrupoAlmacen}`})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`px-2 py-0.5 w-max text-xs font-semibold inline-flex items-center gap-1 rounded-full ${fecha.Estado === 'Aprobado' ? 'bg-green-100 text-green-700' :
                                                                fecha.Estado === 'Rechazado' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                                }`}>
                                                                &#9679; {fecha.Estado || 'Pendiente'}
                                                            </span>
                                                            {(fecha.UsuarioCrea || fecha.USUARIO_MODIFICACION) && (
                                                                <span className="text-[10px] text-gray-500 uppercase font-medium">Crea: {fecha.UsuarioCrea || fecha.USUARIO_MODIFICACION}</span>
                                                            )}
                                                            {fecha.UsuarioAprueba && (
                                                                <span className="text-[10px] text-gray-400 uppercase font-medium">Aprob: {fecha.UsuarioAprueba}</span>
                                                            )}
                                                        </div>
                                                        {fecha.Estado === 'Rechazado' && fecha.MotivoRechazo && (
                                                            <div className="text-xs text-red-500 italic mt-1 w-48 overflow-hidden text-ellipsis whitespace-normal">
                                                                "{fecha.MotivoRechazo}"
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end gap-1">
                                                            {(user?.aprobarAjustes || user?.esAdmin) && fecha.Estado !== 'Aprobado' && (
                                                                <button
                                                                    onClick={() => handleCambiarEstado(fecha.IDEVENTO, fecha.FECHA, 'Aprobado')}
                                                                    className="px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded text-xs font-medium transition-colors"
                                                                >
                                                                    Aprobar
                                                                </button>
                                                            )}
                                                            {(user?.aprobarAjustes || user?.esAdmin) && fecha.Estado !== 'Rechazado' && (
                                                                <button
                                                                    onClick={() => setRechazoModal({ idEvento: fecha.IDEVENTO, fecha: fecha.FECHA })}
                                                                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-medium transition-colors"
                                                                >
                                                                    Rechazar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Period-based adjustments view */}
            {(user?.esAdmin || user?.ajustarCurva || user?.verAjustePresupuesto) && (
                <EventosPeriodView />
            )}

            {/* Reorder Modal */}
            {showReorderModal && (
                <EventReorderModal
                    eventos={eventos}
                    onSave={async (orderedIds) => {
                        await reorderEventos(orderedIds);
                        setSuccess('Orden guardado exitosamente');
                        loadEventos();
                    }}
                    onClose={() => setShowReorderModal(false)}
                />
            )}
            {/* Modal de Rechazo */}
            {rechazoModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Rechazar Evento</h3>
                        <p className="text-sm text-gray-500 mb-4">Ingrese un motivo para rechazar este evento.</p>
                        <textarea
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-100 text-sm mb-4 resize-none"
                            rows={3}
                            placeholder="Ej: Ya pasó la fecha, datos incorrectos..."
                            value={motivoRechazo}
                            onChange={(e) => setMotivoRechazo(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setRechazoModal(null); setMotivoRechazo(''); }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleCambiarEstado(rechazoModal.idEvento, rechazoModal.fecha, 'Rechazado', motivoRechazo)}
                                disabled={!motivoRechazo.trim()}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
                            >
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
