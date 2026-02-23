import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from './ui/Toast';
import { Loader2, Plus, Trash2, Edit2, X, Check, Search, Download, RefreshCw, AlertCircle, CheckCircle, Store } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

async function apiFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path} `, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()} `,
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
    }
    return res.json();
}

interface AliasRow {
    Id: number;
    Alias: string;
    CodAlmacen: string;
    Fuente: string | null;
    Activo: boolean;
    FechaCreacion: string;
}

interface StoreOption {
    CodAlmacen: string;
    Nombre: string;
}

interface Stats {
    TotalAliases: number;
    TotalStores: number;
    TotalFuentes: number;
    byFuente: { Fuente: string; Total: number }[];
}

export const StoreAliasAdmin: React.FC = () => {
    const { showConfirm } = useToast();
    const [aliases, setAliases] = useState<AliasRow[]>([]);
    const [stores, setStores] = useState<StoreOption[]>([]);
    const [fuentes, setFuentes] = useState<string[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filters
    const [filterFuente, setFilterFuente] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formAlias, setFormAlias] = useState('');
    const [formCod, setFormCod] = useState('');
    const [formFuente, setFormFuente] = useState('');
    const [formCustomFuente, setFormCustomFuente] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed
    const [seeding, setSeeding] = useState(false);

    // Test resolve
    const [testNombre, setTestNombre] = useState('');
    const [testFuente, setTestFuente] = useState('');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [aliasData, storeData, fuenteData, statsData] = await Promise.all([
                apiFetch(`/ api / admin / store - aliases ? ${filterFuente ? `fuente=${filterFuente}` : ''}${searchTerm ? `&search=${searchTerm}` : ''} `),
                apiFetch('/api/admin/store-aliases/stores'),
                apiFetch('/api/admin/store-aliases/fuentes'),
                apiFetch('/api/admin/store-aliases/stats'),
            ]);
            setAliases(aliasData);
            setStores(storeData);
            setFuentes(fuenteData);
            setStats(statsData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [filterFuente]);

    // Group aliases by CodAlmacen
    const grouped = useMemo(() => {
        let filtered = aliases;
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            filtered = aliases.filter(a =>
                a.Alias.toLowerCase().includes(s) ||
                a.CodAlmacen.toLowerCase().includes(s) ||
                (a.Fuente || '').toLowerCase().includes(s)
            );
        }
        const map: Record<string, AliasRow[]> = {};
        for (const a of filtered) {
            if (!map[a.CodAlmacen]) map[a.CodAlmacen] = [];
            map[a.CodAlmacen].push(a);
        }
        return map;
    }, [aliases, searchTerm]);

    const handleSeed = async () => {
        setSeeding(true);
        setError('');
        setSuccess('');
        try {
            const result = await apiFetch('/api/admin/store-aliases/seed', { method: 'POST' });
            setSuccess(`Seed completado: ${result.inserted} insertados, ${result.skipped} duplicados saltados`);
            loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSeeding(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const fuente = formFuente === '__custom__' ? formCustomFuente.trim().toUpperCase() : (formFuente || null);
            if (editingId) {
                await apiFetch(`/ api / admin / store - aliases / ${editingId} `, {
                    method: 'PUT',
                    body: JSON.stringify({ alias: formAlias, codAlmacen: formCod, fuente }),
                });
                setSuccess('Alias actualizado');
            } else {
                await apiFetch('/api/admin/store-aliases', {
                    method: 'POST',
                    body: JSON.stringify({ alias: formAlias, codAlmacen: formCod, fuente }),
                });
                setSuccess('Alias creado');
            }
            resetForm();
            loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!await showConfirm({ message: '¿Eliminar este alias?', destructive: true })) return;
        try {
            await apiFetch(`/ api / admin / store - aliases / ${id} `, { method: 'DELETE' });
            setSuccess('Alias eliminado');
            loadData();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const startEdit = (a: AliasRow) => {
        setEditingId(a.Id);
        setFormAlias(a.Alias);
        setFormCod(a.CodAlmacen);
        if (a.Fuente && !fuentes.includes(a.Fuente)) {
            setFormFuente('__custom__');
            setFormCustomFuente(a.Fuente);
        } else {
            setFormFuente(a.Fuente || '');
            setFormCustomFuente('');
        }
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormAlias('');
        setFormCod('');
        setFormFuente('');
        setFormCustomFuente('');
        setShowForm(false);
    };

    const handleTestResolve = async () => {
        if (!testNombre.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await apiFetch('/api/admin/store-aliases/resolve', {
                method: 'POST',
                body: JSON.stringify({ nombre: testNombre, fuente: testFuente || null }),
            });
            setTestResult(res.codAlmacen ? `✅ ${res.codAlmacen} ` : '❌ No encontrado');
        } catch (err: any) {
            setTestResult('Error: ' + err.message);
        } finally {
            setTesting(false);
        }
    };

    const FUENTE_COLORS: Record<string, string> = {
        CONTA: 'bg-blue-100 text-blue-700',
        INOCUIDAD: 'bg-green-100 text-green-700',
        MERCADEO: 'bg-purple-100 text-purple-700',
        QUEJAS: 'bg-red-100 text-red-700',
        JUSTO: 'bg-yellow-100 text-yellow-800',
        CALIDAD: 'bg-teal-100 text-teal-700',
        OPERACIONES: 'bg-orange-100 text-orange-700',
        GENERAL: 'bg-gray-100 text-gray-700',
        UBER: 'bg-lime-100 text-lime-700',
        INVGATE: 'bg-cyan-100 text-cyan-700',
        FORMS: 'bg-indigo-100 text-indigo-700',
        GOOGLE: 'bg-pink-100 text-pink-700',
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 rounded-xl">
                        <Store className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900">Alias de Locales</h2>
                        <p className="text-sm text-gray-500">Mapeo de nombres de locales de distintas fuentes a CODALMACEN</p>
                    </div>
                    <button
                        onClick={handleSeed}
                        disabled={seeding}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                        {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Importar desde DIM
                    </button>
                </div>

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-xl px-4 py-3 border border-blue-100">
                            <p className="text-2xl font-bold text-blue-700">{stats.TotalAliases}</p>
                            <p className="text-xs text-blue-600 font-medium">Alias totales</p>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-xl px-4 py-3 border border-emerald-100">
                            <p className="text-2xl font-bold text-emerald-700">{stats.TotalStores}</p>
                            <p className="text-xs text-emerald-600 font-medium">Locales cubiertos</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100/60 rounded-xl px-4 py-3 border border-purple-100">
                            <p className="text-2xl font-bold text-purple-700">{stats.TotalFuentes}</p>
                            <p className="text-xs text-purple-600 font-medium">Fuentes</p>
                        </div>
                    </div>
                )}

                {/* Fuente chips from stats */}
                {stats && stats.byFuente.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {stats.byFuente.map(f => (
                            <span
                                key={f.Fuente}
                                className={`px - 3 py - 1 rounded - full text - xs font - semibold cursor - pointer transition - all ${filterFuente === f.Fuente
                                    ? 'ring-2 ring-offset-1 ring-indigo-400 ' + (FUENTE_COLORS[f.Fuente] || 'bg-gray-100 text-gray-700')
                                    : FUENTE_COLORS[f.Fuente] || 'bg-gray-100 text-gray-700'
                                    } `}
                                onClick={() => setFilterFuente(filterFuente === f.Fuente ? '' : f.Fuente)}
                            >
                                {f.Fuente} ({f.Total})
                            </span>
                        ))}
                        {filterFuente && (
                            <button
                                onClick={() => setFilterFuente('')}
                                className="px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                            >
                                ✕ Limpiar filtro
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-red-700 text-sm">{error}</span>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-green-700 text-sm">{success}</span>
                    <button onClick={() => setSuccess('')} className="ml-auto text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Search + Add */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por alias, código o fuente..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                    />
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-lg"
                >
                    <Plus className="w-4 h-4" /> Nuevo Alias
                </button>
                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-all"
                >
                    <RefreshCw className={`w - 4 h - 4 ${loading ? 'animate-spin' : ''} `} />
                </button>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-5">
                    <h3 className="text-base font-bold text-gray-800 mb-4">{editingId ? 'Editar Alias' : 'Nuevo Alias'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Alias *</label>
                            <input
                                type="text"
                                value={formAlias}
                                onChange={e => setFormAlias(e.target.value)}
                                placeholder="V. Sabanilla"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CodAlmacen *</label>
                            <select
                                value={formCod}
                                onChange={e => setFormCod(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                            >
                                <option value="">— Seleccionar —</option>
                                {stores.map(s => (
                                    <option key={s.CodAlmacen} value={s.CodAlmacen}>
                                        {s.CodAlmacen} — {s.Nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fuente</label>
                            <select
                                value={formFuente}
                                onChange={e => { setFormFuente(e.target.value); setFormCustomFuente(''); }}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                            >
                                <option value="">Genérica (todas)</option>
                                {fuentes.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                                <option value="UBER">UBER</option>
                                <option value="INVGATE">INVGATE</option>
                                <option value="FORMS">FORMS</option>
                                <option value="GOOGLE">GOOGLE</option>
                                <option value="__custom__">— Otra (escribir) —</option>
                            </select>
                            {formFuente === '__custom__' && (
                                <input
                                    type="text"
                                    value={formCustomFuente}
                                    onChange={e => setFormCustomFuente(e.target.value.toUpperCase())}
                                    placeholder="Nombre de fuente"
                                    className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200"
                                />
                            )}
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={handleSave}
                                disabled={saving || !formAlias.trim() || !formCod}
                                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {editingId ? 'Guardar' : 'Crear'}
                            </button>
                            <button
                                onClick={resetForm}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm transition-all"
                            >
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Test Resolver */}
            <div className="bg-white rounded-2xl shadow border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">🔍 Probar Resolución</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={testNombre}
                        onChange={e => setTestNombre(e.target.value)}
                        placeholder="Nombre del local (ej: V. Sabanilla)"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleTestResolve()}
                    />
                    <select
                        value={testFuente}
                        onChange={e => setTestFuente(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    >
                        <option value="">Cualquier fuente</option>
                        {fuentes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button
                        onClick={handleTestResolve}
                        disabled={testing || !testNombre.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resolver'}
                    </button>
                    {testResult && (
                        <span className="flex items-center text-sm font-medium px-3 py-2 bg-gray-50 rounded-xl">
                            {testResult}
                        </span>
                    )}
                </div>
            </div>

            {/* Aliases Table grouped by CodAlmacen */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                </div>
            ) : Object.keys(grouped).length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No hay alias configurados</p>
                    <p className="text-sm mt-1">Usa "Importar desde DIM" para cargar datos automáticamente</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {Object.entries(grouped).map(([cod, rows]) => {
                        const storeName = stores.find(s => s.CodAlmacen === cod)?.Nombre || cod;
                        return (
                            <div key={cod} className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                                {/* Store header */}
                                <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-slate-50 to-transparent border-b border-gray-100">
                                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold font-mono">{cod}</span>
                                    <span className="font-semibold text-gray-800 text-sm">{storeName}</span>
                                    <span className="text-xs text-gray-400 ml-auto">{rows.length} alias</span>
                                </div>
                                {/* Alias list */}
                                <div className="divide-y divide-gray-50">
                                    {rows.map(a => (
                                        <div key={a.Id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/50 transition-colors group">
                                            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 truncate">{a.Alias}</span>
                                            {a.Fuente && (
                                                <span className={`px - 2.5 py - 0.5 rounded - full text - xs font - semibold ${FUENTE_COLORS[a.Fuente] || 'bg-gray-100 text-gray-600'} `}>
                                                    {a.Fuente}
                                                </span>
                                            )}
                                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => startEdit(a)}
                                                    className="p-1.5 hover:bg-indigo-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-all"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(a.Id)}
                                                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
