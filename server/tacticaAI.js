const { sql, poolPromise } = require('./db');

/**
 * Generate tactical sales analysis using Gemini AI
 * @param {object} data - Annual data summary with monthly breakdowns
 * @param {string|null} customPrompt - Custom prompt template from DB (uses placeholders)
 * @returns {string} - Markdown analysis
 */
async function generateTacticaAnalysis(data, customPrompt = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no está configurada en .env');
    }

    const prompt = customPrompt
        ? applyTemplate(customPrompt, data)
        : buildDefaultPrompt(data);

    console.log('🤖 Calling Gemini for tactical analysis...');

    const model = 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        const msg = err?.error?.message || JSON.stringify(err);
        throw new Error(msg);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini no retornó contenido');

    console.log('✅ Gemini analysis generated:', text.length, 'chars');
    return text;
}

/**
 * Apply template placeholders to a custom prompt
 */
function applyTemplate(template, data) {
    const { storeName, year, kpi, monthlyData, annualTotals } = data;

    const monthlyTable = buildMonthlyTable(monthlyData);
    const annualSummary = buildAnnualSummary(annualTotals);

    return template
        .replace(/\{\{storeName\}\}/g, storeName || '')
        .replace(/\{\{year\}\}/g, year || '')
        .replace(/\{\{kpi\}\}/g, kpi || '')
        .replace(/\{\{monthlyTable\}\}/g, monthlyTable)
        .replace(/\{\{annualTotals\}\}/g, annualSummary);
}

/**
 * Build markdown table from monthly data
 */
function buildMonthlyTable(monthlyData) {
    if (!monthlyData || monthlyData.length === 0) return '(Sin datos mensuales)';

    const header = '| Mes | Presupuesto | Real | % Alcance Acum. | Año Anterior | Tiene Datos |\n|-----|------------|------|-----------------|-------------|-------------|';
    const rows = monthlyData.map(m => {
        const pctAlcance = m.presupuestoAcumuladoConDatos > 0
            ? ((m.realAcumulado / m.presupuestoAcumuladoConDatos) * 100).toFixed(1)
            : '—';
        return `| ${m.monthName} | ${fmt(m.presupuesto)} | ${fmt(m.real)} | ${pctAlcance}% | ${fmt(m.anterior)} | ${m.hasData ? 'Sí' : 'No'} |`;
    }).join('\n');

    return `${header}\n${rows}`;
}

/**
 * Build annual summary text
 */
function buildAnnualSummary(annualTotals) {
    if (!annualTotals) return '(Sin totales anuales)';
    return `- **Presupuesto anual**: ${fmt(annualTotals.presupuestoAnual)}
- **Presupuesto acumulado (días con datos)**: ${fmt(annualTotals.presupuestoAcumulado)}
- **Real acumulado**: ${fmt(annualTotals.real)}
- **Alcance**: ${annualTotals.alcance?.toFixed(1) || '—'}%
- **Año anterior acumulado**: ${fmt(annualTotals.anterior)}
- **Año anterior ajustado acum.**: ${fmt(annualTotals.anteriorAjustado)}`;
}

/**
 * Default prompt (fallback if no custom prompt in DB)
 */
function buildDefaultPrompt(data) {
    const { storeName, year, kpi, monthlyData, annualTotals } = data;

    const monthlyTable = buildMonthlyTable(monthlyData);
    const annualSummary = buildAnnualSummary(annualTotals);

    return `Sos un consultor estratégico de ventas para la cadena de restaurantes Rostipollos en Costa Rica.

Analizá los siguientes datos de **${kpi}** para **${storeName}** del año **${year}** y generá un reporte EJECUTIVO de oportunidades tácticas.

## Datos Mensuales
${monthlyTable}

## Totales Anuales
${annualSummary}

## Instrucciones
Generá un análisis EJECUTIVO en español, con las siguientes secciones. Usá formato markdown:

### 1. 📊 Resumen Ejecutivo
Un párrafo conciso con la situación actual del negocio.

### 2. 🔍 Análisis de Brechas
- Identificá los meses con mayor diferencia negativa entre Real y Presupuesto.
- Comparación con año anterior: ¿estamos creciendo o decreciendo?
- Identificá patrones (ej: meses débiles sistemáticos).

### 3. 🎯 Oportunidades Tácticas (Top 5)
Las 5 oportunidades más concretas y accionables para mejorar ${kpi}, con estimación de impacto potencial en colones o porcentaje.

### 4. ⚠️ Alertas y Riesgos
Meses futuros que requieren atención especial basándose en tendencias históricas.

### 5. 📈 Proyección y Metas
- ¿Es alcanzable el presupuesto anual basándose en la tendencia actual?
- ¿Cuánto necesitamos vender diariamente en promedio para cerrar la brecha?
- Meta sugerida para los próximos 3 meses.

IMPORTANTE:
- Sé específico con números y porcentajes.
- Enfocate en acciones PRÁCTICAS para un gerente de restaurante.
- No repitas los datos crudos, interpretalos.
- Máximo 600 palabras.
- Usá colones costarricenses (₡) como moneda.`;
}

function fmt(value) {
    if (value === undefined || value === null) return '—';
    if (Math.abs(value) >= 1000000000) return `₡${(value / 1000000000).toFixed(2)}B`;
    if (Math.abs(value) >= 1000000) return `₡${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `₡${(value / 1000).toFixed(0)}k`;
    return `₡${value.toFixed(0)}`;
}

module.exports = { generateTacticaAnalysis };
