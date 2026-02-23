/**
 * Module Configuration
 * Central configuration for all KPIs Rosti modules
 */

import type { ModuleConfig } from '../types/modules';

export const MODULES: ModuleConfig[] = [
    {
        id: 'presupuesto',
        name: 'Alcance de Presupuesto',
        subtitle: 'Acumulado del Año',
        description: 'Mensual, Anual, Tendencia',
        icon: '🔥',
        color: '#FF4535',
        gradient: 'linear-gradient(135deg, #FF4535 0%, #FF6B5C 100%)',
        route: '/presupuesto',
        permissionKey: 'presupuesto'
    },
    {
        id: 'tiempos',
        name: 'Tiempos',
        description: 'Cocina, Atención, Servicio',
        icon: '⏱️',
        color: '#F5A623',
        gradient: 'linear-gradient(135deg, #F5A623 0%, #FFB84D 100%)',
        route: '/tiempos',
        permissionKey: 'tiempos'
    },
    {
        id: 'evaluaciones',
        name: 'Evaluaciones',
        description: 'Calidad, Inocuidad, Visitas',
        icon: '✅',
        color: '#2C3E50',
        gradient: 'linear-gradient(135deg, #2C3E50 0%, #34495E 100%)',
        route: '/evaluaciones',
        permissionKey: 'evaluaciones'
    },
    {
        id: 'inocuidad',
        name: 'Inocuidad',
        description: 'Tendencia, Mapa de Calor',
        icon: '🛡️',
        color: '#0D9488',
        gradient: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
        route: '/inocuidad',
        permissionKey: 'evaluaciones'
    },
    {
        id: 'inventarios',
        name: 'Control de Inventarios',
        description: 'Inventarios, Mermas, Fabricación',
        icon: '📦',
        color: '#E67E22',
        gradient: 'linear-gradient(135deg, #E67E22 0%, #F39C12 100%)',
        route: '/inventarios',
        permissionKey: 'inventarios'
    }
];

/**
 * Get modules that the user has access to
 */
export function getAccessibleModules(userPermissions: Record<string, boolean>): ModuleConfig[] {
    return MODULES.filter(module => {
        // Admin has access to all modules
        if (userPermissions.esAdmin) return true;

        // Check specific permission using permissionKey
        const permKey = `acceso${module.permissionKey.charAt(0).toUpperCase()}${module.permissionKey.slice(1)}`;
        return userPermissions[permKey] === true;
    });
}
