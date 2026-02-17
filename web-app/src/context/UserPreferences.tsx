import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getDashboardConfig, saveDashboardConfig } from '../api';
import type { ComparativePeriod } from '../shared/types/modules';

export type PctDisplayMode = 'base100' | 'differential';
export type YearType = 'Año Anterior' | 'Año Anterior Ajustado';
export type ValueDisplayMode = 'completo' | 'miles' | 'millones';

interface UserPreferences {
    pctDisplayMode: PctDisplayMode;
    pctDecimals: number;         // Decimals for percentages (0-3)
    valueDecimals: number;       // Decimals for currency/values (0-3)
    valueDisplayMode: ValueDisplayMode; // How to display values: full, thousands, millions
    defaultYearType: YearType;   // Default year comparison type
    dashboardLocales?: string[]; // User-selected locales for dashboard KPIs (max 5)
    comparativePeriod: ComparativePeriod; // Comparative period for trend calculations
}

interface UserPreferencesContextType {
    preferences: UserPreferences;
    setPctDisplayMode: (mode: PctDisplayMode) => void;
    setPctDecimals: (decimals: number) => void;
    setValueDecimals: (decimals: number) => void;
    setValueDisplayMode: (mode: ValueDisplayMode) => void;
    setDefaultYearType: (yearType: YearType) => void;
    setDashboardLocales: (locales: string[]) => void;
    setComparativePeriod: (period: ComparativePeriod) => void;
    addDashboardLocal: (local: string) => boolean;
    removeDashboardLocal: (local: string) => void;
    /** Format a percentage (already in 0-1 scale, e.g. 1.05 = 105%) */
    formatPctValue: (pct: number) => string;
    /** Format a percentage already in 0-100 scale (e.g. 105 = 105%) */
    formatPct100: (pct: number) => string;
}

const STORAGE_KEY = 'user_preferences';

const defaultPreferences: UserPreferences = {
    pctDisplayMode: 'base100',
    pctDecimals: 1,
    valueDecimals: 0,
    valueDisplayMode: 'completo',
    defaultYearType: 'Año Anterior',
    comparativePeriod: 'Month',
};

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null);

function loadPreferences(): UserPreferences {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultPreferences, ...parsed };
        }
    } catch { /* ignore */ }
    return { ...defaultPreferences };
}

function savePreferences(prefs: UserPreferences) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const UserPreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
    const [serverSynced, setServerSynced] = useState(false);

    // Load dashboard config (locales + comparative period) from server on mount
    useEffect(() => {
        const loadDashboardConfig = async () => {
            try {
                const config = await getDashboardConfig();
                setPreferences(prev => ({
                    ...prev,
                    dashboardLocales: config.dashboardLocales && config.dashboardLocales.length > 0
                        ? config.dashboardLocales
                        : prev.dashboardLocales,
                    comparativePeriod: (config.comparativePeriod as ComparativePeriod) || prev.comparativePeriod
                }));
                setServerSynced(true);
            } catch (err) {
                console.error('Error loading dashboard config from server:', err);
                setServerSynced(true); // Still mark as synced to allow using localStorage fallback
            }
        };
        loadDashboardConfig();
    }, []);

    // Save to localStorage whenever preferences change
    useEffect(() => {
        savePreferences(preferences);
    }, [preferences]);

    // Save dashboard config to server whenever it changes (debounced)
    useEffect(() => {
        if (!serverSynced) return; // Don't save until initial load is complete

        const timeoutId = setTimeout(async () => {
            try {
                await saveDashboardConfig({
                    dashboardLocales: preferences.dashboardLocales,
                    comparativePeriod: preferences.comparativePeriod
                });
                console.log('✅ Dashboard config saved to server');
            } catch (err) {
                console.error('Error saving dashboard config to server:', err);
            }
        }, 1000); // Debounce 1 second

        return () => clearTimeout(timeoutId);
    }, [preferences.dashboardLocales, preferences.comparativePeriod, serverSynced]);

    const setPctDisplayMode = (mode: PctDisplayMode) => {
        setPreferences(prev => ({ ...prev, pctDisplayMode: mode }));
    };

    const setPctDecimals = (decimals: number) => {
        setPreferences(prev => ({ ...prev, pctDecimals: Math.max(0, Math.min(3, decimals)) }));
    };

    const setValueDecimals = (decimals: number) => {
        setPreferences(prev => ({ ...prev, valueDecimals: Math.max(0, Math.min(3, decimals)) }));
    };

    const setValueDisplayMode = (mode: ValueDisplayMode) => {
        setPreferences(prev => ({ ...prev, valueDisplayMode: mode }));
    };

    const setDefaultYearType = (yearType: YearType) => {
        setPreferences(prev => ({ ...prev, defaultYearType: yearType }));
    };

    const setDashboardLocales = (locales: string[]) => {
        setPreferences(prev => ({ ...prev, dashboardLocales: locales.slice(0, 5) }));
    };

    const setComparativePeriod = (period: ComparativePeriod) => {
        setPreferences(prev => ({ ...prev, comparativePeriod: period }));
    };

    const addDashboardLocal = (local: string): boolean => {
        const current = preferences.dashboardLocales || [];
        if (current.length >= 5) return false;
        if (current.includes(local)) return true;
        setPreferences(prev => ({ ...prev, dashboardLocales: [...current, local] }));
        return true;
    };

    const removeDashboardLocal = (local: string) => {
        const current = preferences.dashboardLocales || [];
        setPreferences(prev => ({ ...prev, dashboardLocales: current.filter(l => l !== local) }));
    };

    /** Format a percentage value where 1.0 = 100% (0-1 scale) */
    const formatPctValue = (pct: number): string => {
        const d = preferences.pctDecimals;
        if (preferences.pctDisplayMode === 'differential') {
            const diff = (pct - 1) * 100;
            return `${diff >= 0 ? '+' : ''}${diff.toFixed(d)}%`;
        }
        return `${(pct * 100).toFixed(d)}%`;
    };

    /** Format a percentage value where 100 = 100% (0-100 scale) */
    const formatPct100 = (pct: number): string => {
        const d = preferences.pctDecimals;
        if (preferences.pctDisplayMode === 'differential') {
            const diff = pct - 100;
            return `${diff >= 0 ? '+' : ''}${diff.toFixed(d)}%`;
        }
        return `${pct.toFixed(d)}%`;
    };

    return (
        <UserPreferencesContext.Provider value={{
            preferences,
            setPctDisplayMode,
            setPctDecimals,
            setValueDecimals,
            setValueDisplayMode,
            setDefaultYearType,
            setDashboardLocales,
            setComparativePeriod,
            addDashboardLocal,
            removeDashboardLocal,
            formatPctValue,
            formatPct100
        }}>
            {children}
        </UserPreferencesContext.Provider>
    );
};

export function useUserPreferences(): UserPreferencesContextType {
    const ctx = useContext(UserPreferencesContext);
    if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider');
    return ctx;
}
