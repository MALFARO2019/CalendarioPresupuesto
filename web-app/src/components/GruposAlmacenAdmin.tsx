import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from './ui/Toast';
import { Loader2, Plus, Trash2, Edit2, X, Check, Search, Download, ChevronDown, ChevronRight, Store, AlertCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

async function apiFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(options.headers || {})
        }
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || res.statusText);
    }
    return res.json();
}

interface GrupoRow {
    IDGRUPO: number;
    DESCRIPCION: string;
    CODVISIBLE: number;
    Activo: boolean;
    FechaCreacion: string;
    TotalMiembros: number;
}

interface LineaRow {
    Id: number;
    IDGRUPO: number;
    CODALMACEN: string;
    Activo: boolean;
}

interface StoreOption {
    CODALMACEN: string;
    NOMBRE: string;
}

export const GruposAlmacenAdmin: React.FC = () => {
    const { showToast, showConfirm } = useToast();

    const [grupos, setGrupos] = useState<GrupoRow[]>([]);
    const [stores, setStores] = useState<StoreOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [search, setSearch] = useState('');

    // Expanded group
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [expandedLineas, setExpandedLineas] = useState<LineaRow[]>([]);
    const [loadingLineas, setLoadingLineas] = useState(false);

    // New group form
    const [showNewForm, setShowNewForm] = useState(false);
    const [newDesc, setNewDesc] = useState('');
    const [newCodvis, setNewCodvis] = useState(20);
    const [saving, setSaving] = useState(false);

    // Edit group
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDesc, setEditDesc] = useState('');
    const [editCodvis, setEditCodvis] = useState(20);

    // Add member
    const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
    const [selectedStore, setSelectedStore] = useState('');
    const [storeSearch, setStoreSearch] = useState('');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [g, s] = await Promise.all([
                apiFetch('/api/admin/grupos-almacen'),
                apiFetch('/api/admin/grupos-almacen/stores')
            ]);
            setGrupos(g);
            setStores(s);
        } catch (err: any) {
            showToast('Error cargando datos: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Silent refresh: update groups & stores without showing full-page spinner
    const refreshData = async () => {
        try {
            const [g, s] = await Promise.all([
                apiFetch('/api/admin/grupos-almacen'),
                apiFetch('/api/admin/grupos-almacen/stores')
            ]);
            setGrupos(g);
            setStores(s);
        } catch { /* silent */ }
    };

    const loadLineas = async (id: number) => {
        setLoadingLineas(true);
        try {
            const data = await apiFetch(`/api/admin/grupos-almacen/${id}`);
            setExpandedLineas(data.lineas || []);
        } catch (err: any) {
            showToast('Error cargando miembros: ' + err.message, 'error');
        } finally {
            setLoadingLineas(false);
        }
    };

    const toggleExpand = (id: number) => {
        if (expandedId === id) {
            setExpandedId(null);
            setExpandedLineas([]);
        } else {
            setExpandedId(id);
            loadLineas(id);
        }
        setAddingToGroup(null);
    };

    const handleImport = async () => {
        if (!await showConfirm({ message: '¿Importar grupos desde ROSTIPOLLOS_P (CODVISIBLE=20)? Los duplicados se omiten.' })) return;
        setImporting(true);
        try {
            const result = await apiFetch('/api/admin/grupos-almacen/import', { method: 'POST' });
            showToast(result.message || 'Importación exitosa', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error importando: ' + err.message, 'error');
        } finally {
            setImporting(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!newDesc.trim()) return;
        setSaving(true);
        try {
            await apiFetch('/api/admin/grupos-almacen', {
                method: 'POST',
                body: JSON.stringify({ descripcion: newDesc.trim(), codvisible: newCodvis })
            });
            showToast('Grupo creado', 'success');
            setShowNewForm(false);
            setNewDesc('');
            setNewCodvis(20);
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateGroup = async (id: number) => {
        if (!editDesc.trim()) return;
        setSaving(true);
        try {
            await apiFetch(`/api/admin/grupos-almacen/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ descripcion: editDesc.trim(), codvisible: editCodvis, activo: true })
            });
            showToast('Grupo actualizado', 'success');
            setEditingId(null);
            refreshData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteGroup = async (id: number, desc: string) => {
        if (!await showConfirm({ message: `¿Eliminar grupo "${desc}" y todos sus miembros?`, destructive: true })) return;
        try {
            await apiFetch(`/api/admin/grupos-almacen/${id}`, { method: 'DELETE' });
            showToast('Grupo eliminado', 'success');
            if (expandedId === id) { setExpandedId(null); setExpandedLineas([]); }
            refreshData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleAddMember = async (idgrupo: number) => {
        if (!selectedStore) return;
        try {
            await apiFetch(`/api/admin/grupos-almacen/${idgrupo}/lineas`, {
                method: 'POST',
                body: JSON.stringify({ codalmacen: selectedStore })
            });
            showToast('Almacén agregado', 'success');
            setSelectedStore('');
            setStoreSearch('');
            setAddingToGroup(null);
            loadLineas(idgrupo);
            refreshData(); // refresh count without scroll reset
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleRemoveMember = async (lineaId: number, codalmacen: string) => {
        if (!await showConfirm({ message: `¿Quitar almacén ${codalmacen} del grupo?`, destructive: true })) return;
        try {
            await apiFetch(`/api/admin/grupos-almacen/lineas/${lineaId}`, { method: 'DELETE' });
            showToast('Almacén removido', 'success');
            if (expandedId) { loadLineas(expandedId); refreshData(); }
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const filteredGrupos = useMemo(() => {
        if (!search.trim()) return grupos;
        const term = search.toLowerCase();
        return grupos.filter(g => g.DESCRIPCION.toLowerCase().includes(term));
    }, [grupos, search]);

    // Filter stores not already in the expanded group
    const availableStores = useMemo(() => {
        const existing = new Set(expandedLineas.map(l => l.CODALMACEN));
        let filtered = stores.filter(s => !existing.has(s.CODALMACEN));
        if (storeSearch.trim()) {
            const t = storeSearch.toLowerCase();
            filtered = filtered.filter(s =>
                s.CODALMACEN.toLowerCase().includes(t) ||
                (s.NOMBRE && s.NOMBRE.toLowerCase().includes(t))
            );
        }
        return filtered;
    }, [stores, expandedLineas, storeSearch]);

    const startEdit = (g: GrupoRow) => {
        setEditingId(g.IDGRUPO);
        setEditDesc(g.DESCRIPCION);
        setEditCodvis(g.CODVISIBLE);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 rounded-xl">
                            <Store className="w-6 h-6 text-emerald-700" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Grupos Almacén</h2>
                            <p className="text-sm text-gray-500">{grupos.length} grupo{grupos.length !== 1 ? 's' : ''} registrado{grupos.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                        >
                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Importar Rostipollos
                        </button>
                        <button
                            onClick={() => setShowNewForm(!showNewForm)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg"
                        >
                            <Plus className="w-4 h-4" />
                            Nuevo Grupo
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="mt-4 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar grupo..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                </div>
            </div>

            {/* New group form */}
            {showNewForm && (
                <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Nuevo Grupo</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            placeholder="Descripción del grupo"
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-500 transition-all"
                            autoFocus
                        />
                        <input
                            type="number"
                            value={newCodvis}
                            onChange={e => setNewCodvis(Number(e.target.value))}
                            placeholder="CODVISIBLE"
                            className="w-32 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-500 transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleCreateGroup}
                                disabled={saving || !newDesc.trim()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Crear
                            </button>
                            <button
                                onClick={() => { setShowNewForm(false); setNewDesc(''); }}
                                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Groups list */}
            {filteredGrupos.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 text-center">
                    <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No hay grupos registrados</p>
                    <p className="text-gray-400 text-sm mt-1">Usa "Importar Rostipollos" o crea uno nuevo</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredGrupos.map(g => (
                        <div key={g.IDGRUPO} className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                            {/* Group header */}
                            <div
                                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-all"
                                onClick={() => toggleExpand(g.IDGRUPO)}
                            >
                                {expandedId === g.IDGRUPO
                                    ? <ChevronDown className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                                    : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                }
                                {editingId === g.IDGRUPO ? (
                                    <div className="flex-1 flex flex-col sm:flex-row gap-2" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="text"
                                            value={editDesc}
                                            onChange={e => setEditDesc(e.target.value)}
                                            className="flex-1 px-3 py-1.5 border-2 border-indigo-300 rounded-lg text-sm focus:border-indigo-500"
                                            autoFocus
                                        />
                                        <input
                                            type="number"
                                            value={editCodvis}
                                            onChange={e => setEditCodvis(Number(e.target.value))}
                                            className="w-24 px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm"
                                        />
                                        <div className="flex gap-1">
                                            <button onClick={() => handleUpdateGroup(g.IDGRUPO)} disabled={saving}
                                                className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg transition-all">
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setEditingId(null)}
                                                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{g.DESCRIPCION}</p>
                                            <p className="text-xs text-gray-400">CODVISIBLE: {g.CODVISIBLE} · {g.TotalMiembros} almacen{g.TotalMiembros !== 1 ? 'es' : ''}</p>
                                        </div>
                                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => startEdit(g)}
                                                className="p-2 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-all"
                                                title="Editar">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteGroup(g.IDGRUPO, g.DESCRIPCION)}
                                                className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-all"
                                                title="Eliminar">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Expanded: members list */}
                            {expandedId === g.IDGRUPO && (
                                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                                    {loadingLineas ? (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                        </div>
                                    ) : (
                                        <>
                                            {/* Member chips */}
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {expandedLineas.length === 0 ? (
                                                    <p className="text-sm text-gray-400 italic">Sin miembros</p>
                                                ) : expandedLineas.map(l => {
                                                    const store = stores.find(s => s.CODALMACEN === l.CODALMACEN);
                                                    return (
                                                        <div key={l.Id}
                                                            className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm group hover:border-red-200 transition-all">
                                                            <span className="font-mono text-xs text-indigo-600 font-semibold">{l.CODALMACEN}</span>
                                                            {store?.NOMBRE && <span className="text-gray-500 text-xs">({store.NOMBRE})</span>}
                                                            <button
                                                                onClick={() => handleRemoveMember(l.Id, l.CODALMACEN)}
                                                                className="ml-1 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                                title="Quitar"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Add member */}
                                            {addingToGroup === g.IDGRUPO ? (
                                                <div className="flex flex-col sm:flex-row gap-2 bg-white border border-indigo-100 rounded-xl p-3">
                                                    <div className="flex-1 relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            value={storeSearch}
                                                            onChange={e => { setStoreSearch(e.target.value); setSelectedStore(''); }}
                                                            placeholder="Buscar almacén..."
                                                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 transition-all"
                                                            autoFocus
                                                        />
                                                        {storeSearch && availableStores.length > 0 && !selectedStore && (
                                                            <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-auto">
                                                                {availableStores.slice(0, 20).map(s => (
                                                                    <button key={s.CODALMACEN}
                                                                        onClick={() => { setSelectedStore(s.CODALMACEN); setStoreSearch(`${s.CODALMACEN} - ${s.NOMBRE}`); }}
                                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-all flex items-center gap-2">
                                                                        <span className="font-mono text-xs text-indigo-600 font-semibold">{s.CODALMACEN}</span>
                                                                        <span className="text-gray-500">{s.NOMBRE}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleAddMember(g.IDGRUPO)}
                                                            disabled={!selectedStore}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50">
                                                            <Plus className="w-4 h-4" /> Agregar
                                                        </button>
                                                        <button
                                                            onClick={() => { setAddingToGroup(null); setStoreSearch(''); setSelectedStore(''); }}
                                                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-all">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setAddingToGroup(g.IDGRUPO)}
                                                    className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-all"
                                                >
                                                    <Plus className="w-4 h-4" /> Agregar almacén
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
