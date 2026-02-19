import React, { useState } from 'react';
import type { BudgetRecord } from '../mockData';
import { useFormatCurrency } from '../utils/formatters';

type SortField = 'week' | 'budget' | 'real' | 'diffPercent' | 'growth';

interface WeeklyBehaviorProps {
    data: BudgetRecord[];
    kpi: string;
    comparisonType: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
}

export const WeeklyBehavior: React.FC<WeeklyBehaviorProps> = ({ data, kpi, comparisonType, yearType }) => {
    const fc = useFormatCurrency();
    const [sortField, setSortField] = useState<SortField>('week');
    const [sortAsc, setSortAsc] = useState(true);

    // Group data by week number
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

    // Sort weeklyData
    const sortedWeeklyData = [...weeklyData].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'week') cmp = a.week - b.week;
        else if (sortField === 'budget') cmp = a.budget - b.budget;
        else if (sortField === 'real') cmp = a.real - b.real;
        else if (sortField === 'diffPercent') cmp = a.diffPercent - b.diffPercent;
        else if (sortField === 'growth') cmp = a.growth - b.growth;
        return sortAsc ? cmp : -cmp;
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(prev => !prev);
        } else {
            setSortField(field);
            setSortAsc(false); // default descending when picking a metric
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="ml-0.5 text-gray-300">↕</span>;
        return <span className="ml-0.5 text-indigo-500">{sortAsc ? '↑' : '↓'}</span>;
    };

    const thClass = (field: SortField) =>
        `pb-2 text-right font-bold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-500 transition-colors ${sortField === field ? 'text-indigo-500' : ''}`;

    const sortOptions: { value: SortField; label: string }[] = [
        { value: 'week', label: 'Semana' },
        { value: 'budget', label: 'Presupuesto' },
        { value: 'real', label: 'Real' },
        { value: 'diffPercent', label: 'Diff %' },
        { value: 'growth', label: 'Crec %' },
    ];

    return (
        <div className="flex-1 overflow-x-auto">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Comportamiento de semanas</h3>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-medium whitespace-nowrap">Ordenar por:</label>
                    <select
                        value={sortField}
                        onChange={e => { setSortField(e.target.value as SortField); setSortAsc(e.target.value === 'week'); }}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                        onClick={() => setSortAsc(p => !p)}
                        title={sortAsc ? 'Ascendente' : 'Descendente'}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                        {sortAsc ? '↑ Asc' : '↓ Desc'}
                    </button>
                </div>
            </div>
            <table className="w-full min-w-[400px]">
                <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th
                            className={`pb-2 text-left font-bold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-500 transition-colors ${sortField === 'week' ? 'text-indigo-500' : ''}`}
                            onClick={() => handleSort('week')}
                        >
                            Semana<SortIcon field="week" />
                        </th>
                        <th className={thClass('budget')} onClick={() => handleSort('budget')}>
                            Ppto<SortIcon field="budget" />
                        </th>
                        <th className={thClass('real')} onClick={() => handleSort('real')}>
                            Real<SortIcon field="real" />
                        </th>
                        <th className={thClass('diffPercent')} onClick={() => handleSort('diffPercent')}>
                            Diff %<SortIcon field="diffPercent" />
                        </th>
                        <th className={thClass('growth')} onClick={() => handleSort('growth')}>
                            Crec %<SortIcon field="growth" />
                        </th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {sortedWeeklyData.map((week, idx) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="py-3 font-bold text-gray-500">W{week.week}</td>
                            <td className="py-3 text-right font-mono text-gray-600">{fc(week.budget, kpi)}</td>
                            <td className="py-3 text-right font-mono font-bold text-gray-800">{fc(week.real, kpi)}</td>
                            <td className="py-3 text-right">
                                {week.hasData ? (() => {
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
