import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Filter, CalendarDays, MapPin, AlertTriangle } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const RANGES = [
  { key: "anio", label: "Año" },
  { key: "sem", label: "Sem." },
  { key: "trim", label: "Trim." },
  { key: "mes", label: "Mes" },
];

const LOCAL_OPTIONS = [
  "Alajuela",
  "Real Alajuela",
  "Grupo GAM Oeste",
  "Grupo GAM Este",
  "Todos",
];

const CATEGORY_GROUPS = [
  {
    group: "Infraestructura",
    rows: [
      "Limpieza exteriores",
      "Áreas de salón e intermedio",
      "Baño invitados",
      "Documentación legal",
    ],
  },
  {
    group: "Operación y Servicio",
    rows: [
      "Urna de postres",
      "Área servicio exprés",
      "Personal servicio exprés",
      "PCC manejo térmico",
    ],
  },
  {
    group: "Pilas y Cocina",
    rows: [
      "Área de pilas rejilla",
      "Área de pilas limpieza",
      "Área de pilas químicos",
      "Área de cocina limpieza",
    ],
  },
  {
    group: "Control y Registros",
    rows: [
      "Manejo integrado de plagas",
      "Registro cocción pollo",
      "Lavado de manos",
      "Holding cabinet",
    ],
  },
];

