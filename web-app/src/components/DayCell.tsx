import React from 'react';
import type { BudgetRecord } from '../mockData';
import { useUserPreferences } from '../context/UserPreferences';
import { useFormatCurrency } from '../utils/formatters';

interface DayCellProps {
    day: number;
    data?: BudgetRecord;
    isCurrentMonth: boolean;
    comparisonType?: string;
    kpi?: string;
}

export const DayCell: React.FC<DayCellProps> = ({ day, data, isCurrentMonth, comparisonType = 'Presupuesto', kpi = 'Ventas' }) => {
    if (!isCurrentMonth) {
        return <div className="h-28 bg-gray-50 border border-gray-200"></div>;
    }

    if (!data) {
        return (
            <div className="h-28 border border-gray-200 p-2 flex flex-col bg-white">
                <span className="text-gray-300 font-bold text-base">{day}</span>
            </div>
        );
    }

    const { Monto: presupuesto, MontoReal: real, MontoAnterior: anterior, MontoAnteriorAjustado: anteriorAjustado } = data;

    // Determine target based on comparison type
    const isBudgetComparison = comparisonType === 'Presupuesto';
    const isAdjustedComparison = comparisonType === 'Año Anterior Ajustado';

    let target = presupuesto; // default to budget
    if (!isBudgetComparison) {
        target = isAdjustedComparison ? anteriorAjustado : anterior;
    }

    const percentage = target > 0 ? (real / target) * 100 : 0;

    // Determine color based on percentage
    let barColor = 'bg-red-500';
    if (percentage >= 100) {
        barColor = 'bg-green-500';
    } else if (percentage >= 90) {
        barColor = 'bg-orange-400';
    }

    const fc = useFormatCurrency();

    const { formatPct100 } = useUserPreferences();

    return (
        <div className="h-28 border border-gray-200 flex flex-col bg-white hover:shadow-md transition-shadow">
            {/* Day Number */}
            <div className="px-2 pt-1.5 pb-1">
                <span className="text-gray-900 font-bold text-base">{day}</span>
            </div>

            {/* Metrics */}
            <div className="flex-1 px-2 flex flex-col justify-center gap-0.5">
                <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-bold text-gray-500">P:</span>
                    <span className="text-xs font-semibold text-gray-700 font-mono">
                        {fc(target, kpi)}
                    </span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-bold text-gray-500">R:</span>
                    <span className="text-xs font-semibold text-gray-900 font-mono">
                        {fc(real, kpi)}
                    </span>
                </div>
            </div>


            {/* Percentage Bar at Bottom */}
            <div className="flex items-center h-7 border-t border-gray-200">
                {real > 0 ? (
                    <div className={`h-full ${barColor} flex items-center justify-center px-2 text-white font-bold text-xs min-w-[45px]`}>
                        {formatPct100(percentage)}
                    </div>
                ) : (
                    <div className="h-full bg-gray-100 flex items-center justify-center px-2 text-gray-400 font-medium text-xs w-full">
                        Sin datos
                    </div>
                )}
            </div>
        </div>
    );
};
