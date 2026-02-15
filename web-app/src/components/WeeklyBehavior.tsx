import React from 'react';
import type { BudgetRecord } from '../mockData';
import { formatCurrencyCompact } from '../utils/formatters';

interface WeeklyBehaviorProps {
    data: BudgetRecord[];
    kpi: string;
    comparisonType: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
}

export const WeeklyBehavior: React.FC<WeeklyBehaviorProps> = ({ data, kpi, comparisonType, yearType }) => {
    // Group data by week number
    // For simplicity, we can assume data is for a single month and group by week index 
    // or calculate ISO week. Given mock data, let's group by 7-day chunks or Week number if calculated.
    // Let's crudely group by (day-1) / 7 for this month view

    const weeklyData = [];
    const weeksCount = Math.ceil(data.length / 7); // Approx

    for (let i = 0; i < weeksCount; i++) {
        // Get ALL days in this week (including those without real data for budget calculation)
        const allWeekDays = data.filter(d => {
            return Math.ceil(d.Dia / 7) === i + 1;
        });

        // Get only days with real data for actual calculations
        const weekRecordsWithData = allWeekDays.filter(d => d.MontoReal > 0);

        // Calculate budget from ALL days in the week
        const totalBudget = allWeekDays.reduce((sum, r) => sum + r.Monto, 0);

        // Calculate real only from days with data
        const totalReal = weekRecordsWithData.reduce((sum, r) => sum + r.MontoReal, 0);

        // Only calculate comparison if there is real data
        let totalComparison = 0;
        if (weekRecordsWithData.length > 0) {
            if (comparisonType === 'Presupuesto') {
                totalComparison = weekRecordsWithData.reduce((sum, r) => sum + r.Monto, 0);
            } else if (comparisonType === 'Año Anterior Ajustado') {
                totalComparison = weekRecordsWithData.reduce((sum, r) => sum + (r.MontoAnteriorAjustado || 0), 0);
            } else {
                totalComparison = weekRecordsWithData.reduce((sum, r) => sum + r.MontoAnterior, 0);
            }
        }

        const diff = totalReal - totalComparison;
        const diffPercent = totalComparison > 0 ? (diff / totalComparison) * 100 : 0;
        const totalLastYear = yearType === 'Año Anterior Ajustado'
            ? weekRecordsWithData.reduce((sum, r) => sum + (r.MontoAnteriorAjustado || 0), 0)
            : weekRecordsWithData.reduce((sum, r) => sum + r.MontoAnterior, 0);
        const growth = totalLastYear > 0 ? ((totalReal - totalLastYear) / totalLastYear) * 100 : 0;

        weeklyData.push({
            week: i + 1,
            budget: totalBudget,
            real: totalReal,
            diff,
            diffPercent,
            lastYear: totalLastYear,
            growth,
            hasData: weekRecordsWithData.length > 0
        });
    }



    return (
        <div className="flex-1 overflow-x-auto">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Comportamiento de semanas</h3>
            <table className="w-full min-w-[400px]">
                <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 text-left font-bold uppercase tracking-wider">Semana</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Ppto</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Real</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Diff %</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Crec %</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {weeklyData.map((week, idx) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="py-3 font-bold text-gray-500">W{week.week}</td>
                            <td className="py-3 text-right font-mono text-gray-600">{formatCurrencyCompact(week.budget, kpi)}</td>
                            <td className="py-3 text-right font-mono font-bold text-gray-800">{formatCurrencyCompact(week.real, kpi)}</td>
                            <td className="py-3 text-right">
                                {week.hasData ? (() => {
                                    // Compliance = (Real / Budget) * 100
                                    // Diff% = (Real - Budget) / Budget * 100
                                    // Relationship: Diff% = Compliance - 100
                                    // Logic: Compliance < 90 (Diff < -10) -> Red
                                    //        Compliance < 100 (Diff < 0) -> Orange
                                    //        Compliance >= 100 (Diff >= 0) -> Green

                                    let badgeColor = 'bg-green-100 text-green-700';
                                    if (week.diffPercent < -10) {
                                        badgeColor = 'bg-red-100 text-red-700';
                                    } else if (week.diffPercent < 0) {
                                        badgeColor = 'bg-orange-100 text-orange-700';
                                    }

                                    return (
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                                            {week.diffPercent > 0 ? '+' : ''}{week.diffPercent.toFixed(1)}%
                                        </span>
                                    );
                                })() : (
                                    <span className="px-2 py-1 text-xs font-medium text-gray-400">-</span>
                                )}
                            </td>
                            <td className="py-3 text-right font-bold text-gray-500">
                                {week.hasData ? (
                                    <span className={week.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                        {week.growth > 0 ? '+' : ''}{week.growth.toFixed(1)}%
                                    </span>
                                ) : (
                                    <span className="text-gray-400">-</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
