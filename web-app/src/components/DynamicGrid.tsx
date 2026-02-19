import React, { useState, useMemo } from 'react';
import { useFormatCurrency } from '../utils/formatters';
import { useUserPreferences } from '../context/UserPreferences';
import { ArrowUpDown } from 'lucide-react';

interface PeriodData {
    periodo: string;
    periodoInicio: string;
    periodoFin: string;
    presupuesto: number;
    presupuestoConDatos: number;
    real: number;
    anterior: number;
    anteriorAjustado: number;
    pctAlcance: number;
    pctAnterior: number;
    pctAnteriorAjustado: number;
}

interface DynamicGridProps {
    periods: PeriodData[];
    totals: {
        presupuesto: number;
        presupuestoConDatos: number;
        real: number;
        anterior: number;
        anteriorAjustado: number;
        pctAlcance: number;
        pctAnterior: number;
        pctAnteriorAjustado: number;
    };
    kpi: string;
    groupBy: string;
}

type SortField = 'periodo' | 'presupuesto' | 'real' | 'alcance' | 'anterior' | 'vsAnterior' | 'anteriorAjust' | 'vsAnteriorAjust';

export function DynamicGrid({ periods, totals, kpi, groupBy }: DynamicGridProps) {
    const fc = useFormatCurrency();
    const { preferences } = useUserPreferences();
    const [sortBy, setSortBy] = useState<SortField>('periodo');

    const formatPct = (pct: number) => {
        const value = preferences.pctDisplayMode === 'differential' ? (pct - 1) * 100 : pct * 100;
        const sign = preferences.pctDisplayMode === 'differential' && value > 0 ? '+' : '';
        return `${sign}${value.toFixed(preferences.pctDecimals)}%`;
    };

    const getAlcanceColor = (pct: number) => {
        if (pct >= 1) return 'text-green-600 bg-green-50';
        if (pct >= 0.9) return 'text-orange-500 bg-orange-50';
        return 'text-red-600 bg-red-50';
    };

    const getVsAnteriorColor = (pct: number) => {
        if (pct >= 1) return 'text-green-600';
        return 'text-red-600';
    };

    // Sort periods based on selected field
    const sortedPeriods = useMemo(() => {
        const sorted = [...periods];

        switch (sortBy) {
            case 'periodo':
                sorted.sort((a, b) => a.periodoInicio.localeCompare(b.periodoInicio));
                break;
            case 'presupuesto':
                sorted.sort((a, b) => b.presupuesto - a.presupuesto);
                break;
            case 'real':
                sorted.sort((a, b) => b.real - a.real);
                break;
            case 'alcance':
                sorted.sort((a, b) => b.pctAlcance - a.pctAlcance);
                break;
            case 'anterior':
                sorted.sort((a, b) => b.anterior - a.anterior);
                break;
            case 'vsAnterior':
                sorted.sort((a, b) => b.pctAnterior - a.pctAnterior);
                break;
            case 'anteriorAjust':
                sorted.sort((a, b) => b.anteriorAjustado - a.anteriorAjustado);
                break;
            case 'vsAnteriorAjust':
                sorted.sort((a, b) => b.pctAnteriorAjustado - a.pctAnteriorAjustado);
                break;
        }

        return sorted;
    }, [periods, sortBy]);

    if (!periods || periods.length === 0) {
        return (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
                <p className="text-gray-500">No hay datos disponibles para el rango seleccionado.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            {/* Sort selector */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">ORDENAR POR</span>
                </div>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortField)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
                >
                    <option value="periodo">Periodo</option>
                    <option value="alcance">% Ppto (Alcance)</option>
                    <option value="real">Real</option>
                    <option value="presupuesto">Presupuesto</option>
                    <option value="vsAnterior">vs Anterior %</option>
                    <option value="anterior">Año Anterior</option>
                    <option value="vsAnteriorAjust">vs Anterior Ajust. %</option>
                    <option value="anteriorAjust">Año Anterior Ajust.</option>
                </select>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Periodo
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Presupuesto
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                P. Con Datos
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Real
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Alcance
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Anterior
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                vs Anterior
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Anterior Ajust.
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                vs Ant. Ajust.
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedPeriods.map((period, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                                    {period.periodo}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {fc(period.presupuesto, kpi)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {fc(period.presupuestoConDatos, kpi)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                                    {fc(period.real, kpi)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={`inline-block px-2 py-1 rounded-md text-sm font-bold ${getAlcanceColor(period.pctAlcance)}`}>
                                        {formatPct(period.pctAlcance)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {fc(period.anterior, kpi)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={`text-sm font-semibold ${getVsAnteriorColor(period.pctAnterior)}`}>
                                        {formatPct(period.pctAnterior)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {isFinite(period.anteriorAjustado) ? fc(period.anteriorAjustado, kpi) : '₡0'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={`text-sm font-semibold ${getVsAnteriorColor(period.pctAnteriorAjustado)}`}>
                                        {isFinite(period.pctAnteriorAjustado) ? formatPct(period.pctAnteriorAjustado) : '0%'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-t-2 border-indigo-200">
                        <tr>
                            <td className="px-4 py-4 text-sm font-bold text-gray-900 uppercase">
                                Total
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-gray-900">
                                {fc(totals.presupuesto, kpi)}
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-gray-900">
                                {fc(totals.presupuestoConDatos, kpi)}
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-gray-900">
                                {fc(totals.real, kpi)}
                            </td>
                            <td className="px-4 py-4 text-right">
                                <span className={`inline-block px-2 py-1 rounded-md text-sm font-bold ${getAlcanceColor(totals.pctAlcance)}`}>
                                    {formatPct(totals.pctAlcance)}
                                </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-gray-900">
                                {fc(totals.anterior, kpi)}
                            </td>
                            <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${getVsAnteriorColor(totals.pctAnterior)}`}>
                                    {formatPct(totals.pctAnterior)}
                                </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-gray-900">
                                {isFinite(totals.anteriorAjustado) ? fc(totals.anteriorAjustado, kpi) : '₡0'}
                            </td>
                            <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${getVsAnteriorColor(totals.pctAnteriorAjustado)}`}>
                                    {isFinite(totals.pctAnteriorAjustado) ? formatPct(totals.pctAnteriorAjustado) : '0%'}
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
