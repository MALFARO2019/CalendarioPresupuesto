import { useState, useMemo, useEffect, useRef } from 'react';
import { FilterBar } from './components/FilterBar';
import { CalendarGrid } from './components/CalendarGrid';
import { LoginPage } from './components/LoginPage';
import { AdminPage } from './components/AdminPage';
import { Dashboard } from './views/Dashboard';
import { generateMockData } from './mockData';
import type { BudgetRecord } from './mockData';
import { fetchBudgetData, fetchFechaLimite, fetchStores, fetchGroupStores, fetchAvailableCanales, getToken, getUser, logout, verifyToken, API_BASE, fetchEventosPorMes, fetchEventosPorAno, fetchSPEventosPorMes, fetchSPEventosPorAno, fetchEventosAjuste, fetchAdminPorLocal, type PersonalAsignado, type EventosByDate } from './api';
import { addMonths, format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, LogOut, Settings, Calendar, BarChart3, Download, Mail, Send, X, SlidersHorizontal, Home } from 'lucide-react';

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
import { RangosView } from './components/RangosView';
import { PreferencesView } from './components/PreferencesView';

type AppView = 'login' | 'dashboard' | 'admin' | 'preferencias';
type DashboardTab = 'home' | 'mensual' | 'anual' | 'tendencia' | 'rangos';

