import React from 'react';
import { BarChart3 } from 'lucide-react';

export type GroupByType = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year';

interface GroupingSelectorProps {
    groupBy: GroupByType;
    onGroupByChange: (groupBy: GroupByType) => void;
    startDate: string;
    endDate: string;
}

export function GroupingSelector({ groupBy, onGroupByChange, startDate, endDate }: GroupingSelectorProps) {
    // Calculate which grouping options are valid based on date range
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));

    const options: { key: GroupByType; label: string; minDays: number }[] = [
        { key: 'day', label: 'Diario', minDays: 1 },
        { key: 'week', label: 'Semanal', minDays: 7 },
        { key: 'month', label: 'Mensual', minDays: 28 },
        { key: 'quarter', label: 'Trimestral', minDays: 90 },
        { key: 'semester', label: 'Semestral', minDays: 180 },
        { key: 'year', label: 'Anual', minDays: 365 }
    ];

    // Filter options to show only valid ones based on range
    const validOptions = options.filter(opt => daysDiff >= opt.minDays);

    return (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-gray-800">Agrupación de Datos</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {options.map(({ key, label, minDays }) => {
                    const isValid = daysDiff >= minDays;
                    const isSelected = groupBy === key;

                    return (
                        <button
                            key={key}
                            onClick={() => isValid && onGroupByChange(key)}
                            disabled={!isValid}
                            className={`touch-target px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${isSelected
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                    : isValid
                                        ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        : 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                }`}
                            title={!isValid ? `Requiere al menos ${minDays} días en el rango` : ''}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {validOptions.length < options.length && (
                <p className="mt-3 text-xs text-gray-500 italic">
                    💡 Algunas opciones no están disponibles para el rango seleccionado
                </p>
            )}
        </div>
    );
}
