import React, { useState, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchReferencias, saveReferencia, deleteReferencia, fetchStoresWithNames,
    getUser, type ReferenciaLocal, type StoreItem
} from '../../api';

interface Props {
    nombrePresupuesto: string;
    anoModelo: number;
}

export const ReferenciasPanel: React.FC<Props> = ({ nombrePresupuesto, anoModelo }) => {
    const { showConfirm } = useToast();
    const user = getUser();
    const isAdmin = user?.esAdmin;

    const [referencias, setReferencias] = useState<ReferenciaLocal[]>([]);
    const [stores, setStores] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [filterAno, setFilterAno] = useState<number>(anoModelo);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editRef, setEditRef] = useState<ReferenciaLocal | null>(null);
    const [codNuevo, setCodNuevo] = useState('');
    const [codReferencia, setCodReferencia] = useState('');
    const [canalRef, setCanalRef] = useState('');
    const [anoRef, setAnoRef] = useState<number>(anoModelo);

    useEffect(() => { loadData(); }, [nombrePresupuesto, filterAno]);

    const loadData = async () => {
        try {
            setLoading(true);
            const storesData = await fetchStoresWithNames().catch(() => [] as StoreItem[]);
            setStores(storesData);
            try {
                const refsData = await fetchReferencias(nombrePresupuesto, filterAno);
                setReferencias(refsData);
            } catch {
                setReferencias([]); // Table may not exist yet
            }
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setCodNuevo(''); setCodReferencia(''); setCanalRef('');
        setAnoRef(anoModelo);
        setEditRef(null); setShowForm(false);
    };

    const handleEdit = (ref: ReferenciaLocal) => {
        setEditRef(ref);
        setCodNuevo(ref.codAlmacenNuevo);
        setCodReferencia(ref.codAlmacenReferencia);
        setCanalRef(ref.canal || '');
        setAnoRef(ref.ano || anoModelo);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!codNuevo || !codReferencia) {
            setMessage({ type: 'error', text: 'Debe completar local nuevo y referencia' });
            return;
        }

        try {
            setSaving(true);
            setMessage(null);
            const storeNuevo = stores.find(s => s.code === codNuevo);
            const storeRef = stores.find(s => s.code === codReferencia);
            await saveReferencia({
                id: editRef?.id,
                codAlmacenNuevo: codNuevo,
                nombreAlmacenNuevo: storeNuevo?.name || '',
                codAlmacenReferencia: codReferencia,
                nombreAlmacenReferencia: storeRef?.name || '',
                canal: canalRef || null,
                ano: anoRef,
                nombrePresupuesto,
                activo: true,
            });
            setMessage({ type: 'success', text: editRef ? 'Referencia actualizada' : 'Referencia creada' });
            resetForm();
            loadData();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!await showConfirm({ message: '¿Eliminar esta referencia?', destructive: true })) return;
        try {
            setMessage(null);
            await deleteReferencia(id);
            setMessage({ type: 'success', text: 'Referencia eliminada' });
            loadData();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    // Generate year options: current year ± 2
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                    Mapeo de locales nuevos a locales de referencia. Para los días sin datos históricos
                    (ej. apertura a mitad de mes), se usa la participación diaria del local de referencia.
                </p>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">Año:</span>
                        <select value={filterAno} onChange={e => setFilterAno(parseInt(e.target.value))}
                            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium">
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    {isAdmin && (
                        <button onClick={() => { resetForm(); setShowForm(true); }}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 whitespace-nowrap">
                            ➕ Nueva Referencia
                        </button>
                    )}
                </div>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}

            {/* Form */}
            {showForm && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm">{editRef ? '✏️ Editar Referencia' : '➕ Nueva Referencia'}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Año</label>
                            <select value={anoRef} onChange={e => setAnoRef(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Local Nuevo</label>
                            <select value={codNuevo} onChange={e => setCodNuevo(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="">Seleccionar...</option>
                                {stores.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Local Referencia</label>
                            <select value={codReferencia} onChange={e => setCodReferencia(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="">Seleccionar...</option>
                                {stores.filter(s => s.code !== codNuevo).map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Canal (opcional)</label>
                            <select value={canalRef} onChange={e => setCanalRef(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="">Todos los canales</option>
                                <option value="Salón">Salón</option>
                                <option value="Llevar">Llevar</option>
                                <option value="AutoPollo">AutoPollo</option>
                                <option value="Express">Express</option>
                                <option value="ECommerce">ECommerce</option>
                                <option value="UberEats">UberEats</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? '⏳' : '💾'} Guardar
                        </button>
                        <button onClick={resetForm}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                </div>
            ) : referencias.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">🔗</div>
                    <p>No hay referencias configuradas para {filterAno}</p>
                    <p className="text-xs mt-1">Los locales nuevos necesitarán una referencia para participación histórica</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {referencias.map(ref => (
                        <div key={ref.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex items-center gap-3 flex-1">
                                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold">{ref.ano || '—'}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-700">
                                        {ref.codAlmacenNuevo}
                                        {ref.nombreAlmacenNuevo && <span className="text-xs ml-1 text-blue-400">{ref.nombreAlmacenNuevo}</span>}
                                    </div>
                                    <span className="text-xs text-gray-500 font-medium">usa la participación de</span>
                                    <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-medium text-emerald-700">
                                        {ref.codAlmacenReferencia}
                                        {ref.nombreAlmacenReferencia && <span className="text-xs ml-1 text-emerald-400">{ref.nombreAlmacenReferencia}</span>}
                                    </div>
                                </div>
                                {ref.canal && (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">{ref.canal}</span>
                                )}
                                {!ref.activo && (
                                    <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-medium">Inactivo</span>
                                )}
                            </div>
                            {isAdmin && (
                                <div className="flex gap-2">
                                    <button onClick={() => handleEdit(ref)}
                                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                                        ✏️ Editar
                                    </button>
                                    <button onClick={() => handleDelete(ref.id)}
                                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
