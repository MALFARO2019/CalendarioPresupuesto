import React from 'react';
import type { ModuleConfig, ModuleStats, GroupedModuleStats } from '../../shared/types/modules';
import { TrendIndicator } from './TrendIndicator';

interface ModuleCardProps {
    module: ModuleConfig;
    stats?: ModuleStats[] | GroupedModuleStats[];
    isLoading?: boolean;
    onClick?: () => void;
    dateRange?: { startDate: string; endDate: string };
}

// Type guard to check if stats are grouped
function isGroupedStats(stats: ModuleStats[] | GroupedModuleStats[]): stats is GroupedModuleStats[] {
    return stats.length > 0 && 'groupName' in stats[0];
}

export function ModuleCard({ module, stats = [], isLoading = false, onClick, dateRange }: ModuleCardProps) {
    const isGrouped = isGroupedStats(stats);

    const getColorClass = (color?: 'green' | 'red' | 'yellow') => {
        if (!color) return 'text-gray-900';
        if (color === 'green') return 'text-green-600';
        if (color === 'red') return 'text-red-600';
        return 'text-yellow-600';
    };

    // Helper to organize stats into rows by KPI
    const organizeStatsByKPI = (stats: ModuleStats[]) => {
        const kpis = ['Vent', 'Tran', 'TQP'];
        return kpis.map(kpi => {
            const pptoStat = stats.find(s => s.label.includes(kpi) && s.label.includes('Ppto'));
            const antStat = stats.find(s => s.label.includes(kpi) && s.label.includes('Ant'));
            return { kpi, ppto: pptoStat, ant: antStat };
        }).filter(row => row.ppto && row.ant);
    };

    return (
        <div
            className="module-card bg-white rounded-2xl p-5 shadow-lg cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl border-2 border-transparent relative overflow-hidden"
            onClick={onClick}
            style={{
                '--module-gradient': module.gradient,
            } as React.CSSProperties}
        >
            {/* Top accent bar */}
            <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ background: module.gradient }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md"
                    style={{ background: module.gradient }}
                >
                    {module.icon}
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-0.5">
                        {module.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                        {module.description}
                    </p>
                    {dateRange && (
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 font-semibold">
                            <span className="flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(dateRange.startDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                            </span>
                            <span>-</span>
                            <span>{new Date(dateRange.endDate + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Display */}
            {isLoading ? (
                // Loading spinner
                <div className="bg-gray-50 rounded-xl p-6 mb-4 min-h-[150px] flex flex-col items-center justify-center gap-3">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-transparent rounded-full border-t-orange-500 border-r-orange-500 animate-spin"></div>
                    </div>
                    <p className="text-gray-500 text-sm font-medium">Cargando datos...</p>
                </div>
            ) : stats.length > 0 ? (
                <div className="mb-4">
                    {isGrouped ? (
                        // Multi-group display (for presupuesto with multiple locales) - 2 COLUMN GRID
                        <div className="grid grid-cols-2 gap-2">
                            {(stats as GroupedModuleStats[]).map((group, idx) => {
                                const rows = organizeStatsByKPI(group.stats);
                                return (
                                    <div key={idx} className="bg-gray-50 rounded-lg p-2">
                                        <div className="text-[9px] font-bold text-gray-600 uppercase mb-1.5 tracking-wide truncate" title={group.groupName}>
                                            {group.groupName}
                                        </div>
                                        <div className="space-y-1.5">
                                            {rows.map((row, rowIdx) => (
                                                <div key={rowIdx} className="grid grid-cols-[auto_1fr_1fr] gap-1 items-center">
                                                    <div className="text-[8px] font-bold text-gray-500 uppercase w-7">
                                                        {row.kpi}
                                                    </div>
                                                    <div className="text-center bg-white rounded px-0.5 py-1">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className={`text-sm font-black leading-none ${getColorClass(row.ppto?.color)}`}>
                                                                {row.ppto?.value}
                                                            </div>
                                                            {row.ppto?.trend && (
                                                                <TrendIndicator trend={row.ppto.trend} size="sm" />
                                                            )}
                                                        </div>
                                                        <div className="text-[8px] text-gray-700 font-bold uppercase mt-0.5">
                                                            Ppto
                                                        </div>
                                                    </div>
                                                    <div className="text-center bg-white rounded px-0.5 py-1">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className={`text-sm font-black leading-none ${getColorClass(row.ant?.color)}`}>
                                                                {row.ant?.value}
                                                            </div>
                                                            {row.ant?.trend && (
                                                                <TrendIndicator trend={row.ant.trend} size="sm" />
                                                            )}
                                                        </div>
                                                        <div className="text-[8px] text-gray-700 font-bold uppercase mt-0.5">
                                                            Ant.
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Single group display (original 3-column grid)
                        <div className="grid grid-cols-3 gap-2">
                            {(stats as ModuleStats[]).map((stat, idx) => (
                                <div key={idx} className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <div className={`text-base font-black ${getColorClass(stat.color)}`}>
                                            {stat.value}
                                        </div>
                                        {stat.trend && (
                                            <TrendIndicator trend={stat.trend} size="sm" />
                                        )}
                                    </div>
                                    <div className="text-[9px] text-gray-500 font-semibold uppercase tracking-wide">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-gray-50 rounded-xl p-4 mb-4 min-h-[80px] flex items-center justify-center">
                    <p className="text-gray-400 text-xs font-medium">Vista previa del módulo</p>
                </div>
            )}

            {/* Button */}
            <button
                className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{ background: module.gradient }}
            >
                Ver Módulo
            </button>

            <style>{`
        .module-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: var(--module-gradient);
        }
      `}</style>
        </div>
    );
}
