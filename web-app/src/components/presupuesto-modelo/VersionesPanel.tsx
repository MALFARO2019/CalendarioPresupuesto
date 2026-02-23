import React, { useState, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchVersiones, restaurarVersion,
    getUser, type VersionPresupuesto
} from '../../api';

interface Props {
    nombrePresupuesto: string;
}

export const VersionesPanel: React.FC<Props> = ({ nombrePresupuesto }) => {
    const { showConfirm } = useToast();
    const user = getUser();
    const canRestore = user?.esAdmin || (user as any)?.restaurarVersiones;

    const [versiones, setVersiones] = useState<VersionPresupuesto[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => { loadData(); }, [nombrePresupuesto]);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await fetchVersiones(nombrePresupuesto);
            setVersiones(data.sort((a, b) => b.numeroVersion - a.numeroVersion));
        } catch {
            // Table may not exist yet — show empty list
            setVersiones([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (version: VersionPresupuesto) => {
        if (!await showConfirm({ message: `¿Restaurar a la versión ${version.numeroVersion}?\n\nEsto reemplazará los datos actuales del presupuesto "${nombrePresupuesto}" con los datos del snapshot.\n\nUsuario que creó: ${version.usuario}\nFecha: ${new Date(version.fechaCreacion).toLocaleString('es-CR')}`, destructive: true })) return;

        try {
            setRestoring(version.id);
            setMessage(null);
            await restaurarVersion(version.id);
            setMessage({ type: 'success', text: `Versión ${version.numeroVersion} restaurada exitosamente` });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setRestoring(null);
        }
    };

    const formatDate = (d: string) => new Date(d).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                    Se mantienen hasta <span className="font-bold">15 versiones</span> automáticamente.
                    Se crea una nueva versión con cada ejecución del cálculo.
                </p>
                <button onClick={loadData} disabled={loading}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                    🔄 Refrescar
                </button>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                </div>
            ) : versiones.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">📋</div>
                    <p>No hay versiones guardadas</p>
                    <p className="text-xs mt-1">Se crearán automáticamente al ejecutar el cálculo</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {versiones.map((v, i) => (
                        <div key={v.id} className={`bg-white rounded-xl border ${i === 0 ? 'border-emerald-200 shadow-sm' : 'border-gray-200'} p-4 flex flex-col md:flex-row md:items-center gap-3`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    v{v.numeroVersion}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm text-gray-800 truncate">{v.nombreTabla}</span>
                                        {i === 0 && (
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">Más reciente</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                                        <span>📅 {formatDate(v.fechaCreacion)}</span>
                                        <span>👤 {v.usuario}</span>
                                        <span>📊 {v.totalRegistros.toLocaleString()} registros</span>
                                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium">{v.origen}</span>
                                    </div>
                                    {v.notas && <p className="text-xs text-gray-400 mt-1 truncate">{v.notas}</p>}
                                </div>
                            </div>
                            {canRestore && (
                                <button
                                    onClick={() => handleRestore(v)}
                                    disabled={restoring === v.id}
                                    className="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                                >
                                    {restoring === v.id ? '⏳ Restaurando...' : '⏪ Restaurar'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
