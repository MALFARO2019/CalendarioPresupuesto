import { useState, useMemo, useEffect, useRef } from 'react';
import { FilterBar } from './components/FilterBar';
import { CalendarGrid } from './components/CalendarGrid';
import { LoginPage } from './components/LoginPage';
import { AdminPage } from './components/AdminPage';
import { generateMockData } from './mockData';
import type { BudgetRecord } from './mockData';
import { fetchBudgetData, fetchStores, fetchGroupStores, getToken, getUser, logout, verifyToken, API_BASE } from './api';
import { addMonths, format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, LogOut, Settings, Calendar, BarChart3, Download, Mail, Send, X, SlidersHorizontal } from 'lucide-react';

import { formatCurrency } from './utils/formatters';
import { useUserPreferences } from './context/UserPreferences';
import { AnnualCalendar } from './components/AnnualCalendar';
import { exportMonthlyExcel, exportAnnualExcel } from './utils/excelExporter';
import { TendenciaAlcance } from './components/TendenciaAlcance';
import { WeekDayBehavior } from './components/WeekDayBehavior';
import { WeeklyBehavior } from './components/WeeklyBehavior';
import { DailyBehaviorChart } from './components/DailyBehaviorChart';
import { InfoCard } from './components/InfoCard';
import { IncrementCard } from './components/IncrementCard';
import { SummaryCard } from './components/SummaryCard';
import { GroupMembersCard } from './components/GroupMembersCard';

type AppView = 'login' | 'dashboard' | 'admin';
type DashboardTab = 'mensual' | 'anual' | 'tendencia';

