import React from 'react';

interface FilterBarProps {
    year: number;
    setYear: (year: number) => void;
    filterLocal: string;
    setFilterLocal: (val: string) => void;
    filterCanal: string;
    setFilterCanal: (val: string) => void;
    filterKpi: string;
    setFilterKpi: (val: string) => void;
    filterType: string;
    setFilterType: (val: string) => void;
    yearType: 'Año Anterior' | 'Año Anterior Ajustado';
    setYearType: (val: 'Año Anterior' | 'Año Anterior Ajustado') => void;
    groups?: string[];
    individualStores?: string[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
    year,
    filterLocal, setFilterLocal,
    filterCanal, setFilterCanal,
    filterKpi, setFilterKpi,
    filterType, setFilterType,
    yearType, setYearType,
    groups = [],
    individualStores = []
}) => {

    const canales = ['Todos', 'Salón', 'Llevar', 'Express', 'AutoPollo', 'UberEats', 'ECommerce', 'WhatsApp'];

    return (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-gray-100 mb-4 sm:mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-6">
                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Año</label>
                    <div className="relative">
                        <select
                            value={year}
                            disabled
                            className="block w-full rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed shadow-sm px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-sm appearance-none transition-smooth touch-target"
                        >
                            <option value={2026}>2026</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Local</label>
                    <select
                        value={filterLocal}
                        onChange={(e) => setFilterLocal(e.target.value)}
                        className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-smooth hover:border-indigo-300 touch-target"
                    >
                        <option value="">Seleccionar...</option>
                        {groups.length > 0 && (
                            <optgroup label="Grupos">
                                {groups.map(group => (
                                    <option key={group} value={group}>{group}</option>
                                ))}
                            </optgroup>
                        )}
                        {individualStores.length > 0 && (
                            <optgroup label="Locales">
                                {individualStores.map(store => (
                                    <option key={store} value={store}>{store}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">KPI</label>
                    <select
                        value={filterKpi}
                        onChange={(e) => setFilterKpi(e.target.value)}
                        className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-smooth hover:border-indigo-300 touch-target"
                    >
                        <option value="Ventas">Ventas</option>
                        <option value="Transacciones">Transacciones</option>
                        <option value="TQP">TQP</option>
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Canal</label>
                    <select
                        value={filterCanal}
                        onChange={(e) => setFilterCanal(e.target.value)}
                        className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-smooth hover:border-indigo-300 touch-target"
                    >
                        {canales.map(canal => (
                            <option key={canal} value={canal}>{canal}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Comparar con</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-smooth hover:border-indigo-300 touch-target"
                    >
                        <option value="Presupuesto">Presupuesto</option>
                        <option value="Año Anterior">Año Anterior</option>
                        <option value="Año Anterior Ajustado">Año Anterior Ajustado</option>
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Tipo Año</label>
                    <select
                        value={yearType}
                        onChange={(e) => setYearType(e.target.value as 'Año Anterior' | 'Año Anterior Ajustado')}
                        className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-smooth hover:border-indigo-300 touch-target"
                    >
                        <option value="Año Anterior">Natural</option>
                        <option value="Año Anterior Ajustado">Ajustado</option>
                    </select>
                </div>
            </div>
        </div>
    );
};
