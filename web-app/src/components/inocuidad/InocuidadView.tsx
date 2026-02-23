import React, { useState, useEffect } from 'react';
import { getToken, API_BASE } from '../../api';
import { InocuidadTendencia } from './InocuidadTendencia';
import { InocuidadCalor } from './InocuidadCalor';

interface FormSource {
    SourceID: number;
    Alias: string;
    TableName: string;
    UltimaSync: string;
    TotalRespuestas: number;
    Activo: boolean;
}

interface InocuidadViewProps {
    year: number;
    groups: string[];
    individualStores: string[];
    filterLocal: string;
    onFilterLocalChange: (v: string) => void;
    activeSubTab: 'tendencia' | 'calor';
}

export const InocuidadView: React.FC<InocuidadViewProps> = ({
    year, groups, individualStores, filterLocal, onFilterLocalChange, activeSubTab
}) => {
    const [sources, setSources] = useState<FormSource[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
    const [sourcesLoading, setSourcesLoading] = useState(true);

    // Load available form sources and auto-select the first one
    useEffect(() => {
        const loadSources = async () => {
            try {
                const token = getToken();
                if (!token) return;
                const response = await fetch(`${API_BASE}/inocuidad/sources`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) return;
                const data = await response.json();
                setSources(data);
                // Auto-select first source (the Inocuidad form)
                if (data.length > 0 && !selectedSourceId) {
                    setSelectedSourceId(data[0].SourceID);
                }
            } catch (e) {
                console.warn('Could not load inocuidad sources:', e);
            } finally {
                setSourcesLoading(false);
            }
        };
        loadSources();
    }, []);

    // No sources found
    if (!sourcesLoading && sources.length === 0) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <p className="text-amber-700 font-semibold mb-2">No hay formularios configurados</p>
                <p className="text-amber-600 text-sm">
                    Configure al menos un formulario en Administración → Forms y sincronice los datos.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Content based on active sub-tab from the top nav */}
            {activeSubTab === 'tendencia' && (
                <InocuidadTendencia
                    year={year}
                    groups={groups}
                    individualStores={individualStores}
                    filterLocal={filterLocal}
                    onFilterLocalChange={onFilterLocalChange}
                    sourceId={selectedSourceId}
                />
            )}

            {activeSubTab === 'calor' && (
                <InocuidadCalor
                    year={year}
                    groups={groups}
                    individualStores={individualStores}
                    filterLocal={filterLocal}
                    onFilterLocalChange={onFilterLocalChange}
                    sourceId={selectedSourceId}
                />
            )}
        </div>
    );
};
