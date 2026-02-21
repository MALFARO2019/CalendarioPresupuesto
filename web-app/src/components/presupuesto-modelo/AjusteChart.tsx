import React, { useState, useEffect } from 'react';
import {
    fetchAjustes, aplicarAjuste, previewAjuste, fetchAllStores,
    fetchConsolidadoMensual,
    getUser, type AjustePresupuesto
} from '../../api';

interface Props {
    anoModelo: number;
    nombrePresupuesto: string;
}

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_FULL = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CANALES = ['Salón', 'Llevar', 'AutoPollo', 'Express', 'ECommerce', 'UberEats', 'Todos'];
const TIPOS = ['Ventas', 'Transacciones'];

export const AjusteChart: React.FC<Props> = ({ anoModelo, nombrePresupuesto }) => {
    const user = getUser();
    const canAdjust = user?.esAdmin || (user as any)?.ajustarCurva;

    const [ajustes, setAjustes] = useState<AjustePresupuesto[]>([]);
    const [stores, setStores] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [preview, setPreview] = useState<any[]>([]);
    const [chartData, setChartData] = useState<number[]>(new Array(12).fill(0));

    // Form
    const [codAlmacen, setCodAlmacen] = useState('');
    const [mes, setMes] = useState(1);
    const [canal, setCanal] = useState('Todos');
    const [tipo, setTipo] = useState('Ventas');
    const [metodoAjuste, setMetodoAjuste] = useState('Porcentaje');
    const [valorAjuste, setValorAjuste] = useState(0);
    const [metodoDistribucion, setMetodoDistribucion] = useState('Mes');
    const [motivo, setMotivo] = useState('');

    useEffect(() => {
        loadData();
    }, [nombrePresupuesto]);

    // Reload chart when filters change
    useEffect(() => {
        loadChartData();
    }, [codAlmacen, tipo, anoModelo]);

    const loadData = async () => {
        try {
            setLoading(true);
            const storesData = await fetchAllStores().catch(() => [] as string[]);
            setStores(storesData);
            if (storesData.length > 0 && !codAlmacen) setCodAlmacen(storesData[0]);

            // Fetch ajustes separately — don't break the whole page if table doesn't exist
            try {
                const ajustesData = await fetchAjustes(nombrePresupuesto);
                setAjustes(ajustesData);
            } catch {
                setAjustes([]); // Graceful fallback
            }
        } catch (err: any) {
            // Only show non-DB errors
            if (!err.message?.includes('Invalid object') && !err.message?.includes('does not exist')) {
                setMessage({ type: 'error', text: err.message });
            }
        } finally {
            setLoading(false);
        }
    };

    const loadChartData = async () => {
        if (!codAlmacen) return;
        try {
            const data = await fetchConsolidadoMensual(anoModelo, codAlmacen, tipo);
            // Sum by month across all channels for the selected store
            const monthlyTotals = new Array(12).fill(0);
            (data || []).forEach((row: any) => {
                if (row.Canal === 'Todos' || !row.Canal) {
                    for (let m = 1; m <= 12; m++) {
                        const key = `Mes${m}`;
                        if (row[key] != null) monthlyTotals[m - 1] += Number(row[key]);
                    }
                }
            });
            // If no "Todos" row, sum all channels
            if (monthlyTotals.every(v => v === 0)) {
                (data || []).forEach((row: any) => {
                    for (let m = 1; m <= 12; m++) {
                        const key = `Mes${m}`;
                        if (row[key] != null) monthlyTotals[m - 1] += Number(row[key]);
                    }
                });
            }
            setChartData(monthlyTotals);
        } catch {
            setChartData(new Array(12).fill(0)); // Graceful fallback
        }
    };

    const handlePreview = async () => {
        try {
            setMessage(null);
            const result = await previewAjuste({
                nombrePresupuesto, codAlmacen, mes, canal, tipo,
                metodoAjuste, valorAjuste, metodoDistribucion
            });
            setPreview(result.preview || []);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    const handleApply = async () => {
        if (!motivo.trim()) {
            setMessage({ type: 'error', text: 'Debe ingresar un motivo para el ajuste' });
            return;
        }
        if (!confirm(`¿Aplicar ajuste de ${metodoAjuste} ${valorAjuste} al presupuesto?`)) return;

        try {
            setApplying(true);
            setMessage(null);
            await aplicarAjuste({
                nombrePresupuesto, codAlmacen, mes, canal, tipo,
                metodoAjuste, valorAjuste, metodoDistribucion, motivo
            });
            setMessage({ type: 'success', text: 'Ajuste aplicado exitosamente' });
            setPreview([]);
            setMotivo('');
            loadData();
            loadChartData();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setApplying(false);
        }
    };

    const maxVal = Math.max(...chartData, 1);
    const hasChartData = chartData.some(v => v > 0);

    return (
        <div className="space-y-6">
            {/* Monthly Distribution Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">📊 Distribución Mensual</h3>
                    <span className="text-xs text-gray-400">{codAlmacen || 'Todos'} — {tipo}</span>
                </div>
                {hasChartData ? (
                    <div className="flex items-end gap-1.5 h-44 px-2">
                        {chartData.map((val, i) => {
                            const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const isSelected = mes === i + 1;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
                                    onClick={() => setMes(i + 1)}>
                                    <span className={`text-[9px] font-mono transition-opacity ${val > 0 ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 ${isSelected ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                                        {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val.toFixed(0)}
                                    </span>
                                    <div className="w-full relative" style={{ height: '140px' }}>
                                        <div
                                            className={`absolute bottom-0 w-full rounded-t-md transition-all duration-300 ${isSelected
                                                ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-lg shadow-emerald-200'
                                                : 'bg-gradient-to-t from-indigo-400 to-indigo-300 group-hover:from-indigo-500 group-hover:to-indigo-400'
                                                }`}
                                            style={{ height: `${Math.max(height, 2)}%` }}
                                        />
                                    </div>
                                    <span className={`text-[10px] font-medium ${isSelected ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                                        {MESES[i + 1]}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-44 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-200">
                        <div className="text-center">
                            <div className="text-3xl mb-2 opacity-30">📊</div>
                            <p className="text-sm text-gray-400">Sin datos de presupuesto</p>
                            <p className="text-xs text-gray-300 mt-1">Ejecute el cálculo del presupuesto para ver la distribución</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Adjustment Form */}
            {canAdjust && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📈 Nuevo Ajuste</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Local</label>
                            <select value={codAlmacen} onChange={e => setCodAlmacen(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                {stores.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Mes</label>
                            <select value={mes} onChange={e => setMes(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                {MESES_FULL.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Canal</label>
                            <select value={canal} onChange={e => setCanal(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Método</label>
                            <select value={metodoAjuste} onChange={e => setMetodoAjuste(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="Porcentaje">Porcentaje (%)</option>
                                <option value="MontoAbsoluto">Monto Absoluto</option>
                                <option value="Factor">Factor</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Valor</label>
                            <input type="number" step="0.01" value={valorAjuste} onChange={e => setValorAjuste(parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                placeholder={metodoAjuste === 'Porcentaje' ? 'ej: 5 = +5%' : 'valor'} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Distribución</label>
                            <select value={metodoDistribucion} onChange={e => setMetodoDistribucion(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="Mes">Todo el Mes</option>
                                <option value="Semana">Por Semana</option>
                                <option value="TipoDia">Por Tipo Día</option>
                            </select>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Motivo</label>
                            <input value={motivo} onChange={e => setMotivo(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                placeholder="Razón del ajuste..." />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={handlePreview}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                            👁️ Vista Previa
                        </button>
                        <button onClick={handleApply} disabled={applying}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                            {applying ? '⏳' : '✅'} Aplicar Ajuste
                        </button>
                    </div>
                </div>
            )}

            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}

            {/* Preview Table */}
            {preview.length > 0 && (
                <div className="border border-indigo-200 rounded-xl overflow-hidden">
                    <div className="bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">👁️ Vista Previa del Ajuste</div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Fecha</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Día</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Actual</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Nuevo</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Diferencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {preview.map((p: any, i: number) => (
                                    <tr key={i} className={p.Diferencia !== 0 ? 'bg-amber-50/50' : ''}>
                                        <td className="px-3 py-1.5">{p.Fecha ? new Date(p.Fecha).toLocaleDateString('es-CR') : ''}</td>
                                        <td className="px-3 py-1.5">{p.idDia}</td>
                                        <td className="px-3 py-1.5 text-right font-mono">{Math.round(p.MontoActual).toLocaleString()}</td>
                                        <td className="px-3 py-1.5 text-right font-mono font-bold">{Math.round(p.MontoNuevo).toLocaleString()}</td>
                                        <td className={`px-3 py-1.5 text-right font-mono ${p.Diferencia > 0 ? 'text-green-600' : p.Diferencia < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                            {p.Diferencia > 0 && '+'}{Math.round(p.Diferencia).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Historical Adjustments */}
            <div className="border border-gray-200 rounded-xl">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">📋 Historial de Ajustes</h3>
                    <span className="text-xs text-gray-400">{ajustes.length} ajustes</span>
                </div>
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                    </div>
                ) : ajustes.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No hay ajustes registrados</div>
                ) : (
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Fecha</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Local</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Mes</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Canal</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Método</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-500">Valor</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Usuario</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Motivo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {ajustes.map(a => (
                                    <tr key={a.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 whitespace-nowrap">{new Date(a.fechaAplicacion).toLocaleDateString('es-CR')}</td>
                                        <td className="px-3 py-2">{a.codAlmacen}</td>
                                        <td className="px-3 py-2">{MESES_FULL[a.mes]}</td>
                                        <td className="px-3 py-2">{a.canal}</td>
                                        <td className="px-3 py-2">
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">{a.metodoAjuste}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">{a.valorAjuste}</td>
                                        <td className="px-3 py-2 text-xs">{a.usuario}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate">{a.motivo || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
