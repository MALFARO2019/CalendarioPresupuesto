import React from 'react';
import type { BudgetRecord } from '../mockData';
import { useFormatCurrency } from '../utils/formatters';

interface WeekDayBehaviorProps {
    data: BudgetRecord[];
    kpi: string;
    comparisonType: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
}

export const WeekDayBehavior: React.FC<WeekDayBehaviorProps> = ({ data, kpi, comparisonType, yearType }) => {
    const fc = useFormatCurrency();
    // Days mapping: JS getDay() returns 0=Sun, we want Mon-Sun order
    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const displayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sun=0 in JS getDay

    // Calculate stats per day of the week
    const stats = displayOrder.map((dayIndex, idx) => {
        // Filter for this day of week AND only days with real data
        const dayRecords = data.filter(d => {
            const date = new Date(d.Año, d.Mes - 1, d.Dia);
            return date.getDay() === dayIndex && d.MontoReal > 0;
        });

        const totalReal = dayRecords.reduce((sum, r) => sum + r.MontoReal, 0);
        const totalBudget = dayRecords.reduce((sum, r) => sum + r.Monto, 0);

        let totalComparison = totalBudget;
        if (comparisonType !== 'Presupuesto') {
            totalComparison = comparisonType === 'Año Anterior Ajustado'
                ? dayRecords.reduce((sum, r) => sum + (r.MontoAnteriorAjustado || 0), 0)
                : dayRecords.reduce((sum, r) => sum + r.MontoAnterior, 0);
        }

        const diffPercent = totalComparison > 0 ? ((totalReal - totalComparison) / totalComparison) * 100 : 0;
        const totalLastYear = yearType === 'Año Anterior Ajustado'
            ? dayRecords.reduce((sum, r) => sum + (r.MontoAnteriorAjustado || 0), 0)
            : dayRecords.reduce((sum, r) => sum + r.MontoAnterior, 0);
        const growth = totalLastYear > 0 ? ((totalReal - totalLastYear) / totalLastYear) * 100 : 0;

        return {
            dayName: dayNames[idx],
            budget: totalBudget,
            real: totalReal,
            diffPercent,
            growth
        };
    });



    return (
        <div className="flex-1 overflow-x-auto">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Comportamiento día semana</h3>
            <table className="w-full min-w-[400px]">
                <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 text-left font-bold uppercase tracking-wider">Día</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Ppto</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Real</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Diff %</th>
                        <th className="pb-2 text-right font-bold uppercase tracking-wider">Crec %</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {stats.map((stat, idx) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="py-3 font-bold text-gray-500">{stat.dayName}</td>
                            <td className="py-3 text-right font-mono text-gray-600">{fc(stat.budget, kpi)}</td>
                            <td className="py-3 text-right font-mono font-bold text-gray-800">{fc(stat.real, kpi)}</td>
                            <td className="py-3 text-right">
                                {(() => {
                                    let badgeColor = 'bg-green-100 text-green-700';
                                    if (stat.diffPercent < -10) {
                                        badgeColor = 'bg-red-100 text-red-700';
                                    } else if (stat.diffPercent < 0) {
                                        badgeColor = 'bg-orange-100 text-orange-700';
                                    }

                                    return (
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                                            {stat.diffPercent > 0 ? '+' : ''}{stat.diffPercent.toFixed(1)}%
                                        </span>
                                    );
                                })()}
                            </td>
                            <td className="py-3 text-right font-bold text-gray-500">
                                {stat.growth.toFixed(1)}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
