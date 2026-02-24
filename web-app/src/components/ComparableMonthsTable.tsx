import React, { useState, useMemo } from 'react';
import { useFormatCurrency } from '../utils/formatters';
import { useUserPreferences } from '../context/UserPreferences';
import type { BudgetRecord } from '../mockData';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ComparableMonthsTableProps {
    data: BudgetRecord[];
    kpi: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    year: number;
    fechaLimite: string;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ComparableMonthsTable: React.FC<ComparableMonthsTableProps> = ({
    data, kpi, yearType, year, fechaLimite
}) => {
    const [expanded, setExpanded] = useState(true);
    const fc = useFormatCurrency();
    const { formatPct100 } = useUserPreferences();

    const prevYear = year - 1;
    const isAjustado = yearType === 'Año Anterior Ajustado';

    const rows = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Group by month
        const monthMap = new Map<number, {
            real: number;
            pres: number;
            anterior: number;
            anteriorDiasConDatos: number;
            realDiasConDatos: number;
            presDiasConDatos: number;
            dayCount: number;
            daysWithReal: number;
        }>();

        for (const d of data) {
            const m = d.Mes;
            if (!monthMap.has(m)) {
                monthMap.set(m, { real: 0, pres: 0, anterior: 0, anteriorDiasConDatos: 0, realDiasConDatos: 0, presDiasConDatos: 0, dayCount: 0, daysWithReal: 0 });
            }
            const entry = monthMap.get(m)!;
            entry.real += d.MontoReal || 0;
            entry.pres += d.Monto || 0;
            const ant = isAjustado ? (d.MontoAnteriorAjustado || 0) : (d.MontoAnterior || 0);
            entry.anterior += ant;
            entry.dayCount++;
            if (d.MontoReal > 0) {
                entry.daysWithReal++;
                entry.realDiasConDatos += d.MontoReal;
                entry.presDiasConDatos += d.Monto || 0;
                const antDCD = isAjustado ? (d.AnteriorAjustadoDiasConDatos || 0) : (d.AnteriorDiasConDatos || 0);
                entry.anteriorDiasConDatos += antDCD;
            }
        }

        const mapped = Array.from(monthMap.entries()).map(([mes, v]) => {
            const vtaAnterior = v.anteriorDiasConDatos;
            const vtaActual = v.real;
            const pres = v.presDiasConDatos;

            // % cambio vs año anterior
            const pctCambioAA = vtaAnterior !== 0 ? ((vtaActual - vtaAnterior) / vtaAnterior) * 100 : null;
            // Diferencia vs año anterior
            const difAA = vtaActual - vtaAnterior;
            // Diferencia vs presupuesto
            const difPres = vtaActual - pres;
            // % vs presupuesto
            const pctPres = pres !== 0 ? (vtaActual / pres) * 100 : null;

            const isFuture = v.daysWithReal === 0;
            // Partial month: has some data but not all days
            const isPartial = v.daysWithReal > 0 && v.daysWithReal < v.dayCount;

            return {
                mes,
                mesNombre: MONTH_SHORT[mes - 1] || `M${mes}`,
                mesNombreFull: MONTH_NAMES[mes - 1] || `Mes ${mes}`,
                vtaAnterior,
                vtaActual,
                pctCambioAA,
                difAA,
                pres,
                presFull: v.pres, // full month budget
                difPres,
                pctPres,
                isFuture,
                isPartial,
                daysWithReal: v.daysWithReal,
                dayCount: v.dayCount,
                hasComparable: vtaAnterior > 0
            };
        });

        mapped.sort((a, b) => a.mes - b.mes);
        return mapped;
    }, [data, isAjustado]);

    const totals = useMemo(() => {
        if (rows.length === 0) return null;
        const daysWithData = rows.filter(r => !r.isFuture);
        const totalVtaAnt = daysWithData.reduce((s, r) => s + r.vtaAnterior, 0);
        const totalVtaAct = daysWithData.reduce((s, r) => s + r.vtaActual, 0);
        const totalPres = daysWithData.reduce((s, r) => s + r.pres, 0);
        const totalPresFull = rows.reduce((s, r) => s + r.presFull, 0);

        // SSS: months with comparable data in both years
        const comparableMonths = daysWithData.filter(r => r.hasComparable);
        const sssVtaAnt = comparableMonths.reduce((s, r) => s + r.vtaAnterior, 0);
        const sssVtaAct = comparableMonths.reduce((s, r) => s + r.vtaActual, 0);

        // "Nuevos": months without comparable
        const newMonths = daysWithData.filter(r => !r.hasComparable);
        const newVtaAct = newMonths.reduce((s, r) => s + r.vtaActual, 0);

        return {
            totalVtaAnt,
            totalVtaAct,
            totalPres,
            totalPresFull,
            totalDifAA: totalVtaAct - totalVtaAnt,
            totalPctAA: totalVtaAnt > 0 ? ((totalVtaAct - totalVtaAnt) / totalVtaAnt) * 100 : null,
            totalDifPres: totalVtaAct - totalPres,
            totalPctPres: totalPres > 0 ? (totalVtaAct / totalPres) * 100 : null,
            sssVtaAnt,
            sssVtaAct,
            sssPct: sssVtaAnt > 0 ? ((sssVtaAct - sssVtaAnt) / sssVtaAnt) * 100 : null,
            newVtaAct,
            newCount: newMonths.length,
            comparableCount: comparableMonths.length,
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
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-lg overflow-hidden mt-8">
            {/* Collapsible Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors"
            >
                <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-lg sm:text-xl">📅</span>
                    <div className="text-left">
                        <h3 className="text-sm sm:text-base font-bold text-gray-800">Meses Comparables</h3>
                        <p className="text-[10px] sm:text-xs text-gray-500">
                            {year} vs {prevYear} • {yearType}
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
                                <th className="py-2 px-2 text-center font-bold text-gray-500 whitespace-nowrap" rowSpan={2}>
                                    Mes
                                </th>
                                <th className="py-2 px-2 text-center font-bold whitespace-nowrap border-l border-gray-200" colSpan={1}>
                                    <span className="text-purple-600">{prevYear}</span>
                                </th>
                                <th className="py-2 px-2 text-center font-bold whitespace-nowrap border-l border-gray-200" colSpan={1}>
                                    <span className="text-indigo-600">{year}</span>
                                </th>
                                <th className="py-2 px-2 text-center font-bold text-gray-500 whitespace-nowrap border-l border-gray-200" colSpan={2}>
                                    vs Año Ant.
                                </th>
                                <th className="py-2 px-2 text-center font-bold text-gray-500 whitespace-nowrap border-l border-gray-200" colSpan={3}>
                                    vs Presupuesto
                                </th>
                            </tr>
                            <tr className="bg-gray-50 border-b border-gray-300">
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">Vta</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">Vta</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">%</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px]">Dif</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px] border-l border-gray-200">Pres</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px]">Dif</th>
                                <th className="py-1.5 px-2 text-right font-semibold text-gray-500 text-[10px]">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.mes}
                                    className={`border-b border-gray-100 ${r.isFuture ? 'opacity-40' : ''} hover:bg-gray-50 transition-colors`}
                                >
                                    <td className="py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
                                        {r.mesNombre}
                                        {r.isPartial && (
                                            <span className="ml-1 text-[9px] text-amber-500 font-normal">
                                                ({r.daysWithReal}d)
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-gray-700 border-l border-gray-100">
                                        {r.vtaAnterior > 0 ? fc(r.vtaAnterior, kpi) : '—'}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono font-semibold text-gray-800 border-l border-gray-100">
                                        {r.isFuture ? '—' : fc(r.vtaActual, kpi)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold border-l border-gray-100 ${r.pctCambioAA !== null ? getDifColor(r.pctCambioAA) : 'text-gray-400'}`}>
                                        {r.isFuture ? '' : r.pctCambioAA !== null ? `${r.pctCambioAA >= 0 ? '+' : ''}${r.pctCambioAA.toFixed(1)}%` : '—'}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono ${r.isFuture ? 'text-gray-400' : getDifColor(r.difAA)}`}>
                                        {r.isFuture ? '' : fc(r.difAA, kpi)}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-gray-600 border-l border-gray-100">
                                        {r.isFuture ? fc(r.presFull, kpi) : fc(r.pres, kpi)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono ${r.isFuture ? 'text-gray-400' : getDifColor(r.difPres)}`}>
                                        {r.isFuture ? '' : fc(r.difPres, kpi)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${r.isFuture ? 'text-gray-400' : getColorClass(r.pctPres)}`}>
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
                                        <td className="py-2 px-2 font-bold text-purple-700 text-[10px]">
                                            SSS ({totals.comparableCount}m)
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono font-bold text-purple-700 border-l border-gray-100">
                                            {fc(totals.sssVtaAnt, kpi)}
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono font-bold text-purple-700 border-l border-gray-100">
                                            {fc(totals.sssVtaAct, kpi)}
                                        </td>
                                        <td className={`py-2 px-2 text-right font-mono font-bold border-l border-gray-100 ${totals.sssPct !== null ? getDifColor(totals.sssPct) : ''}`}>
                                            {totals.sssPct !== null ? `${totals.sssPct >= 0 ? '+' : ''}${totals.sssPct.toFixed(1)}%` : ''}
                                        </td>
                                        <td colSpan={4}></td>
                                    </tr>
                                )}

                                {/* Nuevos */}
                                {totals.newCount > 0 && (
                                    <tr className="bg-green-50">
                                        <td className="py-2 px-2 font-bold text-green-700 text-[10px]">
                                            Nuevos ({totals.newCount}m)
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-400 border-l border-gray-100">—</td>
                                        <td className="py-2 px-2 text-right font-mono font-bold text-green-700 border-l border-gray-100">
                                            {fc(totals.newVtaAct, kpi)}
                                        </td>
                                        <td colSpan={5}></td>
                                    </tr>
                                )}

                                {/* TOTAL */}
                                <tr className="bg-gray-100 border-t-2 border-gray-400">
                                    <td className="py-2.5 px-2 font-bold text-gray-800">
                                        TOTAL
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold text-gray-800 border-l border-gray-100">
                                        {fc(totals.totalVtaAnt, kpi)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold text-gray-800 border-l border-gray-100">
                                        {fc(totals.totalVtaAct, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-2 text-right font-mono font-extrabold border-l border-gray-100 ${totals.totalPctAA !== null ? getDifColor(totals.totalPctAA) : ''}`}>
                                        {totals.totalPctAA !== null ? `${totals.totalPctAA >= 0 ? '+' : ''}${totals.totalPctAA.toFixed(1)}%` : ''}
                                    </td>
                                    <td className={`py-2.5 px-2 text-right font-mono font-bold ${getDifColor(totals.totalDifAA)}`}>
                                        {fc(totals.totalDifAA, kpi)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold text-gray-800 border-l border-gray-100">
                                        {fc(totals.totalPres, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-2 text-right font-mono font-bold ${getDifColor(totals.totalDifPres)}`}>
                                        {fc(totals.totalDifPres, kpi)}
                                    </td>
                                    <td className={`py-2.5 px-2 text-right font-mono font-extrabold ${getColorClass(totals.totalPctPres)}`}>
                                        {totals.totalPctPres !== null ? `${totals.totalPctPres.toFixed(1)}%` : ''}
                                    </td>
                                </tr>

                                {/* Presupuesto Anual Full */}
                                <tr className="bg-blue-50 border-t border-blue-200">
                                    <td className="py-2 px-2 font-bold text-blue-700 text-[10px]">
                                        Pres. Anual
                                    </td>
                                    <td className="border-l border-gray-100"></td>
                                    <td className="border-l border-gray-100"></td>
                                    <td colSpan={2}></td>
                                    <td className="py-2 px-2 text-right font-mono font-bold text-blue-700 border-l border-gray-100">
                                        {fc(totals.totalPresFull, kpi)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${getDifColor(totals.totalVtaAct - totals.totalPresFull)}`}>
                                        {fc(totals.totalVtaAct - totals.totalPresFull, kpi)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${getColorClass(totals.totalPresFull > 0 ? (totals.totalVtaAct / totals.totalPresFull) * 100 : null)}`}>
                                        {totals.totalPresFull > 0 ? `${((totals.totalVtaAct / totals.totalPresFull) * 100).toFixed(1)}%` : ''}
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
