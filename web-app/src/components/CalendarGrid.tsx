import React from 'react';
import type { BudgetRecord } from '../mockData';
import { DayCell } from './DayCell';
import { getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { useUserPreferences } from '../context/UserPreferences';
import { useFormatCurrency } from '../utils/formatters';

interface CalendarGridProps {
    data: BudgetRecord[];
    month: number;
    year: number;
    comparisonType: string;
    kpi: string;
    eventsByDate?: Record<string, { id: number; evento: string; esFeriado: boolean; esInterno: boolean }[]>;
    eventosAjusteByDate?: Record<string, { id: number; evento: string; esFeriado: boolean; esInterno: boolean }[]>;
}

// L = Lunes, K = Martes, M = Miércoles, J, V, S, D
const DAYS_OF_WEEK = ['L', 'K', 'M', 'J', 'V', 'S', 'D'];

export const CalendarGrid: React.FC<CalendarGridProps> = ({ data, month, year, comparisonType, kpi, eventsByDate = {}, eventosAjusteByDate = {} }) => {
    const { formatPct100 } = useUserPreferences();
    const fc = useFormatCurrency();
    // Data is already filtered for the month by parent component
    const monthData = data;
    const totalDays = getDaysInMonth(new Date(year, month));

    // Calculate padding days
    const firstDayOfMonth = startOfMonth(new Date(year, month));
    const startDayIndex = (getDay(firstDayOfMonth) + 6) % 7;

    const cells = [];

    // Padding for previous month
    for (let i = 0; i < startDayIndex; i++) {
        cells.push(<DayCell key={`pad-${i}`} day={0} isCurrentMonth={false} comparisonType={comparisonType} />);
    }

    // Days of month
    console.log('🗓️ Creating calendar cells for', totalDays, 'days');
    console.log('📊 Month data available:', monthData.length, 'records');
    if (monthData.length > 0) {
        console.log('📝 Sample month record:', monthData[0]);
    }

    for (let d = 1; d <= totalDays; d++) {
        const dayRecord = monthData.find(r => r.Dia === d);
        if (d <= 3) {
            console.log(`Day ${d}: found record?`, dayRecord ? 'YES' : 'NO', dayRecord);
        }
        // Build date key for events
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
        const dayEvents = eventsByDate[dateKey] || [];
        const dayAjusteEvents = eventosAjusteByDate[dateKey] || [];
        cells.push(
            <div key={`day-${d}`} className="relative">
                <DayCell
                    day={d}
                    data={dayRecord}
                    isCurrentMonth={true}
                    comparisonType={comparisonType}
                    kpi={kpi}
                />
                {/* Regular + SharePoint events */}
                {dayEvents.length > 0 && (
                    <div className="absolute bottom-0.5 left-0 right-0 px-0.5 flex flex-col gap-0.5">
                        {dayEvents.slice(0, 2).map((ev, i) => (
                            <div key={i} className="group/ev relative">
                                <div
                                    className={`text-[8px] leading-tight font-semibold truncate rounded px-0.5 cursor-default ${ev.esFeriado
                                        ? 'bg-red-500 text-white'
                                        : 'bg-amber-400 text-amber-900'
                                        }`}
                                >
                                    {ev.evento}
                                </div>
                                {/* Rich tooltip */}
                                <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover/ev:flex flex-col min-w-[160px] max-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl p-2 text-left pointer-events-none">
                                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded mb-1 inline-block ${ev.esFeriado ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                        {ev.esFeriado ? '🔴 Feriado' : '🟡 Evento'}
                                    </div>
                                    <p className="text-xs font-semibold text-gray-800 leading-snug">{ev.evento}</p>
                                </div>
                            </div>
                        ))}
                        {dayEvents.length > 2 && (
                            <div className="group/more relative">
                                <div className="text-[7px] text-gray-500 font-bold text-center cursor-default">+{dayEvents.length - 2} más</div>
                                {/* Show all events tooltip on the +N chip */}
                                <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover/more:flex flex-col min-w-[160px] max-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl p-2 pointer-events-none">
                                    {dayEvents.map((ev2, j) => (
                                        <div key={j} className="flex items-start gap-1.5 py-1 border-b last:border-0 border-gray-100">
                                            <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${ev2.esFeriado ? 'bg-red-500' : 'bg-amber-400'
                                                }`} />
                                            <p className="text-[10px] text-gray-800 font-medium leading-snug">{ev2.evento}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {/* Adjustment events (red line style) */}
                {(dayAjusteEvents.length > 0 && dayEvents.length === 0) && (
                    <div className="absolute bottom-0.5 left-0 right-0 px-0.5 flex flex-col gap-0.5">
                        {dayAjusteEvents.slice(0, 2).map((ev, i) => (
                            <div key={`aj-${i}`} className="group/ev relative">
                                <div className="text-[8px] leading-tight font-semibold truncate rounded px-0.5 cursor-default bg-red-600 text-white">
                                    {ev.evento}
                                </div>
                                <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover/ev:flex flex-col min-w-[160px] max-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl p-2 text-left pointer-events-none">
                                    <div className="text-[10px] font-bold px-1.5 py-0.5 rounded mb-1 inline-block bg-red-100 text-red-700">🔴 Ajuste</div>
                                    <p className="text-xs font-semibold text-gray-800 leading-snug">{ev.evento}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Adjustment events when regular events also present - show below */}
                {(dayAjusteEvents.length > 0 && dayEvents.length > 0) && (
                    dayAjusteEvents.slice(0, 1).map((ev, i) => (
                        <div key={`aj2-${i}`} className="absolute bottom-0.5 right-0.5 group/ev">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-600 border border-white cursor-default" />
                            <div className="absolute bottom-full right-0 mb-1 z-50 hidden group-hover/ev:flex flex-col min-w-[160px] max-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl p-2 text-left pointer-events-none">
                                <div className="text-[10px] font-bold px-1.5 py-0.5 rounded mb-1 inline-block bg-red-100 text-red-700">🔴 Ajuste</div>
                                {dayAjusteEvents.map((aev, j) => (
                                    <p key={j} className="text-xs font-semibold text-gray-800 leading-snug">{aev.evento}</p>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    }

    // Padding for next month
    const totalCells = cells.length;
    const remainingCells = 42 - totalCells;
    if (remainingCells > 0 && totalCells < 42) {
        for (let i = 0; i < remainingCells; i++) {
            cells.push(<DayCell key={`pad-end-${i}`} day={0} isCurrentMonth={false} />);
        }
    }

    // Calculate column totals (per day of week: L=0, K=1, M=2 ... D=6)
    const isBudgetComparison = comparisonType === 'Presupuesto';
    const isAdjustedComparison = comparisonType === 'Año Anterior Ajustado';

    const columnTotals = DAYS_OF_WEEK.map((_, colIndex) => {
        // colIndex: 0=Monday(1), 1=Tuesday(2), ...6=Sunday(0)
        const jsDayIndex = colIndex === 6 ? 0 : colIndex + 1; // convert to JS getDay

        // Filter for this day of week AND only days with real data
        const dayRecords = monthData.filter(d => {
            const date = new Date(d.Año, d.Mes - 1, d.Dia);
            return date.getDay() === jsDayIndex && d.MontoReal > 0;
        });

        const totalP = dayRecords.reduce((sum, r) => sum + r.Monto, 0);
        const totalR = dayRecords.reduce((sum, r) => sum + r.MontoReal, 0);
        const totalPA = dayRecords.reduce((sum, r) => sum + (r.MontoAcumulado || r.Monto), 0);

        let target = totalP;
        if (!isBudgetComparison) {
            if (isAdjustedComparison) {
                target = dayRecords.reduce((sum, r) => sum + (r.MontoAnteriorAjustado || 0), 0);
            } else {
                target = dayRecords.reduce((sum, r) => sum + r.MontoAnterior, 0);
            }
        }

        const pct = target > 0 ? (totalR / target) * 100 : 0;

        return { totalP, totalR, totalPA, pct };
    });



    const getPercentColor = (pct: number) => {
        if (pct === 0) return 'bg-gray-200 text-gray-500'; // No data - neutral color
        if (pct >= 100) return 'bg-green-500 text-white';
        if (pct >= 90) return 'bg-orange-400 text-white';
        return 'bg-red-500 text-white';
    };

    return (
        <div className="w-full bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
            {/* Header Row */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
                {DAYS_OF_WEEK.map((day, index) => (
                    <div
                        key={index}
                        className="py-4 text-center font-bold text-xs text-gray-500 uppercase tracking-widest"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 bg-gray-50/50">
                {cells}
            </div>

            {/* Column Totals Footer */}
            <div className="border-t-2 border-gray-300">
                {/* Row P */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className="px-2 py-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400">P </span>
                            <span className="text-xs font-semibold text-gray-600 font-mono">{fc(col.totalP, kpi)}</span>
                        </div>
                    ))}
                </div>
                {/* Row R */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className="px-2 py-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400">R </span>
                            <span className="text-xs font-bold text-gray-800 font-mono">{fc(col.totalR, kpi)}</span>
                        </div>
                    ))}
                </div>
                {/* Row PA */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className="px-2 py-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400">PA </span>
                            <span className="text-xs font-semibold text-gray-500 font-mono">{fc(col.totalPA, kpi)}</span>
                        </div>
                    ))}
                </div>
                {/* Row % with colors */}
                <div className="grid grid-cols-7">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className={`px-2 py-2 text-center font-bold text-xs ${getPercentColor(col.pct)}`}>
                            {formatPct100(col.pct)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
