// =============================================================================
// REPORTE NOCTURNO DE VENTAS — Alcance de Presupuesto
// Usa RSM_ALCANCE_DIARIO: MontoReal = venta real, Monto = presupuesto
// Grupos de locales vienen de CODALMACEN que empieza con 'G'
// Canales individuales: Salón, Express, UberEats, AutoPollo, ECommerce, Llevar
// =============================================================================
const { sql, poolPromise } = require('./db');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Logo path for embedding in emails
const LOGO_PATH = path.resolve(__dirname, '..', 'web-app', 'public', 'LogoRosti.png');

// ── Utilidades ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '₡0';
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return n.toFixed(1) + '%';
}
function semaforo(pct) {
  if (pct == null || isNaN(pct) || !isFinite(pct)) return '#64748b'; // gris
  if (pct >= 100) return '#22c55e';   // verde
  if (pct >= 90) return '#f59e0b';   // amarillo
  if (pct >= 80) return '#fb923c';   // naranja
  return '#ef4444';                   // rojo
}
function semaforoBg(pct) {
  if (pct == null || isNaN(pct) || !isFinite(pct)) return '#1e293b';
  if (pct >= 100) return '#14532d';
  if (pct >= 90) return '#422006';
  if (pct >= 80) return '#431407';
  return '#450a0a';
}
function dateStr(d) {
  return d.toISOString().substring(0, 10);
}
function inicioAno(hoy) {
  return new Date(hoy.getFullYear(), 0, 1);
}
function inicioMes(hoy) {
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
}
function inicioSemana(hoy) {
  const d = new Date(hoy);
  const day = d.getDay(); // 0=dom
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // lunes
  return d;
}

// ── Íconos por grupo ──────────────────────────────────────────────────────────
const ICONOS_GRUPO = {
  'Corporativo': '🏢',
  'Restaurantes': '🍽️',
  'Ventanitas': '🪟',
  'Free Standing': '🏠',
  'Mall': '🏬',
  'Plaza': '🛍️',
  'Same Store Sales': '📊',
  'Nuevos': '🆕',
};
const ICONOS_CANAL = {
  'Salón': '🪑',
  'Express': '🏍️',
  'UberEats': '📱',
  'Llevar': '🥡',
  'AutoPollo': '🚗',
  'ECommerce': '💻',
};

// Canales individuales para la sección de canales
const CANALES_DETALLE = ['Salón', 'Express', 'UberEats', 'Llevar', 'AutoPollo', 'ECommerce'];

// ── Query Principal ────────────────────────────────────────────────────────────
async function fetchData() {
  const pool = await poolPromise;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);

  const desde = dateStr(inicioAno(hoy));
  const hastaHoy = dateStr(hoy);

  // Query 1: Datos por GRUPO de locales (CODALMACEN G*) con Canal = Todos
  const gruposResult = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hastaHoy)
    .query(`
            SELECT
                Fecha,
                Local AS Grupo,
                SUM(MontoReal)     AS VentaReal,
                SUM(Monto)         AS Presupuesto,
                SUM(MontoAnterior) AS MontoAnterior
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha >= @desde AND Fecha <= @hasta
              AND Tipo = 'Ventas'
              AND Canal = 'Todos'
              AND SUBSTRING(CODALMACEN, 1, 1) = 'G'
            GROUP BY Fecha, Local
        `);

  // Query 2: Datos por CANAL individual (no grupos, Canal != 'Todos')
  const canalesResult = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hastaHoy)
    .query(`
            SELECT
                Fecha,
                Canal,
                SUM(MontoReal)     AS VentaReal,
                SUM(Monto)         AS Presupuesto,
                SUM(MontoAnterior) AS MontoAnterior
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha >= @desde AND Fecha <= @hasta
              AND Tipo = 'Ventas'
              AND Canal != 'Todos'
              AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            GROUP BY Fecha, Canal
        `);

  // Query 3: Total corporación (todos los locales individuales, Canal = Todos)
  const totalResult = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hastaHoy)
    .query(`
            SELECT
                Fecha,
                SUM(MontoReal)     AS VentaReal,
                SUM(Monto)         AS Presupuesto,
                SUM(MontoAnterior) AS MontoAnterior
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha >= @desde AND Fecha <= @hasta
              AND Tipo = 'Ventas'
              AND Canal = 'Todos'
              AND SUBSTRING(CODALMACEN, 1, 1) != 'G'
            GROUP BY Fecha
        `);

  // Query 4: Obtener todos los grupos distintos dinámicamente
  const gruposDistinctResult = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hastaHoy)
    .query(`
            SELECT DISTINCT Local AS Grupo
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha >= @desde AND Fecha <= @hasta
              AND Tipo = 'Ventas'
              AND Canal = 'Todos'
              AND SUBSTRING(CODALMACEN, 1, 1) = 'G'
            ORDER BY Local
        `);

  const gruposDisponibles = gruposDistinctResult.recordset.map(r => r.Grupo?.trim()).filter(Boolean);

  return {
    gruposRows: gruposResult.recordset,
    canalesRows: canalesResult.recordset,
    totalRows: totalResult.recordset,
    gruposDisponibles,
    hoy,
    ayer
  };
}

