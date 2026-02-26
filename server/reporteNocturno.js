// =============================================================================
// REPORTE NOCTURNO DE VENTAS — Alcance de Presupuesto por Canal
// Usa RSM_ALCANCE_DIARIO: MontoReal = venta real, Monto = presupuesto
// =============================================================================
const { sql, poolPromise } = require('./db');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ── Grupos de canales (valores reales del campo Canal en la tabla) ─────────────
const GRUPOS = [
    { label: 'Corporación', canales: null },        // todos
    { label: 'Rosti (Rest. + Ventanitas)', canales: ['Restaurantes', 'Ventanitas'] },
    { label: 'Restaurantes', canales: ['Restaurantes'] },
    { label: 'Ventanitas', canales: ['Ventanitas'] },
    { label: 'DKS', canales: ['DKS', 'Dks'] },
];

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
    if (pct >= 90) return '#f59e0b';   // naranja
    return '#ef4444';                   // rojo
}
function semaforoBg(pct) {
    if (pct == null || isNaN(pct) || !isFinite(pct)) return '#1e293b';
    if (pct >= 100) return '#14532d';
    if (pct >= 90) return '#431407';
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
    d.setDate(d.getDate() - day);
    return d;
}

// ── Query Principal ────────────────────────────────────────────────────────────
async function fetchData() {
    const pool = await poolPromise;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);

    const desde = dateStr(inicioAno(hoy));
    const hastaHoy = dateStr(hoy);

    const result = await pool.request()
        .input('desde', sql.Date, desde)
        .input('hasta', sql.Date, hastaHoy)
        .query(`
            SELECT
                Fecha,
                Canal,
                SUM(MontoReal) AS VentaNeta,
                SUM(Monto)     AS Presupuesto
            FROM RSM_ALCANCE_DIARIO
            WHERE Fecha >= @desde AND Fecha <= @hasta
              AND Tipo = 'Ventas'
            GROUP BY Fecha, Canal
        `);

    return { rows: result.recordset, hoy, ayer };
}

// ── Agregación por período ─────────────────────────────────────────────────────
function agrupar(rows, desde, hasta) {
    const d0 = dateStr(desde), d1 = dateStr(hasta);
    const filtered = rows.filter(r => {
        const f = dateStr(new Date(r.Fecha));
        return f >= d0 && f <= d1;
    });

    // Map canal → totales
    const map = {};
    for (const r of filtered) {
        const canal = (r.Canal || '').trim();
        if (!map[canal]) map[canal] = { venta: 0, presupuesto: 0 };
        map[canal].venta += r.VentaNeta || 0;
        map[canal].presupuesto += r.Presupuesto || 0;
    }

    return GRUPOS.map(g => {
        let venta = 0, presupuesto = 0;
        if (g.canales === null) {
            // Corporación: suma todo
            for (const v of Object.values(map)) { venta += v.venta; presupuesto += v.presupuesto; }
        } else {
            for (const canal of g.canales) {
                const v = map[canal] || map[canal.toLowerCase()] || {};
                venta += v.venta || 0;
                presupuesto += v.presupuesto || 0;
            }
        }
        const pct = presupuesto > 0 ? (venta / presupuesto) * 100 : null;
        const dif = venta - presupuesto;
        return { label: g.label, venta, presupuesto, dif, pct };
    });
}

