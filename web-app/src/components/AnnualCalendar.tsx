import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { BudgetRecord } from '../mockData';
import { formatCurrencyCompact, useFormatCurrency } from '../utils/formatters';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUserPreferences } from '../context/UserPreferences';
import { fetchTactica } from '../api';
import jsPDF from 'jspdf';

interface AnnualCalendarProps {
    data: BudgetRecord[];
    year: number;
    comparisonType: string;
    kpi: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    storeName?: string;
    tacticaOpen?: boolean;
    onTacticaClose?: () => void;
}

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

interface MonthAgg {
    month: number;
    monthName: string;
    monthShort: string;
    presupuesto: number;
    presupuestoAcumulado: number;
    presupuestoAcumuladoConDatos: number;
    real: number;
    realAcumulado: number;
    anterior: number;
    anteriorAcumulado: number;
    anteriorAjustado: number;
    anteriorAjustadoAcumulado: number;
    alcanceAcumulado: number;
    hasData: boolean;
}

export const AnnualCalendar: React.FC<AnnualCalendarProps> = ({
    data, year, kpi, storeName = '', tacticaOpen = false, onTacticaClose
}) => {
    const [visibleBars, setVisibleBars] = useState({
        presupuesto: true,
        real: true,
        anterior: false,
        anteriorAjustado: false
    });

    const toggleBar = (bar: keyof typeof visibleBars) => {
        setVisibleBars(prev => ({ ...prev, [bar]: !prev[bar] }));
    };
    const { formatPct100 } = useUserPreferences();
    const fc = useFormatCurrency();

    // Táctica state
    const [showTacticaModal, setShowTacticaModal] = useState(false);
    const [tacticaLoading, setTacticaLoading] = useState(false);
    const [tacticaAnalysis, setTacticaAnalysis] = useState<string | null>(null);
    const [tacticaError, setTacticaError] = useState<string | null>(null);
    const analysisRef = useRef<HTMLDivElement>(null);

    // Watch for external trigger
    useEffect(() => {
        if (tacticaOpen && !showTacticaModal) {
            handleTactica();
        }
    }, [tacticaOpen]);

    const monthlyData: MonthAgg[] = useMemo(() => {
        let accPresupuesto = 0;
        let accPresupuestoConDatos = 0;
        let accReal = 0;
        let accAnterior = 0;
        let accAnteriorAjustado = 0;

        return MONTH_NAMES.map((name, i) => {
            const monthNum = i + 1;
            const monthRecords = data.filter(d => d.Mes === monthNum && d.Año === year);
            const hasRealData = monthRecords.some(d => d.MontoReal > 0);

            const presupuesto = monthRecords.reduce((sum, d) => sum + d.Monto, 0);
            const presupuestoConDatos = monthRecords.filter(d => d.MontoReal > 0).reduce((sum, d) => sum + d.Monto, 0);
            const real = monthRecords.reduce((sum, d) => sum + d.MontoReal, 0);
            const anterior = monthRecords.reduce((sum, d) => sum + (d.MontoAnterior || 0), 0);
            const anteriorAjustado = monthRecords.reduce((sum, d) => sum + (d.MontoAnteriorAjustado || 0), 0);

            accPresupuesto += presupuesto;
            accPresupuestoConDatos += presupuestoConDatos;
            accReal += real;
            accAnterior += anterior;
            accAnteriorAjustado += anteriorAjustado;

            const alcanceAcumulado = accPresupuestoConDatos > 0 ? (accReal / accPresupuestoConDatos) * 100 : 0;

            return {
                month: monthNum,
                monthName: name,
                monthShort: MONTH_SHORT[i],
                presupuesto,
                presupuestoAcumulado: accPresupuesto,
                presupuestoAcumuladoConDatos: accPresupuestoConDatos,
                real,
                realAcumulado: accReal,
                anterior,
                anteriorAcumulado: accAnterior,
                anteriorAjustado,
                anteriorAjustadoAcumulado: accAnteriorAjustado,
                alcanceAcumulado,
                hasData: hasRealData,
            };
        });
    }, [data, year]);

    const getAlcanceColor = (pct: number, hasData: boolean) => {
        if (!hasData) return 'bg-gray-100 text-gray-400';
        if (pct >= 100) return 'bg-green-500 text-white';
        if (pct >= 90) return 'bg-orange-400 text-white';
        return 'bg-red-500 text-white';
    };

    const getAlcanceBorder = (pct: number, hasData: boolean) => {
        if (!hasData) return 'border-gray-200';
        if (pct >= 100) return 'border-green-300';
        if (pct >= 90) return 'border-orange-300';
        return 'border-red-300';
    };

    const annualTotals = useMemo(() => {
        const last = monthlyData.find(m => m.hasData && m.month === Math.max(...monthlyData.filter(x => x.hasData).map(x => x.month)));
        const fullYearPresupuesto = monthlyData.reduce((sum, m) => sum + m.presupuesto, 0);
        return {
            presupuestoAnual: fullYearPresupuesto,
            presupuestoAcumulado: last?.presupuestoAcumuladoConDatos || 0,
            real: last?.realAcumulado || 0,
            anterior: last?.anteriorAcumulado || 0,
            anteriorAjustado: last?.anteriorAjustadoAcumulado || 0,
            alcance: last?.alcanceAcumulado || 0,
            hasData: !!last,
        };
    }, [monthlyData]);

    // Chart data
    const chartData = useMemo(() => {
        return monthlyData.map(m => ({
            name: m.monthShort,
            Presupuesto: m.presupuesto,
            Real: m.hasData ? m.real : 0,
            'Año Anterior': m.anterior,
            'Año Ant. Ajust.': m.anteriorAjustado,
        }));
    }, [monthlyData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const presupuesto = payload.find((p: any) => p.dataKey === 'Presupuesto')?.value;
            const real = payload.find((p: any) => p.dataKey === 'Real')?.value;
            const anterior = payload.find((p: any) => p.dataKey === 'Año Anterior')?.value;
            const anteriorAjustado = payload.find((p: any) => p.dataKey === 'Año Anterior Ajustado')?.value;

            const difPpto = (real != null && presupuesto != null) ? real - presupuesto : null;
            const pctPpto = (presupuesto != null && presupuesto !== 0 && real != null) ? (real / presupuesto * 100) : null;

            const anteriorVal = anteriorAjustado ?? anterior;
            const anteriorLabel = anteriorAjustado != null ? 'Ajust.' : 'Ant.';
            const difAnt = (real != null && anteriorVal != null) ? real - anteriorVal : null;
            const pctAnt = (anteriorVal != null && anteriorVal !== 0 && real != null) ? (real / anteriorVal * 100) : null;

            return (
                <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl min-w-[200px]">
                    <p className="font-bold text-gray-700 mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-xs font-medium">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                            <span className="text-gray-500">{entry.name}:</span>
                            <span className="text-gray-900 font-mono">{fc(entry.value, kpi)}</span>
                        </div>
                    ))}
                    {difPpto != null && (
                        <>
                            <div className="h-px bg-gray-100 my-1.5" />
                            <div className="flex items-center gap-2 text-xs font-medium">
                                <span className="text-gray-500">Dif. Ppto:</span>
                                <span className={`font-mono font-bold ${difPpto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {difPpto >= 0 ? '+' : ''}{fc(difPpto, kpi)}
                                </span>
                                {pctPpto != null && (
                                    <span className={`font-mono font-bold ${pctPpto >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                        ({formatPct100(pctPpto)})
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                    {difAnt != null && (
                        <div className="flex items-center gap-2 text-xs font-medium">
                            <span className="text-gray-500">Dif. {anteriorLabel}:</span>
                            <span className={`font-mono font-bold ${difAnt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {difAnt >= 0 ? '+' : ''}{fc(difAnt, kpi)}
                            </span>
                            {pctAnt != null && (
                                <span className={`font-mono font-bold ${pctAnt >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({formatPct100(pctAnt)})
                                </span>
                            )}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    // Táctica handler
    const handleTactica = async () => {
        setShowTacticaModal(true);
        setTacticaLoading(true);
        setTacticaError(null);
        setTacticaAnalysis(null);

        try {
            const result = await fetchTactica({
                storeName: storeName || 'General',
                year,
                kpi,
                monthlyData: monthlyData.map(m => ({
                    monthName: m.monthName,
                    presupuesto: m.presupuesto,
                    presupuestoAcumulado: m.presupuestoAcumulado,
                    presupuestoAcumuladoConDatos: m.presupuestoAcumuladoConDatos,
                    real: m.real,
                    realAcumulado: m.realAcumulado,
                    anterior: m.anterior,
                    anteriorAcumulado: m.anteriorAcumulado,
                    anteriorAjustado: m.anteriorAjustado,
                    anteriorAjustadoAcumulado: m.anteriorAjustadoAcumulado,
                    alcanceAcumulado: m.alcanceAcumulado,
                    hasData: m.hasData,
                })),
                annualTotals
            });
            setTacticaAnalysis(result.analysis);
        } catch (err: any) {
            setTacticaError(err.message || 'Error al generar análisis');
        } finally {
            setTacticaLoading(false);
        }
    };

    // PDF export for analysis
    const handleSaveTacticaPDF = () => {
        if (!tacticaAnalysis) return;

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 15;
        const maxWidth = pageWidth - margin * 2;
        let y = 20;

        // Header
        pdf.setFillColor(79, 70, 229); // indigo
        pdf.rect(0, 0, pageWidth, 35, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Análisis Táctico', margin, 15);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${storeName} · ${kpi} · ${year}`, margin, 23);
        pdf.setFontSize(9);
        pdf.text(`Generado: ${new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, 30);

        y = 45;
        pdf.setTextColor(30, 30, 30);

        // Parse markdown and render to PDF
        const lines = tacticaAnalysis.split('\n');
        for (const line of lines) {
            if (y > 275) {
                pdf.addPage();
                y = 20;
            }

            const trimmed = line.trim();
            if (!trimmed) { y += 4; continue; }

            if (trimmed.startsWith('### ')) {
                y += 4;
                pdf.setFontSize(13);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(79, 70, 229);
                const heading = trimmed.replace(/^###\s*/, '');
                pdf.text(heading, margin, y);
                y += 7;
                pdf.setTextColor(30, 30, 30);
            } else if (trimmed.startsWith('## ')) {
                y += 5;
                pdf.setFontSize(14);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(30, 30, 80);
                const heading = trimmed.replace(/^##\s*/, '');
                pdf.text(heading, margin, y);
                y += 8;
                pdf.setTextColor(30, 30, 30);
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const content = trimmed.replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
                const wrapped = pdf.splitTextToSize(`• ${content}`, maxWidth - 5);
                pdf.text(wrapped, margin + 3, y);
                y += wrapped.length * 5;
            } else {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const content = trimmed.replace(/\*\*/g, '');
                const wrapped = pdf.splitTextToSize(content, maxWidth);
                pdf.text(wrapped, margin, y);
                y += wrapped.length * 5;
            }
        }

        // Footer
        const pages = pdf.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(`Rostipollos · Análisis Táctico IA · Página ${i}/${pages}`, pageWidth / 2, 290, { align: 'center' });
        }

        pdf.save(`Tactica_${storeName}_${year}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    // Simple markdown renderer
    const renderMarkdown = (md: string) => {
        return md.split('\n').map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <br key={i} />;

            // Headers
            if (trimmed.startsWith('### ')) {
                const text = trimmed.replace(/^###\s*/, '');
                return <h3 key={i} className="text-lg font-bold text-indigo-700 mt-6 mb-2">{text}</h3>;
            }
            if (trimmed.startsWith('## ')) {
                const text = trimmed.replace(/^##\s*/, '');
                return <h2 key={i} className="text-xl font-bold text-gray-800 mt-6 mb-2">{text}</h2>;
            }

            // Bullet points
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const text = trimmed.replace(/^[-*]\s*/, '');
                return (
                    <div key={i} className="flex gap-2 ml-2 mb-1.5">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: formatBold(text) }} />
                    </div>
                );
            }

            // Regular paragraph with bold
            return <p key={i} className="text-sm text-gray-700 mb-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />;
        });
    };

    const formatBold = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');

    return (
        <div className="w-full">
            {/* Section header */}
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800">Calendario Anual {year}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                    KPI: <span className="font-semibold text-gray-500">{kpi}</span>
                    {' · '} Alcance % calculado sobre acumulado vs presupuesto acumulado
                </p>
            </div>

            {/* 12-month grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {monthlyData.map((m) => (
                    <div
                        key={m.month}
                        className={`rounded-2xl border-2 p-4 bg-white transition-all hover:shadow-lg ${getAlcanceBorder(m.alcanceAcumulado, m.hasData)}`}
                    >
                        {/* Month header */}
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-700">{m.monthName}</h3>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getAlcanceColor(m.alcanceAcumulado, m.hasData)}`}>
                                {m.hasData ? formatPct100(m.alcanceAcumulado) : '—'}
                            </span>
                        </div>

                        {/* Data rows */}
                        <div className="space-y-1.5">
                            <Row label="Presup." value={formatCurrencyCompact(m.presupuesto, kpi)} color="text-gray-500" />
                            <Row label="P. Acum." value={formatCurrencyCompact(m.presupuestoAcumulado, kpi)} color="text-indigo-600" bold />
                            <Row label="Real" value={m.hasData ? formatCurrencyCompact(m.real, kpi) : '—'} color={m.hasData ? 'text-gray-800' : 'text-gray-400'} bold />
                            <Row label="Año Ant." value={formatCurrencyCompact(m.anterior, kpi)} color="text-orange-500" />
                            <Row label="Ant. Ajust." value={formatCurrencyCompact(m.anteriorAjustado, kpi)} color="text-amber-500" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Annual total bar */}
            <div className="mt-6 bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-700">Alcance {year}</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getAlcanceColor(annualTotals.alcance, annualTotals.hasData)}`}>
                            {annualTotals.hasData ? formatPct100(annualTotals.alcance) : '—'}
                        </span>
                    </div>
                    <div className="flex gap-6">
                        <TotalCell label="Presupuesto" value={fc(annualTotals.presupuestoAnual, kpi)} />
                        <TotalCell label="P. Acumulado" value={fc(annualTotals.presupuestoAcumulado, kpi)} bold />
                        <TotalCell label="Real" value={fc(annualTotals.real, kpi)} bold />
                        <TotalCell label="Año Anterior" value={fc(annualTotals.anterior, kpi)} />
                        <TotalCell label="Ant. Ajustado" value={fc(annualTotals.anteriorAjustado, kpi)} />
                    </div>
                </div>
            </div>

            {/* Monthly comparison chart */}
            <div className="mt-8 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">Comparativo Mensual</h3>
                    <div className="flex flex-wrap gap-2">
                        <ToggleBtn label="Presupuesto" color="bg-blue-500" checked={visibleBars.presupuesto} onChange={() => toggleBar('presupuesto')} />
                        <ToggleBtn label="Real" color="bg-green-500" checked={visibleBars.real} onChange={() => toggleBar('real')} />
                        <ToggleBtn label="Año Anterior" color="bg-orange-400" checked={visibleBars.anterior} onChange={() => toggleBar('anterior')} />
                        <ToggleBtn label="Ant. Ajustado" color="bg-indigo-500" checked={visibleBars.anteriorAjustado} onChange={() => toggleBar('anteriorAjustado')} />
                    </div>
                </div>

                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                            <defs>
                                <linearGradient id="colorPresup" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRealAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorAntAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FB923C" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FB923C" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorAntAjAnual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                                tickFormatter={(value: number) => formatCurrencyCompact(value, kpi)}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {visibleBars.anteriorAjustado && (
                                <Area type="monotone" dataKey="Año Ant. Ajust." stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorAntAjAnual)" />
                            )}
                            {visibleBars.anterior && (
                                <Area type="monotone" dataKey="Año Anterior" stroke="#FB923C" strokeWidth={2} fillOpacity={1} fill="url(#colorAntAnual)" />
                            )}
                            {visibleBars.presupuesto && (
                                <Area type="monotone" dataKey="Presupuesto" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorPresup)" />
                            )}
                            {visibleBars.real && (
                                <Area type="monotone" dataKey="Real" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorRealAnual)" />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Táctica Modal */}
            {showTacticaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowTacticaModal(false); onTacticaClose?.(); }} />

                    {/* Modal */}
                    <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="text-2xl">✨</span> Análisis Táctico
                                </h2>
                                <p className="text-indigo-200 text-sm mt-0.5">{storeName} · {kpi} · {year}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {tacticaAnalysis && (
                                    <button
                                        onClick={handleSaveTacticaPDF}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        Guardar PDF
                                    </button>
                                )}
                                <button
                                    onClick={() => { setShowTacticaModal(false); onTacticaClose?.(); }}
                                    className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div ref={analysisRef} className="flex-1 overflow-y-auto px-6 py-5">
                            {tacticaLoading && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                                        <span className="absolute inset-0 flex items-center justify-center text-2xl">🤖</span>
                                    </div>
                                    <p className="text-gray-500 font-medium">Analizando datos con IA...</p>
                                    <p className="text-gray-400 text-sm">Esto puede tardar unos segundos</p>
                                </div>
                            )}

                            {tacticaError && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl">⚠️</div>
                                    <p className="text-red-600 font-medium">No se pudo generar el análisis</p>
                                    <p className="text-gray-500 text-sm text-center max-w-md">
                                        Ocurrió un error al comunicarse con el servicio de inteligencia artificial. Intente de nuevo en unos minutos.
                                    </p>
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={handleTactica}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                        >
                                            Reintentar
                                        </button>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(tacticaError);
                                            }}
                                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                            📋 Copiar detalle
                                        </button>
                                    </div>
                                </div>
                            )}

                            {tacticaAnalysis && (
                                <div className="prose prose-sm max-w-none">
                                    {renderMarkdown(tacticaAnalysis)}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {tacticaAnalysis && (
                            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between bg-gray-50 flex-shrink-0">
                                <p className="text-xs text-gray-400">
                                    Generado por Gemini AI · {new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </p>
                                <button
                                    onClick={handleTactica}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                    ↻ Regenerar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper components
function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
            <span className={`text-sm font-mono ${color} ${bold ? 'font-bold' : 'font-semibold'}`}>{value}</span>
        </div>
    );
}

function TotalCell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase">{label}</p>
            <p className={`text-sm font-mono ${bold ? 'font-bold text-gray-800' : 'font-semibold text-gray-600'}`}>{value}</p>
        </div>
    );
}

function ToggleBtn({ label, color, checked, onChange }: { label: string; color: string; checked: boolean; onChange: () => void }) {
    return (
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
            <input type="checkbox" checked={checked} onChange={onChange} className="w-3 h-3" />
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className={checked ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
        </label>
    );
}