// ── Agregación por período ─────────────────────────────────────────────────────
function filtrarPeriodo(rows, desde, hasta) {
  const d0 = dateStr(desde), d1 = dateStr(hasta);
  return rows.filter(r => {
    const f = dateStr(new Date(r.Fecha));
    return f >= d0 && f <= d1;
  });
}

function agruparGrupos(gruposRows, totalRows, desde, hasta, gruposDisponibles, allowedStores) {
  const filteredGrupos = filtrarPeriodo(gruposRows, desde, hasta);
  const filteredTotal = filtrarPeriodo(totalRows, desde, hasta);

  // Total corporación
  const total = { venta: 0, presupuesto: 0, anterior: 0 };
  for (const r of filteredTotal) {
    total.venta += r.VentaReal || 0;
    total.presupuesto += r.Presupuesto || 0;
    total.anterior += r.MontoAnterior || 0;
  }

  // Grupos individuales
  const grupoMap = {};
  for (const r of filteredGrupos) {
    const g = (r.Grupo || '').trim();
    if (!grupoMap[g]) grupoMap[g] = { venta: 0, presupuesto: 0, anterior: 0 };
    grupoMap[g].venta += r.VentaReal || 0;
    grupoMap[g].presupuesto += r.Presupuesto || 0;
    grupoMap[g].anterior += r.MontoAnterior || 0;
  }

  const results = [];
  // Corporativo total primero
  const pctTotal = total.presupuesto > 0 ? (total.venta / total.presupuesto) * 100 : null;
  const vsAntTotal = total.anterior > 0 && total.venta > 0 ? ((total.venta - total.anterior) / total.anterior) * 100 : null;
  results.push({
    label: 'Corporación',
    icono: '🏢',
    venta: total.venta,
    presupuesto: total.presupuesto,
    anterior: total.anterior,
    dif: total.venta - total.presupuesto,
    pct: pctTotal,
    vsAnterior: vsAntTotal,
    isCorporacion: true
  });

  // Filtrar grupos por permisos del usuario
  let gruposActivos = gruposDisponibles || [];
  if (allowedStores && allowedStores.length > 0) {
    gruposActivos = gruposActivos.filter(g => allowedStores.includes(g));
  }

  // Grupos dinámicos (todos los disponibles, filtrados por permisos)
  for (const nombre of gruposActivos) {
    if (nombre === 'Corporativo') continue; // ya lo pusimos como Corporación
    const data = grupoMap[nombre];
    if (!data) continue;
    // Solo incluir si tiene datos significativos
    if (data.presupuesto === 0 && data.venta === 0) continue;
    const pct = data.presupuesto > 0 ? (data.venta / data.presupuesto) * 100 : null;
    const vsAnt = data.anterior > 0 && data.venta > 0 ? ((data.venta - data.anterior) / data.anterior) * 100 : null;
    results.push({
      label: nombre,
      icono: ICONOS_GRUPO[nombre] || '📊',
      venta: data.venta,
      presupuesto: data.presupuesto,
      anterior: data.anterior,
      dif: data.venta - data.presupuesto,
      pct,
      vsAnterior: vsAnt,
      isCorporacion: false
    });
  }

  return results;
}