// ── Generador de HTML ──────────────────────────────────────────────────────────
function buildTableHTML(periodos) {
    const seccionesHTML = periodos.map(({ nombre, datos }) => `
        <div style="margin-bottom:32px;">
          <h3 style="margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#94a3b8;text-transform:uppercase;">${nombre}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:#1e293b;">
                <th style="padding:10px 14px;text-align:left;color:#94a3b8;font-size:12px;font-weight:600;border-bottom:1px solid #334155;">Canal</th>
                <th style="padding:10px 14px;text-align:right;color:#94a3b8;font-size:12px;font-weight:600;border-bottom:1px solid #334155;">Venta</th>
                <th style="padding:10px 14px;text-align:right;color:#94a3b8;font-size:12px;font-weight:600;border-bottom:1px solid #334155;">Presupuesto</th>
                <th style="padding:10px 14px;text-align:right;color:#94a3b8;font-size:12px;font-weight:600;border-bottom:1px solid #334155;">Diferencia</th>
                <th style="padding:10px 14px;text-align:center;color:#94a3b8;font-size:12px;font-weight:600;border-bottom:1px solid #334155;">%</th>
              </tr>
            </thead>
            <tbody>
              ${datos.map((r, i) => `
              <tr style="background:${i % 2 === 0 ? '#0f172a' : '#1e293b'};">
                <td style="padding:11px 14px;color:#e2e8f0;font-size:13px;font-weight:${i === 0 ? '700' : '400'};border-bottom:1px solid #1e293b;">
                  ${i === 0 ? '🏢 ' : ''}<span>${r.label}</span>
                </td>
                <td style="padding:11px 14px;text-align:right;color:#f1f5f9;font-size:13px;border-bottom:1px solid #1e293b;">${fmt(r.venta)}</td>
                <td style="padding:11px 14px;text-align:right;color:#94a3b8;font-size:13px;border-bottom:1px solid #1e293b;">${fmt(r.presupuesto)}</td>
                <td style="padding:11px 14px;text-align:right;font-size:13px;border-bottom:1px solid #1e293b;color:${r.dif >= 0 ? '#4ade80' : '#f87171'};">${fmt(r.dif)}</td>
                <td style="padding:11px 14px;text-align:center;border-bottom:1px solid #1e293b;">
                  <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${semaforoBg(r.pct)};color:${semaforo(r.pct)};">${fmtPct(r.pct)}</span>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
    `).join('');

    return seccionesHTML;
}

function buildHTML(hoy, ayer, periodos) {
    const horaStr = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    const fechaStr = hoy.toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte Nocturno de Ventas</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:22px;margin-bottom:2px;">🌙 Reporte Nocturno de Ventas</div>
                    <div style="font-size:13px;color:#c4b5fd;margin-top:4px;text-transform:capitalize;">${fechaStr}</div>
                  </td>
                  <td align="right">
                    <div style="font-size:30px;font-weight:800;color:#fff;">${horaStr}</div>
                    <div style="font-size:11px;color:#c4b5fd;">Hora de generación</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#0f172a;border:1px solid #1e293b;border-top:none;border-radius:0 0 16px 16px;padding:28px 32px;">
              ${buildTableHTML(periodos)}

              <!-- FOOTER -->
              <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1e293b;text-align:center;color:#475569;font-size:11px;">
                Generado automáticamente por <strong style="color:#6366f1;">Rosti Control de Presupuesto</strong> · ${new Date().toLocaleString('es-CR')}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Función principal de generación y envío ────────────────────────────────────
async function generarReporteAlcance(destinatarios) {
    const { rows, hoy, ayer } = await fetchData();

    const periodos = [
        { nombre: '📅 Hoy', datos: agrupar(rows, hoy, hoy) },
        { nombre: '📅 Ayer', datos: agrupar(rows, ayer, ayer) },
        { nombre: '📆 Semana', datos: agrupar(rows, inicioSemana(hoy), hoy) },
        { nombre: '🗓️ Mes', datos: agrupar(rows, inicioMes(hoy), hoy) },
        { nombre: '📊 YTD', datos: agrupar(rows, inicioAno(hoy), hoy) },
    ];

    const html = buildHTML(hoy, ayer, periodos);

    // Envío via nodemailer (mismo transporte del proyecto)
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

    await transporter.sendMail({
        from: `"Rosti Control" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
        to: destinatarios.join(';'),
        subject: `🌙 Reporte Nocturno de Ventas — ${hoyStr}`,
        html,
    });

    console.log(`📧 Reporte nocturno enviado a: ${destinatarios.join(', ')}`);
    return { ok: true, html };
}

// ── Función de prueba (node -e "require('./reporteNocturno').test()") ──────────
async function test() {
    const { html } = await generarReporteAlcance([process.env.SMTP_USER || process.env.EMAIL_USER || 'malfaro@rostipolloscr.com']);
    require('fs').writeFileSync('./reporte_nocturno_preview.html', html);
    console.log('✅ Preview guardado en reporte_nocturno_preview.html');
    process.exit(0);
}

module.exports = { generarReporteAlcance, test };
