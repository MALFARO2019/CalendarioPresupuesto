import React, { useState, useCallback } from 'react';
import { getUser, type ModeloConfig } from '../../api';
import { ModeloConfig as ModeloConfigView } from './ModeloConfig';
import { ConsolidadoGrid } from './ConsolidadoGrid';
import { AjusteChart } from './AjusteChart';
import { VersionesPanel } from './VersionesPanel';
import { BitacoraPanel } from './BitacoraPanel';
import { ReferenciasPanel } from './ReferenciasPanel';

type SubTab = 'config' | 'consolidado' | 'ajustes' | 'versiones' | 'bitacora' | 'referencias';

const TAB_CONFIG: { id: SubTab; label: string; icon: string; permiso: string }[] = [
    { id: 'config', label: 'Configuración', icon: '⚙️', permiso: 'verConfigModelo' },
    { id: 'consolidado', label: 'Consolidado', icon: '📊', permiso: 'verConsolidadoMensual' },
    { id: 'ajustes', label: 'Ajustes', icon: '📈', permiso: 'verAjustePresupuesto' },
    { id: 'versiones', label: 'Versiones', icon: '📋', permiso: 'verVersiones' },
    { id: 'bitacora', label: 'Bitácora', icon: '📝', permiso: 'verBitacora' },
    { id: 'referencias', label: 'Referencias', icon: '🔗', permiso: 'verReferencias' },
];

export const ModeloPresupuestoAdmin: React.FC = () => {
    const [selectedConfig, setSelectedConfig] = useState<ModeloConfig | null>(null);
    const [activeTab, setActiveTab] = useState<SubTab>('config');

    const user = getUser();
    const isAdmin = user?.esAdmin;

    // Filter visible tabs based on permissions
    const visibleTabs = TAB_CONFIG.filter(tab => {
        if (isAdmin) return true;
        return (user as any)?.[tab.permiso];
    });

    const handleConfigSelect = useCallback((config: ModeloConfig | null) => {
        setSelectedConfig(config);
    }, []);

    const nombrePresupuesto = selectedConfig?.nombrePresupuesto || 'Sin configuración';
    const anoModelo = selectedConfig?.anoModelo || new Date().getFullYear();

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl shadow-sm">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Modelo de Presupuesto</h2>
                        <p className="text-sm text-gray-500">
                            {selectedConfig
                                ? `${nombrePresupuesto} — Año ${anoModelo}`
                                : 'Seleccione o cree una configuración'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
                {/* Mobile select */}
                <div className="md:hidden p-3 border-b border-gray-100">
                    <select
                        value={activeTab}
                        onChange={e => setActiveTab(e.target.value as SubTab)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium"
                    >
                        {visibleTabs.map(tab => (
                            <option key={tab.id} value={tab.id}>{tab.icon} {tab.label}</option>
                        ))}
                    </select>
                </div>

                {/* Desktop tabs */}
                <div className="hidden md:flex border-b border-gray-100 px-4 overflow-x-auto">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id
                                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-4 md:p-6">
                    {activeTab === 'config' && (
                        <ModeloConfigView
                            onConfigSelect={handleConfigSelect}
                            selectedConfigId={selectedConfig?.id || null}
                        />
                    )}
                    {activeTab !== 'config' && !selectedConfig && (
                        <div className="text-center py-10 text-gray-400 text-sm">
                            Vaya a la pestaña <strong>Configuración</strong> y seleccione una configuración primero.
                        </div>
                    )}
                    {activeTab === 'consolidado' && selectedConfig && (
                        <ConsolidadoGrid anoModelo={anoModelo} nombrePresupuesto={nombrePresupuesto} />
                    )}
                    {activeTab === 'ajustes' && selectedConfig && (
                        <AjusteChart anoModelo={anoModelo} nombrePresupuesto={nombrePresupuesto} />
                    )}
                    {activeTab === 'versiones' && selectedConfig && (
                        <VersionesPanel nombrePresupuesto={nombrePresupuesto} />
                    )}
                    {activeTab === 'bitacora' && selectedConfig && (
                        <BitacoraPanel nombrePresupuesto={nombrePresupuesto} />
                    )}
                    {activeTab === 'referencias' && selectedConfig && (
                        <ReferenciasPanel nombrePresupuesto={nombrePresupuesto} anoModelo={anoModelo} />
                    )}
                </div>
            </div>
        </div>
    );
};