function agruparCanales(canalesRows, desde, hasta, allowedCanales) {
  const filtered = filtrarPeriodo(canalesRows, desde, hasta);

  const map = {};
  for (const r of filtered) {
    const c = (r.Canal || '').trim();
    if (!map[c]) map[c] = { venta: 0, presupuesto: 0, anterior: 0 };
    map[c].venta += r.VentaReal || 0;
    map[c].presupuesto += r.Presupuesto || 0;
    map[c].anterior += r.MontoAnterior || 0;
  }

  // Filtrar canales por permisos del usuario
  let canalesActivos = CANALES_DETALLE;
  if (allowedCanales && allowedCanales.length > 0) {
    canalesActivos = CANALES_DETALLE.filter(c => allowedCanales.includes(c));
  }

  const results = [];
  for (const canal of canalesActivos) {
    const data = map[canal];
    if (!data) continue;
    if (data.presupuesto === 0 && data.venta === 0) continue;
    const pct = data.presupuesto > 0 ? (data.venta / data.presupuesto) * 100 : null;
    const vsAnt = data.anterior > 0 && data.venta > 0 ? ((data.venta - data.anterior) / data.anterior) * 100 : null;
    results.push({
      label: canal,
      icono: ICONOS_CANAL[canal] || '📦',
      venta: data.venta,
      presupuesto: data.presupuesto,
      anterior: data.anterior,
      dif: data.venta - data.presupuesto,
      pct,
      vsAnterior: vsAnt
    });
  }

  return results;
}

// ── Badge de variación vs anterior ─────────────────────────────────────────────
function vsAntBadge(pct) {
  if (pct == null || isNaN(pct) || !isFinite(pct)) return '';
  const color = pct >= 0 ? '#12B76A' : '#F04438';
  const sign = pct >= 0 ? '+' : '';
  return `<span style="font-size:12px;font-weight:600;color:${color};">${sign}${pct.toFixed(1)}%</span>`;
}

// ── Formato compacto (ej: ₡38.2M, ₡2.45B) ─────────────────────────────────
function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '₡' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '₡' + (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '₡' + (n / 1e3).toFixed(0) + 'K';
  return fmt(n);
}

// ── Generador de tablas HTML (Estilo Stitch) ──────────────────────────────────
function buildTableHTML(titulo, datos) {
  if (!datos || datos.length === 0) return '';

  return `
        <div style="margin-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
            <tr>
              <td style="width:4px;background:#E55B13;border-radius:2px;">&nbsp;</td>
              <td style="padding-left:10px;font-size:12px;font-weight:700;color:#344054;text-transform:uppercase;letter-spacing:1px;">${titulo}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:8px 12px;text-align:left;color:#98A2B3;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #EAECF0;">Canal / Grupo</th>
                <th style="padding:8px 12px;text-align:right;color:#98A2B3;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #EAECF0;">Venta</th>
                <th style="padding:8px 12px;text-align:right;color:#98A2B3;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #EAECF0;">KPI</th>
              </tr>
            </thead>
            <tbody>
              ${datos.map((r, i) => {
    const isCorp = r.isCorporacion;
    const fontWeight = isCorp ? '700' : '400';
    const labelColor = isCorp ? '#101828' : '#344054';
    const kpiColor = r.pct >= 100 ? '#12B76A' : r.pct >= 90 ? '#F79009' : '#F04438';

    return `
              <tr style="${isCorp ? 'border-bottom:1px solid #D0D5DD;' : ''}">
                <td style="padding:10px 12px;color:${labelColor};font-size:13px;font-weight:${fontWeight};border-bottom:1px solid #F2F4F7;">
                  ${r.label}
                </td>
                <td style="padding:10px 12px;text-align:right;color:#344054;font-size:13px;font-weight:${fontWeight};border-bottom:1px solid #F2F4F7;">
                  ${fmt(r.venta)}
                </td>
                <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #F2F4F7;">
                  ${r.pct != null ? `<span style="font-size:12px;font-weight:600;color:${kpiColor};">${r.pct >= 0 && r.vsAnterior != null ? (r.vsAnterior >= 0 ? '+' : '') + r.vsAnterior.toFixed(1) + '%' : fmtPct(r.pct)}</span>` : '—'}
                </td>
              </tr>`;
  }).join('')}
            </tbody>
          </table>
        </div>
    `;
}

