import { useState, useMemo, useEffect } from 'react';
import { FilterBar } from './components/FilterBar';
import { SummaryCard } from './components/SummaryCard';
import { CalendarGrid } from './components/CalendarGrid';
import { LoginPage } from './components/LoginPage';
import { AdminPage } from './components/AdminPage';
import { generateMockData } from './mockData';
import type { BudgetRecord } from './mockData';
import { fetchBudgetData, fetchStores, fetchGroupStores, getToken, getUser, logout, verifyToken } from './api';
import { addMonths, format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, LogOut, Settings, Calendar, BarChart3 } from 'lucide-react';
import { AnnualCalendar } from './components/AnnualCalendar';
import { TendenciaAlcance } from './components/TendenciaAlcance';
import { WeekDayBehavior } from './components/WeekDayBehavior';
import { WeeklyBehavior } from './components/WeeklyBehavior';
import { DailyBehaviorChart } from './components/DailyBehaviorChart';
import { InfoCard } from './components/InfoCard';
import { IncrementCard } from './components/IncrementCard';
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
  const [yearType, setYearType] = useState<'Año Anterior' | 'Año Anterior Ajustado'>('Año Anterior');

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

      <main className="max-w-[1600px] mx-auto px-6 py-8">
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

        <SummaryCard
          dataVentas={dataVentas}
          dataTransacciones={dataTransacciones}
          dataTQP={dataTQP}
          currentMonth={currentDate.getMonth()}
          comparisonType={filterType}
          yearType={yearType}
          filterLocal={filterLocal}
          isAnnual={dashboardTab === 'anual'}
        />

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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8">
                <CalendarGrid
                  data={currentMonthData}
                  month={currentDate.getMonth()}
                  year={currentDate.getFullYear()}
                  comparisonType={filterType}
                  kpi={filterKpi}
                />
              </div>

              <div className="lg:col-span-4 flex flex-col gap-6">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg">
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

            <div className="mt-8">
              <DailyBehaviorChart data={currentMonthData} kpi={filterKpi} />
            </div>

            {/* Only show increment card for current month or future months */}
            {currentDate.getMonth() >= new Date().getMonth() && currentDate.getFullYear() >= new Date().getFullYear() && (
              <div className="mt-8">
                <IncrementCard data={currentMonthData} currentDate={currentDate} />
              </div>
            )}

            <InfoCard />

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
            <AnnualCalendar
              data={data}
              year={year}
              comparisonType={filterType}
              kpi={filterKpi}
              yearType={yearType}
            />

            <InfoCard />

            {showGroupCard && (
              <GroupMembersCard
                groupName={filterLocal}
                stores={groupMembers}
              />
            )}
          </>
        )}

        {!loading && dashboardTab === 'tendencia' && (
          <TendenciaAlcance
            year={year}
            startDate={`${year}-01-01`}
            endDate={format(new Date(), 'yyyy-MM-dd')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
