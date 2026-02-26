import React, { useState, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchReports,
    fetchReportSubscriptions,
    subscribeToReport,
    unsubscribeFromReport,
    updateReportSubscription,
    previewReport,
    generateReport,
    getUser,
    type Report,
    type ReportSubscription,
    type ReportPreviewResult
} from '../../api';
import {
    ArrowLeft, Bell, BellOff, Search, Eye, Mail, Send, Loader2, Clock, Calendar,
    CheckCircle, X, RefreshCw, Filter
} from 'lucide-react';

interface ReportsViewProps {
    onBack: () => void;
}

export function ReportsView({ onBack }: ReportsViewProps) {
    const { showToast } = useToast();
    const user = getUser();
    const [activeTab, setActiveTab] = useState<'catalogo' | 'suscripciones'>('catalogo');
    const [reports, setReports] = useState<Report[]>([]);
    const [subscriptions, setSubscriptions] = useState<ReportSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('Todas');

    // Preview modal
    const [previewData, setPreviewData] = useState<ReportPreviewResult | null>(null);
    const [previewReport_, setPreviewReport_] = useState<Report | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Generate modal
    const [generateModal, setGenerateModal] = useState<Report | null>(null);
    const [generateEmail, setGenerateEmail] = useState('');
    const [generating, setGenerating] = useState(false);

    // Subscribe modal (for custom programming)
    const [subscribeModal, setSubscribeModal] = useState<{
        report: Report | null;
        isEdit: boolean;
        subscriptionId?: number;
    } | null>(null);
    const [subEmail, setSubEmail] = useState(user?.email || '');
    const [subFreq, setSubFreq] = useState('Diario');
    const [subHora, setSubHora] = useState('07:00');
    const [subDiaSemana, setSubDiaSemana] = useState<number>(1);
    const [subDiaMes, setSubDiaMes] = useState<number>(1);
    const [savingSub, setSavingSub] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [reps, subs] = await Promise.all([
                fetchReports(),
                fetchReportSubscriptions()
            ]);
            setReports(reps);
            setSubscriptions(subs);
        } catch (err: any) {
            showToast('Error cargando reportes: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribeClick = (report: Report) => {
        // Handle numeric BIT value from SQL as well as boolean
        const canCustomize = report.PermitirProgramacionCustom === true || (report.PermitirProgramacionCustom as any) === 1;

        if (canCustomize) {
            // Edit new subscription
            setSubscribeModal({ report, isEdit: false });
            setSubEmail(user?.email || '');
            setSubFreq(report.Frecuencia || 'Diario');
            setSubHora(report.HoraEnvio || '07:00');
            setSubDiaSemana(report.DiaSemana || 1);
            setSubDiaMes(report.DiaMes || 1);
        } else {
            // Direct subscribe
            handleSubscribe(report.ID);
        }
    };

    const handleEditSubscriptionClick = (sub: ReportSubscription, reportDef: Report | undefined) => {
        if (!reportDef) return;

        // Ensure we check PermitirProgramacionCustom correctly (BIT 1/0 from SQL)
        const canCustomize = reportDef.PermitirProgramacionCustom === true || (reportDef.PermitirProgramacionCustom as any) === 1;
        if (!canCustomize) return;

        setSubscribeModal({ report: reportDef, isEdit: true, subscriptionId: sub.ID });
        setSubEmail(sub.EmailDestino || user?.email || '');
        setSubFreq(sub.FrecuenciaPersonal || sub.FrecuenciaDefault || 'Diario');
        setSubHora(sub.HoraEnvioPersonal || sub.HoraEnvioDefault || '07:00');
        setSubDiaSemana(sub.DiaSemanaPersonal || sub.DiaSemanaDefault || 1);
        setSubDiaMes(sub.DiaMesPersonal || sub.DiaMesDefault || 1);
    };

    const handleSaveCustomSubscription = async () => {
        if (!subscribeModal?.report) return;
        setSavingSub(true);
        try {
            if (subscribeModal.isEdit && subscribeModal.subscriptionId) {
                await updateReportSubscription(subscribeModal.report.ID, {
                    emailDestino: subEmail,
                    frecuenciaPersonal: subFreq,
                    horaEnvioPersonal: subHora,
                    diaSemanaPersonal: subDiaSemana,
                    diaMesPersonal: subDiaMes
                });
                showToast('Programación de suscripción actualizada', 'success');
            } else {
                // To create with custom it calls subscribe endpoint but we need a modified version in api or just update it right after
                // The current subscribeToReport in api.ts doesn't take config param, let's update api.ts later to take config or just call updateReportSubscription right after
                await subscribeToReport(subscribeModal.report.ID);
                // Immediately after, update the config
                await updateReportSubscription(subscribeModal.report.ID, {
                    emailDestino: subEmail,
                    frecuenciaPersonal: subFreq,
                    horaEnvioPersonal: subHora,
                    diaSemanaPersonal: subDiaSemana,
                    diaMesPersonal: subDiaMes
                });
                showToast('Suscrito con programación personalizada', 'success');
            }
            setSubscribeModal(null);
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSavingSub(false);
        }
    };

    const handleSubscribe = async (reportId: number) => {
        try {
            await subscribeToReport(reportId);
            showToast('Suscrito exitosamente', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };


    const handleUnsubscribe = async (reportId: number) => {
        try {
            await unsubscribeFromReport(reportId);
            showToast('Suscripción eliminada', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleToggleSubscription = async (reportId: number, activo: boolean) => {
        try {
            await updateReportSubscription(reportId, { activo });
            showToast(activo ? 'Suscripción activada' : 'Suscripción pausada', 'success');
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handlePreview = async (report: Report) => {
        setPreviewReport_(report);
        setPreviewLoading(true);
        try {
            const data = await previewReport(report.ID);
            setPreviewData(data);
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
            setPreviewReport_(null);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (!generateModal) return;
        setGenerating(true);
        try {
            const result = await generateReport(generateModal.ID, {}, generateEmail || undefined);
            showToast(result.message, 'success');
            setGenerateModal(null);
            loadData();
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const categories = ['Todas', ...Array.from(new Set(reports.map(r => r.Categoria)))];
    const filteredReports = reports.filter(r => {
        if (search && !r.Nombre.toLowerCase().includes(search.toLowerCase()) && !r.Descripcion?.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterCat !== 'Todas' && r.Categoria !== filterCat) return false;
        return true;
    });

    const freqLabel = (freq: string, hour?: string | null, day?: number | null, dayMonth?: number | null) => {
        const h = hour || '07:00';
        if (freq === 'Diario') return `Diario ${h}`;
        if (freq === 'Semanal') {
            const days = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            return `Semanal ${days[day || 1]} ${h}`;
        }
        if (freq === 'Mensual') return `Mensual día ${dayMonth || 1} ${h}`;
        return freq;
    };

    const freqColor = (freq: string) => {
        if (freq === 'Diario') return 'bg-blue-100 text-blue-700';
        if (freq === 'Semanal') return 'bg-amber-100 text-amber-700';
        if (freq === 'Mensual') return 'bg-purple-100 text-purple-700';
        return 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="bg-slate-50/50">
            <div className="max-w-6xl mx-auto pb-10">
                {/* Header - Sticky */}
                <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm mb-2">
                    <div className="px-4 sm:px-6 py-4 flex items-center gap-4">
                        <button onClick={onBack}
                            className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-xl transition-all text-gray-600">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-xl font-bold text-gray-900 leading-tight">📊 Reportes</h1>
                            <p className="text-xs text-gray-400">Catálogo de reportes y suscripciones</p>
                        </div>
                        <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg transition-all text-gray-400 hover:text-gray-600">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Tabs */}
                    <div className="px-4 sm:px-6 pb-2 flex gap-2">
                        <button onClick={() => setActiveTab('catalogo')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'catalogo' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            📋 Catálogo
                        </button>
                        <button onClick={() => setActiveTab('suscripciones')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'suscripciones' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            <Bell className="w-3.5 h-3.5" /> Mis Suscripciones
                            {subscriptions.length > 0 && (
                                <span className="ml-1 bg-white/20 rounded-full px-1.5 text-xs">{subscriptions.length}</span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="px-4 sm:px-6 py-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        </div>
                    ) : activeTab === 'catalogo' ? (
                        <>
                            {/* Search & Filter */}
                            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="Buscar reportes..." value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-gray-400" />
                                    <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white">
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            {filteredReports.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <p className="text-lg font-semibold">No hay reportes disponibles</p>
                                    <p className="text-sm mt-1">El administrador aún no ha configurado reportes</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredReports.map(report => (
                                        <div key={report.ID} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all p-5 flex flex-col">
                                            <div className="flex items-start gap-3 mb-3">
                                                <span className="text-2xl">{report.Icono}</span>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-gray-900 text-sm">{report.Nombre}</h3>
                                                    {report.Descripcion && (
                                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{report.Descripcion}</p>
                                                    )}
                                                </div>
                                                {report.Suscrito ? (
                                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                ) : null}
                                            </div>

                                            <div className="flex items-center gap-2 mb-4">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${freqColor(report.Frecuencia)}`}>
                                                    {report.Frecuencia}
                                                </span>
                                                <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                                    {report.Categoria}
                                                </span>
                                                {report.TotalSuscriptores != null && report.TotalSuscriptores > 0 && (
                                                    <span className="text-[10px] text-gray-400">{report.TotalSuscriptores} suscriptor(es)</span>
                                                )}
                                            </div>

                                            <div className="mt-auto flex items-center gap-2">
                                                <button onClick={() => handlePreview(report)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold transition-all touch-target">
                                                    <Eye className="w-3.5 h-3.5" /> Preview
                                                </button>
                                                {report.Suscrito ? (
                                                    <button onClick={() => handleUnsubscribe(report.ID)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-all touch-target">
                                                        <BellOff className="w-3.5 h-3.5" /> Desuscribir
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleSubscribeClick(report)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm touch-target">
                                                        <Bell className="w-3.5 h-3.5" /> Suscribirse
                                                    </button>
                                                )}
                                                {report.PermitirEnviarAhora !== false && (
                                                    <button onClick={() => { setGenerateModal(report); setGenerateEmail(user?.email || ''); }}
                                                        className="flex items-center justify-center p-2 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-all touch-target"
                                                        title="Generar y enviar ahora">
                                                        <Send className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Subscriptions Tab */
                        <>
                            {subscriptions.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-lg font-semibold">No tienes suscripciones</p>
                                    <p className="text-sm mt-1">Ve al catálogo para suscribirte a reportes</p>
                                    <button onClick={() => setActiveTab('catalogo')}
                                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all">
                                        Ver Catálogo
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {subscriptions.map(sub => (
                                        <div key={sub.ID} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{sub.Icono}</span>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-gray-900 text-sm">{sub.Nombre}</h3>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${freqColor(sub.FrecuenciaPersonal || sub.FrecuenciaDefault)}`}>
                                                            {freqLabel(
                                                                sub.FrecuenciaPersonal || sub.FrecuenciaDefault,
                                                                sub.HoraEnvioPersonal || sub.HoraEnvioDefault,
                                                                sub.DiaSemanaPersonal || sub.DiaSemanaDefault,
                                                                sub.DiaMesPersonal || sub.DiaMesDefault
                                                            )}
                                                        </span>
                                                        {sub.UltimoEnvio && (
                                                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                                                <Clock className="w-3 h-3" />
                                                                Último: {new Date(sub.UltimoEnvio).toLocaleDateString('es-CR')}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-gray-400">
                                                            {sub.TotalEnvios} envío(s)
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Toggle */}
                                                <button onClick={() => handleToggleSubscription(sub.ReporteID, !sub.Activo)}
                                                    className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${sub.Activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${sub.Activo ? 'left-5' : 'left-0.5'}`} />
                                                </button>

                                                {reports.find(r => r.ID === sub.ReporteID)?.PermitirProgramacionCustom && (
                                                    <button onClick={() => handleEditSubscriptionClick(sub, reports.find(r => r.ID === sub.ReporteID))}
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all touch-target"
                                                        title="Configurar programación">
                                                        <Calendar className="w-4 h-4" />
                                                    </button>
                                                )}

                                                <button onClick={() => handleUnsubscribe(sub.ReporteID)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all touch-target"
                                                    title="Eliminar suscripción">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Preview Modal */}
            {previewReport_ && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setPreviewReport_(null); setPreviewData(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <span className="text-xl">{previewReport_.Icono}</span>
                            <div className="flex-1">
                                <h2 className="font-bold text-gray-900">{previewReport_.Nombre}</h2>
                                <p className="text-xs text-gray-500">Vista previa del reporte</p>
                            </div>
                            <button onClick={() => { setPreviewReport_(null); setPreviewData(null); }}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            {previewLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                    <span className="ml-2 text-sm text-gray-500">Ejecutando reporte...</span>
                                </div>
                            ) : previewData ? (
                                <>
                                    <p className="text-xs text-gray-400 mb-3">{previewData.rowCount} filas</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr>
                                                    {(previewData.columns || Object.keys(previewData.data[0] || {}).map(k => ({ field: k, label: k, format: 'text' as const }))).map(col => (
                                                        <th key={col.field} className="px-3 py-2 bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                                                            {col.label}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewData.data.slice(0, 100).map((row, i) => (
                                                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                                                        {(previewData.columns || Object.keys(row).map(k => ({ field: k, label: k, format: 'text' as const }))).map(col => (
                                                            <td key={col.field} className="px-3 py-2 text-xs text-gray-700 border-b border-gray-100">
                                                                {formatCell(row[col.field], col.format)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {previewData.rowCount > 100 && (
                                            <p className="text-xs text-gray-400 text-center mt-3">
                                                Mostrando 100 de {previewData.rowCount} filas
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="text-center text-gray-400 py-12">No hay datos</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Modal */}
            {generateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setGenerateModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-gray-900 mb-1">{generateModal.Icono} Generar Reporte</h2>
                        <p className="text-xs text-gray-500 mb-4">Se generará y enviará por email inmediatamente</p>
                        <label className="label-mini">Email destino</label>
                        <input type="email" value={generateEmail} onChange={e => setGenerateEmail(e.target.value)}
                            className="input-field mb-4" placeholder="correo@ejemplo.com" />
                        <div className="flex gap-3">
                            <button onClick={() => setGenerateModal(null)}
                                className="flex-1 btn-ghost justify-center">Cancelar</button>
                            <button onClick={handleGenerate} disabled={generating || !generateEmail}
                                className="flex-1 btn-primary justify-center">
                                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Subscribe / Custom Program Modal */}
            {subscribeModal && subscribeModal.report && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSubscribeModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-gray-900 mb-1">{subscribeModal.report.Icono} Configurar Suscripción</h2>
                        <p className="text-xs text-gray-500 mb-4">Elige cuándo quieres recibir el reporte de "{subscribeModal.report.Nombre}"</p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="label-mini">Email de entrega</label>
                                <input type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)}
                                    className="input-field" placeholder="correo@ejemplo.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label-mini">Frecuencia</label>
                                    <select value={subFreq} onChange={e => setSubFreq(e.target.value)} className="input-field">
                                        {['Diario', 'Semanal', 'Mensual'].map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label-mini">Hora de envío</label>
                                    <input type="time" value={subHora} onChange={e => setSubHora(e.target.value)}
                                        className="input-field" />
                                </div>
                                {subFreq === 'Semanal' && (
                                    <div className="col-span-2">
                                        <label className="label-mini">Día de la semana</label>
                                        <select value={subDiaSemana} onChange={e => setSubDiaSemana(parseInt(e.target.value))} className="input-field">
                                            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d, i) => (
                                                <option key={i} value={i + 1}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {subFreq === 'Mensual' && (
                                    <div className="col-span-2">
                                        <label className="label-mini">Día del mes</label>
                                        <input type="number" min={1} max={28} value={subDiaMes} onChange={e => setSubDiaMes(parseInt(e.target.value))}
                                            className="input-field" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setSubscribeModal(null)}
                                className="flex-1 btn-ghost justify-center">Cancelar</button>
                            <button onClick={handleSaveCustomSubscription} disabled={savingSub || !subEmail}
                                className="flex-1 btn-primary justify-center">
                                {savingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatCell(value: any, format: string) {
    if (value === null || value === undefined) return '-';
    if (format === 'currency' && typeof value === 'number') return '₡' + value.toLocaleString('es-CR');
    if (format === 'percent' && typeof value === 'number') {
        const pct = (value * 100).toFixed(1) + '%';
        const color = value >= 1 ? 'text-green-600' : value >= 0.9 ? 'text-amber-600' : 'text-red-600';
        return <span className={`font-semibold ${color}`}>{pct}</span>;
    }
    if (format === 'number' && typeof value === 'number') return value.toLocaleString('es-CR');
    return String(value);
}