function seededNumber(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function labelsByRange(range) {
  if (range === "anio") return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (range === "trim") return ["T1", "T2", "T3", "T4"];
  if (range === "sem") return ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12"];
  return Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
}

function makeHeatmapData({ year, local, range }) {
  const cols = labelsByRange(range);
  const rows = CATEGORY_GROUPS.flatMap((g) => g.rows.map((r) => ({ group: g.group, name: r })));

  return rows.map((row, rIdx) => {
    const values = cols.map((col, cIdx) => {
      const seed = seededNumber(`${year}-${local}-${range}-${row.name}-${col}`);
      const base = 80 + (seed % 18); // 80-97
      const variation = ((rIdx % 5) - 2) * 1.4 + Math.sin((cIdx + 1) / 2) * 1.8;
      let score = Math.max(58, Math.min(100, base + variation));

      // algunos focos rojos/amarillos para que el mockup se vea útil
      if (row.name.includes("pilas limpieza") && (cIdx === 1 || cIdx === 7)) score = 71 + (seed % 6);
      if (row.name.includes("plagas") && cIdx === 4) score = 68 + (seed % 7);
      if (row.name.includes("Baño") && cIdx === 9) score = 77 + (seed % 5);

      return Math.round(score * 10) / 10;
    });

    return { ...row, values };
  });
}

function makeTrendData({ year, local, range }) {
  const cols = labelsByRange(range);
  return cols.map((label, idx) => {
    const seed = seededNumber(`${year}-${local}-${range}-trend-${label}`);
    const overall = 84 + (seed % 13) + Math.sin(idx / 2) * 2.2;
    const hallazgos = Math.max(0, 12 - Math.round((overall - 80) / 2));
    return {
      periodo: label,
      puntaje: Math.round(Math.max(70, Math.min(100, overall)) * 10) / 10,
      meta: 95,
      hallazgos,
    };
  });
}

function colorForScore(score) {
  if (score == null) return { bg: "#f3f4f6", fg: "#111827" };
  if (score < 75) return { bg: "#fee2e2", fg: "#991b1b" };
  if (score < 85) return { bg: "#fef3c7", fg: "#92400e" };
  if (score < 92) return { bg: "#dcfce7", fg: "#166534" };
  return { bg: "#bbf7d0", fg: "#14532d" };
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export default function MockupMapaCalorInocuidad() {
  const [year, setYear] = useState("2026");
  const [range, setRange] = useState("anio");
  const [local, setLocal] = useState("Alajuela");

  const heatmap = useMemo(() => makeHeatmapData({ year, local, range }), [year, local, range]);
  const trend = useMemo(() => makeTrendData({ year, local, range }), [year, local, range]);
  const cols = labelsByRange(range);

  const avgScore = useMemo(() => {
    const all = heatmap.flatMap((r) => r.values);
    return average(all);
  }, [heatmap]);

  const below85 = useMemo(() => heatmap.filter((r) => average(r.values) < 85).length, [heatmap]);

  const totalEvaluaciones = useMemo(() => {
    const factor = range === "anio" ? 12 : range === "trim" ? 4 : range === "sem" ? 12 : 31;
    return local === "Todos" ? factor * 6 : factor;
  }, [range, local]);

  const hallazgosTop = useMemo(() => {
    return heatmap
      .map((r) => ({ categoria: r.name, promedio: average(r.values) }))
      .sort((a, b) => a.promedio - b.promedio)
      .slice(0, 4);
  }, [heatmap]);

  const groupRowSpans = useMemo(() => {
    const spans = {};
    CATEGORY_GROUPS.forEach((g) => {
      spans[g.group] = g.rows.length;
    });
    return spans;
  }, []);

  let groupSeen = {};

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mapa de Calor — Inocuidad {year}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mockup de vista con filtros por año, rango y local/grupo. Valores ilustrativos para diseño.
          </p>
        </div>

        <Card className="rounded-2xl shadow-sm border-slate-200">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-600 mb-2 block">AÑO</label>
                <div className="flex items-center gap-2 border rounded-xl bg-white px-3 py-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-transparent outline-none text-slate-800"
                  >
                    {["2026", "2025", "2024"].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="text-sm font-semibold text-slate-600 mb-2 block">RANGO</label>
                <div className="inline-flex rounded-xl border bg-white p-1 gap-1">
                  {RANGES.map((r) => (
                    <Button
                      key={r.key}
                      variant="ghost"
                      onClick={() => setRange(r.key)}
                      className={`rounded-lg px-4 ${range === r.key ? "bg-teal-500 text-white hover:bg-teal-500" : "text-slate-600"}`}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-6">
                <label className="text-sm font-semibold text-slate-600 mb-2 block">LOCAL / GRUPO</label>
                <div className="flex items-center gap-2 border rounded-xl bg-white px-3 py-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <select
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    className="w-full bg-transparent outline-none text-slate-800"
                  >
                    {LOCAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <Filter className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Puntaje promedio</div>
              <div className="text-2xl font-bold mt-1">{avgScore.toFixed(1)}%</div>
              <div className="text-xs text-slate-500 mt-1">Meta sugerida: 95%</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Evaluaciones</div>
              <div className="text-2xl font-bold mt-1">{totalEvaluaciones}</div>
              <div className="text-xs text-slate-500 mt-1">Según rango seleccionado</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Categorías bajo 85%</div>
              <div className="text-2xl font-bold mt-1">{below85}</div>
              <div className="text-xs text-slate-500 mt-1">Prioridad de mejora</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
              <div>
                <div className="text-xs text-slate-500">Hallazgo recurrente</div>
                <div className="text-sm font-semibold">Pilas / limpieza</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2 rounded-2xl shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Tendencia de Inocuidad</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis domain={[65, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <ReferenceLine y={95} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="puntaje" stroke="#0f766e" strokeWidth={3} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top hallazgos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hallazgosTop.map((h, i) => (
                <div key={h.categoria} className="rounded-xl border p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800 leading-tight">{i + 1}. {h.categoria}</div>
                    <span className="text-xs font-semibold rounded-md px-2 py-1 bg-slate-100">{h.promedio.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(4, Math.min(100, h.promedio))}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mapa de calor por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left border-b border-r min-w-[140px]">Grupo</th>
                    <th className="px-3 py-2 text-left border-b border-r min-w-[220px]">Categoría</th>
                    {cols.map((c) => (
                      <th key={c} className="px-2 py-2 text-center border-b border-r min-w-[52px]">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-center border-b min-w-[70px]">Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => {
                    const avg = average(row.values);
                    const showGroupCell = !groupSeen[row.group];
                    if (!groupSeen[row.group]) groupSeen[row.group] = true;
                    const avgColor = colorForScore(avg);
                    return (
                      <tr key={`${row.group}-${row.name}`} className="bg-white hover:bg-slate-50/70">
                        {showGroupCell && (
                          <td
                            rowSpan={groupRowSpans[row.group]}
                            className="px-3 py-2 border-b border-r align-top font-semibold text-slate-700 bg-slate-50"
                          >
                            {row.group}
                          </td>
                        )}
                        <td className="px-3 py-2 border-b border-r text-slate-700">{row.name}</td>
                        {row.values.map((v, idx) => {
                          const c = colorForScore(v);
                          return (
                            <td
                              key={idx}
                              className="px-2 py-2 border-b border-r text-center font-medium"
                              style={{ backgroundColor: c.bg, color: c.fg }}
                              title={`${row.name} • ${cols[idx]}: ${v}%`}
                            >
                              {Math.round(v)}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 border-b text-center font-semibold" style={{ backgroundColor: avgColor.bg, color: avgColor.fg }}>
                          {avg.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="font-semibold">Leyenda:</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#fee2e2' }} /> &lt; 75%</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#fef3c7' }} /> 75% - 84.9%</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#dcfce7' }} /> 85% - 91.9%</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#bbf7d0' }} /> ≥ 92%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
