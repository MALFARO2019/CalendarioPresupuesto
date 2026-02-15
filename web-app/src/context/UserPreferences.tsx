import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type PctDisplayMode = 'base100' | 'differential';
export type YearType = 'Año Anterior' | 'Año Anterior Ajustado';

interface UserPreferences {
    pctDisplayMode: PctDisplayMode;
    pctDecimals: number;         // Decimals for percentages (0-3)
    valueDecimals: number;       // Decimals for currency/values (0-3)
    defaultYearType: YearType;   // Default year comparison type
}

interface UserPreferencesContextType {
    preferences: UserPreferences;
    setPctDisplayMode: (mode: PctDisplayMode) => void;
    setPctDecimals: (decimals: number) => void;
    setValueDecimals: (decimals: number) => void;
    setDefaultYearType: (yearType: YearType) => void;
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
    defaultYearType: 'Año Anterior',
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

    useEffect(() => {
        savePreferences(preferences);
    }, [preferences]);

    const setPctDisplayMode = (mode: PctDisplayMode) => {
        setPreferences(prev => ({ ...prev, pctDisplayMode: mode }));
    };

    const setPctDecimals = (decimals: number) => {
        setPreferences(prev => ({ ...prev, pctDecimals: Math.max(0, Math.min(3, decimals)) }));
    };

    const setValueDecimals = (decimals: number) => {
        setPreferences(prev => ({ ...prev, valueDecimals: Math.max(0, Math.min(3, decimals)) }));
    };

    const setDefaultYearType = (yearType: YearType) => {
        setPreferences(prev => ({ ...prev, defaultYearType: yearType }));
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
            preferences, setPctDisplayMode, setPctDecimals, setValueDecimals, setDefaultYearType,
            formatPctValue, formatPct100
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