// ── HTML Principal (Estilo Stitch) ────────────────────────────────────────────
function buildHTML(hoy, periodos, kpis, config = {}) {
  const nombre = config.nombre || 'Reporte Nocturno de Ventas';
  const icono = config.icono || '🌙';
  const fechaStr = hoy.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fechaCapitalized = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);

  // KPI rápidos por período (formato compacto)
  const quickMetrics = periodos.map(p => {
    const corp = p.grupos?.find(g => g.isCorporacion);
    return { nombre: p.nombre.toUpperCase(), venta: corp?.venta || 0 };
  });

  // Build sections: grupos + canales for each period
  let sections = '';
  for (const p of periodos) {
    sections += buildTableHTML(p.nombre + ' — Por Canal', p.grupos);
    if (p.canales && p.canales.length > 0) {
      sections += buildTableHTML(p.nombre + ' — Por Grupo de Producto', p.canales);
    }
  }

  const progressPct = Math.min(kpis.pctMes || 0, 100);
  const progressColor = kpis.pctMes >= 100 ? '#12B76A' : '#E55B13';
  const vsAntColor = kpis.vsAntMes >= 0 ? '#12B76A' : '#F04438';
  const vsAntSign = kpis.vsAntMes >= 0 ? '+' : '';

  // Determine logo src: use CID for email (default), data URI for preview
  const logoSrc = config._logoDataUri || 'cid:logo-rosti';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<title>${nombre}</title>
