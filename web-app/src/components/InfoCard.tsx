import React from 'react';

export const InfoCard: React.FC = () => {
    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-md border border-blue-200 p-6 mt-8">
            <div className="flex items-start gap-4">
                <div className="bg-blue-500 rounded-full p-3 flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800 mb-3">Información de Comparaciones</h3>
                    <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <p><span className="font-semibold">Año Anterior:</span> Compara día natural 1 con 1 (ej: 1 de enero 2026 vs 1 de enero 2025)</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <p><span className="font-semibold">Año Anterior Ajustado:</span> Compara día de la semana lunes con lunes (ej: todos los lunes de enero 2026 vs todos los lunes de enero 2025)</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <p><span className="font-semibold">PA:</span> Presupuesto Acumulado</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
