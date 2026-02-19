import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

type PresetType = 'year' | 'month' | 'week' | 'last7' | 'last30' | 'custom';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onDateChange: (start: string, end: string) => void;
    year: number;
}

export function DateRangePicker({ startDate, endDate, onDateChange, year }: DateRangePickerProps) {
    const [preset, setPreset] = useState<PresetType>('month');
    const [customStart, setCustomStart] = useState(startDate);
    const [customEnd, setCustomEnd] = useState(endDate);

    const applyPreset = (presetType: PresetType) => {
        setPreset(presetType);
        const now = new Date();
        let start: Date, end: Date;

        switch (presetType) {
            case 'year':
                start = new Date(year, 0, 1);
                end = new Date(year, 11, 31);
                break;
            case 'month':
                start = new Date(year, now.getMonth(), 1);
                end = new Date(year, now.getMonth() + 1, 0);
                break;
            case 'week':
                // Current week (Monday to Sunday)
                const today = new Date(year, now.getMonth(), now.getDate());
                const dayOfWeek = today.getDay();
                const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
                start = new Date(today);
                start.setDate(today.getDate() - diff);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'last7':
                end = new Date(year, now.getMonth(), now.getDate());
                start = new Date(end);
                start.setDate(end.getDate() - 6);
                break;
            case 'last30':
                end = new Date(year, now.getMonth(), now.getDate());
                start = new Date(end);
                start.setDate(end.getDate() - 29);
                break;
            default:
                return;
        }

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        onDateChange(formatDate(start), formatDate(end));
    };

    const handleCustomApply = () => {
        if (customStart && customEnd && customStart <= customEnd) {
            onDateChange(customStart, customEnd);
        }
    };

    return (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-gray-800">Rango de Fechas</h3>
            </div>

            {/* Preset buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                {[
                    { key: 'year' as PresetType, label: 'Año' },
                    { key: 'month' as PresetType, label: 'Mes' },
                    { key: 'week' as PresetType, label: 'Semana' },
                    { key: 'last7' as PresetType, label: 'Últimos 7 días' },
                    { key: 'last30' as PresetType, label: 'Últimos 30 días' },
                    { key: 'custom' as PresetType, label: 'Personalizado' }
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => key === 'custom' ? setPreset('custom') : applyPreset(key)}
                        className={`touch-target px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${preset === key
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Custom date inputs */}
            {preset === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                            Desde
                        </label>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            max={customEnd}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                            Hasta
                        </label>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            min={customStart}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <button
                        onClick={handleCustomApply}
                        disabled={!customStart || !customEnd || customStart > customEnd}
                        className="touch-target px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Aplicar
                    </button>
                </div>
            )}

            {/* Current selection display */}
            <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                    <span className="font-semibold">Rango seleccionado:</span>{' '}
                    {new Date(startDate).toLocaleDateString('es-CR')} - {new Date(endDate).toLocaleDateString('es-CR')}
                </p>
            </div>
        </div>
    );
}
