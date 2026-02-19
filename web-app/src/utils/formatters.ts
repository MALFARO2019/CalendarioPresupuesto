import { useUserPreferences } from '../context/UserPreferences';

// Utility function to format numbers based on KPI type
export function formatCurrency(value: number, kpi: string, decimals: number = 0): string {
    const isNumber = kpi === 'Transacciones' || kpi === 'TQP';
    const maxDecimals = decimals;
    const formatted = new Intl.NumberFormat('es-CR', {
        style: 'decimal',
        minimumFractionDigits: maxDecimals,
        maximumFractionDigits: maxDecimals
    }).format(value);

    return isNumber ? formatted : `₡${formatted}`;
}

export function formatCurrencyCompact(value: number, kpi: string): string {
    const isTransaction = kpi === 'Transacciones';
    const formatted = value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` :
        value >= 1000 ? `${(value / 1000).toFixed(0)}k` :
            value.toLocaleString('es-CR');

    return isTransaction ? formatted : `₡${formatted}`;
}

/**
 * React hook that returns a KPI-aware value formatter respecting user preferences.
 * Components MUST use this hook for proper reactivity with decimal preferences.
 * Usage: const fc = useFormatCurrency();
 *        fc(12345.67, 'Ventas') => "₡12.346" or "₡12.345,67"
 */
export function useFormatCurrency() {
    const { preferences } = useUserPreferences();
    const decimals = preferences.valueDecimals;
    const mode = preferences.valueDisplayMode || 'completo';
    return (value: number, kpi: string): string => {
        const isNumber = kpi === 'Transacciones' || kpi === 'TQP';
        let displayValue = value;
        let suffix = '';

        if (mode === 'millones' && !isNumber) {
            displayValue = value / 1000000;
            suffix = 'M';
        } else if (mode === 'miles' && !isNumber) {
            displayValue = value / 1000;
            suffix = 'K';
        }

        const displayDecimals = mode === 'completo' ? decimals : (mode === 'millones' ? Math.max(decimals, 1) : decimals);
        const formatted = new Intl.NumberFormat('es-CR', {
            style: 'decimal',
            minimumFractionDigits: displayDecimals,
            maximumFractionDigits: displayDecimals
        }).format(displayValue);

        return isNumber ? `${formatted}${suffix}` : `₡${formatted}${suffix}`;
    };
}
