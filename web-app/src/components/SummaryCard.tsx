import React, { useMemo } from "react";
import { useFormatCurrency } from '../utils/formatters';
import { useUserPreferences } from '../context/UserPreferences';
// Note: Trend indicators for SummaryCard will be implemented in Phase 8

interface SummaryCardProps {
    dataVentas: any[];
    dataTransacciones: any[];
    dataTQP: any[];
    currentMonth: number;
    comparisonType: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    filterLocal: string;
    isAnnual?: boolean;
    dateRange?: { startDate: string; endDate: string };
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ dataVentas, dataTransacciones, dataTQP, currentMonth, comparisonType, yearType, filterLocal, isAnnual = false, dateRange }) => {
    const { formatPct100 } = useUserPreferences();
    const fc = useFormatCurrency();
    const summary = useMemo(() => {
        if (!dataVentas || !dataTransacciones || !dataTQP) return null;

        const today = new Date();

        // Helper: filter data by dateRange (Fecha field) to match Tendencia's BETWEEN filter
        const filterByDateRange = (records: any[]) => {
            if (!dateRange) return records;
            const rangeStart = dateRange.startDate; // "2026-01-01"
            const rangeEnd = dateRange.endDate;     // "2026-02-16"
            return records.filter((d: any) => {
                if (!d.Fecha) return true; // keep records without Fecha
                // Normalize Fecha to YYYY-MM-DD string for comparison
                let fechaStr: string;
                if (typeof d.Fecha === 'string') {
                    fechaStr = d.Fecha.substring(0, 10);
                } else if (d.Fecha instanceof Date) {
                    fechaStr = d.Fecha.toISOString().substring(0, 10);
                } else {
                    return true;
                }
                return fechaStr >= rangeStart && fechaStr <= rangeEnd;
            });
        };

        // Filter data: for annual view, keep both full year (for P. Año) and date-filtered (for P. Acum)
        const currentMonthIndex = currentMonth + 1;
        // Date-filtered data (for P. Acum in annual, or full month for monthly)
        const ventasMonth = isAnnual ? filterByDateRange(dataVentas) : dataVentas.filter(d => d.Mes === currentMonthIndex);
        const transaccionesMonth = isAnnual ? filterByDateRange(dataTransacciones) : dataTransacciones.filter(d => d.Mes === currentMonthIndex);
        // Full year data (for P. Año in annual view)
        const ventasFullYear = isAnnual ? dataVentas : null;
        const transaccionesFullYear = isAnnual ? dataTransacciones : null;

        // Helper to calculate metrics for a KPI dataset with specific comparison
        // fullYearData is the unfiltered dataset (only used in annual view for P. Año row)
        const calculateKPI = (data: any[], compareType: 'Presupuesto' | 'Año Anterior' | 'Año Anterior Ajustado', fullYearData?: any[] | null) => {
            if (data.length === 0) return {
                mes: 0,
                acum: 0,
                real: 0,
                difAcum: 0,
                alcance: 0,
                saldo: 0
            };

            const totalActual = data.reduce((sum: number, d: any) => sum + (d.MontoReal || 0), 0);

            let totalMes, totalAcum;
            // For P. Año/Mes: use full year data if available (annual view), otherwise use filtered data
            const mesData = fullYearData || data;

            if (compareType === 'Presupuesto') {
                // P. Año: sum all Monto for the FULL year (not date-filtered)
                totalMes = mesData.reduce((sum: number, d: any) => sum + (d.Monto || 0), 0);
                // P. Acum: sum Monto only for days with real data within date range
                totalAcum = isAnnual
                    ? data.filter((d: any) => d.MontoReal > 0).reduce((sum: number, d: any) => sum + (d.Monto || 0), 0)
                    : data.reduce((sum: number, d: any) => sum + (d.MontoAcumulado || 0), 0);
            } else if (compareType === 'Año Anterior Ajustado') {
                totalMes = mesData.reduce((sum: number, d: any) => sum + (d.MontoAnteriorAjustado || 0), 0);
                totalAcum = isAnnual
                    ? data.filter((d: any) => d.MontoReal > 0).reduce((sum: number, d: any) => sum + (d.MontoAnteriorAjustado || 0), 0)
                    : data.reduce((sum: number, d: any) => sum + (d.MontoAnteriorAjustadoAcumulado || 0), 0);
            } else {
                totalMes = mesData.reduce((sum: number, d: any) => sum + (d.MontoAnterior || 0), 0);
                totalAcum = isAnnual
                    ? data.filter((d: any) => d.MontoReal > 0).reduce((sum: number, d: any) => sum + (d.MontoAnterior || 0), 0)
                    : data.reduce((sum: number, d: any) => sum + (d.MontoAnteriorAcumulado || 0), 0);
            }

            const difAcum = totalActual - totalAcum;
            const alcance = totalAcum > 0 ? (totalActual / totalAcum) * 100 : 0;
            const saldo = totalAcum - totalActual;

            return {
                mes: totalMes,
                acum: totalAcum,
                real: totalActual,
                difAcum,
                alcance,
                saldo
            };
        };

        // Calculate for PRESUPUESTO (always)
        const presupuesto = {
            Ventas: calculateKPI(ventasMonth, 'Presupuesto', ventasFullYear),
            Transacciones: calculateKPI(transaccionesMonth, 'Presupuesto', transaccionesFullYear),
            TQP: {
                mes: 0,
                acum: 0,
                real: 0,
                difAcum: 0,
                alcance: 0,
                saldo: 0
            }
        };

        // Calculate TQP from Ventas / Transacciones for Presupuesto
        const ventasP = presupuesto.Ventas;
        const transP = presupuesto.Transacciones;
        presupuesto.TQP = {
            mes: transP.mes > 0 ? ventasP.mes / transP.mes : 0,
            acum: transP.acum > 0 ? ventasP.acum / transP.acum : 0,
            real: transP.real > 0 ? ventasP.real / transP.real : 0,
            difAcum: (transP.real > 0 ? ventasP.real / transP.real : 0) - (transP.acum > 0 ? ventasP.acum / transP.acum : 0),
            alcance: (transP.acum > 0 && ventasP.acum > 0) ? ((ventasP.real / transP.real) / (ventasP.acum / transP.acum)) * 100 : 0,
            saldo: (transP.acum > 0 ? ventasP.acum / transP.acum : 0) - (transP.real > 0 ? ventasP.real / transP.real : 0)
        };

        // Calculate for AÑO ANTERIOR (use yearType parameter)
        const anoAnterior = {
            Ventas: calculateKPI(ventasMonth, yearType, ventasFullYear),
            Transacciones: calculateKPI(transaccionesMonth, yearType, transaccionesFullYear),
            TQP: {
                mes: 0,
                acum: 0,
                real: 0,
                difAcum: 0,
                alcance: 0,
                saldo: 0
            }
        };

        // Calculate TQP from Ventas / Transacciones for Año Anterior
        const ventasA = anoAnterior.Ventas;
        const transA = anoAnterior.Transacciones;
        anoAnterior.TQP = {
            mes: transA.mes > 0 ? ventasA.mes / transA.mes : 0,
            acum: transA.acum > 0 ? ventasA.acum / transA.acum : 0,
            real: transA.real > 0 ? ventasA.real / transA.real : 0,
            difAcum: (transA.real > 0 ? ventasA.real / transA.real : 0) - (transA.acum > 0 ? ventasA.acum / transA.acum : 0),
            alcance: (transA.acum > 0 && ventasA.acum > 0) ? ((ventasA.real / transA.real) / (ventasA.acum / transA.acum)) * 100 : 0,
            saldo: (transA.acum > 0 ? ventasA.acum / transA.acum : 0) - (transA.real > 0 ? ventasA.real / transA.real : 0)
        };


        // Calculate remaining days
        const currentYear = today.getFullYear();
        const currentMonthNum = today.getMonth();
        const viewingYear = currentYear; // Always use current year (2026)
        const viewingMonth = currentMonth; // Use prop from parent (0-indexed)

        let remainingDaysCount;

        // If viewing a future month, count ALL days in the month
        if (viewingYear > currentYear || (viewingYear === currentYear && viewingMonth > currentMonthNum)) {
            // Future month: calculate actual number of days in the month
            // new Date(year, month + 1, 0) gives the last day of the month
            const daysInMonth = new Date(viewingYear, viewingMonth + 1, 0).getDate();
            remainingDaysCount = daysInMonth;
        } else {
            // Current month or past: count only days after today with no data
            remainingDaysCount = ventasMonth.filter(d => {
                const dayDate = new Date(d.Año, d.Mes - 1, d.Dia);
                return dayDate > today && d.MontoReal === 0;
            }).length;
        }

        // Use PRESUPUESTO saldo for increments calculation
        const incrementVentas = remainingDaysCount > 0 ? presupuesto.Ventas.saldo / remainingDaysCount : 0;
        const incrementTransacciones = remainingDaysCount > 0 ? presupuesto.Transacciones.saldo / remainingDaysCount : 0;
        const incrementTQP = remainingDaysCount > 0 ? presupuesto.TQP.saldo / remainingDaysCount : 0;

        return {
            presupuesto,
            anoAnterior,
            yearType,
            remainingDays: remainingDaysCount,
            incrementVentas,
            incrementTransacciones,
            incrementTQP
        };
    }, [dataVentas, dataTransacciones, dataTQP, currentMonth, comparisonType, isAnnual, dateRange]);

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const getAlcanceColor = (percentage: number) => {
        if (percentage >= 100) return "text-green-600";
        if (percentage >= 90) return "text-orange-500";
        return "text-red-600";
    };

    if (!summary) {
        return (
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 mb-8">
                <p className="text-gray-400 text-center">Sin datos para este mes</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-3xl shadow-xl border border-gray-200 p-8 mb-8">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    Alcance Canal Todos {filterLocal}
                </h2>
                <p className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                    <span>Año: {new Date().getFullYear()}{isAnnual ? '' : ` - Mes: ${monthNames[currentMonth]}`}</span>
                    {dateRange && (
                        <>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1 text-xs text-gray-500 font-semibold">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(dateRange.startDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                                <span>-</span>
                                {new Date(dateRange.endDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </>
                    )}
                </p>
            </div>

            {/* Row 1: Two comparison tables side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Left: Contra PRESUPUESTO */}
                <div className="bg-white rounded-2xl shadow-md border border-blue-200 p-5">
                    <h3 className="text-base font-bold text-blue-700 mb-3">
                        <span className="bg-blue-100 rounded-lg px-3 py-1 text-sm">Presupuesto</span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b-2 border-gray-200">
                                    <th className="text-left py-2 px-2 text-xs font-bold text-gray-600 uppercase"></th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-green-700 uppercase">Ventas</th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-blue-700 uppercase">Trans.</th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-purple-700 uppercase">TQP</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">{isAnnual ? 'P. Año' : 'P. Mes'}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.Ventas.mes, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.Transacciones.mes, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.TQP.mes, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">P. Acum</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.Ventas.acum, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.Transacciones.acum, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.presupuesto.TQP.acum, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100 bg-blue-50">
                                    <td className="py-2 px-2 font-bold text-gray-800">Real</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.presupuesto.Ventas.real, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.presupuesto.Transacciones.real, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.presupuesto.TQP.real, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">Dif. Acum</td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.Ventas.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.presupuesto.Ventas.difAcum >= 0 ? '+' : ''}{fc(summary.presupuesto.Ventas.difAcum, 'Ventas')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.Transacciones.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.presupuesto.Transacciones.difAcum >= 0 ? '+' : ''}{fc(summary.presupuesto.Transacciones.difAcum, 'Transacciones')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.TQP.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.presupuesto.TQP.difAcum >= 0 ? '+' : ''}{fc(summary.presupuesto.TQP.difAcum, 'TQP')}
                                    </td>
                                </tr>
                                <tr className="border-b-2 border-gray-300 bg-yellow-50">
                                    <td className="py-3 px-2 font-bold text-gray-800 text-sm">Alcance</td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.presupuesto.Ventas.alcance)}`}>
                                        {formatPct100(summary.presupuesto.Ventas.alcance)}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.presupuesto.Transacciones.alcance)}`}>
                                        {formatPct100(summary.presupuesto.Transacciones.alcance)}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.presupuesto.TQP.alcance)}`}>
                                        {formatPct100(summary.presupuesto.TQP.alcance)}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-2 font-semibold text-gray-600">Saldo</td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.Ventas.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.presupuesto.Ventas.saldo), 'Ventas')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.Transacciones.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.presupuesto.Transacciones.saldo), 'Transacciones')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.presupuesto.TQP.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.presupuesto.TQP.saldo), 'TQP')}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Contra AÑO ANTERIOR */}
                <div className="bg-white rounded-2xl shadow-md border border-purple-200 p-5">
                    <h3 className="text-base font-bold text-purple-700 mb-3">
                        <span className="bg-purple-100 rounded-lg px-3 py-1 text-sm">
                            {summary.yearType}
                        </span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b-2 border-gray-200">
                                    <th className="text-left py-2 px-2 text-xs font-bold text-gray-600 uppercase"></th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-green-700 uppercase">Ventas</th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-blue-700 uppercase">Trans.</th>
                                    <th className="text-right py-2 px-2 text-xs font-bold text-purple-700 uppercase">TQP</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">{isAnnual ? 'Año' : 'Mes'}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.Ventas.mes, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.Transacciones.mes, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.TQP.mes, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">P. Acum</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.Ventas.acum, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.Transacciones.acum, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fc(summary.anoAnterior.TQP.acum, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100 bg-purple-50">
                                    <td className="py-2 px-2 font-bold text-gray-800">Real</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.anoAnterior.Ventas.real, 'Ventas')}</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.anoAnterior.Transacciones.real, 'Transacciones')}</td>
                                    <td className="py-2 px-2 text-right font-mono font-bold">{fc(summary.anoAnterior.TQP.real, 'TQP')}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-semibold text-gray-600">Dif. Acum</td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.Ventas.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.anoAnterior.Ventas.difAcum >= 0 ? '+' : ''}{fc(summary.anoAnterior.Ventas.difAcum, 'Ventas')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.Transacciones.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.anoAnterior.Transacciones.difAcum >= 0 ? '+' : ''}{fc(summary.anoAnterior.Transacciones.difAcum, 'Transacciones')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.TQP.difAcum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.anoAnterior.TQP.difAcum >= 0 ? '+' : ''}{fc(summary.anoAnterior.TQP.difAcum, 'TQP')}
                                    </td>
                                </tr>
                                <tr className="border-b-2 border-gray-300 bg-yellow-50">
                                    <td className="py-3 px-2 font-bold text-gray-800 text-sm">Alcance</td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.anoAnterior.Ventas.alcance)}`}>
                                        {formatPct100(summary.anoAnterior.Ventas.alcance)}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.anoAnterior.Transacciones.alcance)}`}>
                                        {formatPct100(summary.anoAnterior.Transacciones.alcance)}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-extrabold text-xl ${getAlcanceColor(summary.anoAnterior.TQP.alcance)}`}>
                                        {formatPct100(summary.anoAnterior.TQP.alcance)}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-2 font-semibold text-gray-600">Saldo</td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.Ventas.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.anoAnterior.Ventas.saldo), 'Ventas')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.Transacciones.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.anoAnterior.Transacciones.saldo), 'Transacciones')}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-mono font-bold ${summary.anoAnterior.TQP.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fc(Math.abs(summary.anoAnterior.TQP.saldo), 'TQP')}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