function App() {
  const [view, setView] = useState<AppView>('login');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('home');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [year, setYear] = useState(2026);
  const [filterLocal, setFilterLocal] = useState('');
  const [filterCanal, setFilterCanal] = useState('Todos');
  const [filterKpi, setFilterKpi] = useState('Ventas');
  const [filterType, setFilterType] = useState('Presupuesto');
  const { preferences, setPctDisplayMode, setPctDecimals, setValueDecimals, setValueDisplayMode, setDefaultYearType, setGroupOrder } = useUserPreferences();
  const user = getUser();
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
  const [availableCanales, setAvailableCanales] = useState<string[]>([]);
  const [dbMode, setDbMode] = useState<string>('primary');
  const [fechaLimite, setFechaLimite] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [verEventos, setVerEventos] = useState(false);
  const [eventsByDate, setEventsByDate] = useState<EventosByDate>({});
  const [eventosByYear, setEventosByYear] = useState<EventosByDate>({});
  const [eventosYear, setEventosYear] = useState(new Date().getFullYear());
  const [verEventosAjuste, setVerEventosAjuste] = useState(false);
  const [eventosAjusteByDate, setEventosAjusteByDate] = useState<EventosByDate>({});
  const [verEventosAA, setVerEventosAA] = useState(false);
  const [eventosAAByDate, setEventosAAByDate] = useState<EventosByDate>({});
  const [adminNameForLocal, setAdminNameForLocal] = useState<PersonalAsignado[]>([]);
  const [appVersion, setAppVersion] = useState('');

  // Fetch DB mode on mount
  useEffect(() => {
    fetch(`${API_BASE}/db-mode`)
      .then(r => r.json())
      .then(d => { if (d.mode) setDbMode(d.mode); })
      .catch(() => { });

    // Fetch app version
    fetch(`${API_BASE}/version-check`)
      .then(r => r.json())
      .then(d => { if (d.version) setAppVersion(d.version); })
      .catch(() => { });
  }, []);

  // Fetch eventos por mes y por año cuando verEventos está activo
  // Merges both DIM_EVENTOS (internal) and SharePoint Eventos Rosti
  useEffect(() => {
    if (!verEventos) {
      setEventsByDate({});
      setEventosByYear({});
      return;
    }
    const token = getToken();
    if (!token) return;
    const month = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Merge helper: combine two EventosByDate maps
    const mergeEvents = (a: EventosByDate, b: EventosByDate): EventosByDate => {
      const merged = { ...a };
      for (const [key, evs] of Object.entries(b)) {
        merged[key] = [...(merged[key] || []), ...evs];
      }
      return merged;
    };

    // Fetch por mes: DIM_EVENTOS + SharePoint
    Promise.all([
      fetchEventosPorMes(currentYear, month),
      fetchSPEventosPorMes(currentYear, month)
    ]).then(([dim, sp]) => setEventsByDate(mergeEvents(dim, sp)));

    // Fetch por año: DIM_EVENTOS + SharePoint
    Promise.all([
      fetchEventosPorAno(eventosYear),
      fetchSPEventosPorAno(eventosYear)
    ]).then(([dim, sp]) => setEventosByYear(mergeEvents(dim, sp)));
  }, [verEventos, currentDate, eventosYear]);

  // Fetch eventos del año anterior y mapear a fechas del año actual
  useEffect(() => {
    if (!verEventosAA) {
      setEventosAAByDate({});
      return;
    }
    const token = getToken();
    if (!token) return;
    const currentYear = currentDate.getFullYear();
    const prevYear = currentYear - 1;
    const month = currentDate.getMonth() + 1;

    const mergeEvents = (a: EventosByDate, b: EventosByDate): EventosByDate => {
      const merged = { ...a };
      for (const [key, evs] of Object.entries(b)) {
        merged[key] = [...(merged[key] || []), ...evs];
      }
      return merged;
    };

    // Remap date keys: 2025-MM-DD → 2026-MM-DD (shift to current year)
    const remapYear = (events: EventosByDate): EventosByDate => {
      const remapped: EventosByDate = {};
      for (const [dateKey, evs] of Object.entries(events)) {
        const newKey = `${currentYear}${dateKey.substring(4)}`; // Replace year prefix
        remapped[newKey] = (remapped[newKey] || []).concat(
          evs.map(e => ({ ...e, evento: `[${prevYear}] ${e.evento}` }))
        );
      }
      return remapped;
    };

    // Fetch from same sources but for prevYear
    Promise.all([
      fetchEventosPorMes(prevYear, month),
      fetchSPEventosPorMes(prevYear, month)
    ]).then(([dim, sp]) => setEventosAAByDate(remapYear(mergeEvents(dim, sp))));
  }, [verEventosAA, currentDate]);

  // Fetch all personal assigned to selected local (only for individual stores, not groups)
  useEffect(() => {
    if (!filterLocal || groups.includes(filterLocal)) {
      setAdminNameForLocal([]);
      return;
    }
    let cancelled = false;
    fetchAdminPorLocal(filterLocal).then(lista => {
      if (!cancelled) setAdminNameForLocal(lista);
    });
    return () => { cancelled = true; };
  }, [filterLocal, groups]);

  // Fetch adjustment events (USARENPRESUPUESTO) - no year filter
  useEffect(() => {
    if (!verEventosAjuste) {
      setEventosAjusteByDate({});
      return;
    }
    const token = getToken();
    if (!token) return;
    fetchEventosAjuste().then(data => setEventosAjusteByDate(data));
  }, [verEventosAjuste]);

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

  // Fetch stores and fecha limite when dashboard loads
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

    // Fetch available canales for current user
    fetchAvailableCanales()
      .then(canales => {
        setAvailableCanales(canales);
        console.log('📡 Available canales loaded:', canales);
      })
      .catch(err => console.warn('Could not fetch canales:', err.message));

    // Fetch the cutoff date from DB (MAX(Fecha) WHERE MontoReal > 0)
    fetchFechaLimite(year)
      .then(fecha => {
        if (fecha) {
          setFechaLimite(fecha);
          console.log('📅 Fecha limite loaded from DB:', fecha);
        }
      })
      .catch(err => console.warn('Could not fetch fecha limite:', err.message));
  }, [view, year]);

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
    // NOTE: Do NOT pass date range - let AnnualCalendar filter internally for correct PRESUP vs P.ACUM calculation
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
        onAdminAccess={() => { setView('admin'); }}
      />
    );
  }

  // Admin view
  if (view === 'admin') {
    const adminUser = user || getUser();
    const isOfflineAdmin = adminUser?.offlineAdmin === true;
    return <AdminPage onBack={() => setView(isOfflineAdmin ? 'login' : 'dashboard')} currentUser={adminUser} />;
  }

  // Preferences view
  if (view === 'preferencias') {
    return (
      <PreferencesView
        onBack={() => setView('dashboard')}
        groups={groups}
        yearType={yearType}
        onYearTypeChange={setYearType}
      />
    );
  }

  // Dashboard view
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-inter text-gray-800 pb-20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-md">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-16 sm:h-20 flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <img src="/LogoRosti.png" alt="Rosti" className="h-10 sm:h-14 w-auto rounded-xl" />
            <div className="hidden sm:block">
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-gray-900 whitespace-nowrap">
                KPIs Rosti{appVersion && <span className="text-[10px] font-normal text-gray-400 ml-1.5 align-middle">{appVersion}</span>}
              </h1>
              <p className="text-xs text-gray-500 font-medium hidden lg:block">Gestión y visualización de métricas</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 ml-auto flex-shrink-0">
            {/* Data source indicator - hidden on mobile */}
            <div className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${useApi ? (dbMode === 'auxiliary' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700') : 'bg-red-100 text-red-700'}`}>
              <div className={`w-2 h-2 rounded-full ${useApi ? (dbMode === 'auxiliary' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-red-500'}`}></div>
              {useApi ? (dbMode === 'auxiliary' ? 'SQL S' : 'SQL P') : 'Mock'}
            </div>

            {/* User info - compact on mobile */}
            {user && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-100">
                <div className="w-6 h-6 sm:w-7 sm:h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-600">{user.nombre?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}</span>
                </div>
                <div className="hidden sm:flex flex-col max-w-[150px]">
                  <span className="text-xs font-semibold text-gray-800 truncate">{user.nombre || user.email}</span>
                  <span className="text-[10px] font-medium text-gray-500 truncate">{user.email}</span>
                </div>
              </div>
            )}



            {/* Report Menu */}
            <div className="relative">
              <button
                onClick={() => setShowReportMenu(!showReportMenu)}
                className="touch-target p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                title="Generar Reporte"
              >
                <Download className="w-4 h-4" />
              </button>
              {showReportMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowReportMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 sm:w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
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


            {/* User Preferences - navigate to full view */}
            <button
              onClick={() => setView('preferencias')}
              className="touch-target p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              title="Preferencias"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

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

            {/* Admin/Events/Modelo button - for admin, eventos, or modelo users */}
            {(user?.esAdmin || user?.accesoEventos || user?.accesoModeloPresupuesto || user?.ajustarCurva || user?.verAjustePresupuesto || user?.verConfigModelo || user?.verConsolidadoMensual || user?.verVersiones || user?.verBitacora || user?.verReferencias || user?.editarConsolidado || user?.ejecutarRecalculo || user?.restaurarVersiones) && (
              <button
                onClick={() => setView('admin')}
                className="touch-target p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                title={user?.esAdmin ? "Configuración" : user?.accesoEventos ? "Eventos" : "Modelo Presupuesto"}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="touch-target p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Tab selector - hidden on very small screens, shown on larger */}
            <div className="hidden sm:flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100 shadow-inner mr-3">
              <button
                onClick={() => setDashboardTab('home')}
                className={`touch-target flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'home'
                  ? 'bg-white shadow-sm text-indigo-600'
                  : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Inicio</span>
              </button>

              {/* Only show presupuesto tabs when not in home */}
              {dashboardTab !== 'home' && (
                <>
                  {user?.accesoPresupuestoMensual && (
                    <button
                      onClick={() => setDashboardTab('mensual')}
                      className={`touch-target flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'mensual'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Mensual</span>
                    </button>
                  )}
                  {user?.accesoPresupuestoAnual && (
                    <button
                      onClick={() => setDashboardTab('anual')}
                      className={`touch-target flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'anual'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Anual</span>
                    </button>
                  )}
                  {user?.accesoTendencia && (
                    <button
                      onClick={() => setDashboardTab('tendencia')}
                      className={`touch-target flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'tendencia'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Tendencia</span>
                    </button>
                  )}
                  {user?.accesoPresupuestoRangos && (
                    <button
                      onClick={() => setDashboardTab('rangos')}
                      className={`touch-target flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab === 'rangos'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Rangos</span>
                    </button>
                  )}
                </>
              )}
            </div>




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

      <main id="dashboard-content" className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Filters - Only show when in Presupuesto module (not in tendencia or rangos) */}
        {dashboardTab !== 'home' && dashboardTab !== 'tendencia' && dashboardTab !== 'rangos' && (
          <FilterBar
            year={year}
            setYear={() => { }} // Year is read-only
            filterLocal={filterLocal}
            setFilterLocal={setFilterLocal}
            filterCanal={filterCanal}
            setFilterCanal={setFilterCanal}
            filterKpi={filterKpi}
            setFilterKpi={setFilterKpi}
            filterType={filterType}
            setFilterType={setFilterType}
            groups={preferences.groupOrder && preferences.groupOrder.length > 0
              ? preferences.groupOrder.filter((g: string) => groups.includes(g)).concat(groups.filter((g: string) => !(preferences.groupOrder || []).includes(g)))
              : groups}
            individualStores={individualStores}
            yearType={yearType}
            setYearType={(type: 'Año Anterior' | 'Año Anterior Ajustado') => {
              setYearType(type);
              setDefaultYearType(type);
            }}
            availableCanales={availableCanales}
            showMonthSelector={dashboardTab === 'mensual'}
            currentMonth={currentDate.getMonth()}
            onMonthChange={(month: number) => {
              const newDate = new Date(currentDate.getFullYear(), month, 1);
              setCurrentDate(newDate);
            }}
          />
        )}

        {/* Filters for Rangos - without month selector */}
        {dashboardTab === 'rangos' && (
          <FilterBar
            year={year}
            setYear={() => { }} // Year is read-only
            filterLocal={filterLocal}
            setFilterLocal={setFilterLocal}
            filterCanal={filterCanal}
            setFilterCanal={setFilterCanal}
            filterKpi={filterKpi}
            setFilterKpi={setFilterKpi}
            filterType={filterType}
            setFilterType={setFilterType}
            groups={preferences.groupOrder && preferences.groupOrder.length > 0
              ? preferences.groupOrder.filter((g: string) => groups.includes(g)).concat(groups.filter((g: string) => !(preferences.groupOrder || []).includes(g)))
              : groups}
            individualStores={individualStores}
            yearType={yearType}
            setYearType={(type: 'Año Anterior' | 'Año Anterior Ajustado') => {
              setYearType(type);
              setDefaultYearType(type);
            }}
            availableCanales={availableCanales}
            showMonthSelector={false}
            currentMonth={currentDate.getMonth()}
            onMonthChange={(month: number) => {
              const newDate = new Date(currentDate.getFullYear(), month, 1);
              setCurrentDate(newDate);
            }}
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
            <span className="text-yellow-600 text-sm">⚠️ No se pudo conectar al servidor. Revisar conexión al VPN de Rosti. Usando datos de prueba.</span>
            <button
              onClick={() => { setUseApi(true); setError(null); }}
              className="text-yellow-700 underline text-sm font-medium hover:text-yellow-800"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && dashboardTab === 'home' && (
          <Dashboard
            onNavigateToModule={(moduleId) => {
              if (moduleId === 'presupuesto') {
                if (user?.accesoPresupuestoMensual) {
                  setDashboardTab('mensual');
                } else if (user?.accesoPresupuestoAnual) {
                  setDashboardTab('anual');
                } else if (user?.accesoPresupuestoRangos) {
                  setDashboardTab('rangos');
                } else if (user?.accesoTendencia) {
                  setDashboardTab('tendencia'); // Fallback if they have tendency access but no specific budget section access (unlikely combo but safe)
                } else {
                  // Fallback to mensual anyway, permissions will just hide content
                  setDashboardTab('mensual');
                }
              }
              // Future modules will be handled here
            }}
          />
        )}

        {!loading && dashboardTab === 'mensual' && user?.accesoPresupuestoMensual && (
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
                adminName={null}
                personalLocal={adminNameForLocal}
                dateRange={(() => {
                  const yr = currentDate.getFullYear();
                  const mo = currentDate.getMonth() + 1;
                  const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;
                  // Last day of the selected month
                  const lastDayOfMonth = new Date(yr, mo, 0).getDate();
                  const lastDayStr = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
                  // Use fechaLimite only if it's within the same month; otherwise use last day of month
                  const endDate = fechaLimite < lastDayStr ? fechaLimite : lastDayStr;
                  return { startDate, endDate };
                })()}
              />
            </div>

            {/* Calendar Grid + Behavior Analysis in same row */}
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-8">
              {/* Calendar Grid */}
              <div className="print-page lg:flex-[3]">
                <div id="monthly-calendar-container">
                  <div className="flex justify-end mb-2 gap-2">
                    <button
                      onClick={() => setVerEventos(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventos
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                      <span>{verEventos ? '📅' : '🗓️'}</span>
                      Ver Eventos
                    </button>
                    <button
                      onClick={() => setVerEventosAA(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventosAA
                        ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                      <span>{verEventosAA ? '🟣' : '⚪'}</span>
                      Eventos Año Ant.
                    </button>
                    <button
                      onClick={() => setVerEventosAjuste(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${verEventosAjuste
                        ? 'bg-red-100 text-red-700 border-red-300'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                      <span>{verEventosAjuste ? '🔴' : '⚪'}</span>
                      Eventos Ajuste
                    </button>
                  </div>
                  <CalendarGrid
                    data={currentMonthData}
                    month={currentDate.getMonth()}
                    year={currentDate.getFullYear()}
                    comparisonType={filterType}
                    kpi={filterKpi}
                    eventsByDate={verEventos ? eventsByDate : {}}
                    eventosAjusteByDate={verEventosAjuste ? eventosAjusteByDate : {}}
                    eventosAAByDate={verEventosAA ? eventosAAByDate : {}}
                  />
                </div>
              </div>

              {/* Behavior Analysis */}
              <div className="print-page lg:flex-[2]">
                <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-100 shadow-lg h-full">
                  <div className="mb-4">
                    <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-1">Análisis de Comportamiento</h2>
                    <p className="text-xs text-gray-400">Desempeño semanal y por día</p>
                  </div>
                  <div className="flex flex-col gap-4 sm:gap-6">
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
                <DailyBehaviorChart
                  data={currentMonthData}
                  kpi={filterKpi}
                  dateRange={{
                    startDate: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`,
                    endDate: fechaLimite
                  }}
                  verEventos={verEventos}
                  eventsByDate={eventsByDate}
                  verEventosAjuste={verEventosAjuste}
                  eventosAjusteByDate={eventosAjusteByDate}
                  verEventosAA={verEventosAA}
                  eventosAAByDate={eventosAAByDate}
                />
              </div>
            </div>

            {/* Page 5: Increments & Info */}
            <div className="print-page">
              {currentDate.getMonth() >= new Date().getMonth() && currentDate.getFullYear() >= new Date().getFullYear() && (
                <div className="mt-8">
                  <IncrementCard
                    data={currentMonthData}
                    currentDate={currentDate}
                    dateRange={{
                      startDate: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`,
                      endDate: fechaLimite
                    }}
                  />
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

        {!loading && dashboardTab === 'anual' && user?.accesoPresupuestoAnual && (
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
              dateRange={{
                startDate: `${currentDate.getFullYear()}-01-01`,
                endDate: fechaLimite
              }}
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
                fechaLimite={fechaLimite}
                verEventos={verEventos}
                onVerEventosChange={(v) => setVerEventos(v)}
                eventosByYear={eventosByYear}
                verEventosAjuste={verEventosAjuste}
                onVerEventosAjusteChange={(v) => setVerEventosAjuste(v)}
                eventosAjusteByDate={eventosAjusteByDate}
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
              endDate={fechaLimite}
              groups={preferences.groupOrder && preferences.groupOrder.length > 0
                ? preferences.groupOrder.filter((g: string) => groups.includes(g)).concat(groups.filter((g: string) => !(preferences.groupOrder || []).includes(g)))
                : groups}
              individualStores={individualStores}
              onExportExcel={(fn) => { tendenciaExportRef.current = fn; }}
              verEventos={verEventos}
              onVerEventosChange={(v) => setVerEventos(v)}
              eventosByYear={eventosByYear}
              filterLocal={filterLocal}
              onFilterLocalChange={setFilterLocal}
            />
          </div>
        )}

        {!loading && dashboardTab === 'rangos' && user?.accesoPresupuestoRangos && (
          <RangosView
            year={year}
            filterLocal={filterLocal}
            filterCanal={filterCanal}
            filterKpi={filterKpi}
            yearType={yearType}
            verEventos={verEventos}
            onVerEventosChange={(v) => setVerEventos(v)}
            eventosByYear={eventosByYear}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation - only visible on small screens when in budget module */}
      {dashboardTab !== 'home' && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] no-print">
          <div className="flex items-center justify-around px-1 py-1.5 max-w-md mx-auto">
            <button
              onClick={() => setDashboardTab('home')}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all text-gray-400 active:bg-gray-100"
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Inicio</span>
            </button>

            {user?.accesoPresupuestoMensual && (
              <button
                onClick={() => setDashboardTab('mensual')}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all ${dashboardTab === 'mensual'
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-400 active:bg-gray-100'
                  }`}
              >
                <Calendar className="w-5 h-5" />
                <span className="text-[10px] font-semibold">Mensual</span>
              </button>
            )}

            {user?.accesoPresupuestoAnual && (
              <button
                onClick={() => setDashboardTab('anual')}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all ${dashboardTab === 'anual'
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-400 active:bg-gray-100'
                  }`}
              >
                <BarChart3 className="w-5 h-5" />
                <span className="text-[10px] font-semibold">Anual</span>
              </button>
            )}

            {user?.accesoTendencia && (
              <button
                onClick={() => setDashboardTab('tendencia')}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all ${dashboardTab === 'tendencia'
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-400 active:bg-gray-100'
                  }`}
              >
                <BarChart3 className="w-5 h-5" />
                <span className="text-[10px] font-semibold">Tendencia</span>
              </button>
            )}

            {user?.accesoPresupuestoRangos && (
              <button
                onClick={() => setDashboardTab('rangos')}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all ${dashboardTab === 'rangos'
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-400 active:bg-gray-100'
                  }`}
              >
                <Calendar className="w-5 h-5" />
                <span className="text-[10px] font-semibold">Rangos</span>
              </button>
            )}
          </div>
        </nav>
      )}

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
