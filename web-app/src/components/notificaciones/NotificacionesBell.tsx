import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    fetchNotificacionesPendientes, revisarNotificacion, marcarVersionLeida,
    type NotificacionAdmin, type NotificacionVersion
} from '../../api';

interface Props {
    versionActual?: string;
}

const TIPO_ICONS: Record<string, string> = {
    mejora: '✨', correccion: '🐛', nuevo: '🆕', info: 'ℹ️'
};

export const NotificacionesBell: React.FC<Props> = ({ versionActual }) => {
    const [open, setOpen] = useState(false);
    const [adminNotifs, setAdminNotifs] = useState<NotificacionAdmin[]>([]);
    const [versionesNotifs, setVersionesNotifs] = useState<{ VersionId: string; TotalNotif: number }[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    // Modal de confirmación
    const [modalNotif, setModalNotif] = useState<NotificacionAdmin | null>(null);
    const [modalComentario, setModalComentario] = useState('');
    const [modalCodigo, setModalCodigo] = useState('');
    const [modalError, setModalError] = useState('');
    const [confirmando, setConfirmando] = useState(false);

    // Versión expandida
    const [versionDetalle, setVersionDetalle] = useState<string | null>(null);
    const [versionItems, setVersionItems] = useState<NotificacionVersion[]>([]);
    const [loadingVersion, setLoadingVersion] = useState(false);

    const panelRef = useRef<HTMLDivElement>(null);

    const loadPendientes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchNotificacionesPendientes(versionActual);
            setAdminNotifs(data.admin);
            setVersionesNotifs(data.versiones);
            setTotal(data.total);
        } catch { /* silencioso */ } finally {
            setLoading(false);
        }
    }, [versionActual]);

    // Cargar al montar y cada 5 minutos
    useEffect(() => {
        loadPendientes();
        const interval = setInterval(loadPendientes, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [loadPendientes]);

    // Cerrar al click fuera
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const openNotif = (n: NotificacionAdmin) => {
        setModalNotif(n);
        setModalComentario('');
        setModalCodigo('');
        setModalError('');
        setOpen(false);
    };

    const handleConfirmar = async () => {
        if (!modalNotif) return;
        if (modalNotif.RequiereComentario === 'obligatorio' && !modalComentario.trim()) {
            setModalError('El comentario es obligatorio');
            return;
        }
        if (modalNotif.RequiereCodigoEmpleado && !modalCodigo.trim()) {
            setModalError('El código de empleado es obligatorio');
            return;
        }
        try {
            setConfirmando(true);
            await revisarNotificacion(modalNotif.Id, modalComentario || undefined, modalCodigo || undefined);
            setModalNotif(null);
            await loadPendientes();
        } catch (e: any) {
            setModalError(e.message || 'Error al confirmar');
        } finally {
            setConfirmando(false);
        }
    };

    const handleVerVersion = async (versionId: string) => {
        setVersionDetalle(versionId);
        setLoadingVersion(true);
        setOpen(false);
        try {
            const { fetchNotificacionesVersiones } = await import('../../api');
            const items = await fetchNotificacionesVersiones(versionId);
            setVersionItems(items);
        } catch { setVersionItems([]); } finally {
            setLoadingVersion(false);
        }
    };

    const handleMarcarVersionLeida = async (versionId: string) => {
        try {
            await marcarVersionLeida(versionId);
            setVersionDetalle(null);
            await loadPendientes();
        } catch { /* silencioso */ }
    };

    return (
        <>
            {/* Bell icon */}
            <div className="relative" ref={panelRef}>
                <button
                    onClick={() => setOpen(prev => !prev)}
                    className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-sky-50 transition-all"
                    title="Notificaciones"
                >
                    <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {total > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] bg-sky-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow">
                            {total > 99 ? '99+' : total}
                        </span>
                    )}
                </button>

                {/* Dropdown panel */}
                {open && (
                    <div className="absolute right-0 top-11 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-800 text-sm">🔔 Notificaciones</h3>
                            {loading && <span className="text-xs text-gray-400 animate-pulse">Cargando...</span>}
                        </div>

                        <div className="max-h-[420px] overflow-y-auto">
                            {/* Notificaciones admin */}
                            {adminNotifs.length > 0 && (
                                <div>
                                    {adminNotifs.map(n => (
                                        <button key={n.Id} onClick={() => openNotif(n)}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors flex gap-3 items-start">
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                                                style={{ backgroundColor: n.ClasificacionColor }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-gray-400 mb-0.5"
                                                    style={{ color: n.ClasificacionColor }}>{n.ClasificacionNombre}</p>
                                                <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{n.Titulo}</p>
                                                {n.NRepeticiones > 1 && (n.VistasCount ?? 0) < n.NRepeticiones && (
                                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                                        Vista {(n.VistasCount || 0) + 1} de {n.NRepeticiones}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-indigo-500 text-xs font-medium flex-shrink-0">Ver →</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Notificaciones de versión */}
                            {versionesNotifs.length > 0 && (
                                <div>
                                    {adminNotifs.length > 0 && (
                                        <div className="px-4 py-2 bg-blue-50 text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                                            Novedades del sistema
                                        </div>
                                    )}
                                    {versionesNotifs.map(v => (
                                        <button key={v.VersionId} onClick={() => handleVerVersion(v.VersionId)}
                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 transition-colors flex items-center gap-3">
                                            <span className="text-xl">📦</span>
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-gray-800">Versión {v.VersionId}</p>
                                                <p className="text-xs text-gray-400">{v.TotalNotif} {v.TotalNotif === 1 ? 'novedad' : 'novedades'}</p>
                                            </div>
                                            <span className="text-blue-500 text-xs font-medium">Ver →</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {total === 0 && !loading && (
                                <div className="py-10 text-center text-gray-400 text-sm">
                                    <p className="text-2xl mb-2">✅</p>
                                    <p>Todo al día</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal notificación admin */}
            {modalNotif && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                        {/* Header con color de clasificación */}
                        <div className="rounded-t-2xl px-5 py-4 flex items-center gap-3"
                            style={{ backgroundColor: modalNotif.ClasificacionColor + '22', borderBottom: `3px solid ${modalNotif.ClasificacionColor}` }}>
                            <span className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: modalNotif.ClasificacionColor }} />
                            <div>
                                <p className="text-xs font-bold" style={{ color: modalNotif.ClasificacionColor }}>
                                    {modalNotif.ClasificacionNombre}
                                </p>
                                <h3 className="font-bold text-gray-800">{modalNotif.Titulo}</h3>
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Imagen opcional */}
                            {modalNotif.ImagenUrl && (
                                <img src={modalNotif.ImagenUrl} alt="" className="w-full rounded-xl object-cover max-h-40" />
                            )}

                            {/* Texto */}
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{modalNotif.Texto}</p>

                            {/* Campo código empleado */}
                            {modalNotif.RequiereCodigoEmpleado && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">
                                        Código de Empleado <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={modalCodigo}
                                        onChange={e => setModalCodigo(e.target.value)}
                                        placeholder="Ingrese su código de empleado"
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                </div>
                            )}

                            {/* Campo comentario */}
                            {modalNotif.RequiereComentario !== 'none' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">
                                        Comentario{' '}
                                        {modalNotif.RequiereComentario === 'obligatorio'
                                            ? <span className="text-red-500">*</span>
                                            : <span className="text-gray-400">(opcional)</span>}
                                    </label>
                                    <textarea
                                        value={modalComentario}
                                        onChange={e => setModalComentario(e.target.value)}
                                        rows={3}
                                        placeholder="Escriba su comentario..."
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                </div>
                            )}

                            {modalError && (
                                <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">❌ {modalError}</p>
                            )}

                            <div className="flex gap-3">
                                <button onClick={() => setModalNotif(null)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                                    Cerrar
                                </button>
                                <button onClick={handleConfirmar} disabled={confirmando}
                                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                                    {confirmando ? '⏳ Confirmando...' : '✅ Confirmar lectura'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal versión */}
            {versionDetalle && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800">📦 Novedades — Versión {versionDetalle}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Nuevas funcionalidades y mejoras</p>
                            </div>
                            <button onClick={() => setVersionDetalle(null)}
                                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-3">
                            {loadingVersion ? (
                                <div className="text-center py-8 text-gray-400 text-sm animate-pulse">Cargando novedades...</div>
                            ) : versionItems.map(item => (
                                <div key={item.Id} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                                    <span className="text-lg flex-shrink-0 mt-0.5">{TIPO_ICONS[item.Tipo] || '📌'}</span>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">{item.Titulo}</p>
                                        <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{item.Texto}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                            <button onClick={() => setVersionDetalle(null)}
                                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                                Cerrar
                            </button>
                            <button onClick={() => handleMarcarVersionLeida(versionDetalle)}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                                ✅ Marcar como leída
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default NotificacionesBell;
