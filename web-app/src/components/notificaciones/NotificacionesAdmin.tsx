import React, { useState, useEffect, useCallback } from 'react';
import {
    fetchNotificacionesAdmin, saveNotificacionAdmin, deleteNotificacionAdmin,
    toggleNotificacionActivaAdmin, // Agregado
    fetchClasificaciones, fetchNotifReporteLineal, fetchNotifReporteAgrupado,
    getUser, // Agregado para verificar esAdmin
    type NotificacionAdmin, type ClasificacionNotif,
    type NotifLogEntry, type NotifReporteAgrupado
} from '../../api';

type Tab = 'notificaciones' | 'reportes';

const TIPO_COMENTARIO_LABELS: Record<string, string> = {
    none: 'No requiere', opcional: 'Opcional', obligatorio: 'Obligatorio'
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

const emptyNotif = (): Partial<NotificacionAdmin> => ({
    Titulo: '', Texto: '', ImagenUrl: '', ClasificacionId: 0,
    NRepeticiones: 1, RequiereComentario: 'none',
    RequiereCodigoEmpleado: false, ComunicarConFlamia: false, Activo: true
});

export const NotificacionesAdmin: React.FC = () => {
    const [tab, setTab] = useState<Tab>('notificaciones');
    const [clasificaciones, setClasificaciones] = useState<ClasificacionNotif[]>([]);
    const [notifs, setNotifs] = useState<NotificacionAdmin[]>([]);
    const [loading, setLoading] = useState(false);
    const [editItem, setEditItem] = useState<Partial<NotificacionAdmin> & { id?: number } | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [uploadingImg, setUploadingImg] = useState(false);
    const user = getUser(); // Usuario actual

    // Reportes
    const [reporteTipo, setReporteTipo] = useState<'lineal' | 'agrupado'>('lineal');
    const [filtroDesde, setFiltroDesde] = useState('');
    const [filtroHasta, setFiltroHasta] = useState('');
    const [reporteLineal, setReporteLineal] = useState<NotifLogEntry[]>([]);
    const [reporteAgrupado, setReporteAgrupado] = useState<NotifReporteAgrupado[]>([]);
    const [loadingReporte, setLoadingReporte] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [c, n] = await Promise.all([fetchClasificaciones(), fetchNotificacionesAdmin()]);
            setClasificaciones(c);
            setNotifs(n);
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const nuevoNotif = () => {
        const empty = emptyNotif();
        if (clasificaciones.length > 0) empty.ClasificacionId = clasificaciones[0].Id;
        setEditItem(empty);
        setError('');
    };

    const editarNotif = (n: NotificacionAdmin) => {
        setEditItem({ ...n, id: n.Id });
        setError('');
    };

    const handleImageUpload = async (file: File) => {
        setUploadingImg(true);
        try {
            const { getToken, API_BASE } = await import('../../api');
            const form = new FormData();
            form.append('imagen', file);
            const res = await fetch(`${API_BASE}/notificaciones/upload-imagen`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: form
            });
            const data = await res.json();
            if (data.url) setEditItem(p => ({ ...p!, ImagenUrl: `${API_BASE.replace('/api', '')}${data.url}` }));
            else setError(data.error || 'Error al subir imagen');
        } catch { setError('Error al subir imagen'); } finally { setUploadingImg(false); }
    };

    const handleSave = async () => {
        if (!editItem) return;
        if (!editItem.Titulo?.trim()) { setError('El título es requerido'); return; }
        if (!editItem.Texto?.trim()) { setError('El texto es requerido'); return; }
        if (!editItem.ClasificacionId) { setError('La clasificación es requerida'); return; }
        try {
            setGuardando(true);
            await saveNotificacionAdmin(editItem);
            setEditItem(null);
            await loadData();
        } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('¿ESTÁ SEGURO DE ELIMINAR ESTA NOTIFICACIÓN? Esta acción es permanente y se borrará de la base de datos.')) return;
        try {
            await deleteNotificacionAdmin(id);
            await loadData();
            setError('');
        } catch (e: any) { setError(e.message); }
    };

    const handleToggleActivo = async (id: number, currentStatus: boolean) => {
        try {
            await toggleNotificacionActivaAdmin(id, !currentStatus);
            await loadData();
            setError('');
        } catch (e: any) { setError(e.message); }
    };

    const buscarReporte = async () => {
        setLoadingReporte(true);
        try {
            if (reporteTipo === 'lineal') {
                setReporteLineal(await fetchNotifReporteLineal({ desde: filtroDesde, hasta: filtroHasta }));
            } else {
                setReporteAgrupado(await fetchNotifReporteAgrupado({ desde: filtroDesde, hasta: filtroHasta }));
            }
        } catch { /* silencioso */ } finally { setLoadingReporte(false); }
    };

    const clasificacion = (id: number) => clasificaciones.find(c => c.Id === id);

    return (
        <div className="flex flex-col gap-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-100 pb-0">
                {(['notificaciones', 'reportes'] as Tab[]).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all
                            ${tab === t ? 'bg-white border border-b-0 border-gray-200 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'notificaciones' ? '🔔 Notificaciones' : '📊 Reportes'}
                    </button>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5 rounded-xl">❌ {error}</div>
            )}

            {/* ═══════════════════════════════════════════
                TAB: NOTIFICACIONES CRUD
                ═══════════════════════════════════════════ */}
            {tab === 'notificaciones' && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-gray-800">Notificaciones activas</h3>
                        <button onClick={nuevoNotif}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                            + Nueva
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-sm text-gray-400 animate-pulse py-6 text-center">Cargando...</div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-left">
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Título</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Clasificación</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Repeticiones</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Comentario</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Cód. Empl.</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase">Estado</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {notifs.length === 0 && (
                                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">Sin notificaciones</td></tr>
                                    )}
                                    {notifs.map(n => (
                                        <tr key={n.Id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{n.Titulo}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                                                    style={{ backgroundColor: n.ClasificacionColor }}>
                                                    {n.ClasificacionNombre}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{n.NRepeticiones}x</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{TIPO_COMENTARIO_LABELS[n.RequiereComentario]}</td>
                                            <td className="px-4 py-3 text-center">{n.RequiereCodigoEmpleado ? '✅' : '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${n.Activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {n.Activo ? 'Activa' : 'Inactiva'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => editarNotif(n)}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Editar</button>
                                                    <button onClick={() => handleToggleActivo(n.Id, !!n.Activo)}
                                                        className={`text-xs font-medium ${n.Activo ? 'text-amber-600 hover:text-amber-800' : 'text-green-600 hover:text-green-800'}`}>
                                                        {n.Activo ? 'Desactivar' : 'Activar'}
                                                    </button>
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

            {/* ═══════════════════════════════════════════
                TAB: REPORTES
                ═══════════════════════════════════════════ */}
            {tab === 'reportes' && (
                <div className="flex flex-col gap-4">
                    {/* Filtros */}
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                            {(['lineal', 'agrupado'] as const).map(t => (
                                <button key={t} onClick={() => setReporteTipo(t)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all
                                        ${reporteTipo === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>
                                    {t === 'lineal' ? '📋 Detalle' : '📊 Agrupado'}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            <span className="self-center text-gray-400 text-sm">—</span>
                            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </div>
                        <button onClick={buscarReporte} disabled={loadingReporte}
                            className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
                            {loadingReporte ? '⏳ Buscando...' : '🔍 Buscar'}
                        </button>
                    </div>

                    {/* Reporte lineal */}
                    {reporteTipo === 'lineal' && (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Fecha</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Usuario</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Notificación</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Cód. Empl.</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Comentario</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reporteLineal.length === 0 && (
                                        <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sin resultados — aplique filtros y busque</td></tr>
                                    )}
                                    {reporteLineal.map(r => (
                                        <tr key={r.Id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                                                {new Date(r.FechaVista).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-800 text-xs">{r.NombreUsuario || r.Usuario}</p>
                                                <p className="text-gray-400 text-[10px]">{r.Usuario}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{r.NotifTitulo}</td>
                                            <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.CodigoEmpleado || '—'}</td>
                                            <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate text-xs">{r.Comentario || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Reporte agrupado */}
                    {reporteTipo === 'agrupado' && (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Usuario</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-left">Período</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-right">Vistas</th>
                                        <th className="px-4 py-3 font-bold text-xs text-gray-500 uppercase text-right">Notifs distintas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reporteAgrupado.length === 0 && (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-400">Sin resultados — aplique filtros y busque</td></tr>
                                    )}
                                    {reporteAgrupado.map((r, i) => (
                                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-800 text-xs">{r.NombreUsuario || r.Usuario}</p>
                                                <p className="text-gray-400 text-[10px]">{r.Usuario}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">{MESES[(r.Mes || 1) - 1]} {r.Ano}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-bold text-indigo-700">{r.TotalVistas}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-600">{r.NotifDistintas}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════
                MODAL EDITAR / CREAR
                ═══════════════════════════════════════════ */}
            {editItem !== null && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">{editItem.id ? '✏️ Editar notificación' : '➕ Nueva notificación'}</h3>
                            <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {error && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-xl">❌ {error}</div>}

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Título *</label>
                                <input type="text" value={editItem.Titulo || ''} onChange={e => setEditItem(p => ({ ...p!, Titulo: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Texto *</label>
                                <textarea rows={4} value={editItem.Texto || ''} onChange={e => setEditItem(p => ({ ...p!, Texto: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Imagen (opcional)</label>
                                <div className="flex items-center gap-3">
                                    {editItem.ImagenUrl ? (
                                        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                                            <img src={editItem.ImagenUrl} alt="preview" className="w-full h-full object-cover" />
                                            <button onClick={() => setEditItem(p => ({ ...p!, ImagenUrl: '' }))}
                                                className="absolute top-0 right-0 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl-lg">×</button>
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                    )}
                                    <label className={`flex-1 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm cursor-pointer hover:bg-gray-50 transition-all ${uploadingImg ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        <span className="text-gray-500">{uploadingImg ? 'Subiendo...' : 'Seleccionar imagen'}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                                    </label>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, GIF o WebP · máx 3 MB</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Clasificación *</label>
                                    <select value={editItem.ClasificacionId || ''} onChange={e => setEditItem(p => ({ ...p!, ClasificacionId: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                        <option value="">Seleccionar...</option>
                                        {clasificaciones.map(c => <option key={c.Id} value={c.Id}>{c.Nombre}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">N° repeticiones</label>
                                    <input type="number" min={1} max={99} value={editItem.NRepeticiones || 1}
                                        onChange={e => setEditItem(p => ({ ...p!, NRepeticiones: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Requiere comentario</label>
                                <select value={editItem.RequiereComentario || 'none'}
                                    onChange={e => setEditItem(p => ({ ...p!, RequiereComentario: e.target.value as any }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                    <option value="none">No requiere</option>
                                    <option value="opcional">Opcional</option>
                                    <option value="obligatorio">Obligatorio</option>
                                </select>
                            </div>

                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!editItem.RequiereCodigoEmpleado}
                                        onChange={e => setEditItem(p => ({ ...p!, RequiereCodigoEmpleado: e.target.checked }))}
                                        className="w-4 h-4 rounded accent-indigo-600" />
                                    <span className="text-sm text-gray-700">Requiere código de empleado</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!editItem.ComunicarConFlamia}
                                        onChange={e => setEditItem(p => ({ ...p!, ComunicarConFlamia: e.target.checked }))}
                                        className="w-4 h-4 rounded accent-indigo-600" />
                                    <span className="text-sm text-gray-700">Comunicar con Flamia</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!editItem.Activo}
                                        onChange={e => setEditItem(p => ({ ...p!, Activo: e.target.checked }))}
                                        className="w-4 h-4 rounded accent-indigo-600" />
                                    <span className="text-sm text-gray-700">Activa</span>
                                </label>
                            </div>

                            {/* Preview de clasificación seleccionada */}
                            {editItem.ClasificacionId ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Preview:</span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
                                        style={{ backgroundColor: clasificacion(editItem.ClasificacionId!)?.Color }}>
                                        {clasificacion(editItem.ClasificacionId!)?.Nombre}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                            {editItem.id && user?.esAdmin && (
                                <button
                                    onClick={() => handleDelete(editItem.id!)}
                                    className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                                    title="Eliminar permanentemente"
                                >
                                    🗑️ Eliminar
                                </button>
                            )}
                            <button onClick={() => { setEditItem(null); setError(''); }}
                                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                                Cancelar
                            </button>
                            <button onClick={handleSave} disabled={guardando}
                                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                                {guardando ? '⏳ Guardando...' : '💾 Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificacionesAdmin;
