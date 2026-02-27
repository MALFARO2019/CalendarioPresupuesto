import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { MODULES } from '../shared/config/modules';
import { ModuleCard } from '../shared/components/ModuleCard';
import type { GroupedModuleStats } from '../shared/types/modules';
import { getToken, API_BASE, getUser, fetchFechaLimite, fetchReports, fetchReportSubscriptions } from '../api';
import type { ModuleStats } from '../shared/types/modules';
import { useUserPreferences } from '../context/UserPreferences';
import { DashboardConfigModal } from '../components/dashboard/DashboardConfigModal';

interface DashboardProps {
    onNavigateToModule?: (moduleId: string) => void;
}

export function Dashboard({ onNavigateToModule }: DashboardProps) {
    const { formatPctValue, preferences } = useUserPreferences();
    const [presupuestoStats, setPresupuestoStats] = useState<GroupedModuleStats[]>([]);
    const [reportesStats, setReportesStats] = useState<ModuleStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingReportes, setIsLoadingReportes] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null);

    // Get default locales for soporte user
    const getDefaultLocales = (): string[] => {
        const user = getUser();
        if (user?.email === 'soporte@rostipolloscr.com') {
            return ['Corporativo', 'Restaurantes', 'Ventanitas', 'SSS'];
        }
        return [];
    };

    const dashboardLocales = preferences.dashboardLocales && preferences.dashboardLocales.length > 0
        ? preferences.dashboardLocales
        : getDefaultLocales();

    useEffect(() => {
        if (dashboardLocales.length === 0) return;


        // Fetch KPI stats for all configured locales using /api/tendencia (same as Anual view)
        const fetchMultiGroupStats = async () => {
            setIsLoading(true);
            try {
                const token = getToken();
                if (!token) return;

                const year = new Date().getFullYear();
                const startDate = `${year}-01-01`;
                // Use DB-driven fecha limite (MAX(Fecha) WHERE MontoReal > 0)
                const fechaLimiteFromDB = await fetchFechaLimite(year);
                const endDate = fechaLimiteFromDB || new Date().toISOString().split('T')[0];

                // Store date range for display
                setDateRange({ startDate, endDate });

                // Fetch data for each locale using /api/tendencia (same endpoint as Anual view)
                const results = await Promise.all(dashboardLocales.map(async (local) => {
                    const kpis = ['Ventas', 'Transacciones', 'TQP'];

                    // Fetch all 3 KPIs for this local in parallel
                    const kpiResults = await Promise.all(kpis.map(async (kpi) => {
                        const params = new URLSearchParams({
                            startDate,
                            endDate,
                            kpi,
                            channel: 'Total',
                            yearType: 'anterior',
                            local,
                            comparativePeriod: preferences.comparativePeriod
                        });

                        const url = `${API_BASE}/tendencia?${params}`;
                        const response = await fetch(url, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (!response.ok) throw new Error(`Failed to fetch ${kpi} for ${local}`);

                        const data = await response.json();
                        return { kpi, data };
                    }));

                    // Build stats object for this local
                    const stats: any = {};
                    kpiResults.forEach(({ kpi, data }) => {
                        console.log(`🔍 Dashboard received for ${local} + ${kpi}:`, {
                            hasResumen: !!data.resumen,
                            hasResumenMultiKpi: !!data.resumenMultiKpi,
                            resumenMultiKpiKeys: data.resumenMultiKpi ? Object.keys(data.resumenMultiKpi) : [],
                            resumenPct: data.resumen?.pctPresupuesto,
                            multiKpiPct: data.resumenMultiKpi?.[kpi]?.pctPresupuesto
                        });

                        // IMPORTANT: Use resumen (main query result) instead of resumenMultiKpi
                        // This ensures we use the same calculation as Anual view
                        // The resumen object contains the aggregated data for the specific KPI requested
                        if (data.resumen) {
                            stats[kpi] = {
                                pctPresupuesto: data.resumen.pctPresupuesto,
                                pctAnterior: data.resumen.pctAnterior,
                                trendPresupuesto: data.resumen.trendPresupuesto,
                                trendAnterior: data.resumen.trendAnterior
                            };
                        }
                    });

                    return { local, stats };
                }));

                console.log('✅ Dashboard data loaded via /api/tendencia:', results.length, 'locales');

                // Transform the response into GroupedModuleStats format with trends
                const stats: GroupedModuleStats[] = results.map((result: any) => {
                    const kpis = ['Ventas', 'Transacciones', 'TQP'];
                    const moduleStats = kpis.flatMap(kpi => {
                        const kpiData = result.stats[kpi];
                        if (!kpiData) return [];

                        const kpiLabel = kpi === 'TQP' ? 'TQP' : kpi.substring(0, 4);
                        return [
                            {
                                label: `${kpiLabel} Ppto`,
                                value: formatPctValue(kpiData.pctPresupuesto),
                                color: kpiData.pctPresupuesto >= 1.0 ? 'green' as const :
                                    kpiData.pctPresupuesto >= 0.9 ? 'yellow' as const : 'red' as const,
                                trend: kpiData.trendPresupuesto
                            },
                            {
                                label: `${kpiLabel} Ant.`,
                                value: formatPctValue(kpiData.pctAnterior),
                                color: kpiData.pctAnterior >= 1.0 ? 'green' as const :
                                    kpiData.pctAnterior >= 0.9 ? 'yellow' as const : 'red' as const,
                                trend: kpiData.trendAnterior
                            }
                        ];
                    });

                    return {
                        groupName: result.local,
                        stats: moduleStats
                    };
                });

                setPresupuestoStats(stats);
            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMultiGroupStats();
    }, [dashboardLocales, preferences.comparativePeriod, formatPctValue]);

    useEffect(() => {
        const user = getUser();
        if (!user?.accesoReportes && !user?.esAdmin) return;

        const loadReportStats = async () => {
            setIsLoadingReportes(true);
            try {
                const [reps, subs] = await Promise.all([
                    fetchReports(),
                    fetchReportSubscriptions()
                ]);

                const categories = [...new Set(reps.map(r => r.Categoria || 'Otros'))].sort();

                const stats: ModuleStats[] = categories.map(cat => {
                    const reportsInCat = reps.filter(r => (r.Categoria || 'Otros') === cat);
                    const reportIds = new Set(reportsInCat.map(r => r.ID));

                    const subCount = subs.filter(s => reportIds.has(s.ReporteID)).length;

                    return {
                        label: cat,
                        value: subCount.toString(),
                        color: subCount > 0 ? 'green' : 'gray'
                    };
                });

                setReportesStats(stats);
            } catch (err) {
                console.error('Error fetching report stats:', err);
            } finally {
                setIsLoadingReportes(false);
            }
        };

        loadReportStats();
    }, []);

    const handleModuleClick = (moduleId: string) => {
        if (onNavigateToModule) {
            onNavigateToModule(moduleId);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900">
            {/* Top Bar */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-orange-500/20 shadow-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-white">Dashboard</h1>
                            <p className="text-xs sm:text-sm text-orange-200 mt-1">
                                Selecciona un módulo para comenzar
                            </p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                            <button
                                onClick={() => setShowConfigModal(true)}
                                className="flex items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 backdrop-blur-sm border border-indigo-500/30 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-indigo-100 transition-colors touch-target"
                            >
                                <Settings className="w-4 h-4" />
                                <span className="hidden sm:inline">Configurar KPIs</span>
                            </button>
                            <div className="bg-orange-500/20 backdrop-blur-sm border border-orange-500/30 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-orange-100">
                                📅 {new Date().toLocaleDateString('es-CR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
                {/* Welcome Section */}
                <div className="mb-6 sm:mb-10">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                        Bienvenido a KPIs Rosti
                    </h2>
                    <p className="text-sm sm:text-base text-orange-200">
                        Accede a métricas y análisis de tus restaurantes
                    </p>
                </div>

                {/* Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {(() => {
                        const user = getUser();

                        // Filter modules based on user permissions
                        const accessibleModules = MODULES.filter(module => {
                            // Admins have access to all modules
                            if (user?.esAdmin) return true;

                            // Check specific module permission
                            const permissionKey = `acceso${module.permissionKey.charAt(0).toUpperCase()}${module.permissionKey.slice(1)}`;
                            return user?.[permissionKey] === true;
                        });

                        // Render modules or empty state
                        if (accessibleModules.length > 0) {
                            return accessibleModules.map(module => (
                                <ModuleCard
                                    key={module.id}
                                    module={module}
                                    stats={module.id === 'presupuesto' ? presupuestoStats : module.id === 'reportes' ? reportesStats : []}
                                    isLoading={module.id === 'presupuesto' ? isLoading : module.id === 'reportes' ? isLoadingReportes : false}
                                    onClick={() => handleModuleClick(module.id)}
                                    dateRange={module.id === 'presupuesto' && dateRange ? dateRange : undefined}
                                />
                            ));
                        } else {
                            return (
                                <div className="col-span-2 text-center py-12 bg-slate-800/50 rounded-2xl border border-orange-500/20">
                                    <p className="text-orange-200 text-lg font-semibold">
                                        No tienes acceso a ningún módulo.
                                    </p>
                                    <p className="text-orange-300/70 text-sm mt-2">
                                        Contacta al administrador para obtener permisos.
                                    </p>
                                </div>
                            );
                        }
                    })()}
                </div>
            </div>

            {/* Configuration Modal */}
            <DashboardConfigModal
                isOpen={showConfigModal}
                onClose={() => setShowConfigModal(false)}
            />
        </div>
    );
}
