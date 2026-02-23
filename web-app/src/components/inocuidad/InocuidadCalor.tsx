import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getToken, API_BASE } from '../../api';

interface Criterio {
    columnName: string;
    shortName: string;
    dataType: string;
    orden: number;
}

interface EvalRow {
    codAlmacen: string;
    local: string;
    restaurante: string | null;
    evaluador: string | null;
    adminTurno: string | null;
    totalPuntos: number | null;
    submittedAt: string;
    values: Record<string, any>;
}

interface KpiConfig {
    Meta?: number;
    Advertencia?: number;
    ColorMeta?: string;
    ColorAdvertencia?: string;
    ColorCritico?: string;
}

type RangeType = 'anual' | 'semestre' | 'trimestre' | 'mes';

// Map RangeType to the backend's expected rangoTipo values
const RANGE_TYPE_MAP: Record<RangeType, string> = {
    anual: 'Año',
    semestre: 'Semestre',
    trimestre: 'Trimestre',
    mes: 'Mes',
};

interface InocuidadCalorProps {
    year: number;
    rangeType: RangeType;
    rangePeriod: number;
    groups: string[];
    individualStores: string[];
    filterLocal: string;
    onFilterLocalChange: (v: string) => void;
    sourceId: number | null;
}

export const InocuidadCalor: React.FC<InocuidadCalorProps> = ({
    year, rangeType, rangePeriod, groups, individualStores, filterLocal, onFilterLocalChange, sourceId
}) => {
    const [rows, setRows] = useState<EvalRow[]>([]);
    const [criterios, setCriterios] = useState<Criterio[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

    // Fetch data
    useEffect(() => {
        if (!sourceId) return;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = getToken();
                if (!token) { setError('No hay sesión activa'); return; }

                const params = new URLSearchParams({
                    sourceId: String(sourceId),
                    year: String(year),
                    rangoTipo: RANGE_TYPE_MAP[rangeType],
                    rangoValor: String(rangePeriod)
                });
                if (filterLocal && groups.includes(filterLocal)) {
                    params.set('grupo', filterLocal);
                } else if (filterLocal && filterLocal !== 'Corporativo') {
                    params.set('locales', filterLocal);
                }

                const response = await fetch(`${API_BASE}/inocuidad/calor?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.status === 401) { localStorage.clear(); window.location.reload(); return; }
                if (!response.ok) throw new Error(`Error ${response.status}`);

                const result = await response.json();
                setRows(result.rows || []);
                setCriterios(result.criterios || []);
                setKpiConfig(result.kpiConfig || null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [sourceId, year, filterLocal, groups, rangeType, rangePeriod]);

    // Cell color: solid green/red/gray
    const getCellColor = useCallback((value: any, dataType: string): { bg: string; border: string } => {
        if (value === null || value === undefined || value === '') {
            return { bg: '#e5e7eb', border: '#d1d5db' };
        }
        if (dataType === 'int' || dataType.includes('numeric') || dataType.includes('float') || dataType.includes('decimal')) {
            const num = parseFloat(value);
            if (isNaN(num)) return { bg: '#e5e7eb', border: '#d1d5db' };
            if (num > 0) return { bg: '#22c55e', border: '#16a34a' };
            return { bg: '#ef4444', border: '#dc2626' };
        }
        const str = String(value).toLowerCase().trim();
        if (['sí', 'si', 'yes', 'cumple', 'ok', 'bien', 'correcto', 'bueno', 'excelente', 'aprobado'].includes(str)) {
            return { bg: '#22c55e', border: '#16a34a' };
        }
        if (['no', 'no cumple', 'reprobado', 'mal', 'incorrecto'].includes(str)) {
            return { bg: '#ef4444', border: '#dc2626' };
        }
        if (['n/a', 'na', 'no aplica'].includes(str)) {
            return { bg: '#e5e7eb', border: '#d1d5db' };
        }
        return { bg: '#fbbf24', border: '#f59e0b' };
    }, []);

    const formatDate = useCallback((dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: '2-digit' });
        } catch {
            return dateStr;
        }
    }, []);

    const rowSummaries = useMemo(() => {
        return rows.map(row => {
            let pass = 0, fail = 0, na = 0;
            for (const c of criterios) {
                const val = row.values[c.columnName];
                if (val === null || val === undefined || val === '') { na++; continue; }
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    if (num > 0) pass++; else fail++;
                } else {
                    const str = String(val).toLowerCase().trim();
                    if (['sí', 'si', 'yes', 'cumple', 'ok'].includes(str)) pass++;
                    else if (['no', 'no cumple', 'reprobado'].includes(str)) fail++;
                    else na++;
                }
            }
            const total = pass + fail;
            const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
            return { pass, fail, na, pct };
        });
    }, [rows, criterios]);

    if (!sourceId) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg className="w-7 h-7 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando...</span>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg className="w-7 h-7 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="ml-3 text-gray-500 font-medium">Cargando mapa de calor...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-red-600 text-sm">⚠️ {error}</span>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500">
                <p className="font-medium">No hay datos para el período seleccionado.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto" style={{ maxHeight: '80vh' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{
                                position: 'sticky', left: 0, top: 0, zIndex: 30,
                                background: '#f8fafc', borderBottom: '2px solid #cbd5e1', borderRight: '2px solid #cbd5e1',
                                padding: '4px 8px', minWidth: '140px', textAlign: 'left',
                                fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase'
                            }}>
                                Restaurante
                            </th>
                            <th style={{
                                position: 'sticky', left: 140, top: 0, zIndex: 30,
                                background: '#f8fafc', borderBottom: '2px solid #cbd5e1', borderRight: '1px solid #e2e8f0',
                                padding: '4px 6px', minWidth: '70px', textAlign: 'center',
                                fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase'
                            }}>
                                Fecha
                            </th>
                            <th style={{
                                position: 'sticky', left: 210, top: 0, zIndex: 30,
                                background: '#f8fafc', borderBottom: '2px solid #cbd5e1', borderRight: '2px solid #94a3b8',
                                padding: '4px 6px', minWidth: '40px', textAlign: 'center',
                                fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase'
                            }}>
                                %
                            </th>
                            {criterios.map(c => (
                                <th key={c.columnName} style={{
                                    position: 'sticky', top: 0, zIndex: 20,
                                    background: '#f8fafc', borderBottom: '2px solid #cbd5e1',
                                    padding: '4px 1px', minWidth: '24px', maxWidth: '28px',
                                    verticalAlign: 'bottom', height: '140px',
                                    borderRight: '1px solid #e2e8f0'
                                }}
                                    title={c.shortName}
                                >
                                    <div style={{
                                        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                                        fontSize: '9px', fontWeight: 600, color: '#64748b',
                                        maxHeight: '130px', overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', lineHeight: 1.2
                                    }}>
                                        {c.shortName}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIdx) => {
                            const summary = rowSummaries[rowIdx];
                            const pctColor = summary.pct >= 80 ? '#16a34a' : summary.pct >= 60 ? '#ca8a04' : '#dc2626';
                            return (
                                <tr key={rowIdx} style={{
                                    borderBottom: '1px solid #e2e8f0',
                                    background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                                }}>
                                    <td style={{
                                        position: 'sticky', left: 0, zIndex: 10,
                                        background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                        borderRight: '2px solid #cbd5e1',
                                        padding: '3px 8px', fontSize: '11px', fontWeight: 600,
                                        color: '#1e293b', whiteSpace: 'nowrap', maxWidth: '160px',
                                        overflow: 'hidden', textOverflow: 'ellipsis'
                                    }}
                                        title={`${row.local}${row.evaluador ? ` — Eval: ${row.evaluador}` : ''}${row.adminTurno ? ` — Admin: ${row.adminTurno}` : ''}`}
                                    >
                                        {row.local}
                                    </td>
                                    <td style={{
                                        position: 'sticky', left: 140, zIndex: 10,
                                        background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                        borderRight: '1px solid #e2e8f0',
                                        padding: '3px 6px', fontSize: '10px', color: '#64748b',
                                        textAlign: 'center', whiteSpace: 'nowrap'
                                    }}>
                                        {formatDate(row.submittedAt)}
                                    </td>
                                    <td style={{
                                        position: 'sticky', left: 210, zIndex: 10,
                                        background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                        borderRight: '2px solid #94a3b8',
                                        padding: '3px 4px', fontSize: '11px', fontWeight: 700,
                                        color: pctColor, textAlign: 'center'
                                    }}>
                                        {summary.pct}%
                                    </td>
                                    {criterios.map((c, colIdx) => {
                                        const val = row.values[c.columnName];
                                        const colors = getCellColor(val, c.dataType);
                                        const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                                        return (
                                            <td key={c.columnName}
                                                style={{
                                                    padding: '1px',
                                                    borderRight: '1px solid rgba(255,255,255,0.3)',
                                                }}
                                                onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                                                onMouseLeave={() => setHoveredCell(null)}
                                            >
                                                <div
                                                    style={{
                                                        width: '100%', height: '22px',
                                                        backgroundColor: colors.bg,
                                                        borderRadius: '2px',
                                                        border: isHovered ? '2px solid #1e293b' : `1px solid ${colors.border}`,
                                                        transition: 'border 0.1s ease',
                                                        cursor: 'default'
                                                    }}
                                                    title={`${row.local} — ${c.shortName}: ${val ?? 'N/A'}`}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{
                padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
                fontSize: '12px', color: '#64748b'
            }}>
                <span style={{ fontWeight: 600 }}>
                    {rows.length} evaluación(es) • {criterios.length} criterio(s)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, backgroundColor: '#22c55e', border: '1px solid #16a34a' }} />
                        Cumple
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, backgroundColor: '#ef4444', border: '1px solid #dc2626' }} />
                        No cumple
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, backgroundColor: '#e5e7eb', border: '1px solid #d1d5db' }} />
                        Sin dato
                    </span>
                </span>
            </div>
        </div>
    );
};
