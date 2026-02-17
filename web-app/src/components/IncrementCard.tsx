import React, { useMemo } from 'react';
import type { BudgetRecord } from '../mockData';
import { useFormatCurrency } from '../utils/formatters';

interface IncrementCardProps {
    data: BudgetRecord[];
    currentDate: Date;
    dateRange?: { startDate: string; endDate: string };
}

export const IncrementCard: React.FC<IncrementCardProps> = ({ data, currentDate, dateRange }) => {
    const fc = useFormatCurrency();
    const incrementsData = useMemo(() => {
        const today = new Date();
        const currentMonth = currentDate.getMonth() + 1; // 1-indexed for data
        const currentYear = currentDate.getFullYear();
        const viewingMonth = currentDate.getMonth(); // 0-indexed for Date constructor 
        const currentMonthNum = today.getMonth(); // today's month (0-indexed)
        const currentYearNum = today.getFullYear();

        // Filter for current month
        const monthData = data.filter(d => d.Mes === currentMonth && d.Año === currentYear);

        // Calculate remaining days properly for future months
        let remainingDays;
        if (currentYear > currentYearNum || (currentYear === currentYearNum && viewingMonth > currentMonthNum)) {
            // Future month: all days in the month
            remainingDays = new Date(currentYear, viewingMonth + 1, 0).getDate();
        } else {
            // Current month: count only future days without data
            remainingDays = monthData.filter(d => d.Dia > today.getDate()).length;
        }

        // Calculate totals for the month
        const totalBudgetVentas = monthData.reduce((sum, r) => sum + r.Monto, 0);
        const totalRealVentas = monthData.reduce((sum, r) => sum + r.MontoReal, 0);
        const saldoVentas = totalBudgetVentas - totalRealVentas;

        // For now, using same data structure for all KPIs
        // In reality, you'd need separate queries for Transacciones and TQP
        const incrementVentas = remainingDays > 0 ? saldoVentas / remainingDays : 0;

        return {
            remainingDays,
            saldoVentas,
            incrementVentas,
            // Placeholder values - in real implementation, fetch from different KPI queries
            saldoTransacciones: Math.round(saldoVentas / 11525), // using TQP approximation
            incrementTransacciones: Math.round((saldoVentas / 11525) / (remainingDays || 1)),
            saldoTQP: 11525, // Placeholder
            incrementTQP: Math.round(11525 / (remainingDays || 1))
        };
    }, [data, currentDate]);

    return (
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800">Saldo e Incrementos Necesarios</h3>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Proyección para alcanzar el presupuesto</span>
                        {dateRange && (
                            <>
                                <span className="text-gray-400">•</span>
                                <span className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {new Date(dateRange.startDate).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                                    <span>-</span>
                                    {new Date(dateRange.endDate).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <div className="bg-indigo-100 rounded-xl px-4 py-3">
                    <span className="text-xs text-indigo-600 font-bold uppercase tracking-wide">Días Restantes</span>
                    <p className="text-3xl font-bold text-indigo-700 mt-1">{incrementsData.remainingDays}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Ventas */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-200">
                    <h4 className="text-sm font-bold text-green-700 uppercase tracking-wide mb-3">Ventas</h4>
                    <div className="space-y-2">
                        <div>
                            <span className="text-xs text-gray-600">Saldo</span>
                            <p className="text-xl font-bold text-gray-900 font-mono">
                                {fc(Math.abs(incrementsData.saldoVentas), 'Ventas')}
                            </p>
                        </div>
                        <div className="pt-2 border-t border-green-200">
                            <span className="text-xs text-gray-600">Incremento/día</span>
                            <p className="text-2xl font-bold text-green-700 font-mono">
                                {fc(Math.abs(incrementsData.incrementVentas), 'Ventas')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Transacciones */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-700 uppercase tracking-wide mb-3">Transacciones</h4>
                    <div className="space-y-2">
                        <div>
                            <span className="text-xs text-gray-600">Saldo</span>
                            <p className="text-xl font-bold text-gray-900 font-mono">
                                {fc(Math.abs(incrementsData.saldoTransacciones), 'Transacciones')}
                            </p>
                        </div>
                        <div className="pt-2 border-t border-blue-200">
                            <span className="text-xs text-gray-600">Incremento/día</span>
                            <p className="text-2xl font-bold text-blue-700 font-mono">
                                {fc(Math.abs(incrementsData.incrementTransacciones), 'Transacciones')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* TQP */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-200">
                    <h4 className="text-sm font-bold text-purple-700 uppercase tracking-wide mb-3">Tiquete Promedio</h4>
                    <div className="space-y-2">
                        <div>
                            <span className="text-xs text-gray-600">Saldo</span>
                            <p className="text-xl font-bold text-gray-900 font-mono">
                                {fc(Math.abs(incrementsData.saldoTQP), 'TQP')}
                            </p>
                        </div>
                        <div className="pt-2 border-t border-purple-200">
                            <span className="text-xs text-gray-600">Incremento/día</span>
                            <p className="text-2xl font-bold text-purple-700 font-mono">
                                {fc(Math.abs(incrementsData.incrementTQP), 'TQP')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