function App() {
  const [view, setView] = useState<AppView>('login');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('mensual');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [year, setYear] = useState(2026);
  const [filterLocal, setFilterLocal] = useState('');
  const [filterCanal, setFilterCanal] = useState('Todos');
  const [filterKpi, setFilterKpi] = useState('Ventas');
  const [filterType, setFilterType] = useState('Presupuesto');
  const { preferences, setPctDisplayMode, setPctDecimals, setValueDecimals, setDefaultYearType } = useUserPreferences();
  const [yearType, setYearType] = useState<'Año Anterior' | 'Año Anterior Ajustado'>(preferences.defaultYearType);

  const [data, setData] = useState<BudgetRecord[]>([]);
  const [dataVentas, setDataVentas] = useState<BudgetRecord[]>([]);
  const [dataTransacciones, setDataTransacciones] = useState<BudgetRecord[]>([]);
  const [dataTQP, setDataTQP] = useState<BudgetRecord[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [individualStores, setIndividualStores] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [showGroupCard, setShowGroupCard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useApi, setUseApi] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        const valid = await verifyToken();
        if (valid) {
          setView('dashboard');
        } else {
          logout();
        }
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, []);

  // Fetch stores when dashboard loads
  useEffect(() => {
    if (view !== 'dashboard') return;

    fetchStores()
      .then(storeData => {
        setGroups(storeData.groups);
        setIndividualStores(storeData.individuals);
        // Auto-select first individual store
        if (!filterLocal && storeData.individuals.length > 0) {
          setFilterLocal(storeData.individuals[0]);
        }
      })
      .catch(err => console.warn('Could not fetch stores:', err.message));
  }, [view]);

  // Fetch budget data when filters change
  useEffect(() => {
    if (view !== 'dashboard') return;

    if (!useApi) {
      console.log('🔵 useApi is false, skipping API call');
      return;
    }

    if (!filterLocal) {
      console.log('🔴 filterLocal is undefined, waiting for store selection');
      return;
    }

    console.log('🚀 Fetching budget data:', { year, filterLocal, filterCanal, filterKpi });
    setLoading(true);
    setError(null);

    // Fetch data for current selected KPI (for calendar and charts)
    fetchBudgetData(year, filterLocal, filterCanal, filterKpi)
      .then(records => {
        console.log('✅ Budget data loaded:', records.length, 'records');
        setData(records);
      })
      .catch(err => {
        console.error('❌ API failed:', err);
        console.warn('🔄 Falling back to mock data');
        setError(`Error al cargar datos: ${err.message}`);
        setData(generateMockData());
        setUseApi(false);
      });

    // Fetch data for ALL 3 KPIs for summary card
    Promise.all([
      fetchBudgetData(year, filterLocal, filterCanal, 'Ventas'),
      fetchBudgetData(year, filterLocal, filterCanal, 'Transacciones'),
      fetchBudgetData(year, filterLocal, filterCanal, 'TQP')
    ])
      .then(([ventas, transacciones, tqp]) => {
        setDataVentas(ventas);
        setDataTransacciones(transacciones);
        setDataTQP(tqp);
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ Failed to fetch all KPIs:', err);
        setLoading(false);
      });
  }, [year, filterLocal, filterCanal, filterKpi, useApi, view]);

  // Fetch group members when a group is selected
  useEffect(() => {
    console.log('🔍 Group detection - filterLocal:', filterLocal, 'groups:', groups, 'view:', view);

    if (view !== 'dashboard' || !filterLocal) {
      console.log('⚠️ Hiding card - not dashboard or no filterLocal');
      setShowGroupCard(false);
      setGroupMembers([]);
      return;
    }

    // Check if selected local is a group
    const isGroup = groups.includes(filterLocal);
    console.log('🎯 Is group?', isGroup, '- filterLocal:', filterLocal);

    if (isGroup) {
      console.log('📡 Fetching group stores for:', filterLocal);
      fetchGroupStores(filterLocal)
        .then(data => {
          console.log('✅ Group stores loaded:', data.stores.length, 'stores');
          setGroupMembers(data.stores);
          setShowGroupCard(true);
        })
        .catch(err => {
          console.error('❌ Error fetching group stores:', err);
          setGroupMembers([]);
          setShowGroupCard(false);
        });
    } else {
      console.log('➡️ Not a group, hiding card');
      setShowGroupCard(false);
      setGroupMembers([]);
    }
  }, [filterLocal, groups, view]);

  const currentMonthData = useMemo(() => {
    const month = currentDate.getMonth() + 1;
    const yearVal = currentDate.getFullYear();
    const filtered = data.filter(d => d.Mes === month && d.Año === yearVal);
    return filtered;
  }, [data, currentDate]);

  const handlePrevMonth = () => {
    const newDate = subMonths(currentDate, 1);
    if (newDate.getFullYear() === 2026) setCurrentDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = addMonths(currentDate, 1);
    if (newDate.getFullYear() === 2026) setCurrentDate(newDate);
  };

  const handleLogout = () => {
    logout();
    setView('login');
    setData([]);
    setGroups([]);
    setIndividualStores([]);
  };

  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showUserPrefs, setShowUserPrefs] = useState(false);
  const [tacticaOpen, setTacticaOpen] = useState(false);
  const tendenciaExportRef = useRef<(() => void) | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);


  const handlePrintPDF = () => {
    setShowReportMenu(false);
    window.print();
  };

  const handleSendEmail = () => {
    setShowReportMenu(false);
    // Default to logged-in user's email
    if (!emailTo && user?.email) {
      setEmailTo(user.email);
    }
    setShowEmailModal(true);
  };

  const buildReportHTML = () => {
    const sourceData = dashboardTab === 'mensual' ? currentMonthData : data;
    if (!sourceData || sourceData.length === 0) {
      return '<p>No hay datos disponibles para este reporte.</p>';
    }

    // Use data values directly from the view - no recalculation
    const totalReal = sourceData.reduce((s: number, d: any) => s + (d.MontoReal || 0), 0);
    const totalPpto = sourceData.reduce((s: number, d: any) => s + (d.Monto || 0), 0);
    const pctAlcance = totalPpto > 0 ? ((totalReal / totalPpto) * 100).toFixed(1) : '0.0';
    const pctClass = parseFloat(pctAlcance) >= 100 ? 'pct-green' : parseFloat(pctAlcance) >= 90 ? 'pct-orange' : 'pct-red';

    let html = `
      <h3 style="color:#374151;margin:0 0 10px 0;font-size:16px;">Resumen de Alcance</h3>
      <table class="report-table">
        <tr>
          <th>Métrica</th>
          <th style="text-align:right">Valor</th>
        </tr>
        <tr>
          <td>Real Acumulado</td>
          <td style="text-align:right;font-weight:600">${formatCurrency(totalReal, filterKpi)}</td>
        </tr>
        <tr>
          <td>Presupuesto Acumulado</td>
          <td style="text-align:right;font-weight:600">${formatCurrency(totalPpto, filterKpi)}</td>
        </tr>
        <tr>
          <td>Alcance</td>
          <td style="text-align:right" class="${pctClass}">${pctAlcance}%</td>
        </tr>
      </table>
    `;

    // Sort by day number ascending
    const sortedData = [...sourceData].sort((a: any, b: any) => (a.Dia || 0) - (b.Dia || 0));

    html += `
      <h3 style="color:#374151;margin:20px 0 10px 0;font-size:16px;">Detalle Diario</h3>
      <table class="report-table">
        <tr>
          <th>Día</th>
          <th style="text-align:right">Real</th>
          <th style="text-align:right">Presupuesto</th>
          <th style="text-align:right">Alcance</th>
        </tr>
    `;

    sortedData.forEach((d: any) => {
      const pct = d.Monto > 0 ? ((d.MontoReal / d.Monto) * 100).toFixed(1) : '-';
      const cls = pct !== '-' ? (parseFloat(pct) >= 100 ? 'pct-green' : parseFloat(pct) >= 90 ? 'pct-orange' : 'pct-red') : '';
      html += `
        <tr>
          <td>${d.Dia || '-'}</td>
          <td style="text-align:right">${formatCurrency(d.MontoReal || 0, filterKpi)}</td>
          <td style="text-align:right">${formatCurrency(d.Monto || 0, filterKpi)}</td>
          <td style="text-align:right" class="${cls}">${pct}%</td>
        </tr>
      `;
    });
    html += '</table>';
    return html;
  };

  const handleSendReportEmail = async () => {
    if (!emailTo.trim()) return;
    setEmailSending(true);
    try {
      const title = dashboardTab === 'mensual' ? `Calendario Mensual ${year}` :
        dashboardTab === 'anual' ? `Calendario Anual ${year}` : `Tendencia Alcance ${year}`;

      const response = await fetch(`${API_BASE}/send-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          recipientEmail: emailTo.trim(),
          reportTitle: title,
          reportData: {
            local: filterLocal || 'Todos',
            kpi: filterKpi,
            canal: filterCanal || 'Todos'
          },
          htmlContent: buildReportHTML()
        })
      });

      const result = await response.json();
      if (response.ok) {
        alert('✅ Reporte enviado exitosamente a ' + emailTo);
        setShowEmailModal(false);
        setEmailTo('');
      } else {
        alert('❌ Error: ' + (result.error || 'Error al enviar'));
      }
    } catch (error) {
      alert('❌ Error de conexión al enviar el correo');
      console.error(error);
    }
    setEmailSending(false);
  };

  const user = getUser();

  // Loading auth check
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  // Login view
  if (view === 'login') {
    return (
      <LoginPage
        onLoginSuccess={() => { setUseApi(true); setView('dashboard'); }}
      />
    );
  }

  // Admin view
  if (view === 'admin') {
    return <AdminPage onBack={() => setView('dashboard')} currentUser={user} />;
  }

  // Dashboard view
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-inter text-gray-800 pb-20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-md">
        <div className="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/LogoRosti.png" alt="Rosti" className="h-14 w-auto rounded-xl" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Calendario de Presupuesto</h1>
              <p className="text-xs text-gray-500 font-medium">Gestión y visualización de métricas diarias</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Data source indicator */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${useApi ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              <div className={`w-2 h-2 rounded-full ${useApi ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              {useApi ? 'SQL Server' : 'Datos Mock'}
            </div>

            {/* User info */}
            {user && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="text-xs font-bold text-indigo-600">{user.email?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-xs font-medium text-gray-600 max-w-[120px] truncate">{user.email}</span>
              </div>
            )}



            {/* Report Menu */}
            <div className="relative">
              <button
                onClick={() => setShowReportMenu(!showReportMenu)}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                title="Generar Reporte"
              >
                <Download className="w-4 h-4" />
              </button>
              {showReportMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowReportMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
                    <button
                      onClick={handlePrintPDF}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <div className="text-left">
                        <div className="font-semibold">Descargar PDF</div>
                        <div className="text-xs text-gray-400">Imprimir vista actual</div>
                      </div>
                    </button>
                    <div className="h-px bg-gray-100" />
                    <button
                      onClick={() => {
                        setShowReportMenu(false);
                        if (dashboardTab === 'mensual') {
                          exportMonthlyExcel(data, year, currentDate.getMonth(), filterLocal, filterKpi);
                        } else if (dashboardTab === 'anual') {
                          exportAnnualExcel(data, year, filterLocal, filterKpi);
                        } else if (dashboardTab === 'tendencia' && tendenciaExportRef.current) {
                          tendenciaExportRef.current();
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="text-left">
                        <div className="font-semibold">Exportar Excel</div>
                        <div className="text-xs text-gray-400">Datos de vista actual</div>
                      </div>
                    </button>
                    <div className="h-px bg-gray-100" />
                    <button
                      onClick={handleSendEmail}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                    >
                      <Mail className="w-4 h-4" />
                      <div className="text-left">
                        <div className="font-semibold">Enviar por Correo</div>
                        <div className="text-xs text-gray-400">Abrir cliente de correo</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* User Preferences */}
            <div className="relative">
              <button
                onClick={() => setShowUserPrefs(!showUserPrefs)}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                title="Preferencias"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {showUserPrefs && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowUserPrefs(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <h4 className="text-sm font-bold text-gray-700">⚙️ Preferencias</h4>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Formato de Porcentajes */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Formato de Porcentajes</label>
                        <div className="flex flex-col gap-2">
                          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${preferences.pctDisplayMode === 'base100' ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="pctMode" checked={preferences.pctDisplayMode === 'base100'} onChange={() => setPctDisplayMode('base100')} className="accent-indigo-600" />
                            <div>
                              <div className="text-sm font-semibold text-gray-800">Base 100</div>
                              <div className="text-xs text-gray-500">Ej: 105%, 92%</div>
                            </div>
                          </label>
                          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${preferences.pctDisplayMode === 'differential' ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="pctMode" checked={preferences.pctDisplayMode === 'differential'} onChange={() => setPctDisplayMode('differential')} className="accent-indigo-600" />
                            <div>
                              <div className="text-sm font-semibold text-gray-800">Diferencial</div>
                              <div className="text-xs text-gray-500">Ej: +5%, -8%</div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="h-px bg-gray-100" />

                      {/* Decimales de Porcentajes */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Decimales en Porcentajes</label>
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map(d => (
                            <button
                              key={d}
                              onClick={() => setPctDecimals(d)}
                              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all border ${preferences.pctDecimals === d
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >{d}</button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Ej: {(105.1234).toFixed(preferences.pctDecimals)}%</p>
                      </div>

                      <div className="h-px bg-gray-100" />

                      {/* Decimales de Valores */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Decimales en Valores</label>
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map(d => (
                            <button
                              key={d}
                              onClick={() => setValueDecimals(d)}
                              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all border ${preferences.valueDecimals === d
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >{d}</button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Ej: ₡{new Intl.NumberFormat('es-CR', { minimumFractionDigits: preferences.valueDecimals, maximumFractionDigits: preferences.valueDecimals }).format(1234567.89)}</p>
                      </div>

                      <div className="h-px bg-gray-100" />

                      {/* Tipo Año Predeterminado */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Tipo Año Predeterminado</label>
                        <select
                          value={preferences.defaultYearType}
                          onChange={e => {
                            const val = e.target.value as 'Año Anterior' | 'Año Anterior Ajustado';
                            setDefaultYearType(val);
                            setYearType(val);
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          <option value="Año Anterior">Año Anterior</option>
                          <option value="Año Anterior Ajustado">Año Anterior Ajustado</option>
                        </select>
                      </div>

                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Táctica Button - only in Annual view and if enabled */}
            {dashboardTab === 'anual' && user?.accesoTactica && (
              <button
                onClick={() => setTacticaOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all text-sm font-medium"
                title="Análisis Táctico IA"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Táctica
              </button>
            )}

            {/* Admin/Events button - for admin or eventos users */}
            {(user?.esAdmin || user?.accesoEventos) && (
              <button
                onClick={() => setView('admin')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                title={user?.esAdmin ? "Configuración" : "Eventos"}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Tab selector */}
            <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100 shadow-inner mr-3">
              <button
                onClick={() => setDashboardTab('mensual')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'mensual'
                  ? 'bg-white shadow-sm text-indigo-600'
                  : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Mensual
              </button>
              <button
                onClick={() => setDashboardTab('anual')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'anual'
                  ? 'bg-white shadow-sm text-indigo-600'
                  : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Anual
              </button>
              {user?.accesoTendencia && (
                <button
                  onClick={() => setDashboardTab('tendencia')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'tendencia'
                    ? 'bg-white shadow-sm text-indigo-600'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Tendencia
                </button>
              )}
            </div>

            {/* Month selector - only for mensual */}
            {dashboardTab === 'mensual' && (
              <div className="flex items-center bg-gray-50 rounded-xl p-1.5 border border-gray-100 shadow-inner">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500 hover:text-indigo-600 disabled:opacity-30"
                  disabled={currentDate.getMonth() === 0}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="px-6 py-1 min-w-[180px] text-center">
                  <span className="text-sm font-bold capitalize text-gray-800 block">
                    {format(currentDate, 'MMMM', { locale: es })}
                  </span>
                  <span className="text-xs text-gray-400 font-bold block">
                    {format(currentDate, 'yyyy')}
                  </span>
                </div>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500 hover:text-indigo-600 disabled:opacity-30"
                  disabled={currentDate.getMonth() === 11}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Year display - only for anual and tendencia */}
            {(dashboardTab === 'anual' || dashboardTab === 'tendencia') && (
              <div className="flex items-center bg-gray-50 rounded-xl px-5 py-2.5 border border-gray-100 shadow-inner">
                <span className="text-sm font-bold text-gray-800">Año {year}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Print-only header (hidden on screen, visible on print) */}
      <div className="print-header">
        <img src="/LogoRosti.png" alt="Rosti" />
        <div>
          <div className="print-title">
            {dashboardTab === 'mensual' ? `Calendario Mensual - ${format(currentDate, 'MMMM yyyy', { locale: es })}` :
              dashboardTab === 'anual' ? `Calendario Anual ${year}` : `Tendencia Alcance ${year}`}
          </div>
          <div className="print-subtitle">Local: {filterLocal || 'Todos'} | KPI: {filterKpi} | Canal: {filterCanal}</div>
        </div>
        <div className="print-meta">
          <div>Generado: {new Date().toLocaleDateString('es-CR')}</div>
          <div>{user?.nombre || user?.email || ''}</div>
        </div>
      </div>

      <main id="dashboard-content" className="max-w-[1600px] mx-auto px-6 py-8">
        {dashboardTab !== 'tendencia' && (
          <FilterBar
            year={year}
            setYear={setYear}
            filterLocal={filterLocal}
            setFilterLocal={setFilterLocal}
            filterCanal={filterCanal}
            setFilterCanal={setFilterCanal}
            filterKpi={filterKpi}
            setFilterKpi={setFilterKpi}
            filterType={filterType}
            setFilterType={setFilterType}
            yearType={yearType}
            setYearType={setYearType}
            groups={groups}
            individualStores={individualStores}
          />
        )}




        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="ml-3 text-gray-500 font-medium">Cargando datos...</span>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <span className="text-yellow-600 text-sm">⚠️ No se pudo conectar al servidor. Usando datos de prueba.</span>
            <button
              onClick={() => { setUseApi(true); setError(null); }}
              className="text-yellow-700 underline text-sm font-medium hover:text-yellow-800"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && dashboardTab === 'mensual' && (
          <>
            {/* Summary Card */}
            <div className="print-page">
              <SummaryCard
                dataVentas={dataVentas}
                dataTransacciones={dataTransacciones}
                dataTQP={dataTQP}
                currentMonth={currentDate.getMonth()}
                comparisonType={filterType}
                yearType={yearType}
                filterLocal={filterLocal}
              />
            </div>

            {/* Calendar Grid + Behavior Analysis in same row */}
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Calendar Grid */}
              <div className="print-page lg:flex-[3]">
                <div id="monthly-calendar-container">
                  <CalendarGrid
                    data={currentMonthData}
                    month={currentDate.getMonth()}
                    year={currentDate.getFullYear()}
                    comparisonType={filterType}
                    kpi={filterKpi}
                  />
                </div>
              </div>

              {/* Behavior Analysis */}
              <div className="print-page lg:flex-[2]">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg h-full">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800 mb-1">Análisis de Comportamiento</h2>
                    <p className="text-xs text-gray-400">Desempeño semanal y por día</p>
                  </div>
                  <div className="flex flex-col gap-6">
                    <WeekDayBehavior data={currentMonthData} kpi={filterKpi} comparisonType={filterType} yearType={yearType} />
                    <div className="h-px bg-gray-200"></div>
                    <WeeklyBehavior data={currentMonthData} kpi={filterKpi} comparisonType={filterType} yearType={yearType} />
                  </div>
                </div>
              </div>
            </div>

            {/* Page 4: Daily Chart */}
            <div className="print-page">
              <div className="mt-8">
                <DailyBehaviorChart data={currentMonthData} kpi={filterKpi} />
              </div>
            </div>

            {/* Page 5: Increments & Info */}
            <div className="print-page">
              {currentDate.getMonth() >= new Date().getMonth() && currentDate.getFullYear() >= new Date().getFullYear() && (
                <div className="mt-8">
                  <IncrementCard data={currentMonthData} currentDate={currentDate} />
                </div>
              )}

              <InfoCard />
            </div>

            {showGroupCard && (
              <GroupMembersCard
                groupName={filterLocal}
                stores={groupMembers}
              />
            )}

          </>
        )}

        {!loading && dashboardTab === 'anual' && (
          <>
            {/* Summary Card */}
            <SummaryCard
              dataVentas={dataVentas}
              dataTransacciones={dataTransacciones}
              dataTQP={dataTQP}
              currentMonth={currentDate.getMonth()}
              comparisonType={filterType}
              yearType={yearType}
              filterLocal={filterLocal}
              isAnnual={true}
            />

            <div id="annual-calendar-container">
              <AnnualCalendar
                data={data}
                year={year}
                comparisonType={filterType}
                kpi={filterKpi}
                yearType={yearType}
                storeName={filterLocal}
                tacticaOpen={tacticaOpen}
                onTacticaClose={() => setTacticaOpen(false)}
              />
            </div>

            <InfoCard />

            {showGroupCard && (
              <GroupMembersCard
                groupName={filterLocal}
                stores={groupMembers}
              />
            )}

          </>
        )}

        {!loading && dashboardTab === 'tendencia' && user?.accesoTendencia && (
          <div id="tendencia-container">
            <TendenciaAlcance
              year={year}
              startDate={`${year}-01-01`}
              endDate={format(new Date(), 'yyyy-MM-dd')}
              groups={groups}
              individualStores={individualStores}
              onExportExcel={(fn) => { tendenciaExportRef.current = fn; }}
            />
          </div>
        )}
      </main>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center no-print">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEmailModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
            <button
              onClick={() => setShowEmailModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Enviar Reporte por Correo</h3>
            <p className="text-sm text-gray-500 mb-4">El reporte se enviará como HTML en el cuerpo del correo</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email del destinatario</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="ejemplo@empresa.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReportEmail()}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendReportEmail}
                  disabled={emailSending || !emailTo.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {emailSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Enviar Reporte</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
