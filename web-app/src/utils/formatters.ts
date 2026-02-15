// Utility function to format numbers based on KPI type
export function formatCurrency(value: number, kpi: string): string {
    const isNumber = kpi === 'Transacciones' || kpi === 'TQP';
    const formatted = new Intl.NumberFormat('es-CR', {
        style: 'decimal',
        maximumFractionDigits: kpi === 'TQP' ? 2 : 0
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
