/**
 * KPIs Rosti - Module Type Definitions
 * Defines types for the modular architecture
 */

export interface ModuleConfig {
    id: string;
    name: string;
    subtitle?: string;
    description: string;
    icon: string;
    color: string;
    gradient: string;
    route: string;
    permissionKey: keyof ModulePermissions;
}

export interface ModulePermissions {
    presupuesto: boolean;
    tiempos: boolean;
    evaluaciones: boolean;
    inventarios: boolean;
    reportes: boolean;
}

export interface UserWithModuleAccess {
    email: string;
    nombre?: string;
    esAdmin: boolean;
    accesoTendencia?: boolean;
    accesoTactica?: boolean;
    accesoEventos?: boolean;
    // New module permissions
    accesoPresupuesto?: boolean;
    accesoTiempos?: boolean;
    accesoEvaluaciones?: boolean;
    accesoInventarios?: boolean;
    accesoReportes?: boolean;
}

export interface ModuleRoute {
    path: string;
    element: React.ReactNode;
    children?: ModuleRoute[];
}

export interface ModuleStats {
    label: string;
    value: string | number;
    color?: 'green' | 'red' | 'yellow';
    trend?: {
        direction: 'up' | 'down' | 'neutral';
        percentage: number;
        previousValue: number;
    };
}

export type ComparativePeriod = 'Week' | 'Month' | 'Year';

export interface GroupedModuleStats {
    groupName: string;
    stats: ModuleStats[];
}

export interface ModuleCardProps {
    module: ModuleConfig;
    stats?: ModuleStats[] | GroupedModuleStats[];
    onClick?: () => void;
}
