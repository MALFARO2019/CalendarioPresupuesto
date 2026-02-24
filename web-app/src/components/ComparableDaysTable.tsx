import React, { useState, useMemo } from 'react';
import { useFormatCurrency } from '../utils/formatters';
import { useUserPreferences } from '../context/UserPreferences';
import type { ComparableDayRecord } from '../api';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ComparableDaysTableProps {
    data: ComparableDayRecord[];
    kpi: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    year: number;
    month: number; // 0-indexed
}

const DAY_LETTERS: Record<number, string> = { 1: 'L', 2: 'K', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatShortDate(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return `${d.getDate()}/${MONTH_NAMES[d.getMonth()]}`;
}

function getDayLetterFromDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    const jsDay = d.getDay(); // 0=Sun
    const sqlDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
    return DAY_LETTERS[sqlDay] || '';
}

export const ComparableDaysTable: React.FC<ComparableDaysTableProps> = ({
    data, kpi, yearType, year, month
}) => {
    const [expanded, setExpanded] = useState(true);
    const fc = useFormatCurrency();
    const { formatPct100 } = useUserPreferences();

    const prevYear = year - 1;
    const isAjustado = yearType === 'Año Anterior Ajustado';

    const rows = useMemo(() => {
        if (!data || data.length === 0) return [];
        const mapped = data.map(d => {
            const vtaAnterior = isAjustado ? d.MontoAnteriorAjustado : d.MontoAnterior;
            const fechaAnt = isAjustado ? d.FechaAnteriorAjustada : d.FechaAnterior;
            const vtaActual = d.MontoReal;
            const pres = d.Monto;

            // % cambio vs año anterior
            const pctCambioAA = vtaAnterior !== 0 ? ((vtaActual - vtaAnterior) / vtaAnterior) * 100 : null;
            // Diferencia vs año anterior
            const difAA = vtaActual - vtaAnterior;
            // Diferencia vs presupuesto
            const difPres = vtaActual - pres;
            // % vs presupuesto
            const pctPres = pres !== 0 ? (vtaActual / pres) * 100 : null;

            return {
                dia: d.Dia,
                fechaActual: d.Fecha,
                fechaAnterior: fechaAnt,
                diaLetraActual: DAY_LETTERS[d.idDia] || d.Serie || '',
                diaLetraAnterior: getDayLetterFromDate(fechaAnt?.substring(0, 10) || ''),
                vtaAnterior,
                vtaActual,
                pctCambioAA,
                difAA,
                pres,
                difPres,
                pctPres,
                isFuture: vtaActual === 0 && pres > 0,
                hasComparable: vtaAnterior > 0
            };
        });
        // Sort numerically by day, then push future days to end
        mapped.sort((a, b) => {
            if (a.isFuture !== b.isFuture) return a.isFuture ? 1 : -1;
            return a.dia - b.dia;
        });
        return mapped;
    }, [data, isAjustado]);

    const totals = useMemo(() => {
        if (rows.length === 0) return null;
        const daysWithData = rows.filter(r => !r.isFuture);
        const totalVtaAnt = daysWithData.reduce((s, r) => s + r.vtaAnterior, 0);
        const totalVtaAct = daysWithData.reduce((s, r) => s + r.vtaActual, 0);
        const totalPres = daysWithData.reduce((s, r) => s + r.pres, 0);

        // SSS: same-store sales (days with comparable data in both years)
        const comparableDays = daysWithData.filter(r => r.hasComparable);
        const sssVtaAnt = comparableDays.reduce((s, r) => s + r.vtaAnterior, 0);
        const sssVtaAct = comparableDays.reduce((s, r) => s + r.vtaActual, 0);

        // "Nuevos": days without comparable (new stores/days)
        const newDays = daysWithData.filter(r => !r.hasComparable);
        const newVtaAct = newDays.reduce((s, r) => s + r.vtaActual, 0);

        return {
            totalVtaAnt,
            totalVtaAct,
            totalPres,
            totalDifAA: totalVtaAct - totalVtaAnt,
            totalPctAA: totalVtaAnt > 0 ? ((totalVtaAct - totalVtaAnt) / totalVtaAnt) * 100 : null,
            totalDifPres: totalVtaAct - totalPres,
            totalPctPres: totalPres > 0 ? (totalVtaAct / totalPres) * 100 : null,
            sssVtaAnt,
            sssVtaAct,
            sssPct: sssVtaAnt > 0 ? ((sssVtaAct - sssVtaAnt) / sssVtaAnt) * 100 : null,
            newVtaAct,
            newCount: newDays.length,
            comparableCount: comparableDays.length,
        };
    }, [rows]);

    const getColorClass = (pct: number | null) => {
        if (pct === null) return 'text-gray-400';
        if (pct >= 100) return 'text-green-600';
        if (pct >= 90) return 'text-orange-500';
        return 'text-red-600';
    };

    const getDifColor = (val: number) => val >= 0 ? 'text-green-600' : 'text-red-600';

    if (!data || data.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
            {/* Collapsible Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors"
            >
                <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-lg sm:text-xl">📊</span>
                    <div className="text-left">
                        <h3 className="text-sm sm:text-base font-bold text-gray-800">Días Comparables</h3>
                        <p className="text-[10px] sm:text-xs text-gray-500">
                            {MONTH_NAMES[month]} {year} vs {prevYear} • {yearType}
                            {totals && (
                                <span className={`ml-2 font-bold ${getColorClass(totals.totalPctAA !== null ? totals.totalPctAA + 100 : null)}`}>
                                    {totals.totalPctAA !== null ? `${totals.totalPctAA >= 0 ? '+' : ''}${totals.totalPctAA.toFixed(1)}%` : ''}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                {expanded
                    ? <ChevronUp className="w-5 h-5 text-gray-400" />
                    : <ChevronDown className="w-5 h-5 text-gray-400" />
                }
            </button>

            {/* Table Content */}
            {expanded && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-200">
                                <th className="py-2 px-1.5 text-center font-bold text-gray-500 whitespace-nowrap" colSpan={3}>
                                    <span className="text-purple-600">{prevYear}</span>
                                </th>
                                <th className="py-2 px-1.5 text-center font-bold text-gray-500 whitespace-nowrap border-l border-gray-200" colSpan={3}>
                                    <span className="text-indigo-600">{year}</span>
                                </th>
                                <th className="py-2 px-1.5 text-center font-bold text-gray-500 whitespace-nowrap border-l border-gray-200" colSpan={2}>
                                    vs Año Ant.
                                </th>
                                <th className="py-2 px-1.5 text-center font-bold text-gray-500 whitespace-nowrap border-l border-gray-200" colSpan={3}>
                                    vs Presupuesto
                                </th>
                            </tr>
                            <tr className="bg-gray-50 border-b border-gray-300">
                                <th className="py-1.5 px-1.5 text-center font-semibold text-gray-500 text-[10px]">Fecha</th>
                                <th className="py-1.5 px-1 text-center font-semibold text-gray-500 text-[10px]">Día</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px]">Vta</th>
                                <th className="py-1.5 px-1.5 text-center font-semibold text-gray-500 text-[10px] border-l border-gray-200">Fecha</th>
                                <th className="py-1.5 px-1 text-center font-semibold text-gray-500 text-[10px]">Día</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px]">Vta</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">%</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px]">Dif</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">Pres</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px]">Dif</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold text-gray-500 text-[10px]">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr
                                    key={i}
                                    className={`border-b border-gray-100 ${r.isFuture ? 'opacity-40' : ''} ${r.diaLetraActual === 'D' ? 'bg-blue-50/30' : ''} hover:bg-gray-50 transition-colors`}
                                >
                                    <td className="py-1.5 px-1.5 text-center text-gray-600 font-mono whitespace-nowrap">
                                        {formatShortDate(r.fechaAnterior?.substring(0, 10) || '')}
                                    </td>
                                    <td className="py-1.5 px-1 text-center font-bold text-gray-500">
                                        {r.diaLetraAnterior}
                                    </td>
                                    <td className="py-1.5 px-1.5 text-right font-mono text-gray-700">
                                        {r.vtaAnterior > 0 ? fc(r.vtaAnterior, kpi) : '—'}
                                    </td>
                                    <td className="py-1.5 px-1.5 text-center text-gray-600 font-mono whitespace-nowrap border-l border-gray-100">
                                        {formatShortDate(r.fechaActual?.substring(0, 10) || '')}
                                    </td>
                                    <td className="py-1.5 px-1 text-center font-bold text-indigo-600">
                                        {r.diaLetraActual}
                                    </td>
                                    <td className="py-1.5 px-1.5 text-right font-mono font-semibold text-gray-800">
                                        {r.isFuture ? '—' : fc(r.vtaActual, kpi)}
                                    </td>
                                    <td className={`py-1.5 px-1.5 text-right font-mono font-bold border-l border-gray-100 ${r.pctCambioAA !== null ? getDifColor(r.pctCambioAA) : 'text-gray-400'}`}>
                                        {r.isFuture ? '' : r.pctCambioAA !== null ? `${r.pctCambioAA >= 0 ? '+' : ''}${r.pctCambioAA.toFixed(1)}%` : '—'}
                                    </td>
                                    <td className={`py-1.5 px-1.5 text-right font-mono ${r.isFuture ? 'text-gray-400' : getDifColor(r.difAA)}`}>
                                        {r.isFuture ? '' : fc(r.difAA, kpi)}
                                    </td>
                                    <td className="py-1.5 px-1.5 text-right font-mono text-gray-600 border-l border-gray-100">
                                        {fc(r.pres, kpi)}
                                    </td>
                                    <td className={`py-1.5 px-1.5 text-right font-mono ${r.isFuture ? 'text-gray-400' : getDifColor(r.difPres)}`}>
                                        {r.isFuture ? '' : fc(r.difPres, kpi)}
                                    </td>
                                    <td className={`py-1.5 px-1.5 text-right font-mono font-bold ${r.isFuture ? 'text-gray-400' : getColorClass(r.pctPres)}`}>
                                        {r.isFuture ? '' : r.pctPres !== null ? `${r.pctPres.toFixed(1)}%` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>

                        {/* Summary Footer */}
                        {totals && (
                            <tfoot>
                                {/* SSS (Same-Store Sales) */}
                                {totals.comparableCount > 0 && totals.newCount > 0 && (
                                    <tr className="bg-purple-50 border-t-2 border-purple-200">
                                        <td className="py-2 px-1.5 font-bold text-purple-700 text-[10px] text-center" colSpan={2}>
                                            SSS ({totals.comparableCount}d)
                                        </td>
                                        <td className="py-2 px-1.5 text-right font-mono font-bold text-purple-700">
                                            {fc(totals.sssVtaAnt, kpi)}
                                        </td>
                                        <td colSpan={2}></td>
                                        <td className="py-2 px-1.5 text-right font-mono font-bold text-purple-700">
                                            {fc(totals.sssVtaAct, kpi)}
                                        </td>
                                        <td className={`py-2 px-1.5 text-right font-mono font-bold ${totals.sssPct !== null ? getDifColor(totals.sssPct) : ''}`}>
                                            {totals.sssPct !== null ? `${totals.sssPct >= 0 ? '+' : ''}${totals.sssPct.toFixed(1)}%` : ''}
                                        </td>
                                        <td colSpan={4}></td>
                                    </tr>
                                )}

                                {/* Nuevos */}
                                {totals.newCount > 0 && (
                                    <tr className="bg-green-50">
                                        <td className="py-2 px-1.5 font-bold text-green-700 text-[10px] text-center" colSpan={2}>
                                            Nuevos ({totals.newCount}d)
                                        </td>
                                        <td className="py-2 px-1.5 text-right font-mono text-gray-400">—</td>
                                        <td colSpan={2}></td>
                                        <td className="py-2 px-1.5 text-right font-mono font-bold text-green-700">
                                            {fc(totals.newVtaAct, kpi)}
                                        </td>
                                        <td colSpan={5}></td>
                                    </tr>
                                )}

                                {/* TOTAL */}
                                <tr className="bg-gray-100 border-t-2 border-gray-400">
                                    <td className="py-2.5 px-1.5 font-bold text-gray-800 text-center" colSpan={2}>
                                        TOTAL
                                    </td>
                                    <td className="py-2.5 px-1.5 text-right font-mono font-bold text-gray-800">
                                        {fc(totals.totalVtaAnt, kpi)}
                                    </td>
                                    <td className="border-l border-gray-200" colSpan={2}></td>
                                    <td className="py-2.5 px-1.5 text-right font-mono font-bold text-gray-800">
                                        {fc(totals.totalVtaAct, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-1.5 text-right font-mono font-extrabold border-l border-gray-200 ${totals.totalPctAA !== null ? getDifColor(totals.totalPctAA) : ''}`}>
                                        {totals.totalPctAA !== null ? `${totals.totalPctAA >= 0 ? '+' : ''}${totals.totalPctAA.toFixed(1)}%` : ''}
                                    </td>
                                    <td className={`py-2.5 px-1.5 text-right font-mono font-bold ${getDifColor(totals.totalDifAA)}`}>
                                        {fc(totals.totalDifAA, kpi)}
                                    </td>
                                    <td className="py-2.5 px-1.5 text-right font-mono font-bold text-gray-800 border-l border-gray-200">
                                        {fc(totals.totalPres, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-1.5 text-right font-mono font-bold ${getDifColor(totals.totalDifPres)}`}>
                                        {fc(totals.totalDifPres, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-1.5 text-right font-mono font-extrabold ${getColorClass(totals.totalPctPres)}`}>
                                        {totals.totalPctPres !== null ? `${totals.totalPctPres.toFixed(1)}%` : ''}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    );
};
