

interface TrendIndicatorProps {
    trend: {
        direction: 'up' | 'down' | 'neutral';
        percentage: number;
    };
    size?: 'sm' | 'md' | 'lg';
}

export function TrendIndicator({ trend, size = 'sm' }: TrendIndicatorProps) {
    const isPositive = trend.direction === 'up';
    const isNeutral = trend.direction === 'neutral';

    // Size configurations
    const sizeClasses = {
        sm: 'text-[10px]',
        md: 'text-xs',
        lg: 'text-sm'
    };

    // Color classes
    const colorClass = isNeutral
        ? 'text-gray-500'
        : isPositive
            ? 'text-green-600'
            : 'text-red-600';

    // Arrow icons
    const ArrowIcon = isNeutral
        ? () => <span className="font-bold">→</span>
        : isPositive
            ? () => <span className="font-bold">↗</span>
            : () => <span className="font-bold">↘</span>;

    // Format percentage
    const formattedPercent = `${isPositive && !isNeutral ? '+' : ''}${trend.percentage.toFixed(1)}%`;

    return (
        <div className={`inline-flex items-center gap-0.5 ${colorClass} ${sizeClasses[size]} font-bold`}>
            <ArrowIcon />
            <span>{formattedPercent}</span>
        </div>
    );
}
