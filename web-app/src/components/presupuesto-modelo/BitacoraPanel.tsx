import React, { useState, useEffect } from 'react';
import { fetchBitacora, type BitacoraEntry } from '../../api';

interface Props {
    nombrePresupuesto: string;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    'Calculo': { bg: 'bg-blue-50', text: 'text-blue-700', icon: '🔄' },
    'Ajuste': { bg: 'bg-amber-50', text: 'text-amber-700', icon: '📈' },
    'Version': { bg: 'bg-purple-50', text: 'text-purple-700', icon: '📋' },
    'Restaurar': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '⏪' },
    'Consolidado': { bg: 'bg-teal-50', text: 'text-teal-700', icon: '📊' },
    'Config': { bg: 'bg-gray-50', text: 'text-gray-700', icon: '⚙️' },
};

export const BitacoraPanel: React.FC<Props> = ({ nombrePresupuesto }) => {
    const [entries, setEntries] = useState<BitacoraEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    // Filters
    const [filterUsuario, setFilterUsuario] = useState('');
    const [filterMes, setFilterMes] = useState<number | undefined>();
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');

    useEffect(() => { loadData(); }, [nombrePresupuesto]);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await fetchBitacora({
                nombrePresupuesto,
                usuario: filterUsuario || undefined,
                mes: filterMes,
                desde: filterDesde || undefined,
                hasta: filterHasta || undefined,
            });
            setEntries(data.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()));
        } catch {
            // Table may not exist yet — show empty list
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    const toggle = (id: number) => {
        const next = new Set(expanded);
        next.has(id) ? next.delete(id) : next.add(id);
        setExpanded(next);
    };

    const uniqueUsers = [...new Set(entries.map(e => e.usuario))].sort();

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Usuario</label>
                    <select value={filterUsuario} onChange={e => setFilterUsuario(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        <option value="">Todos</option>
                        {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Mes</label>
                    <select value={filterMes || ''} onChange={e => setFilterMes(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        <option value="">Todos</option>
                        {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Desde</label>
                    <input type="date" value={filterDesde} onChange={e => setFilterDesde(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Hasta</label>
                    <input type="date" value={filterHasta} onChange={e => setFilterHasta(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                </div>
                <button onClick={loadData} disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    🔍 Buscar
                </button>
            </div>

            {message && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">❌ {message}</div>}

            {/* Entries */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                </div>
            ) : entries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">📝</div>
                    <p>No hay entradas en la bitácora</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400">{entries.length} entradas</p>
                    {entries.map(entry => {
                        const actionConfig = ACTION_COLORS[entry.accion] || ACTION_COLORS['Config'];
                        const isExpanded = expanded.has(entry.id);

                        return (
                            <div key={entry.id}
                                className={`rounded-lg border border-gray-200 overflow-hidden transition-all ${isExpanded ? 'shadow-sm' : ''}`}>
                                <button
                                    onClick={() => toggle(entry.id)}
                                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                                >
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${actionConfig.bg} ${actionConfig.text}`}>
                                        {actionConfig.icon} {entry.accion}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm text-gray-700">
                                            {entry.codAlmacen && <span className="font-medium">{entry.codAlmacen} </span>}
                                            {entry.mes && <span className="text-gray-500">{MESES[entry.mes]} </span>}
                                            {entry.canal && <span className="text-gray-500">{entry.canal} </span>}
                                            {entry.tipo && <span className="text-gray-500">{entry.tipo}</span>}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                        {new Date(entry.fechaHora).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                    <span className="text-xs text-gray-400 w-16 text-right truncate">{entry.usuario}</span>
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {isExpanded && (
                                    <div className="px-4 pb-3 pt-1 border-t border-gray-100 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                        {entry.valorAnterior && (
                                            <div>
                                                <span className="font-bold text-gray-500">Anterior:</span>{' '}
                                                <span className="font-mono">{entry.valorAnterior}</span>
                                            </div>
                                        )}
                                        {entry.valorNuevo && (
                                            <div>
                                                <span className="font-bold text-gray-500">Nuevo:</span>{' '}
                                                <span className="font-mono">{entry.valorNuevo}</span>
                                            </div>
                                        )}
                                        {entry.motivo && (
                                            <div className="col-span-2">
                                                <span className="font-bold text-gray-500">Motivo:</span>{' '}
                                                <span>{entry.motivo}</span>
                                            </div>
                                        )}
                                        {entry.origen && (
                                            <div>
                                                <span className="font-bold text-gray-500">Origen:</span>{' '}
                                                <span className="px-1.5 py-0.5 bg-gray-200 rounded">{entry.origen}</span>
                                            </div>
                                        )}
                                        {entry.detalle && (
                                            <div className="col-span-2 md:col-span-4">
                                                <span className="font-bold text-gray-500">Detalle:</span>{' '}
                                                <code className="bg-gray-200 px-1.5 py-0.5 rounded text-[11px]">{entry.detalle}</code>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
