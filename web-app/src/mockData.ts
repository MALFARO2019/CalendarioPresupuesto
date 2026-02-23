import { startOfYear, endOfYear, eachDayOfInterval, format, isBefore } from 'date-fns';

export interface BudgetRecord {
    Fecha: string; // YYYY-MM-DD
    Año: number;
    Mes: number;
    Dia: number;
    DiaSemana: number; // 0 = Sunday, 1 = Monday, etc.
    MontoReal: number;
    Monto: number; // Presupuesto
    MontoDiasConDatos: number; // Monto only for stores with MontoReal > 0 (pre-aggregated)
    MontoAcumulado: number;
    MontoAnterior: number;
    AnteriorDiasConDatos: number; // MontoAnterior only for stores with MontoReal > 0
    MontoAnteriorAcumulado: number;
    MontoAnteriorAjustado: number;
    AnteriorAjustadoDiasConDatos: number; // MontoAnteriorAjustado only for stores with MontoReal > 0
    MontoAnteriorAjustadoAcumulado: number;
}

export const generateMockData = (): BudgetRecord[] => {
    const year = 2026;
    const startDate = startOfYear(new Date(year, 0, 1));
    const endDate = endOfYear(new Date(year, 0, 1));
    // const today = new Date(); // Unused

    const days = eachDayOfInterval({ start: startDate, end: endDate });

    let cumulativeBudget = 0;
    let cumulativeLastYear = 0;
    let cumulativeLastYearAdj = 0;

    return days.map((day) => {
        // Random base values
        const budget = Math.floor(Math.random() * 50000) + 10000;
        const lastYear = Math.floor(Math.random() * 50000) + 10000;
        const lastYearAdj = Math.floor(Math.random() * 50000) + 10000;

        // Use the provided current time 2026-02-13.
        const isPastOrToday = !isBefore(new Date('2026-02-13T16:24:31-06:00'), day);

        const real = isPastOrToday ? Math.floor(Math.random() * 60000) + 5000 : 0;

        cumulativeBudget += budget;
        cumulativeLastYear += lastYear;
        cumulativeLastYearAdj += lastYearAdj;

        return {
            Fecha: format(day, 'yyyy-MM-dd'),
            Año: year,
            Mes: day.getMonth() + 1,
            Dia: day.getDate(),
            DiaSemana: day.getDay(),
            MontoReal: real,
            Monto: budget,
            MontoDiasConDatos: isPastOrToday ? budget : 0,
            MontoAcumulado: cumulativeBudget,
            MontoAnterior: lastYear,
            AnteriorDiasConDatos: isPastOrToday ? lastYear : 0,
            MontoAnteriorAcumulado: cumulativeLastYear,
            MontoAnteriorAjustado: lastYearAdj,
            AnteriorAjustadoDiasConDatos: isPastOrToday ? lastYearAdj : 0,
            MontoAnteriorAjustadoAcumulado: cumulativeLastYearAdj,
        };
    });
};
