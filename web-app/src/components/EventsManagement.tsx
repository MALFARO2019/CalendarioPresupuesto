import React, { useState, useEffect } from 'react';
import {
    fetchEventos,
    createEvento,
    updateEvento,
    deleteEvento,
    fetchEventoFechas,
    createEventoFecha,
    updateEventoFecha,
    deleteEventoFecha,
    getUser,
    type Evento,
    type EventoFecha
} from '../api';
import {
    Calendar, Plus, Trash2, Edit2, X, Loader2, AlertCircle,
    CheckCircle, CalendarDays
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface EventsManagementProps {
    // No props needed - authentication is handled by token
}

export const EventsManagement: React.FC<EventsManagementProps> = () => {
    const [eventos, setEventos] = useState<Evento[]>([]);
    const [selectedEvento, setSelectedEvento] = useState<number | null>(null);
    const [eventoFechas, setEventoFechas] = useState<EventoFecha[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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
        GrupoAlmacen: null as number | null
    });

    const user = getUser();

    useEffect(() => {
        loadEventos();
    }, []);

    useEffect(() => {
        if (selectedEvento !== null) {
            loadEventoFechas(selectedEvento);
        }
    }, [selectedEvento]);

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
        if (!confirm(`¿Eliminar el evento "${nombre}" y todas sus fechas asociadas?`)) return;
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
                usuario: user?.email || 'admin'
            });
            setSuccess('Fecha agregada exitosamente');
            setShowFechaForm(false);
            setFechaForm({ FECHA: '', FECHA_EFECTIVA: '', Canal: 'Todos', GrupoAlmacen: null });
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
        if (!confirm(`¿Eliminar esta fecha del evento?`)) return;
        try {
            setError('');
            await deleteEventoFecha(idEvento, fecha);
            setSuccess('Fecha eliminada exitosamente');
            if (selectedEvento) {
                loadEventoFechas(selectedEvento);
            }
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
            GrupoAlmacen: fecha.GrupoAlmacen
        });
        setShowFechaForm(true);
    };

    const cancelForm = () => {
        setShowEventForm(false);
        setShowFechaForm(false);
        setEditingEvento(null);
        setEditingFecha(null);
        setEventoForm({ EVENTO: '', ESFERIADO: 'N', USARENPRESUPUESTO: 'S', ESINTERNO: 'N' });
        setFechaForm({ FECHA: '', FECHA_EFECTIVA: '', Canal: 'Todos', GrupoAlmacen: null });
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
                        <button
                            onClick={() => { setEditingEvento(null); setShowEventForm(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Nuevo
                        </button>
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
                            eventos.map((evento) => (
                                <div
                                    key={evento.IDEVENTO}
                                    className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${selectedEvento === evento.IDEVENTO
                                        ? 'bg-indigo-50 border-indigo-300'
                                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    onClick={() => setSelectedEvento(evento.IDEVENTO)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-sm text-gray-800">{evento.EVENTO}</h4>
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
                                                <input
                                                    type="text"
                                                    value={fechaForm.Canal}
                                                    onChange={(e) => setFechaForm({ ...fechaForm, Canal: e.target.value })}
                                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm"
                                                    placeholder="Todos, Local, Delivery..."
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Grupo Almacén</label>
                                                <input
                                                    type="number"
                                                    value={fechaForm.GrupoAlmacen || ''}
                                                    onChange={(e) => setFechaForm({ ...fechaForm, GrupoAlmacen: e.target.value ? parseInt(e.target.value) : null })}
                                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm"
                                                    placeholder="Opcional"
                                                />
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
                                            className="p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-sm text-gray-800">
                                                            {safeFormatDate(fecha.FECHA)}
                                                        </span>
                                                        {fecha.Canal && (
                                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                                                {fecha.Canal}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        <div>Referencia: {safeFormatDate(fecha.FECHA_EFECTIVA)}</div>
                                                        {fecha.USUARIO_MODIFICACION && (
                                                            <div className="mt-1 text-gray-400">
                                                                Modificado por {fecha.USUARIO_MODIFICACION} el {fecha.FECHA_MODIFICACION && format(new Date(fecha.FECHA_MODIFICACION), 'PPpp', { locale: es })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 ml-2">
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
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
