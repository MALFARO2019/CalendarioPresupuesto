import React from 'react';
import type { BudgetRecord } from '../mockData';
import { DayCell } from './DayCell';
import { getDaysInMonth, startOfMonth, getDay } from 'date-fns';

interface CalendarGridProps {
    data: BudgetRecord[];
    month: number;
    year: number;
    comparisonType: string;
    kpi: string;
}

// L = Lunes, K = Martes, M = Miércoles, J, V, S, D
const DAYS_OF_WEEK = ['L', 'K', 'M', 'J', 'V', 'S', 'D'];

export const CalendarGrid: React.FC<CalendarGridProps> = ({ data, month, year, comparisonType, kpi }) => {
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
        cells.push(
            <DayCell
                key={`day-${d}`}
                day={d}
                data={dayRecord}
                isCurrentMonth={true}
                comparisonType={comparisonType}
                kpi={kpi}
            />
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

    const formatNumber = (val: number) => {
        const isTransaction = kpi === 'Transacciones';
        const formatted = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` :
            val >= 1000 ? `${(val / 1000).toFixed(0)}k` :
                val.toLocaleString('es-CR');

        return isTransaction ? formatted : `₡${formatted}`;
    };

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
                            <span className="text-xs font-semibold text-gray-600 font-mono">{formatNumber(col.totalP)}</span>
                        </div>
                    ))}
                </div>
                {/* Row R */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className="px-2 py-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400">R </span>
                            <span className="text-xs font-bold text-gray-800 font-mono">{formatNumber(col.totalR)}</span>
                        </div>
                    ))}
                </div>
                {/* Row PA */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className="px-2 py-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400">PA </span>
                            <span className="text-xs font-semibold text-gray-500 font-mono">{formatNumber(col.totalPA)}</span>
                        </div>
                    ))}
                </div>
                {/* Row % with colors */}
                <div className="grid grid-cols-7">
                    {columnTotals.map((col, idx) => (
                        <div key={idx} className={`px-2 py-2 text-center font-bold text-xs ${getPercentColor(col.pct)}`}>
                            {col.pct.toFixed(0)}%
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