<style>
  /* Reset for email clients */
  body, table, td, div, p { margin:0; padding:0; }
  img { display:block; border:0; }
  /* Mobile-first responsive */
  @media only screen and (max-width: 480px) {
    .outer-wrap { padding: 12px 6px !important; }
    .main-card { border-radius: 12px !important; }
    .header-cell { padding: 24px 16px 18px !important; }
    .header-title { font-size: 16px !important; }
    .header-icon { font-size: 20px !important; }
    .kpi-cell { padding: 18px 14px 6px !important; }
    .kpi-pct-hero { font-size: 44px !important; }
    .kpi-big-number { font-size: 22px !important; }
    .content-cell { padding: 12px 14px !important; }
    .metric-pair td { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; }
    .metric-pair td:last-child { padding-left: 0 !important; }
    .quick-metrics td { padding: 4px 2px !important; }
    .quick-metrics .metric-label { font-size: 8px !important; }
    .quick-metrics .metric-value { font-size: 12px !important; }
    .data-cell { padding: 14px 14px 10px !important; }
    .footer-cell { padding: 16px 14px 20px !important; }
    .card-box { padding: 10px 12px !important; }
    .card-box-value { font-size: 15px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;">
    <tr>
      <td align="center" class="outer-wrap" style="padding:24px 12px;">
        <!--[if mso]><table width="460" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table cellpadding="0" cellspacing="0" border="0" class="main-card" style="max-width:460px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #EAECF0;box-shadow:0 4px 12px rgba(16,24,40,0.05);">

          <!-- HEADER -->
          <tr>
            <td class="header-cell" style="background:#FFFFFF;padding:28px 24px 20px;text-align:center;border-bottom:1px solid #F2F4F7;">
              <img src="${logoSrc}" alt="Rosti" style="height:44px;margin:0 auto 14px;display:block;" />
              <div class="header-title" style="font-size:18px;font-weight:800;color:#101828;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;line-height:1.3;">
                <span class="header-icon" style="font-size:22px;margin-right:6px;vertical-align:bottom;">${icono}</span>${nombre}
              </div>
              <div style="font-size:13px;color:#667085;font-weight:500;">${fechaCapitalized}</div>
            </td>
          </tr>

          <!-- KPI PRINCIPAL — PORCENTAJE HÉROE -->
          <tr>
            <td class="kpi-cell" style="padding:24px 20px 8px;">
              <!-- % Alcance como elemento HÉROE -->
              <div style="text-align:center;margin-bottom:8px;">
                <div style="font-size:10px;font-weight:700;color:#98A2B3;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">% ALCANCE DEL MES</div>
                <div class="kpi-pct-hero" style="font-size:52px;font-weight:900;color:${progressColor};line-height:1;letter-spacing:-1px;">${fmtPct(kpis.pctMes)}</div>
              </div>

              <!-- Barra de progreso (gruesa) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                <tr>
                  <td style="background:#F2F4F7;border-radius:6px;height:12px;padding:0;">
                    <div style="width:${progressPct}%;background:${progressColor};height:12px;border-radius:6px;"></div>
                  </td>
                </tr>
              </table>

              <!-- Venta acumulada debajo -->
              <div style="text-align:center;margin-top:14px;">
                <div style="font-size:10px;font-weight:600;color:#98A2B3;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">VENTA ACUMULADA MES</div>
                <div class="kpi-big-number" style="font-size:26px;font-weight:800;color:#101828;line-height:1.1;">${fmt(kpis.ventaMes)}</div>
              </div>
            </td>
          </tr>

          <!-- PRESUPUESTO + VS AÑO ANTERIOR -->
          <tr>
            <td class="content-cell" style="padding:10px 20px 6px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" class="metric-pair">
                <tr>
                  <td width="48%" style="padding-right:6px;">
                    <div class="card-box" style="background:#F9FAFB;border-radius:10px;padding:12px 14px;border:1px solid #EAECF0;">
                      <div style="font-size:9px;font-weight:600;color:#98A2B3;text-transform:uppercase;letter-spacing:1px;">PRESUPUESTO</div>
                      <div class="card-box-value" style="font-size:16px;font-weight:800;color:#101828;margin-top:4px;word-break:break-all;">${fmt(kpis.presupuestoMes)}</div>
                    </div>
                  </td>
                  <td width="48%" style="padding-left:6px;">
                    <div class="card-box" style="background:#F9FAFB;border-radius:10px;padding:12px 14px;border:1px solid #EAECF0;">
                      <div style="font-size:9px;font-weight:600;color:#98A2B3;text-transform:uppercase;letter-spacing:1px;">VS AÑO ANTERIOR</div>
                      <div class="card-box-value" style="font-size:16px;font-weight:800;color:${vsAntColor};margin-top:4px;">${kpis.vsAntMes != null ? vsAntSign + kpis.vsAntMes.toFixed(1) + '%' : '—'}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MÉTRICAS RÁPIDAS POR PERÍODO -->
          <tr>
            <td class="content-cell" style="padding:10px 20px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" class="quick-metrics">
                <tr>
                  ${quickMetrics.map(m => `
                  <td style="text-align:center;padding:0 3px;">
                    <div class="metric-label" style="font-size:9px;font-weight:600;color:#98A2B3;text-transform:uppercase;letter-spacing:0.5px;">${m.nombre}</div>
                    <div class="metric-value" style="font-size:13px;font-weight:800;color:#101828;margin-top:2px;">${fmtCompact(m.venta)}</div>
                  </td>`).join('')}
                </tr>
              </table>
            </td>
          </tr>

          <!-- SEPARADOR -->
          <tr>
            <td style="padding:0 20px;">
              <div style="border-top:1px solid #EAECF0;"></div>
            </td>
          </tr>

          <!-- TABLAS DE DATOS -->
          <tr>
            <td class="data-cell" style="padding:16px 20px 12px;">
              ${sections}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer-cell" style="padding:16px 20px 24px;text-align:center;">
              <div style="font-size:9px;font-weight:600;color:#98A2B3;text-transform:uppercase;letter-spacing:1.5px;line-height:1.5;">
                GENERADO AUTOMÁTICAMENTE POR ROSTI<br>CONTROL DE PRESUPUESTO
              </div>
              <div style="margin-top:10px;">
                <span style="display:inline-block;width:8px;height:8px;background:#E55B13;border-radius:50%;margin:0 2px;"></span>
                <span style="display:inline-block;width:8px;height:8px;background:#D0D5DD;border-radius:50%;margin:0 2px;"></span>
                <span style="display:inline-block;width:8px;height:8px;background:#D0D5DD;border-radius:50%;margin:0 2px;"></span>
              </div>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Función principal de generación y envío ────────────────────────────────────
// userPermissions = { allowedStores: string[], allowedCanales: string[] }
async function generarReporteAlcance(destinatarios, userPermissions = {}, config = {}) {
  const { gruposRows, canalesRows, totalRows, gruposDisponibles, hoy, ayer } = await fetchData();
  const { allowedStores, allowedCanales } = userPermissions;

  // Períodos: Ayer → YTD → Mes → Semana (sin Hoy)
  const periodos = [
    {
      nombre: 'Ayer', icono: '📅',
      grupos: agruparGrupos(gruposRows, totalRows, ayer, ayer, gruposDisponibles, allowedStores),
      canales: agruparCanales(canalesRows, ayer, ayer, allowedCanales)
    },
    {
      nombre: 'YTD', icono: '📊',
      grupos: agruparGrupos(gruposRows, totalRows, inicioAno(hoy), hoy, gruposDisponibles, allowedStores),
      canales: agruparCanales(canalesRows, inicioAno(hoy), hoy, allowedCanales)
    },
    {
      nombre: 'Mes', icono: '🗓️',
      grupos: agruparGrupos(gruposRows, totalRows, inicioMes(hoy), hoy, gruposDisponibles, allowedStores),
      canales: agruparCanales(canalesRows, inicioMes(hoy), hoy, allowedCanales)
    },
    {
      nombre: 'Semana', icono: '📆',
      grupos: agruparGrupos(gruposRows, totalRows, inicioSemana(hoy), hoy, gruposDisponibles, allowedStores),
      canales: agruparCanales(canalesRows, inicioSemana(hoy), hoy, allowedCanales)
    },
  ];

  // KPIs ejecutivos del mes
  const mesDatos = periodos.find(p => p.nombre === 'Mes');
  const corpMes = mesDatos?.grupos?.find(g => g.isCorporacion) || {};
  const kpis = {
    ventaMes: corpMes.venta || 0,
    presupuestoMes: corpMes.presupuesto || 0,
    difMes: corpMes.dif || 0,
    pctMes: corpMes.pct || 0,
    anteriorMes: corpMes.anterior || 0,
    vsAntMes: corpMes.vsAnterior
  };

  const html = buildHTML(hoy, periodos, kpis, config);

  // Envío via nodemailer
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
    tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
  });

  const hoyStr = hoy.toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nombreReporte = config.nombre || 'Reporte Nocturno de Ventas';
  const iconoReporte = config.icono || '🌙';

  // Prepare logo attachment for CID embedding
  const attachments = [];
  if (fs.existsSync(LOGO_PATH)) {
    attachments.push({
      filename: 'LogoRosti.png',
      path: LOGO_PATH,
      cid: 'logo-rosti'
    });
  }

  await transporter.sendMail({
    from: `"Rosti Control" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
    to: destinatarios.join(';'),
    subject: `${iconoReporte} ${nombreReporte} — ${hoyStr}`,
    html,
    attachments,
  });

  console.log(`📧 Reporte nocturno enviado a: ${destinatarios.join(', ')}`);
  return { ok: true, html };
}

// ── Preview (genera HTML sin enviar correo) ───────────────────────────────────
async function generarReporteAlcancePreview(userPermissions = {}, config = {}) {
  const { gruposRows, canalesRows, totalRows, gruposDisponibles, hoy, ayer } = await fetchData();
  const { allowedStores, allowedCanales } = userPermissions;

  const periodos = [
    { nombre: 'Ayer', icono: '📅', grupos: agruparGrupos(gruposRows, totalRows, ayer, ayer, gruposDisponibles, allowedStores), canales: agruparCanales(canalesRows, ayer, ayer, allowedCanales) },
    { nombre: 'YTD', icono: '📊', grupos: agruparGrupos(gruposRows, totalRows, inicioAno(hoy), hoy, gruposDisponibles, allowedStores), canales: agruparCanales(canalesRows, inicioAno(hoy), hoy, allowedCanales) },
    { nombre: 'Mes', icono: '🗓️', grupos: agruparGrupos(gruposRows, totalRows, inicioMes(hoy), hoy, gruposDisponibles, allowedStores), canales: agruparCanales(canalesRows, inicioMes(hoy), hoy, allowedCanales) },
    { nombre: 'Semana', icono: '📆', grupos: agruparGrupos(gruposRows, totalRows, inicioSemana(hoy), hoy, gruposDisponibles, allowedStores), canales: agruparCanales(canalesRows, inicioSemana(hoy), hoy, allowedCanales) },
  ];

  const mesDatos = periodos.find(p => p.nombre === 'Mes');
  const corpMes = mesDatos?.grupos?.find(g => g.isCorporacion) || {};
  const kpis = {
    ventaMes: corpMes.venta || 0, presupuestoMes: corpMes.presupuesto || 0,
    difMes: corpMes.dif || 0, pctMes: corpMes.pct || 0,
    anteriorMes: corpMes.anterior || 0, vsAntMes: corpMes.vsAnterior
  };

  // For preview, embed logo as base64 data URI instead of CID
  const previewConfig = { ...config };
  if (fs.existsSync(LOGO_PATH)) {
    const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
    previewConfig._logoDataUri = `data:image/png;base64,${logoBase64}`;
  }

  return buildHTML(hoy, periodos, kpis, previewConfig);
}

// ── Función de prueba ──────────────────────────────────────────────────────────
async function test() {
  const { gruposRows, canalesRows, totalRows, gruposDisponibles, hoy, ayer } = await fetchData();

  console.log('\n📋 Grupos disponibles en DB:', gruposDisponibles.join(', '));

  // Sin filtro de permisos para test
  const periodos = [
    { nombre: 'Ayer', icono: '📅', grupos: agruparGrupos(gruposRows, totalRows, ayer, ayer, gruposDisponibles), canales: agruparCanales(canalesRows, ayer, ayer) },
    { nombre: 'YTD', icono: '📊', grupos: agruparGrupos(gruposRows, totalRows, inicioAno(hoy), hoy, gruposDisponibles), canales: agruparCanales(canalesRows, inicioAno(hoy), hoy) },
    { nombre: 'Mes', icono: '🗓️', grupos: agruparGrupos(gruposRows, totalRows, inicioMes(hoy), hoy, gruposDisponibles), canales: agruparCanales(canalesRows, inicioMes(hoy), hoy) },
    { nombre: 'Semana', icono: '📆', grupos: agruparGrupos(gruposRows, totalRows, inicioSemana(hoy), hoy, gruposDisponibles), canales: agruparCanales(canalesRows, inicioSemana(hoy), hoy) },
  ];

  // Log summary
  console.log('\n📊 === RESUMEN DE DATOS ===');
  for (const p of periodos) {
    console.log(`\n${p.icono} ${p.nombre}:`);
    for (const g of p.grupos) {
      console.log(`  ${g.icono} ${g.label}: Venta=${fmt(g.venta)} | Ppto=${fmt(g.presupuesto)} | %=${fmtPct(g.pct)} | vsAnt=${g.vsAnterior != null ? g.vsAnterior.toFixed(1) + '%' : '—'}`);
    }
    if (p.canales?.length > 0) {
      console.log('  --- Canales ---');
      for (const c of p.canales) {
        console.log(`  ${c.icono} ${c.label}: Venta=${fmt(c.venta)} | Ppto=${fmt(c.presupuesto)} | %=${fmtPct(c.pct)}`);
      }
    }
  }

  const mesDatos = periodos.find(p => p.nombre === 'Mes');
  const corpMes = mesDatos?.grupos?.find(g => g.isCorporacion) || {};
  const kpis = {
    ventaMes: corpMes.venta || 0, presupuestoMes: corpMes.presupuesto || 0,
    difMes: corpMes.dif || 0, pctMes: corpMes.pct || 0,
    anteriorMes: corpMes.anterior || 0, vsAntMes: corpMes.vsAnterior
  };

  const html = buildHTML(hoy, periodos, kpis);
  require('fs').writeFileSync('./reporte_nocturno_preview.html', html);
  console.log('\n✅ Preview guardado en reporte_nocturno_preview.html');
  process.exit(0);
}

module.exports = { generarReporteAlcance, generarReporteAlcancePreview, test };
