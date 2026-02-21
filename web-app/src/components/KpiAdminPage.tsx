import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, AlertCircle,
    CheckCircle, Loader2, BarChart3, Layers, Settings, Users, Eye,
    RefreshCw, Database, TrendingUp
} from 'lucide-react';

const API_BASE = '/api';

async function apiFetch(url: string, opts: RequestInit = {}) {
    const r = await fetch(`${API_BASE}${url}`, { ...opts, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}`, ...opts.headers } });
    const data = await r.json();
    if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
}
const api = {
    get: (url: string) => apiFetch(url),
    post: (url: string, body: object) => apiFetch(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url: string, body: object) => apiFetch(url, { method: 'PUT', body: JSON.stringify(body) }),
    del: (url: string, body?: object) => apiFetch(url, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

// ============================================================
// Types
// ============================================================
interface Modulo { id: number; nombre: string; descripcion: string; icono: string; activo: boolean; total_kpis?: number; total_grupos?: number; }
interface KpiDef { id: number; modulo_id: number; modulo_nombre?: string; modulo_icono?: string; nombre: string; descripcion: string; sql_query: string; unidad: string; tipo_vista: string; activo: boolean; }
interface Grupo { id: number; modulo_id: number; modulo_nombre?: string; modulo_icono?: string; nombre: string; descripcion: string; activo: boolean; total_kpis?: number; suma_pesos?: number; }
interface GrupoKpi { id: number; grupo_id: number; kpi_id: number; kpi_nombre: string; unidad: string; peso: number; orden: number; }
interface Configuracion { id: number; kpi_id: number; kpi_nombre?: string; unidad?: string; local_grupo: string; meta_default: number | null; umbral_rojo: number; umbral_amarillo: number;[key: string]: any; }

type Tab = 'modulos' | 'kpis' | 'grupos' | 'config';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

// ============================================================
// Utility Components
// ============================================================
const Badge: React.FC<{ label: string; color?: string }> = ({ label, color = 'indigo' }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>{label}</span>
);

const Toast: React.FC<{ msg: { type: 'success' | 'error'; text: string } | null }> = ({ msg }) => {
    if (!msg) return null;
    return (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
            ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {msg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
            {msg.text}
        </div>
    );
};

const ConfirmDelete: React.FC<{ onConfirm: () => void; onCancel: () => void; label: string }> = ({ onConfirm, onCancel, label }) => (
    <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
        <span className="text-xs text-red-700 flex-1">¿Eliminar {label}?</span>
        <button onClick={onConfirm} className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">Sí</button>
        <button onClick={onCancel} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">No</button>
    </div>
);

// ============================================================
// Tab: Módulos
// ============================================================
const ModulosTab: React.FC<{ onToast: (m: any) => void }> = ({ onToast }) => {
    const [items, setItems] = useState<Modulo[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<Modulo> | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { setItems(await api.get('/kpi-admin/modulos')); } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!editing) return;
        try {
            if (editing.id) await api.put(`/kpi-admin/modulos/${editing.id}`, editing);
            else await api.post('/kpi-admin/modulos', editing);
            onToast({ type: 'success', text: editing.id ? 'Módulo actualizado' : 'Módulo creado' });
            setEditing(null);
            load();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const del = async (id: number) => {
        try { await api.del(`/kpi-admin/modulos/${id}`); onToast({ type: 'success', text: 'Módulo eliminado' }); load(); setDeleting(null); }
        catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">Módulos KPI</h3>
                <button onClick={() => setEditing({ nombre: '', descripcion: '', icono: '📊' })}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                    <Plus className="w-4 h-4" /> Nuevo Módulo
                </button>
            </div>

            {editing && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h4 className="font-semibold text-gray-800">{editing.id ? 'Editar' : 'Nuevo'} Módulo</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="label-mini">Icono (emoji)</label>
                            <input value={editing.icono || '📊'} onChange={e => setEditing({ ...editing, icono: e.target.value })}
                                className="input-field" placeholder="📊" maxLength={4} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="label-mini">Nombre *</label>
                            <input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                                className="input-field" placeholder="Ej: Tiempos de Cocina" />
                        </div>
                    </div>
                    <div>
                        <label className="label-mini">Descripción</label>
                        <input value={editing.descripcion || ''} onChange={e => setEditing({ ...editing, descripcion: e.target.value })}
                            className="input-field" placeholder="Descripción del módulo..." />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditing(null)} className="btn-ghost"><X className="w-4 h-4" />Cancelar</button>
                        <button onClick={save} className="btn-primary"><Save className="w-4 h-4" />Guardar</button>
                    </div>
                </div>
            )}

            {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400 w-6 h-6" /></div> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.map(m => (
                        <div key={m.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl">{m.icono}</span>
                                    <div>
                                        <div className="font-bold text-gray-800">{m.nombre}</div>
                                        <div className="text-xs text-gray-500">{m.descripcion}</div>
                                        <div className="flex gap-2 mt-1">
                                            <Badge label={`${m.total_kpis ?? 0} KPIs`} color="blue" />
                                            <Badge label={`${m.total_grupos ?? 0} Grupos`} color="purple" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => setEditing(m)} className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-all"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => setDeleting(m.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            {deleting === m.id && <div className="mt-3"><ConfirmDelete label={m.nombre} onConfirm={() => del(m.id)} onCancel={() => setDeleting(null)} /></div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ============================================================
// Tab: Catálogo de KPIs
// ============================================================
const KpisTab: React.FC<{ onToast: (m: any) => void }> = ({ onToast }) => {
    const [modulos, setModulos] = useState<Modulo[]>([]);
    const [kpis, setKpis] = useState<KpiDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<KpiDef> | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [filterMod, setFilterMod] = useState<number | ''>('');
    const [previewing, setPreviewing] = useState(false);
    const [previewResult, setPreviewResult] = useState<any>(null);
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [m, k] = await Promise.all([api.get('/kpi-admin/modulos'), api.get('/kpi-admin/kpis')]);
            setModulos(m); setKpis(k);
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = filterMod ? kpis.filter(k => k.modulo_id === filterMod) : kpis;

    const save = async () => {
        if (!editing) return;
        try {
            if (editing.id) await api.put(`/kpi-admin/kpis/${editing.id}`, editing);
            else await api.post('/kpi-admin/kpis', editing);
            onToast({ type: 'success', text: editing.id ? 'KPI actualizado' : 'KPI creado' });
            setEditing(null);
            load();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const del = async (id: number) => {
        try { await api.del(`/kpi-admin/kpis/${id}`); onToast({ type: 'success', text: 'KPI eliminado' }); load(); setDeleting(null); }
        catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const preview = async () => {
        if (!editing?.sql_query) return;
        setPreviewing(true);
        try {
            const r = await api.post('/kpi-admin/kpis/preview', {
                sql_query: editing.sql_query,
                fecha_inicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
                fecha_fin: new Date().toISOString().slice(0, 10),
                local_grupo: 'Todos'
            });
            if (r.error) { onToast({ type: 'error', text: r.error }); setPreviewResult(null); }
            else setPreviewResult(r);
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
        setPreviewing(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Catálogo de KPIs</h3>
                    <select value={filterMod} onChange={e => setFilterMod(e.target.value ? parseInt(e.target.value) : '')}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white">
                        <option value="">Todos los módulos</option>
                        {modulos.map(m => <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>)}
                    </select>
                </div>
                <button onClick={() => { setEditing({ nombre: '', descripcion: '', sql_query: '', unidad: '%', tipo_vista: 'ambas', modulo_id: modulos[0]?.id }); setPreviewResult(null); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                    <Plus className="w-4 h-4" /> Nuevo KPI
                </button>
            </div>

            {editing && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-semibold text-gray-800">{editing.id ? 'Editar' : 'Nuevo'} KPI</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label-mini">Módulo *</label>
                            <select value={editing.modulo_id || ''} onChange={e => setEditing({ ...editing, modulo_id: parseInt(e.target.value) })} className="input-field">
                                {modulos.map(m => <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-mini">Nombre *</label>
                            <input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} className="input-field" placeholder="Ej: % Alcance Ventas" />
                        </div>
                        <div>
                            <label className="label-mini">Unidad</label>
                            <select value={editing.unidad || '%'} onChange={e => setEditing({ ...editing, unidad: e.target.value })} className="input-field">
                                <option value="%">% Porcentaje</option>
                                <option value="₡">₡ Colones</option>
                                <option value="min">min Minutos</option>
                                <option value="cant">cant Cantidad</option>
                                <option value="pts">pts Puntos</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-mini">Vista</label>
                            <select value={editing.tipo_vista || 'ambas'} onChange={e => setEditing({ ...editing, tipo_vista: e.target.value })} className="input-field">
                                <option value="ambas">Mensual y Anual</option>
                                <option value="mensual">Solo Mensual</option>
                                <option value="anual">Solo Anual</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="label-mini">Descripción</label>
                        <input value={editing.descripcion || ''} onChange={e => setEditing({ ...editing, descripcion: e.target.value })} className="input-field" placeholder="Descripción del KPI..." />
                    </div>
                    <div>
                        <label className="label-mini flex items-center gap-2">
                            Query SQL
                            <span className="font-normal text-gray-400 text-xs">Variables: {'{fecha_inicio}'} {'{fecha_fin}'} {'{local_grupo}'}</span>
                        </label>
                        <textarea value={editing.sql_query || ''} onChange={e => setEditing({ ...editing, sql_query: e.target.value })}
                            rows={6} className="input-field font-mono text-xs"
                            placeholder={"SELECT SUM(Ventas) as valor\nFROM RSM_VENTAS\nWHERE Fecha BETWEEN {fecha_inicio} AND {fecha_fin}\nAND Local = {local_grupo}"} />
                    </div>
                    {previewResult && (
                        <div className="bg-gray-50 rounded-xl p-3 border">
                            <div className="text-xs font-mono text-gray-600 mb-1">Preview ({previewResult.rowCount} filas):</div>
                            {previewResult.rows.length > 0 && (
                                <table className="text-xs w-full">
                                    <thead><tr>{Object.keys(previewResult.rows[0]).map(k => <th key={k} className="text-left px-2 py-1 text-gray-500">{k}</th>)}</tr></thead>
                                    <tbody>{previewResult.rows.map((r: any, i: number) => <tr key={i}>{Object.values(r).map((v: any, j: number) => <td key={j} className="px-2 py-1 font-mono">{String(v ?? '')}</td>)}</tr>)}</tbody>
                                </table>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2 justify-between">
                        <button onClick={preview} disabled={previewing || !editing.sql_query} className="btn-ghost">
                            {previewing ? <Loader2 className="animate-spin w-4 h-4" /> : <Eye className="w-4 h-4" />} Probar Query
                        </button>
                        <div className="flex gap-2">
                            <button onClick={() => setEditing(null)} className="btn-ghost"><X className="w-4 h-4" />Cancelar</button>
                            <button onClick={save} className="btn-primary"><Save className="w-4 h-4" />Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400 w-6 h-6" /></div> : (
                <div className="space-y-2">
                    {filtered.map(k => (
                        <div key={k.id} className="bg-white border border-gray-100 rounded-xl shadow-sm">
                            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpanded(expanded === k.id ? null : k.id)}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-lg flex-shrink-0">{k.modulo_icono}</span>
                                    <div className="min-w-0">
                                        <div className="font-semibold text-gray-800 truncate">{k.nombre}</div>
                                        <div className="flex gap-2 items-center mt-0.5">
                                            <Badge label={k.modulo_nombre || ''} color="blue" />
                                            <Badge label={k.unidad} color="gray" />
                                            <Badge label={k.tipo_vista} color="green" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={e => { e.stopPropagation(); setEditing(k); setPreviewResult(null); }} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={e => { e.stopPropagation(); setDeleting(k.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                                    {expanded === k.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </div>
                            </div>
                            {expanded === k.id && (
                                <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                                    {k.descripcion && <p className="text-sm text-gray-600 mb-2">{k.descripcion}</p>}
                                    {k.sql_query && <pre className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap">{k.sql_query}</pre>}
                                </div>
                            )}
                            {deleting === k.id && <div className="px-4 pb-4"><ConfirmDelete label={k.nombre} onConfirm={() => del(k.id)} onCancel={() => setDeleting(null)} /></div>}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="text-center py-12 text-gray-400">No hay KPIs definidos. Crea el primero.</div>}
                </div>
            )}
        </div>
    );
};

// ============================================================
// Tab: Grupos de KPI
// ============================================================
const GruposTab: React.FC<{ onToast: (m: any) => void }> = ({ onToast }) => {
    const [modulos, setModulos] = useState<Modulo[]>([]);
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [kpiCatalogo, setKpiCatalogo] = useState<KpiDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingGrupo, setEditingGrupo] = useState<Partial<Grupo> | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [grupoKpisEdit, setGrupoKpisEdit] = useState<{ grupoId: number; kpis: GrupoKpi[] } | null>(null);
    const [newKpiId, setNewKpiId] = useState<number | ''>('');
    const [newPeso, setNewPeso] = useState('');
    const [filterMod, setFilterMod] = useState<number | ''>('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [m, g, k] = await Promise.all([api.get('/kpi-admin/modulos'), api.get('/kpi-admin/grupos'), api.get('/kpi-admin/kpis')]);
            setModulos(m); setGrupos(g); setKpiCatalogo(k);
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = filterMod ? grupos.filter(g => g.modulo_id === filterMod) : grupos;

    const saveGrupo = async () => {
        if (!editingGrupo) return;
        try {
            if (editingGrupo.id) await api.put(`/kpi-admin/grupos/${editingGrupo.id}`, editingGrupo);
            else await api.post('/kpi-admin/grupos', editingGrupo);
            onToast({ type: 'success', text: editingGrupo.id ? 'Grupo actualizado' : 'Grupo creado' });
            setEditingGrupo(null); load();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const del = async (id: number) => {
        try { await api.del(`/kpi-admin/grupos/${id}`); onToast({ type: 'success', text: 'Grupo eliminado' }); load(); setDeleting(null); }
        catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const openGrupoKpis = async (grupo: Grupo) => {
        try {
            const kpis = await api.get(`/kpi-admin/grupos/${grupo.id}/kpis`);
            setGrupoKpisEdit({ grupoId: grupo.id, kpis });
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const addKpiToGrupo = () => {
        if (!grupoKpisEdit || !newKpiId) return;
        const kpi = kpiCatalogo.find(k => k.id === newKpiId);
        if (!kpi) return;
        if (grupoKpisEdit.kpis.find(k => k.kpi_id === newKpiId)) { onToast({ type: 'error', text: 'Este KPI ya está en el grupo' }); return; }
        setGrupoKpisEdit({
            ...grupoKpisEdit,
            kpis: [...grupoKpisEdit.kpis, { id: Date.now(), grupo_id: grupoKpisEdit.grupoId, kpi_id: newKpiId, kpi_nombre: kpi.nombre, unidad: kpi.unidad, peso: parseFloat(newPeso) || 0, orden: grupoKpisEdit.kpis.length }]
        });
        setNewKpiId(''); setNewPeso('');
    };

    const removeKpiFromGrupo = (kpiId: number) => {
        if (!grupoKpisEdit) return;
        setGrupoKpisEdit({ ...grupoKpisEdit, kpis: grupoKpisEdit.kpis.filter(k => k.kpi_id !== kpiId) });
    };

    const saveGrupoKpis = async () => {
        if (!grupoKpisEdit) return;
        const suma = grupoKpisEdit.kpis.reduce((s, k) => s + (parseFloat(String(k.peso)) || 0), 0);
        if (grupoKpisEdit.kpis.length > 0 && Math.abs(suma - 100) > 0.5) {
            onToast({ type: 'error', text: `Los pesos deben sumar 100% (actual: ${suma.toFixed(1)}%)` }); return;
        }
        try {
            const r = await api.put(`/kpi-admin/grupos/${grupoKpisEdit.grupoId}/kpis`, { kpis: grupoKpisEdit.kpis.map((k, i) => ({ kpi_id: k.kpi_id, peso: k.peso, orden: i })) });
            if (r.error) { onToast({ type: 'error', text: r.error }); return; }
            onToast({ type: 'success', text: 'KPIs del grupo guardados' });
            setGrupoKpisEdit(null); load();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const sumaPesos = grupoKpisEdit?.kpis.reduce((s, k) => s + (parseFloat(String(k.peso)) || 0), 0) ?? 0;
    const pesoOk = grupoKpisEdit?.kpis.length === 0 || Math.abs(sumaPesos - 100) < 0.5;

    const filtroCatalogo = kpiCatalogo.filter(k => !grupoKpisEdit?.kpis.find(gk => gk.kpi_id === k.id) &&
        (!editingGrupo?.modulo_id || k.modulo_id === (grupos.find(g => g.id === grupoKpisEdit?.grupoId)?.modulo_id ?? 0)));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Grupos de KPI</h3>
                    <select value={filterMod} onChange={e => setFilterMod(e.target.value ? parseInt(e.target.value) : '')} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white">
                        <option value="">Todos los módulos</option>
                        {modulos.map(m => <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>)}
                    </select>
                </div>
                <button onClick={() => setEditingGrupo({ nombre: '', descripcion: '', modulo_id: modulos[0]?.id })}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                    <Plus className="w-4 h-4" /> Nuevo Grupo
                </button>
            </div>

            {/* Form crear/editar grupo */}
            {editingGrupo && !grupoKpisEdit && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h4 className="font-semibold text-gray-800">{editingGrupo.id ? 'Editar' : 'Nuevo'} Grupo</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label-mini">Módulo *</label>
                            <select value={editingGrupo.modulo_id || ''} onChange={e => setEditingGrupo({ ...editingGrupo, modulo_id: parseInt(e.target.value) })} className="input-field">
                                {modulos.map(m => <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-mini">Nombre *</label>
                            <input value={editingGrupo.nombre || ''} onChange={e => setEditingGrupo({ ...editingGrupo, nombre: e.target.value })} className="input-field" placeholder="Ej: Grupo Gerencial" />
                        </div>
                    </div>
                    <div>
                        <label className="label-mini">Descripción</label>
                        <input value={editingGrupo.descripcion || ''} onChange={e => setEditingGrupo({ ...editingGrupo, descripcion: e.target.value })} className="input-field" placeholder="Descripción..." />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingGrupo(null)} className="btn-ghost"><X className="w-4 h-4" />Cancelar</button>
                        <button onClick={saveGrupo} className="btn-primary"><Save className="w-4 h-4" />Guardar</button>
                    </div>
                </div>
            )}

            {/* Editor de KPIs del grupo */}
            {grupoKpisEdit && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-800">KPIs del Grupo</h4>
                        <div className={`text-sm font-bold ${pesoOk ? 'text-green-600' : 'text-red-600'}`}>Pesos: {sumaPesos.toFixed(1)}%{pesoOk ? ' ✓' : ' ✗ (debe ser 100%)'}</div>
                    </div>
                    <div className="space-y-2">
                        {grupoKpisEdit.kpis.map(k => (
                            <div key={k.kpi_id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                                <div className="flex-1 text-sm font-medium text-gray-700">{k.kpi_nombre}</div>
                                <div className="flex items-center gap-1">
                                    <input type="number" value={k.peso} onChange={e => setGrupoKpisEdit({ ...grupoKpisEdit, kpis: grupoKpisEdit.kpis.map(ki => ki.kpi_id === k.kpi_id ? { ...ki, peso: parseFloat(e.target.value) || 0 } : ki) })}
                                        className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm" min="0" max="100" step="5" />
                                    <span className="text-gray-500 text-sm">%</span>
                                </div>
                                <button onClick={() => removeKpiFromGrupo(k.kpi_id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-end gap-2 bg-indigo-50 p-3 rounded-xl">
                        <div className="flex-1">
                            <label className="label-mini">Agregar KPI</label>
                            <select value={newKpiId} onChange={e => setNewKpiId(e.target.value ? parseInt(e.target.value) : '')} className="input-field">
                                <option value="">Seleccionar KPI...</option>
                                {filtroCatalogo.map(k => <option key={k.id} value={k.id}>{k.modulo_icono} {k.nombre}</option>)}
                            </select>
                        </div>
                        <div className="w-24">
                            <label className="label-mini">Peso %</label>
                            <input type="number" value={newPeso} onChange={e => setNewPeso(e.target.value)} className="input-field" min="0" max="100" />
                        </div>
                        <button onClick={addKpiToGrupo} disabled={!newKpiId} className="btn-primary h-10"><Plus className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => { setGrupoKpisEdit(null); setEditingGrupo(null); }} className="btn-ghost"><X className="w-4 h-4" />Cerrar</button>
                        <button onClick={saveGrupoKpis} className="btn-primary"><Save className="w-4 h-4" />Guardar KPIs</button>
                    </div>
                </div>
            )}

            {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400 w-6 h-6" /></div> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filtered.map(g => (
                        <div key={g.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{g.modulo_icono}</span>
                                        <div className="font-bold text-gray-800">{g.nombre}</div>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">{g.descripcion}</div>
                                    <div className="flex gap-2 mt-2">
                                        <Badge label={`${g.total_kpis ?? 0} KPIs`} color="blue" />
                                        {g.total_kpis && g.total_kpis > 0
                                            ? <Badge label={`${parseFloat(String(g.suma_pesos ?? 0)).toFixed(0)}% pesos`} color={Math.abs((g.suma_pesos ?? 0) - 100) < 0.5 ? 'green' : 'red'} />
                                            : null}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => { openGrupoKpis(g); setEditingGrupo(g); }} title="Editar KPIs" className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"><Layers className="w-4 h-4" /></button>
                                    <button onClick={() => { setEditingGrupo(g); }} title="Editar grupo" className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => setDeleting(g.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            {deleting === g.id && <div className="mt-3"><ConfirmDelete label={g.nombre} onConfirm={() => del(g.id)} onCancel={() => setDeleting(null)} /></div>}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="col-span-2 text-center py-12 text-gray-400">No hay grupos. Crea el primero.</div>}
                </div>
            )}
        </div>
    );
};

// ============================================================
// Tab: Configuración de Metas y Umbrales
// ============================================================
const ConfigTab: React.FC<{ onToast: (m: any) => void }> = ({ onToast }) => {
    const [kpis, setKpis] = useState<KpiDef[]>([]);
    const [configs, setConfigs] = useState<Configuracion[]>([]);
    const [selectedKpi, setSelectedKpi] = useState<number | ''>('');
    const [editing, setEditing] = useState<Partial<Configuracion> | null>(null);
    const [loading, setLoading] = useState(false);
    const [delConf, setDelConf] = useState<{ kpiId: number; local: string } | null>(null);

    const loadKpis = useCallback(async () => {
        try { setKpis(await api.get('/kpi-admin/kpis')); } catch { }
    }, []);

    const loadConfigs = useCallback(async () => {
        if (!selectedKpi) return;
        setLoading(true);
        try { setConfigs(await api.get(`/kpi-admin/configuraciones?kpiId=${selectedKpi}`)); } catch { }
        setLoading(false);
    }, [selectedKpi]);

    useEffect(() => { loadKpis(); }, [loadKpis]);
    useEffect(() => { loadConfigs(); }, [loadConfigs]);

    const kpiInfo = kpis.find(k => k.id === selectedKpi);

    const save = async () => {
        if (!editing) return;
        try {
            const r = await api.put('/kpi-admin/configuraciones', { ...editing, kpi_id: selectedKpi });
            if (r.error) { onToast({ type: 'error', text: r.error }); return; }
            onToast({ type: 'success', text: 'Configuración guardada' });
            setEditing(null); loadConfigs();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    const del = async () => {
        if (!delConf) return;
        try {
            await api.del(`/kpi-admin/configuraciones/${delConf.kpiId}/${encodeURIComponent(delConf.local)}`);
            onToast({ type: 'success', text: 'Configuración eliminada' });
            setDelConf(null); loadConfigs();
        } catch (e: any) { onToast({ type: 'error', text: e.message }); }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Metas y Umbrales</h3>
                    <select value={selectedKpi} onChange={e => { setSelectedKpi(e.target.value ? parseInt(e.target.value) : ''); setEditing(null); }}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white min-w-[200px]">
                        <option value="">Seleccionar KPI...</option>
                        {kpis.map(k => <option key={k.id} value={k.id}>{k.modulo_icono} {k.nombre} ({k.unidad})</option>)}
                    </select>
                </div>
                {selectedKpi && (
                    <button onClick={() => setEditing({ kpi_id: selectedKpi, local_grupo: 'Todos', umbral_rojo: 75, umbral_amarillo: 90 })}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                        <Plus className="w-4 h-4" /> Nueva Config
                    </button>
                )}
            </div>

            {!selectedKpi && (
                <div className="text-center py-16 text-gray-400">
                    <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Selecciona un KPI para configurar sus metas y umbrales de color</p>
                </div>
            )}

            {editing && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-semibold text-gray-800">{editing.id ? 'Editar' : 'Nueva'} Configuración para <span className="text-indigo-600">{kpiInfo?.nombre}</span></h4>
                    <div>
                        <label className="label-mini">Local / Grupo (o "Todos" como default)</label>
                        <input value={editing.local_grupo || 'Todos'} onChange={e => setEditing({ ...editing, local_grupo: e.target.value })} className="input-field" placeholder="Ej: San José, Todos, Corporativo" />
                    </div>
                    <div>
                        <label className="label-mini">Meta Default ({kpiInfo?.unidad})</label>
                        <input type="number" value={editing.meta_default ?? ''} onChange={e => setEditing({ ...editing, meta_default: e.target.value ? parseFloat(e.target.value) : null })} className="input-field" placeholder="Ej: 100 = 100%" step="any" />
                    </div>
                    <div>
                        <label className="label-mini">Metas por Mes (dejar vacío = usar Default)</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {MESES.map(mes => (
                                <div key={mes}>
                                    <label className="text-xs text-gray-500 capitalize block mb-0.5">{mes}</label>
                                    <input type="number" value={editing[`meta_${mes}`] ?? ''}
                                        onChange={e => setEditing({ ...editing, [`meta_${mes}`]: e.target.value ? parseFloat(e.target.value) : null })}
                                        className="input-field text-xs py-1.5" placeholder="—" step="any" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-mini text-red-600">Umbral Rojo (% vs meta)</label>
                            <input type="number" value={editing.umbral_rojo ?? 75} onChange={e => setEditing({ ...editing, umbral_rojo: parseFloat(e.target.value) })} className="input-field border-red-200" min="0" max="100" />
                        </div>
                        <div>
                            <label className="label-mini text-yellow-600">Umbral Amarillo (% vs meta)</label>
                            <input type="number" value={editing.umbral_amarillo ?? 90} onChange={e => setEditing({ ...editing, umbral_amarillo: parseFloat(e.target.value) })} className="input-field border-yellow-200" min="0" max="100" />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditing(null)} className="btn-ghost"><X className="w-4 h-4" />Cancelar</button>
                        <button onClick={save} className="btn-primary"><Save className="w-4 h-4" />Guardar</button>
                    </div>
                </div>
            )}

            {selectedKpi && !loading && (
                <div className="space-y-2">
                    {configs.map(c => (
                        <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-semibold text-gray-800">{c.local_grupo}</div>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                        <span>Meta default: <strong>{c.meta_default != null ? c.meta_default : '—'}</strong> {kpiInfo?.unidad}</span>
                                        <span className="flex items-center gap-1">🔴 &lt;{c.umbral_rojo}% 🟡 &lt;{c.umbral_amarillo}% 🟢 ≥{c.umbral_amarillo}%</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => setEditing(c)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => setDelConf({ kpiId: c.kpi_id, local: c.local_grupo })} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            {delConf?.local === c.local_grupo && delConf?.kpiId === c.kpi_id && (
                                <div className="mt-2"><ConfirmDelete label={`config de "${c.local_grupo}"`} onConfirm={del} onCancel={() => setDelConf(null)} /></div>
                            )}
                        </div>
                    ))}
                    {configs.length === 0 && (
                        <div className="text-center py-10 text-gray-400">
                            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>No hay configuraciones para este KPI. Crea la primera.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================
// Main KpiAdminPage Component
// ============================================================
export const KpiAdminPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('modulos');
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const showToast = useCallback((msg: { type: 'success' | 'error'; text: string }) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    }, []);

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'modulos', label: 'Módulos', icon: <Database className="w-4 h-4" /> },
        { id: 'kpis', label: 'Catálogo KPIs', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'grupos', label: 'Grupos', icon: <Layers className="w-4 h-4" /> },
        { id: 'config', label: 'Metas', icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-6">
            <Toast msg={toast} />

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'modulos' && <ModulosTab onToast={showToast} />}
            {activeTab === 'kpis' && <KpisTab onToast={showToast} />}
            {activeTab === 'grupos' && <GruposTab onToast={showToast} />}
            {activeTab === 'config' && <ConfigTab onToast={showToast} />}
        </div>
    );
};

export default KpiAdminPage;
