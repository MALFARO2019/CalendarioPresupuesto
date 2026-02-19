import React, { useState } from 'react';
import type { BudgetRecord } from '../mockData';
import { useFormatCurrency } from '../utils/formatters';

type SortField = 'dayName' | 'budget' | 'real' | 'diffPercent' | 'growth';

interface WeekDayBehaviorProps {
    data: BudgetRecord[];
    kpi: string;
    comparisonType: string;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
}

export const WeekDayBehavior: React.FC<WeekDayBehaviorProps> = ({ data, kpi, comparisonType, yearType }) => {
    const fc = useFormatCurrency();
    const [sortField, setSortField] = useState<SortField>('dayName');
    const [sortAsc, setSortAsc] = useState(true);

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
            dayOrder: idx, // keep natural order reference
            budget: totalBudget,
            real: totalReal,
            diffPercent,
            growth
        };
    });

    // Sort stats
    const sortedStats = [...stats].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'dayName') cmp = a.dayOrder - b.dayOrder;
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
        { value: 'dayName', label: 'Día' },
        { value: 'budget', label: 'Presupuesto' },
        { value: 'real', label: 'Real' },
        { value: 'diffPercent', label: 'Diff %' },
        { value: 'growth', label: 'Crec %' },
    ];

    return (
        <div className="flex-1 overflow-x-auto">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Comportamiento día semana</h3>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-medium whitespace-nowrap">Ordenar por:</label>
                    <select
                        value={sortField}
                        onChange={e => { setSortField(e.target.value as SortField); setSortAsc(e.target.value === 'dayName'); }}
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
                            className={`pb-2 text-left font-bold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-500 transition-colors ${sortField === 'dayName' ? 'text-indigo-500' : ''}`}
                            onClick={() => handleSort('dayName')}
                        >
                            Día<SortIcon field="dayName" />
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
                    {sortedStats.map((stat, idx) => (
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
