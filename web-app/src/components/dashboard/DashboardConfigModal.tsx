import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useUserPreferences } from '../../context/UserPreferences';
import { fetchStores } from '../../api';
import { getUser } from '../../api';
import type { ComparativePeriod } from '../../shared/types/modules';

interface DashboardConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DashboardConfigModal({ isOpen, onClose }: DashboardConfigModalProps) {
    const { preferences, setDashboardLocales, setComparativePeriod } = useUserPreferences();
    const [availableGroups, setAvailableGroups] = useState<string[]>([]);
    const [availableStores, setAvailableStores] = useState<string[]>([]);
    const [selectedLocales, setSelectedLocales] = useState<string[]>(preferences.dashboardLocales || []);
    const [comparativePeriod, setLocalComparativePeriod] = useState<ComparativePeriod>(preferences.comparativePeriod);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadStores();
            setSelectedLocales(preferences.dashboardLocales || getDefaultLocalesForUser());
            setLocalComparativePeriod(preferences.comparativePeriod);
        }
    }, [isOpen, preferences.dashboardLocales, preferences.comparativePeriod]);

    const getDefaultLocalesForUser = (): string[] => {
        const user = getUser();
        if (user?.email === 'soporte@rostipolloscr.com') {
            return ['Corporativo', 'Restaurantes', 'Ventanitas', 'SSS'];
        }
        return [];
    };

    const loadStores = async () => {
        try {
            setLoading(true);
            const data = await fetchStores();
            setAvailableGroups(data.groups);
            setAvailableStores(data.individuals);
        } catch (err) {
            console.error('Error loading stores:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = (local: string) => {
        if (selectedLocales.length >= 5) return;
        if (!selectedLocales.includes(local)) {
            setSelectedLocales([...selectedLocales, local]);
        }
        setShowDropdown(false);
    };

    const handleRemove = (local: string) => {
        setSelectedLocales(selectedLocales.filter(l => l !== local));
    };

    const handleSave = () => {
        setDashboardLocales(selectedLocales);
        setComparativePeriod(comparativePeriod);
        onClose();
    };

    const allOptions = [...availableGroups, ...availableStores];
    const filteredOptions = allOptions.filter(opt => !selectedLocales.includes(opt));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Configurar Dashboard KPIs</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-4">
                    Configura los locales y el periodo de comparación para mostrar KPIs y tendencias.
                </p>

                {/* Comparative Period Selector */}
                <div className="mb-5">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                        Periodo Comparativo
                    </label>
                    <p className="text-xs text-gray-500 mb-2.5">
                        Selecciona el periodo para calcular tendencias y comparaciones
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {(['Week', 'Month', 'Year'] as const).map((period) => (
                            <button
                                key={period}
                                onClick={() => setLocalComparativePeriod(period)}
                                className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all ${comparativePeriod === period
                                        ? 'bg-indigo-500 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {period === 'Week' ? 'Semana' : period === 'Month' ? 'Mes' : 'Año'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-200 my-5"></div>

                {/* Selected Locales */}
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                        Locales Seleccionados ({selectedLocales.length}/5)
                    </label>
                    <div className="space-y-2">
                        {selectedLocales.length === 0 ? (
                            <div className="text-sm text-gray-400 italic py-2">
                                No has seleccionado ningún local aún
                            </div>
                        ) : (
                            selectedLocales.map((local) => (
                                <div
                                    key={local}
                                    className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2"
                                >
                                    <span className="text-sm font-medium text-gray-900">{local}</span>
                                    <button
                                        onClick={() => handleRemove(local)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Add Locale Dropdown */}
                {selectedLocales.length < 5 && (
                    <div className="mb-6 relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Local
                        </button>

                        {showDropdown && (
                            <div className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                                {filteredOptions.length === 0 ? (
                                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                        No hay más opciones disponibles
                                    </div>
                                ) : (
                                    <>
                                        {availableGroups.filter(g => !selectedLocales.includes(g)).length > 0 && (
                                            <>
                                                <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0">
                                                    Grupos
                                                </div>
                                                {availableGroups
                                                    .filter(g => !selectedLocales.includes(g))
                                                    .map(group => (
                                                        <button
                                                            key={group}
                                                            onClick={() => handleAdd(group)}
                                                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors text-sm"
                                                        >
                                                            {group}
                                                        </button>
                                                    ))}
                                            </>
                                        )}
                                        {availableStores.filter(s => !selectedLocales.includes(s)).length > 0 && (
                                            <>
                                                <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0">
                                                    Locales
                                                </div>
                                                {availableStores
                                                    .filter(s => !selectedLocales.includes(s))
                                                    .map(store => (
                                                        <button
                                                            key={store}
                                                            onClick={() => handleAdd(store)}
                                                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors text-sm"
                                                        >
                                                            {store}
                                                        </button>
                                                    ))}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
