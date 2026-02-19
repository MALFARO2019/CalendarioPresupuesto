import * as XLSX from 'xlsx';
import type { BudgetRecord } from '../mockData';

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Export Monthly view data to Excel
 */
export function exportMonthlyExcel(
    data: BudgetRecord[],
    year: number,
    month: number,
    storeName: string,
    kpi: string
) {
    const monthData = data.filter(d => d.Año === year && d.Mes === month + 1);

    const rows = monthData.map(d => ({
        'Fecha': d.Fecha,
        'Día': d.Dia,
        'Día Semana': DAY_NAMES[d.DiaSemana] || d.DiaSemana,
        'Presupuesto': d.Monto,
        'Real': d.MontoReal,
        'Presup. Acumulado': d.MontoAcumulado,
        'Año Anterior': d.MontoAnterior,
        'Año Ant. Acumulado': d.MontoAnteriorAcumulado,
        'Año Ant. Ajustado': d.MontoAnteriorAjustado,
        'Año Ant. Ajust. Acum.': d.MontoAnteriorAjustadoAcumulado,
        '% Alcance': d.Monto > 0 ? +((d.MontoReal / d.Monto) * 100).toFixed(1) : 0,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
        { wch: 12 }, { wch: 6 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 18 },
        { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
        { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES[month]} ${year}`);
    XLSX.writeFile(wb, `Mensual_${storeName}_${MONTH_NAMES[month]}_${year}_${kpi}.xlsx`);
}

/**
 * Export Annual view data to Excel
 */
export function exportAnnualExcel(
    data: BudgetRecord[],
    year: number,
    storeName: string,
    kpi: string
) {
    // Sheet 1: Monthly summary
    let accPresupuesto = 0;
    let accPresupuestoConDatos = 0;
    let accReal = 0;
    let accAnterior = 0;
    let accAnteriorAjustado = 0;

    const monthlySummary = MONTH_NAMES.map((name, i) => {
        const monthNum = i + 1;
        const monthRecords = data.filter(d => d.Mes === monthNum && d.Año === year);
        const hasRealData = monthRecords.some(d => d.MontoReal > 0);

        const presupuesto = monthRecords.reduce((sum, d) => sum + d.Monto, 0);
        const presupuestoConDatos = monthRecords.filter(d => d.MontoReal > 0).reduce((sum, d) => sum + d.Monto, 0);
        const real = monthRecords.reduce((sum, d) => sum + d.MontoReal, 0);
        const anterior = monthRecords.reduce((sum, d) => sum + (d.MontoAnterior || 0), 0);
        const anteriorAjustado = monthRecords.reduce((sum, d) => sum + (d.MontoAnteriorAjustado || 0), 0);

        accPresupuesto += presupuesto;
        accPresupuestoConDatos += presupuestoConDatos;
        accReal += real;
        accAnterior += anterior;
        accAnteriorAjustado += anteriorAjustado;

        return {
            'Mes': name,
            'Presupuesto': presupuesto,
            'Real': hasRealData ? real : '',
            'Presup. Acumulado': accPresupuesto,
            'Real Acumulado': accReal,
            '% Alcance Acum.': accPresupuestoConDatos > 0 ? +((accReal / accPresupuestoConDatos) * 100).toFixed(1) : '',
            'Año Anterior': anterior,
            'Ant. Acumulado': accAnterior,
            'Año Ant. Ajustado': anteriorAjustado,
            'Ant. Ajust. Acum.': accAnteriorAjustado,
            'Tiene Datos': hasRealData ? 'Sí' : 'No',
        };
    });

    // Sheet 2: Daily detail
    const dailyDetail = data
        .filter(d => d.Año === year)
        .sort((a, b) => a.Mes - b.Mes || a.Dia - b.Dia)
        .map(d => ({
            'Fecha': d.Fecha,
            'Mes': MONTH_NAMES[d.Mes - 1],
            'Día': d.Dia,
            'Día Semana': DAY_NAMES[d.DiaSemana] || d.DiaSemana,
            'Presupuesto': d.Monto,
            'Real': d.MontoReal,
            'Presup. Acumulado': d.MontoAcumulado,
            'Año Anterior': d.MontoAnterior,
            'Año Ant. Ajustado': d.MontoAnteriorAjustado,
        }));

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(monthlySummary);
    wsSummary['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
        { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Mensual');

    const wsDetail = XLSX.utils.json_to_sheet(dailyDetail);
    wsDetail['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle Diario');

    XLSX.writeFile(wb, `Anual_${storeName}_${year}_${kpi}.xlsx`);
}

/**
 * Export Tendencia view data to Excel
 * Called from TendenciaAlcance component
 */
export function exportTendenciaExcel(
    evaluacion: Array<{
        local: string;
        presupuesto: number;
        presupuestoAcum: number;
        real: number;
        anterior: number;
        pctPresupuesto: number;
        pctAnterior: number;
    }>,
    resumen: {
        totalPresupuesto: number;
        totalPresupuestoAcum: number;
        totalReal: number;
        totalAnterior: number;
        pctPresupuesto: number;
        pctAnterior: number;
    },
    year: number,
    dateRange: string,
    kpi: string,
    channel: string
) {
    // Sheet 1: Evaluación por local
    const evalRows = evaluacion.map(e => ({
        'Local': e.local,
        'Presupuesto': e.presupuesto,
        'Presup. Acumulado': e.presupuestoAcum,
        'Real': e.real,
        '% Presupuesto': +((e.pctPresupuesto * 100).toFixed(1)),
        'Año Anterior': e.anterior,
        '% Año Anterior': +((e.pctAnterior * 100).toFixed(1)),
    }));

    // Add totals row
    evalRows.push({
        'Local': 'TOTAL',
        'Presupuesto': resumen.totalPresupuesto,
        'Presup. Acumulado': resumen.totalPresupuestoAcum,
        'Real': resumen.totalReal,
        '% Presupuesto': +((resumen.pctPresupuesto * 100).toFixed(1)),
        'Año Anterior': resumen.totalAnterior,
        '% Año Anterior': +((resumen.pctAnterior * 100).toFixed(1)),
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(evalRows);
    ws['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluación');

    XLSX.writeFile(wb, `Tendencia_${year}_${kpi}_${channel}_${dateRange.replace(/\//g, '-')}.xlsx`);
}
