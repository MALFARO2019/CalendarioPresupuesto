import React, { useState, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchReports,
    createReport as apiCreateReport,
    updateReport as apiUpdateReport,
    deleteReport as apiDeleteReport,
    fetchReportAccess,
    setReportAccess,
    fetchReportUserAccess,
    updateReportUserAccess,
    fetchProfiles,
    fetchAdminUsers,
    previewReport,
    type Report,
    type ReportAccess,
    type ReportUserAccess,
    type Profile,
    type User,
    type ReportPreviewResult
} from '../../api';
import {
    Plus, Edit2, Trash2, Save, X, Loader2, Eye, Shield, AlertCircle, Check, Database, Users, User as UserIcon
} from 'lucide-react';

export function ReportsAdminPanel() {
    const { showToast } = useToast();
    const [reports, setReports] = useState<Report[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [access, setAccess] = useState<ReportAccess[]>([]);
    const [userAccess, setUserAccess] = useState<ReportUserAccess[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<'config' | 'access-profiles' | 'access-users'>('config');

    // Edit/Create form
    const [editReport, setEditReport] = useState<Partial<Report> | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);

    // Preview
    const [previewData, setPreviewData] = useState<ReportPreviewResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [reps, profs, acc, uAcc, allUsers] = await Promise.all([
                fetchReports(),
                fetchProfiles(),
                fetchReportAccess().catch(() => []),
                fetchReportUserAccess().catch(() => []),
                fetchAdminUsers().catch(() => [])
            ]);
            setReports(reps);
            setProfiles(profs);
            setAccess(acc);
            setUserAccess(uAcc);
            setUsers(allUsers);
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!editReport?.Nombre || !editReport?.QuerySQL) {
            showToast('Nombre y Query SQL son requeridos', 'error');
            return;
        }
        setSaving(true);
        try {
            const data = {
                nombre: editReport.Nombre,
                descripcion: editReport.Descripcion,
                icono: editReport.Icono || '📊',
                categoria: editReport.Categoria || 'General',
                querySQL: editReport.QuerySQL,
                columnas: editReport.columnas,
                parametros: editReport.parametros,
                frecuencia: editReport.Frecuencia || 'Diario',
                horaEnvio: editReport.HoraEnvio || '07:00',
                diaSemana: editReport.DiaSemana,
                diaMes: editReport.DiaMes,
                formatoSalida: editReport.FormatoSalida || 'html',
                templateAsunto: editReport.TemplateAsunto,
                templateEncabezado: editReport.TemplateEncabezado,
                permitirProgramacionCustom: editReport.PermitirProgramacionCustom !== false,
                permitirEnviarAhora: editReport.PermitirEnviarAhora !== false,
                activo: editReport.Activo !== false,
                orden: editReport.Orden || 0
            };

            if (isNew) {
                await apiCreateReport(data as any);
                showToast('Reporte creado exitosamente', 'success');
            } else {
                await apiUpdateReport(editReport.ID!, data as any);
                showToast('Reporte actualizado', 'success');
            }
            setEditReport(null);
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!window.confirm(`¿Eliminar reporte "${name}"? Se eliminarán todas las suscripciones.`)) return;
        try {
            await apiDeleteReport(id);
            showToast('Reporte eliminado', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleToggleAccess = async (reporteId: number, perfilId: number, hasAccess: boolean) => {
        const currentPerfilIds = access.filter(a => a.ReporteID === reporteId).map(a => a.PerfilID);
        const newPerfilIds = hasAccess
            ? currentPerfilIds.filter(id => id !== perfilId)
            : [...currentPerfilIds, perfilId];
        try {
            await setReportAccess(reporteId, newPerfilIds);
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleToggleUserAccess = async (reporteId: number, userId: number, hasAccess: boolean) => {
        const currentUserIds = userAccess.filter(a => a.ReporteID === reporteId).map(a => a.UsuarioID);
        const newUserIds = hasAccess
            ? currentUserIds.filter(id => id !== userId)
            : [...currentUserIds, userId];
        try {
            await updateReportUserAccess(reporteId, newUserIds);
            showToast('Acceso de usuario actualizado', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handlePreview = async (reportId: number) => {
        setPreviewLoading(true);
        setPreviewData(null);
        try {
            const data = await previewReport(reportId);
            setPreviewData(data);
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setPreviewLoading(false);
        }
    };

    const ICONOS = ['📊', '📈', '📉', '💰', '🛒', '🍔', '📋', '🏪', '⚡', '🎯', '📅', '🔥', '✅', '⏱️', '📦', '🛡️'];
    const FRECUENCIAS = ['Diario', 'Semanal', 'Mensual'];

    if (loading) {
        return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;
    }

    return (
        <div>
            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
                <button onClick={() => setActiveSubTab('config')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'config' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <Database className="w-4 h-4" /> Configurar Reportes
                </button>
                <button onClick={() => setActiveSubTab('access-profiles')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'access-profiles' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <Users className="w-4 h-4" /> Por Perfil
                </button>
                <button onClick={() => setActiveSubTab('access-users')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'access-users' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <UserIcon className="w-4 h-4" /> Por Usuario
                </button>
            </div>

            {activeSubTab === 'config' ? (
                <>
                    {/* Create button */}
                    <div className="flex justify-end mb-4">
                        <button onClick={() => { setEditReport({ Icono: '📊', Frecuencia: 'Diario', HoraEnvio: '07:00', Activo: true, PermitirProgramacionCustom: true, PermitirEnviarAhora: true, Categoria: 'General', FormatoSalida: 'html', columnas: [], parametros: [] }); setIsNew(true); }}
                            className="btn-primary">
                            <Plus className="w-4 h-4" /> Nuevo Reporte
                        </button>
                    </div>

                    {/* Edit Form */}
                    {editReport && (
                        <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-5 mb-6">
                            <h3 className="font-bold text-gray-900 mb-4">{isNew ? 'Crear Reporte' : 'Editar Reporte'}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="label-mini">Nombre *</label>
                                    <input className="input-field" value={editReport.Nombre || ''} onChange={e => setEditReport({ ...editReport, Nombre: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label-mini">Categoría</label>
                                    <input className="input-field" value={editReport.Categoria || ''} onChange={e => setEditReport({ ...editReport, Categoria: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label-mini">Icono</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ICONOS.map(ic => (
                                            <button key={ic} onClick={() => setEditReport({ ...editReport, Icono: ic })}
                                                className={`w-8 h-8 text-lg rounded-lg transition-all ${editReport.Icono === ic ? 'bg-indigo-200 ring-2 ring-indigo-400' : 'bg-white hover:bg-gray-100'}`}>
                                                {ic}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="label-mini">Frecuencia</label>
                                    <select className="input-field" value={editReport.Frecuencia || 'Diario'}
                                        onChange={e => setEditReport({ ...editReport, Frecuencia: e.target.value })}>
                                        {FRECUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label-mini">Hora Envío</label>
                                    <input type="time" className="input-field" value={editReport.HoraEnvio || '07:00'}
                                        onChange={e => setEditReport({ ...editReport, HoraEnvio: e.target.value })} />
                                </div>
                                {editReport.Frecuencia === 'Semanal' && (
                                    <div>
                                        <label className="label-mini">Día de Semana</label>
                                        <select className="input-field" value={editReport.DiaSemana || 1}
                                            onChange={e => setEditReport({ ...editReport, DiaSemana: parseInt(e.target.value) })}>
                                            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => (
                                                <option key={i} value={i + 1}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {editReport.Frecuencia === 'Mensual' && (
                                    <div>
                                        <label className="label-mini">Día del Mes</label>
                                        <input type="number" className="input-field" value={editReport.DiaMes || 1} min={1} max={28}
                                            onChange={e => setEditReport({ ...editReport, DiaMes: parseInt(e.target.value) })} />
                                    </div>
                                )}
                                <div className="sm:col-span-2">
                                    <label className="label-mini">Descripción</label>
                                    <input className="input-field" value={editReport.Descripcion || ''} onChange={e => setEditReport({ ...editReport, Descripcion: e.target.value })} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="label-mini">Query SQL *</label>
                                    <textarea className="input-field font-mono text-xs" rows={5} value={editReport.QuerySQL || ''}
                                        onChange={e => setEditReport({ ...editReport, QuerySQL: e.target.value })}
                                        placeholder="SELECT Local, SUM(MontoReal) AS Venta FROM RSM_ALCANCE_DIARIO WHERE AÑO = 2026 GROUP BY Local" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="label-mini">Columnas (JSON) — Opcional</label>
                                    <textarea className="input-field font-mono text-xs" rows={3}
                                        value={editReport.columnas ? JSON.stringify(editReport.columnas, null, 2) : ''}
                                        onChange={e => { try { setEditReport({ ...editReport, columnas: JSON.parse(e.target.value) }); } catch { } }}
                                        placeholder='[{"field":"Local","label":"Local","format":"text"},{"field":"Venta","label":"Venta","format":"currency"}]' />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="label-mini">Parámetros (JSON array) — Opcional</label>
                                    <textarea className="input-field font-mono text-xs" rows={2}
                                        value={editReport.parametros ? JSON.stringify(editReport.parametros) : ''}
                                        onChange={e => { try { setEditReport({ ...editReport, parametros: JSON.parse(e.target.value) }); } catch { } }}
                                        placeholder='["local","canal","kpi"]' />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="label-mini">Template Asunto Email</label>
                                    <input className="input-field" value={editReport.TemplateAsunto || ''}
                                        onChange={e => setEditReport({ ...editReport, TemplateAsunto: e.target.value })}
                                        placeholder="{{nombre}} — {{fecha}}" />
                                </div>

                                <div className="sm:col-span-2 pt-2 border-t border-indigo-100/50 flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Permisos del Reporte</h4>

                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <div className="relative flex items-center justify-center mt-0.5">
                                            <input type="checkbox" className="peer sr-only"
                                                checked={editReport.PermitirProgramacionCustom !== false}
                                                onChange={e => setEditReport({ ...editReport, PermitirProgramacionCustom: e.target.checked })} />
                                            <div className="w-5 h-5 rounded border-2 border-gray-300 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center">
                                                <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">Permitir al usuario personalizar su programación</p>
                                            <p className="text-xs text-gray-500">Si se apaga, los usuarios se suscribirán automáticamente a la Frecuencia/Hora por defecto ({editReport.Frecuencia} {editReport.HoraEnvio}) sin poder modificarla.</p>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <div className="relative flex items-center justify-center mt-0.5">
                                            <input type="checkbox" className="peer sr-only"
                                                checked={editReport.PermitirEnviarAhora !== false}
                                                onChange={e => setEditReport({ ...editReport, PermitirEnviarAhora: e.target.checked })} />
                                            <div className="w-5 h-5 rounded border-2 border-gray-300 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center">
                                                <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">Permitir botón "Enviar Ahora"</p>
                                            <p className="text-xs text-gray-500">Muestra un botón en el catálogo para que los usuarios puedan disparar y recibir el reporte instantáneamente por correo.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button onClick={() => setEditReport(null)} className="btn-ghost">
                                    <X className="w-4 h-4" /> Cancelar
                                </button>
                                <button onClick={handleSave} disabled={saving} className="btn-primary">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {isNew ? 'Crear' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reports List */}
                    <div className="space-y-3">
                        {reports.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <p className="text-lg font-semibold">No hay reportes configurados</p>
                                <p className="text-sm mt-1">Crea un nuevo reporte para comenzar</p>
                            </div>
                        ) : reports.map(report => (
                            <div key={report.ID} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                                <span className="text-xl">{report.Icono}</span>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm text-gray-900">{report.Nombre}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-gray-400">{report.Categoria}</span>
                                        <span className="text-[10px] text-gray-400">{report.Frecuencia} {report.HoraEnvio}</span>
                                        {!report.Activo && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">Inactivo</span>}
                                        {report.TotalSuscriptores != null && <span className="text-[10px] text-gray-400">{report.TotalSuscriptores} subs</span>}
                                    </div>
                                </div>
                                <button onClick={() => handlePreview(report.ID)}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Preview">
                                    <Eye className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setEditReport(report); setIsNew(false); }}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Editar">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(report.ID, report.Nombre)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Preview inline */}
                    {previewData && (
                        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-sm text-gray-900">Vista Previa ({previewData.rowCount} filas)</h3>
                                <button onClick={() => setPreviewData(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0">
                                        <tr>
                                            {(previewData.columns || Object.keys(previewData.data[0] || {}).map(k => ({ field: k, label: k, format: 'text' as const }))).map(col => (
                                                <th key={col.field} className="px-2 py-1.5 bg-gray-100 text-left font-bold text-gray-500 uppercase">{col.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.data.slice(0, 50).map((row, i) => (
                                            <tr key={i} className={i % 2 ? 'bg-gray-50/50' : ''}>
                                                {(previewData.columns || Object.keys(row).map(k => ({ field: k, label: k, format: 'text' as const }))).map(col => (
                                                    <td key={col.field} className="px-2 py-1.5 text-gray-700 border-b border-gray-50">{String(row[col.field] ?? '-')}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {previewLoading && <div className="mt-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>}
                </>
            ) : activeSubTab === 'access-profiles' ? (
                /* PROFILES ACCESS TAB */
                <>
                    {reports.length === 0 || profiles.length === 0 ? (
                        <div className="text-center py-12">
                            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                            <p className="text-gray-500">Se necesitan reportes y perfiles configurados para gestionar acceso</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="px-3 py-2 bg-gray-50 text-left font-bold text-gray-600 text-xs border-b-2 border-gray-200 sticky left-0 bg-gray-50 z-10">Perfil</th>
                                        {reports.map(r => (
                                            <th key={r.ID} className="px-3 py-2 bg-gray-50 text-center font-bold text-gray-600 text-xs border-b-2 border-gray-200 whitespace-nowrap">
                                                {r.Icono} {r.Nombre}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {profiles.map(profile => (
                                        <tr key={profile.id} className="hover:bg-indigo-50/30">
                                            <td className="px-3 py-2.5 font-semibold text-gray-800 text-xs border-b border-gray-100 sticky left-0 bg-white z-10">
                                                {profile.nombre}
                                            </td>
                                            {reports.map(report => {
                                                const hasAccess = access.some(a => a.ReporteID === report.ID && a.PerfilID === profile.id);
                                                return (
                                                    <td key={report.ID} className="px-3 py-2.5 text-center border-b border-gray-100">
                                                        <button onClick={() => handleToggleAccess(report.ID, profile.id, hasAccess)}
                                                            className={`w-7 h-7 rounded-lg transition-all inline-flex items-center justify-center ${hasAccess ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>
                                                            {hasAccess ? <Check className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : (
                /* USER ACCESS TAB */
                <>
                    {reports.length === 0 || users.length === 0 ? (
                        <div className="text-center py-12">
                            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                            <p className="text-gray-500">Se necesitan reportes y usuarios para gestionar acceso individual</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="px-3 py-2 bg-gray-50 text-left font-bold text-gray-600 text-xs border-b-2 border-gray-200 sticky left-0 bg-gray-50 z-10">Usuario</th>
                                        {reports.map(r => (
                                            <th key={r.ID} className="px-3 py-2 bg-gray-50 text-center font-bold text-gray-600 text-xs border-b-2 border-gray-200 whitespace-nowrap">
                                                {r.Icono} {r.Nombre}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.filter(u => u.activo).map(usr => (
                                        <tr key={usr.id} className="hover:bg-indigo-50/30">
                                            <td className="px-3 py-2.5 border-b border-gray-100 sticky left-0 bg-white z-10 min-w-[200px]">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-gray-800 text-xs">{usr.nombre}</span>
                                                    <span className="text-[10px] text-gray-400">{usr.email}</span>
                                                </div>
                                            </td>
                                            {reports.map(report => {
                                                const hasAccess = userAccess.some(a => a.ReporteID === report.ID && a.UsuarioID === usr.id);
                                                return (
                                                    <td key={report.ID} className="px-3 py-2.5 text-center border-b border-gray-100">
                                                        <button onClick={() => handleToggleUserAccess(report.ID, usr.id, hasAccess)}
                                                            className={`w-7 h-7 rounded-lg transition-all inline-flex items-center justify-center ${hasAccess ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>
                                                            {hasAccess ? <Check className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div >
    );
}
