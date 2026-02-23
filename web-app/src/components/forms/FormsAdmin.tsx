import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_BASE, getToken } from '../../api';
import { useToast } from '../ui/Toast';
import './FormsAdmin.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormSource {
    SourceID: number;
    Alias: string;
    ExcelUrl: string;
    OwnerEmail: string;
    DriveId: string | null;
    ItemId: string | null;
    SheetName: string | null;
    Activo: boolean;
    UltimaSync: string | null;
    UltimaRespuesta: string | null;
    TotalRespuestas: number;
    CreatedAt: string;
}

interface FormResponse {
    ResponseID: string;
    SourceID: number;
    FormAlias: string;
    RespondentEmail: string;
    RespondentName: string;
    SubmittedAt: string;
    Answers: string; // JSON string
    TotalRecords?: number;
    TotalPages?: number;
}

interface SyncLog {
    SyncID: number;
    FechaSync: string;
    TipoSync: string;
    RegistrosProcesados: number;
    RegistrosNuevos: number;
    RegistrosActualizados: number;
    Estado: string;
    MensajeError: string | null;
    TiempoEjecucionMs: number;
    IniciadoPor: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FormsAdmin: React.FC = () => {
    // Azure config
    const [tenantId, setTenantId] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [originalSecret, setOriginalSecret] = useState(''); // track what was loaded from DB
    const [hasSecret, setHasSecret] = useState(false);
    const [serviceAccount, setServiceAccount] = useState('');
    const [syncInterval, setSyncInterval] = useState('6');
    const [syncEnabled, setSyncEnabled] = useState(false);
    const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
    const [savingConfig, setSavingConfig] = useState(false);

    // Sources
    const [sources, setSources] = useState<FormSource[]>([]);
    const [loadingSources, setLoadingSources] = useState(false);

    // New source form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newAlias, setNewAlias] = useState('');
    const [newExcelUrl, setNewExcelUrl] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [addingSource, setAddingSource] = useState(false);

    // Edit modal
    const [editSource, setEditSource] = useState<FormSource | null>(null);
    const [editAlias, setEditAlias] = useState('');
    const [editExcelUrl, setEditExcelUrl] = useState('');
    const [editOwnerEmail, setEditOwnerEmail] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    // Resolving / syncing
    const [resolvingId, setResolvingId] = useState<number | null>(null);
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [globalSyncing, setGlobalSyncing] = useState(false);

    // Logs
    const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

    // Responses tab
    const [respSourceId, setRespSourceId] = useState<string>('');
    const [respEmail, setRespEmail] = useState('');
    const [respStartDate, setRespStartDate] = useState('');
    const [respEndDate, setRespEndDate] = useState('');
    const [responses, setResponses] = useState<FormResponse[]>([]);
    const [respTotal, setRespTotal] = useState(0);
    const [respPage, setRespPage] = useState(1);
    const [respTotalPages, setRespTotalPages] = useState(1);
    const [loadingResp, setLoadingResp] = useState(false);
    const [respColumns, setRespColumns] = useState<string[]>([]);
    const [detailResponse, setDetailResponse] = useState<FormResponse | null>(null);
    const [exportingCsv, setExportingCsv] = useState(false);
    const PAGE_SIZE = 25;

    // Sort & search state
    const [sourceSearch, setSourceSearch] = useState('');
    const [sourceSort, setSourceSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'Alias', dir: 'asc' });
    const [respSort, setRespSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'SubmittedAt', dir: 'desc' });

    const [activeTab, setActiveTab] = useState<'sources' | 'responses' | 'config' | 'logs'>('sources');

    // Mapping modal state
    const [mappingSource, setMappingSource] = useState<FormSource | null>(null);
    const [mappingLoading, setMappingLoading] = useState(false);
    const [mappingColumns, setMappingColumns] = useState<string[]>([]);
    const [mappingPersona, setMappingPersona] = useState('');
    const [mappingAlmacen, setMappingAlmacen] = useState('');
    const [mappingSaving, setMappingSaving] = useState(false);
    const [mappingStats, setMappingStats] = useState<any>(null);
    const [mappingResolving, setMappingResolving] = useState(false);
    const [mappingUnmapped, setMappingUnmapped] = useState<any[]>([]);
    const [mappingUnmappedCount, setMappingUnmappedCount] = useState(0);
    const [showUnmapped, setShowUnmapped] = useState(false);

    // Manual mapping state
    const [unmappedTab, setUnmappedTab] = useState<'byValue' | 'byRecord'>('byValue');
    const [distinctUnmapped, setDistinctUnmapped] = useState<{ almacen: any[]; persona: any[]; errors: string[] }>({ almacen: [], persona: [], errors: [] });
    const [storeOptions, setStoreOptions] = useState<{ CODALMACEN: string; NOMBRE: string }[]>([]);
    const [personalSearchResults, setPersonalSearchResults] = useState<{ ID: number; NOMBRE: string; CORREO: string }[]>([]);
    const [personalSearchTimer, setPersonalSearchTimer] = useState<any>(null);
    const [savingValueMapping, setSavingValueMapping] = useState<string | null>(null);
    const [selectedMappings, setSelectedMappings] = useState<Record<string, { value: string; label: string }>>({});
    const [personalSearchInput, setPersonalSearchInput] = useState<Record<string, string>>({});
    const [loadingDistinct, setLoadingDistinct] = useState(false);
    const [valueMappings, setValueMappings] = useState<any[]>([]);
    const [reviewMappingType, setReviewMappingType] = useState<'CODALMACEN' | 'PERSONA' | null>(null);
    const [deletingMappingId, setDeletingMappingId] = useState<number | null>(null);

    const headers = () => ({ Authorization: `Bearer ${getToken()}` });
    const { showToast, showConfirm } = useToast();

    // ─── Load ─────────────────────────────────────────────────────────────────

    const loadConfig = useCallback(async () => {
        try {
            // Load base config (tenantId, clientId, syncEnabled, syncInterval, lastSyncDate)
            const [base, reveal] = await Promise.all([
                axios.get(`${API_BASE}/forms/config`, { headers: headers() }),
                axios.get(`${API_BASE}/forms/config/reveal`, { headers: headers() }).catch(() => ({ data: {} }))
            ]);
            setTenantId(base.data.tenantId || '');
            setClientId(base.data.clientId || '');
            // Use revealed plain-text secret if available, otherwise fall back to masked
            const secretVal = reveal.data.clientSecret || base.data.clientSecret || '';
            setClientSecret(secretVal);
            setOriginalSecret(secretVal);
            setHasSecret(!!base.data.hasSecret);
            setServiceAccount(reveal.data.serviceAccount || base.data.serviceAccount || '');
            setSyncInterval(base.data.syncInterval?.toString() || '6');
            setSyncEnabled(base.data.syncEnabled || false);
            setLastSyncDate(base.data.lastSyncDate || null);
        } catch (e: any) { console.error('Error loading config:', e.message); }
    }, []);

    const loadSources = useCallback(async () => {
        setLoadingSources(true);
        try {
            const r = await axios.get(`${API_BASE}/forms/sources`, { headers: headers() });
            setSources(Array.isArray(r.data) ? r.data : []);
        } catch (e: any) { console.error('Error loading sources:', e.message); }
        finally { setLoadingSources(false); }
    }, []);

    const loadLogs = useCallback(async () => {
        try {
            const r = await axios.get(`${API_BASE}/forms/sync-logs?pageSize=15`, { headers: headers() });
            setSyncLogs(r.data.logs || []);
        } catch (e) { /* ignore */ }
    }, []);

    useEffect(() => {
        loadConfig();
        loadSources();
        loadLogs();
    }, [loadConfig, loadSources, loadLogs]);

    // ─── Responses ────────────────────────────────────────────────────────────

    const loadResponses = useCallback(async (page = 1, filters?: { sourceId?: string; email?: string; startDate?: string; endDate?: string }) => {
        setLoadingResp(true);
        const src = filters !== undefined ? (filters.sourceId ?? '') : respSourceId;
        const em = filters !== undefined ? (filters.email ?? '') : respEmail;
        const start = filters !== undefined ? (filters.startDate ?? '') : respStartDate;
        const end = filters !== undefined ? (filters.endDate ?? '') : respEndDate;

        try {
            const params: Record<string, string> = { page: page.toString(), pageSize: PAGE_SIZE.toString() };
            if (src) params.sourceId = src;
            if (em) params.email = em;
            if (start) params.startDate = start;
            if (end) params.endDate = end;

            const r = await axios.get(`${API_BASE}/forms/responses`, { headers: headers(), params });
            const rows: FormResponse[] = Array.isArray(r.data.responses) ? r.data.responses : (Array.isArray(r.data) ? r.data : []);
            setResponses(rows);
            setRespTotal(r.data.total || 0);
            setRespTotalPages(r.data.totalPages || 1);
            setRespPage(page);

            if (rows.length > 0) {
                try {
                    const answers = JSON.parse(rows[0].Answers || '{}');
                    const cols = Object.keys(answers).filter(k => k && k.trim());
                    setRespColumns(cols.slice(0, 20));
                } catch { setRespColumns([]); }
            }
        } catch (e: any) {
            console.error('Error loading responses:', e.message);
        } finally {
            setLoadingResp(false);
        }
    }, []);

    const handleRespSearch = () => {
        loadResponses(1, { sourceId: respSourceId, email: respEmail, startDate: respStartDate, endDate: respEndDate });
    };

    // Auto-load when switching to responses tab
    useEffect(() => {
        if (activeTab === 'responses' && responses.length === 0) {
            loadResponses(1, {});
        }
    }, [activeTab]);

    // ─── Export ───────────────────────────────────────────────────────────────

    const exportCsv = async () => {
        setExportingCsv(true);
        try {
            // Fetch all pages for export (up to 5000 rows)
            const params: Record<string, string> = { page: '1', pageSize: '5000' };
            if (respSourceId) params.sourceId = respSourceId;
            if (respEmail) params.email = respEmail;
            if (respStartDate) params.startDate = respStartDate;
            if (respEndDate) params.endDate = respEndDate;

            const r = await axios.get(`${API_BASE}/forms/responses`, { headers: headers(), params });
            const rows: FormResponse[] = r.data.responses || [];
            if (rows.length === 0) { showToast('No hay datos para exportar', 'warning'); return; }

            // Collect all unique answer keys across all rows
            const allKeys = new Set<string>();
            rows.forEach(row => {
                try {
                    const ans = JSON.parse(row.Answers || '{}');
                    Object.keys(ans).forEach(k => { if (k && k.trim()) allKeys.add(k); });
                } catch { }
            });
            const answerCols = Array.from(allKeys);

            // Build CSV
            const baseHeaders = ['ID', 'Formulario', 'Correo', 'Nombre', 'Fecha Envío'];
            const allHeaders = [...baseHeaders, ...answerCols];

            const escape = (v: any) => {
                const s = v == null ? '' : String(v);
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"` : s;
            };

            const csvLines = [
                allHeaders.map(escape).join(','),
                ...rows.map(row => {
                    let answers: Record<string, any> = {};
                    try { answers = JSON.parse(row.Answers || '{}'); } catch { }
                    return [
                        escape(row.ResponseID),
                        escape(row.FormAlias || ''),
                        escape(row.RespondentEmail || ''),
                        escape(row.RespondentName || ''),
                        escape(row.SubmittedAt ? new Date(row.SubmittedAt).toLocaleString('es-CR') : ''),
                        ...answerCols.map(k => escape(answers[k]))
                    ].join(',');
                })
            ];

            const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM for Excel UTF-8
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const sourceName = sources.find(s => s.SourceID.toString() === respSourceId)?.Alias || 'todos';
            a.href = url;
            a.download = `formulario_${sourceName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            showToast('Error al exportar: ' + e.message, 'error');
        } finally {
            setExportingCsv(false);
        }
    };

    // ─── Azure Config ─────────────────────────────────────────────────────────

    const saveConfig = async () => {
        if (!tenantId || !clientId) { showToast('Tenant ID y Client ID son requeridos', 'warning'); return; }
        setSavingConfig(true);
        try {
            // Only send secret if user actually modified it
            const secretChanged = clientSecret !== originalSecret;
            await axios.post(`${API_BASE}/forms/config`, {
                tenantId, clientId,
                ...(secretChanged && clientSecret ? { clientSecret } : {}),
                serviceAccount: serviceAccount || '',
                syncEnabled, syncInterval: parseInt(syncInterval)
            }, { headers: headers() });
            showToast('Configuración guardada', 'success');
            await loadConfig();
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally { setSavingConfig(false); }
    };

    const testConnection = async () => {
        setConnectionStatus('Probando...');
        try {
            const r = await axios.post(`${API_BASE}/forms/test-connection`, {}, { headers: headers() });
            setConnectionStatus(r.data.success ? '✅ Conexión exitosa' : '❌ ' + r.data.message);
        } catch (e: any) {
            setConnectionStatus('❌ ' + (e.response?.data?.error || e.message));
        }
    };

    // ─── Sources ──────────────────────────────────────────────────────────────

    const addSource = async () => {
        if (!newAlias || !newExcelUrl || !newOwnerEmail) { showToast('Todos los campos son requeridos', 'warning'); return; }
        setAddingSource(true);
        const alias = newAlias;
        try {
            showToast(`⏳ Creando formulario "${alias}"...`, 'info');
            const r = await axios.post(`${API_BASE}/forms/sources`, { alias: newAlias, excelUrl: newExcelUrl, ownerEmail: newOwnerEmail }, { headers: headers() });
            setNewAlias(''); setNewExcelUrl(''); setNewOwnerEmail('');
            setShowAddForm(false);
            await loadSources();

            // Auto-resolve + auto-sync so the Frm_* table gets created and data loads immediately
            const newSourceId = r.data?.sourceId || r.data?.SourceID;
            if (newSourceId) {
                // Step 1: Resolve DriveId/ItemId
                try {
                    showToast(`🔍 Resolviendo "${alias}"...`, 'info');
                    await axios.post(`${API_BASE}/forms/sources/${newSourceId}/resolve`, {}, { headers: headers() });
                    await loadSources();

                    // Step 2: Auto-sync to create the Frm_* table and load data
                    try {
                        showToast(`🔄 Sincronizando "${alias}"...`, 'info');
                        setSyncingId(newSourceId);
                        const syncResult = await axios.post(`${API_BASE}/forms/sources/${newSourceId}/sync`, {}, { headers: headers() });
                        await loadSources();
                        await loadLogs();
                        showToast(`✅ "${alias}" listo: ${syncResult.data.registrosNuevos || 0} registros cargados`, 'success');
                    } catch (syncErr: any) {
                        console.warn('Auto-sync failed for new source:', syncErr.message);
                        showToast(`⚠️ "${alias}" creado y resuelto, pero falló el sync: ${syncErr.response?.data?.error || syncErr.message}`, 'warning');
                    } finally {
                        setSyncingId(null);
                    }
                } catch (resolveErr: any) {
                    console.warn('Auto-resolve failed for new source:', resolveErr.message);
                    showToast(`⚠️ "${alias}" creado, pero no se pudo resolver. Presione 🔍 para resolver manualmente.`, 'warning');
                }
            } else {
                showToast(`✅ Formulario creado. Presione Sync para cargar datos.`, 'success');
            }
        } catch (e: any) { showToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
        finally { setAddingSource(false); }
    };

    const openEdit = (src: FormSource) => {
        setEditSource(src); setEditAlias(src.Alias); setEditExcelUrl(src.ExcelUrl); setEditOwnerEmail(src.OwnerEmail);
    };

    const saveEdit = async () => {
        if (!editSource) return;
        setSavingEdit(true);
        try {
            await axios.put(`${API_BASE}/forms/sources/${editSource.SourceID}`, { alias: editAlias, excelUrl: editExcelUrl, ownerEmail: editOwnerEmail }, { headers: headers() });
            setEditSource(null);
            await loadSources();
        } catch (e: any) { showToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
        finally { setSavingEdit(false); }
    };

    const toggleActive = async (src: FormSource) => {
        try {
            await axios.put(`${API_BASE}/forms/sources/${src.SourceID}`, { activo: !src.Activo }, { headers: headers() });
            await loadSources();
        } catch (e: any) { showToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    const deleteSource = async (src: FormSource) => {
        if (!(await showConfirm({ message: `¿Eliminar permanentemente "${src.Alias}"?\n\nEsto también eliminará todas sus respuestas sincronizadas.`, destructive: true }))) return;
        // Optimistic: remove from list immediately
        setSources(prev => prev.filter(s => s.SourceID !== src.SourceID));
        try {
            await axios.delete(`${API_BASE}/forms/sources/${src.SourceID}`, { headers: headers() });
        } catch (e: any) {
            // Revert on error
            await loadSources();
            showToast('Error al eliminar: ' + (e.response?.data?.error || e.message), 'error');
        }
    };


    const resolveSource = async (src: FormSource) => {
        setResolvingId(src.SourceID);
        try {
            const r = await axios.post(`${API_BASE}/forms/sources/${src.SourceID}/resolve`, {}, { headers: headers() });
            if (r.data.success) { showToast(`Resuelto: ${r.data.sheetName || 'Sheet1'}`, 'success'); await loadSources(); }
        } catch (e: any) { showToast('Error al resolver: ' + (e.response?.data?.error || e.message), 'error'); }
        finally { setResolvingId(null); }
    };

    const syncSource = async (src: FormSource) => {
        setSyncingId(src.SourceID);
        try {
            const r = await axios.post(`${API_BASE}/forms/sources/${src.SourceID}/sync`, {}, { headers: headers() });
            showToast(`Sync: ${r.data.registrosNuevos} nuevos, ${r.data.registrosActualizados} actualizados`, 'success');
            await loadSources(); await loadLogs();
        } catch (e: any) { showToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
        finally { setSyncingId(null); }
    };

    const syncAll = async (type: 'FULL' | 'INCREMENTAL') => {
        if (!(await showConfirm({ message: `¿Iniciar sync ${type === 'FULL' ? 'COMPLETO' : 'INCREMENTAL'}?` }))) return;
        setGlobalSyncing(true);
        try {
            const r = await axios.post(`${API_BASE}/forms/sync`, { type }, { headers: headers() });
            showToast(`Sync ${type}: ${r.data.registrosNuevos || 0} nuevos`, 'success');
            await loadSources(); await loadLogs();
        } catch (e: any) { showToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
        finally { setGlobalSyncing(false); }
    };

    // ─── Mappings ─────────────────────────────────────────────────────────────

    const openMappingModal = async (src: FormSource) => {
        setMappingSource(src);
        setMappingLoading(true);
        setShowUnmapped(false);
        setMappingUnmapped([]);
        try {
            const r = await axios.get(`${API_BASE}/forms/sources/${src.SourceID}/mappings`, { headers: headers() });
            setMappingColumns(r.data.availableColumns || []);
            const persona = r.data.mappings?.find((m: any) => m.fieldType === 'PERSONA');
            const almacen = r.data.mappings?.find((m: any) => m.fieldType === 'CODALMACEN');
            setMappingPersona(persona?.columnName || '');
            setMappingAlmacen(almacen?.columnName || '');
            setMappingStats(r.data.stats);
        } catch (e: any) {
            console.error('Error loading mappings:', e.message);
        } finally {
            setMappingLoading(false);
        }
    };

    const saveMappings = async () => {
        if (!mappingSource) return;
        setMappingSaving(true);
        try {
            await axios.put(`${API_BASE}/forms/sources/${mappingSource.SourceID}/mappings`, {
                personaColumn: mappingPersona || null,
                almacenColumn: mappingAlmacen || null
            }, { headers: headers() });
            showToast('Mapeos guardados', 'success');
            // Reload stats
            const r = await axios.get(`${API_BASE}/forms/sources/${mappingSource.SourceID}/mappings`, { headers: headers() });
            setMappingStats(r.data.stats);
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setMappingSaving(false);
        }
    };

    const resolveMappings = async () => {
        if (!mappingSource) return;
        setMappingResolving(true);
        try {
            const r = await axios.post(`${API_BASE}/forms/sources/${mappingSource.SourceID}/resolve-mappings`, {}, { headers: headers() });
            showToast(r.data.message, 'success');
            // Reload stats
            const stats = await axios.get(`${API_BASE}/forms/sources/${mappingSource.SourceID}/mappings`, { headers: headers() });
            setMappingStats(stats.data.stats);
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setMappingResolving(false);
        }
    };

    const loadUnmapped = async () => {
        if (!mappingSource) return;
        try {
            const r = await axios.get(`${API_BASE}/forms/sources/${mappingSource.SourceID}/unmapped`, { headers: headers() });
            setMappingUnmapped(r.data.unmapped || []);
            setMappingUnmappedCount(r.data.unmappedCount || 0);
            setShowUnmapped(true);
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        }
    };

    const loadDistinctUnmapped = async () => {
        if (!mappingSource) return;
        setLoadingDistinct(true);
        try {
            const [distinct, stores, vMappings] = await Promise.all([
                axios.get(`${API_BASE}/forms/sources/${mappingSource.SourceID}/distinct-unmapped`, { headers: headers() }),
                storeOptions.length === 0 ? axios.get(`${API_BASE}/forms/lookup/stores`, { headers: headers() }) : Promise.resolve(null),
                axios.get(`${API_BASE}/forms/value-mappings`, { headers: headers() })
            ]);
            setDistinctUnmapped(distinct.data);
            if (stores) setStoreOptions(stores.data || []);
            setValueMappings(vMappings.data || []);
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setLoadingDistinct(false);
        }
    };

    const searchPersonal = (search: string) => {
        if (personalSearchTimer) clearTimeout(personalSearchTimer);
        if (search.length < 2) { setPersonalSearchResults([]); return; }
        const timer = setTimeout(async () => {
            try {
                const r = await axios.get(`${API_BASE}/forms/lookup/personal`, { headers: headers(), params: { search } });
                setPersonalSearchResults(r.data || []);
            } catch { setPersonalSearchResults([]); }
        }, 300);
        setPersonalSearchTimer(timer);
    };

    const saveValueMapping = async (sourceValue: string, mappingType: 'CODALMACEN' | 'PERSONA', resolvedValue: string, resolvedLabel: string) => {
        const key = `${mappingType}:${sourceValue}`;
        setSavingValueMapping(key);
        try {
            await axios.post(`${API_BASE}/forms/value-mappings`, {
                sourceValue, mappingType, resolvedValue, resolvedLabel
            }, { headers: headers() });
            showToast(`✅ ${sourceValue} → ${resolvedLabel || resolvedValue}`, 'success');
            // Remove from distinct list
            setDistinctUnmapped(prev => ({
                ...prev,
                almacen: mappingType === 'CODALMACEN' ? prev.almacen.filter(a => a.sourceValue !== sourceValue) : prev.almacen,
                persona: mappingType === 'PERSONA' ? prev.persona.filter(p => p.sourceValue !== sourceValue) : prev.persona
            }));
            setSelectedMappings(prev => { const n = { ...prev }; delete n[key]; return n; });
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setSavingValueMapping(null);
        }
    };

    const loadValueMappings = async (type?: string) => {
        try {
            const r = await axios.get(`${API_BASE}/forms/value-mappings`, { headers: headers(), params: type ? { type } : {} });
            setValueMappings(r.data || []);
        } catch (e: any) {
            showToast('Error cargando mapeos: ' + (e.response?.data?.error || e.message), 'error');
        }
    };

    const deleteValueMappingById = async (id: number) => {
        setDeletingMappingId(id);
        try {
            await axios.delete(`${API_BASE}/forms/value-mappings/${id}`, { headers: headers() });
            setValueMappings(prev => prev.filter(m => m.ID !== id));
            showToast('Mapeo eliminado', 'success');
        } catch (e: any) {
            showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setDeletingMappingId(null);
        }
    };

    // ─── Helpers ──────────────────────────────────────────────────────────────

    const fmtDate = (d: string | null) => !d ? '—' : new Date(d).toLocaleString('es-CR');
    const fmtDuration = (ms: number | null) => !ms ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    const truncateUrl = (url: string) => url.length > 55 ? url.substring(0, 55) + '…' : url;
    const truncate = (s: string, n = 40) => !s ? '' : s.length > n ? s.substring(0, n) + '…' : s;

    // Convert Excel serial date/time numbers to readable string
    const fmtCellValue = (val: any): string => {
        if (val === null || val === undefined || val === '') return '';
        const num = Number(val);
        // Excel serial: integers > 40000 are dates, decimals are times
        if (!isNaN(num) && num > 40000 && num < 60000) {
            // Excel epoch: Jan 1, 1900 (with leap year bug offset)
            const msPerDay = 86400000;
            const excelEpoch = new Date(1899, 11, 30).getTime(); // Dec 30, 1899
            const ms = excelEpoch + num * msPerDay;
            const d = new Date(ms);
            const frac = num % 1;
            if (frac < 0.0001) {
                // Pure date (no time component)
                return d.toLocaleDateString('es-CR');
            }
            // Has time component — show HH:MM
            const h = d.getUTCHours().toString().padStart(2, '0');
            const m = d.getUTCMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
        }
        return String(val);
    };

    // Sortable header helper
    const SortTh = ({ col, label, currentSort, onSort, className }: { col: string; label: string; currentSort: { col: string; dir: 'asc' | 'desc' }; onSort: (c: string) => void; className?: string }) => (
        <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} className={className}>
            {label} {currentSort.col === col ? (currentSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
        </th>
    );

    const toggleSourceSort = (col: string) =>
        setSourceSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

    const toggleRespSort = (col: string) =>
        setRespSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

    // Filtered + sorted sources
    const filteredSources = [...sources]
        .filter(s => {
            const q = sourceSearch.toLowerCase();
            return !q || s.Alias.toLowerCase().includes(q) || s.OwnerEmail.toLowerCase().includes(q);
        })
        .sort((a, b) => {
            const dir = sourceSort.dir === 'asc' ? 1 : -1;
            const col = sourceSort.col as keyof typeof a;
            const av = a[col] ?? '';
            const bv = b[col] ?? '';
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });

    // Sorted responses (client-side on current page)
    const sortedResponses = [...responses].sort((a, b) => {
        const dir = respSort.dir === 'asc' ? 1 : -1;
        const col = respSort.col as keyof typeof a;
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        if (col === 'SubmittedAt') {
            return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * dir;
        }
        return String(av).localeCompare(String(bv)) * dir;
    });

    // Excluded answer columns (system columns already shown as dedicated columns)
    const EXCLUDED_ANSWER_COLS = new Set([
        'Hora de inicio', 'Hora de finalización', 'StartTime', 'CompletionTime',
        'Id', 'ID', 'ResponseID', 'RespondentEmail', 'RespondentName',
        'SubmittedAt', 'SyncedAt', 'SourceID', 'FormAlias',
        'RowNum', 'TotalRecords', 'TotalPages'
    ]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="forms-admin">
            <div className="forms-admin-header">
                <h2>📋 Microsoft Forms</h2>
                <div className="forms-header-right">
                    <p className="forms-subtitle">{lastSyncDate ? `Última sync: ${fmtDate(lastSyncDate)}` : 'Sin sincronizaciones'}</p>
                    <button onClick={() => { loadConfig(); loadSources(); loadLogs(); }} title="Actualizar datos" className="btn-refresh-header">🔄 Actualizar</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="forms-tabs">
                <button className={`tab-btn ${activeTab === 'sources' ? 'active' : ''}`} onClick={() => setActiveTab('sources')}>
                    📊 Formularios ({sources.length})
                </button>
                <button className={`tab-btn ${activeTab === 'responses' ? 'active' : ''}`} onClick={() => setActiveTab('responses')}>
                    📝 Respuestas {respTotal > 0 ? `(${respTotal.toLocaleString()})` : ''}
                </button>
                <button className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
                    ⚙️ Azure AD
                </button>
                <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => { setActiveTab('logs'); loadLogs(); }}>
                    📜 Historial
                </button>
            </div>

            {/* ── TAB: Formularios ── */}
            {activeTab === 'sources' && (
                <div className="tab-content">
                    <div className="sources-toolbar">
                        <button className="btn-add-source" onClick={() => setShowAddForm(true)}>+ Agregar formulario</button>
                        <input
                            type="text"
                            value={sourceSearch}
                            onChange={e => setSourceSearch(e.target.value)}
                            placeholder="🔍 Buscar por nombre o propietario..."
                            className="config-input"
                        />
                        <div className="sync-btns">
                            <button className="btn-sync" onClick={() => syncAll('INCREMENTAL')} disabled={globalSyncing}>
                                {globalSyncing ? '⏳' : '🔄'} Sync incremental
                            </button>
                            <button className="btn-sync-full" onClick={() => syncAll('FULL')} disabled={globalSyncing}>
                                {globalSyncing ? '⏳' : '🔄'} Sync completo
                            </button>
                        </div>
                    </div>

                    {showAddForm && (
                        <div className="add-source-form">
                            <h4>Nuevo formulario</h4>
                            <div className="add-source-fields">
                                <div className="form-group">
                                    <label>Alias (nombre descriptivo)</label>
                                    <input type="text" value={newAlias} onChange={e => setNewAlias(e.target.value)} placeholder="ej: Visita Operativa Operaciones" className="config-input" />
                                </div>
                                <div className="form-group">
                                    <label>Link del Excel (SharePoint/OneDrive)</label>
                                    <input type="text" value={newExcelUrl} onChange={e => setNewExcelUrl(e.target.value)} placeholder="https://xxx-my.sharepoint.com/personal/..." className="config-input" />
                                    <small>Abrir Forms → Respuestas → Abrir en Excel → copiar URL del navegador</small>
                                </div>
                                <div className="form-group">
                                    <label>Correo del propietario del Excel</label>
                                    <input type="email" value={newOwnerEmail} onChange={e => setNewOwnerEmail(e.target.value)} placeholder="usuario@empresa.com" className="config-input" />
                                </div>
                            </div>
                            <div className="add-source-actions">
                                <button className="btn-save" onClick={addSource} disabled={addingSource}>{addingSource ? '⏳ Guardando...' : '💾 Guardar'}</button>
                                <button className="btn-cancel" onClick={() => { setShowAddForm(false); setNewAlias(''); setNewExcelUrl(''); setNewOwnerEmail(''); }}>Cancelar</button>
                            </div>
                        </div>
                    )}

                    {loadingSources ? (
                        <div className="forms-loading">Cargando formularios...</div>
                    ) : sources.length === 0 ? (
                        <div className="forms-empty"><p>No hay formularios configurados.</p><p>Haga clic en <strong>+ Agregar formulario</strong> para comenzar.</p></div>
                    ) : (
                        <div className="sources-table-wrap">
                            <table className="sources-table">
                                <colgroup>
                                    <col className="col-name" />
                                    <col className="col-owner" />
                                    <col className="col-status" />
                                    <col className="col-count" />
                                    <col className="col-sync col-hide-md" />
                                    <col className="col-last" />
                                    <col className="col-actions" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <SortTh col="Alias" label="Formulario" currentSort={sourceSort} onSort={toggleSourceSort} />
                                        <SortTh col="OwnerEmail" label="Propietario" currentSort={sourceSort} onSort={toggleSourceSort} />
                                        <SortTh col="Activo" label="Estado" currentSort={sourceSort} onSort={toggleSourceSort} />
                                        <SortTh col="TotalRespuestas" label="Resp." currentSort={sourceSort} onSort={toggleSourceSort} />
                                        <SortTh col="UltimaSync" label="Última Sync" currentSort={sourceSort} onSort={toggleSourceSort} className="col-hide-md" />
                                        <SortTh col="UltimaRespuesta" label="Últ. Respuesta" currentSort={sourceSort} onSort={toggleSourceSort} />
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSources.map(src => (
                                        <tr key={src.SourceID} className={!src.Activo ? 'row-inactive' : ''}>
                                            <td>
                                                <div className="source-alias" title={src.Alias}>{src.Alias}</div>
                                                <div className="source-url" title={src.ExcelUrl}>{truncateUrl(src.ExcelUrl)}</div>
                                            </td>
                                            <td><span className="owner-badge" title={src.OwnerEmail}>{src.OwnerEmail}</span></td>
                                            <td>
                                                <div className="status-col">
                                                    <span className={`status-badge ${src.Activo ? 'activo' : 'inactivo'}`}>{src.Activo ? '✅' : '⏸'}</span>
                                                    <span className={`resolve-badge ${src.DriveId ? 'resolved' : 'pending'}`}>{src.DriveId ? '🔗' : '⚠️'}</span>
                                                </div>
                                            </td>
                                            <td className="count-cell">
                                                <button className="btn-link" onClick={() => { setRespSourceId(src.SourceID.toString()); setActiveTab('responses'); loadResponses(1, { sourceId: src.SourceID.toString() }); }}>
                                                    {src.TotalRespuestas.toLocaleString()}
                                                </button>
                                            </td>
                                            <td className="date-cell col-hide-md">{fmtDate(src.UltimaSync)}</td>
                                            <td className="date-cell">
                                                {src.UltimaRespuesta ? (() => {
                                                    const days = Math.floor((Date.now() - new Date(src.UltimaRespuesta).getTime()) / 86400000);
                                                    return (
                                                        <span className={`last-resp-badge ${days <= 3 ? 'fresh' : 'stale'}`}>
                                                            {fmtDate(src.UltimaRespuesta)}
                                                        </span>
                                                    );
                                                })() : <span className="no-date">—</span>}
                                            </td>
                                            <td>
                                                <div className="action-btns">
                                                    {!src.DriveId && (
                                                        <button className="btn-resolve btn-icon" onClick={() => resolveSource(src)} disabled={resolvingId === src.SourceID} title="Resolver">
                                                            {resolvingId === src.SourceID ? '⏳' : '🔍'}
                                                        </button>
                                                    )}
                                                    {src.DriveId && src.Activo && (
                                                        <button className="btn-sync-src btn-icon" onClick={() => syncSource(src)} disabled={syncingId === src.SourceID} title="Sync">
                                                            {syncingId === src.SourceID ? '⏳' : '🔄'}
                                                        </button>
                                                    )}
                                                    <button className="btn-mapping btn-icon" onClick={() => openMappingModal(src)} title="Mapeos (Local/Persona)">🔗</button>
                                                    <button className="btn-edit btn-icon" onClick={() => openEdit(src)} title="Editar">✏️</button>
                                                    <button className={`btn-toggle btn-icon ${src.Activo ? 'deactivate' : 'activate'}`} onClick={() => toggleActive(src)} title={src.Activo ? 'Desactivar' : 'Activar'}>
                                                        {src.Activo ? '⏸' : '▶️'}
                                                    </button>
                                                    <button className="btn-delete btn-icon" onClick={() => deleteSource(src)} title="Eliminar">🗑️</button>
                                                </div>
                                            </td>

                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: Respuestas ── */}
            {activeTab === 'responses' && (
                <div className="tab-content">
                    {/* Filters */}
                    <div className="resp-filters">
                        <div className="filter-row">
                            <div className="form-group">
                                <label>Formulario</label>
                                <select value={respSourceId} onChange={e => setRespSourceId(e.target.value)} className="config-select">
                                    <option value="">Todos</option>
                                    {sources.map(s => <option key={s.SourceID} value={s.SourceID}>{s.Alias}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Correo</label>
                                <input type="text" value={respEmail} onChange={e => setRespEmail(e.target.value)} placeholder="Filtrar por correo..." className="config-input" />
                            </div>
                            <div className="form-group">
                                <label>Desde</label>
                                <input type="date" value={respStartDate} onChange={e => setRespStartDate(e.target.value)} className="config-input" />
                            </div>
                            <div className="form-group">
                                <label>Hasta</label>
                                <input type="date" value={respEndDate} onChange={e => setRespEndDate(e.target.value)} className="config-input" />
                            </div>
                        </div>
                        <div className="filter-actions">
                            <button className="btn-save" onClick={handleRespSearch} disabled={loadingResp}>
                                {loadingResp ? '⏳ Buscando...' : '🔍 Buscar'}
                            </button>
                            <button className="btn-export" onClick={exportCsv} disabled={exportingCsv || responses.length === 0} title="Exportar a CSV (compatible con Excel)">
                                {exportingCsv ? '⏳ Exportando...' : '⬇️ Exportar CSV'}
                            </button>
                            <span className="resp-count">{respTotal > 0 ? `${respTotal.toLocaleString()} respuestas` : ''}</span>
                        </div>
                    </div>

                    {/* Responses table */}
                    {loadingResp ? (
                        <div className="forms-loading">Cargando respuestas...</div>
                    ) : responses.length === 0 ? (
                        <div className="forms-empty"><p>No hay respuestas. Use los filtros y haga clic en Buscar.</p></div>
                    ) : (
                        <>
                            <div className="resp-table-wrap">
                                <table className="resp-table">
                                    <thead>
                                        <tr>
                                            <SortTh col="SubmittedAt" label="Fecha Envío" currentSort={respSort} onSort={toggleRespSort} />
                                            <SortTh col="FormAlias" label="Formulario" currentSort={respSort} onSort={toggleRespSort} />
                                            <SortTh col="RespondentEmail" label="Correo" currentSort={respSort} onSort={toggleRespSort} />
                                            <SortTh col="RespondentName" label="Nombre" currentSort={respSort} onSort={toggleRespSort} />
                                            {respColumns.filter(c => !EXCLUDED_ANSWER_COLS.has(c)).slice(0, 5).map(col => (
                                                <th key={col} title={col}>{col.length > 25 ? col.substring(0, 25) + '…' : col}</th>
                                            ))}
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedResponses.map(row => {
                                            let answers: Record<string, any> = {};
                                            try { answers = JSON.parse(row.Answers || '{}'); } catch { }
                                            return (
                                                <tr key={row.ResponseID} className="resp-row" onClick={() => setDetailResponse(row)}>
                                                    <td className="date-cell">{fmtDate(row.SubmittedAt)}</td>
                                                    <td><span className="form-tag">{row.FormAlias || '—'}</span></td>
                                                    <td>{row.RespondentEmail || '—'}</td>
                                                    <td>{row.RespondentName || '—'}</td>
                                                    {respColumns.filter(c => !EXCLUDED_ANSWER_COLS.has(c)).slice(0, 5).map(col => (
                                                        <td key={col} title={fmtCellValue(answers[col])}>{truncate(fmtCellValue(answers[col]), 35)}</td>
                                                    ))}
                                                    <td><button className="btn-detail">Ver →</button></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {respTotalPages > 1 && (
                                <div className="resp-pagination">
                                    <button className="btn-page" onClick={() => loadResponses(respPage - 1)} disabled={respPage <= 1 || loadingResp}>‹ Anterior</button>
                                    <span className="page-info">Página {respPage} de {respTotalPages}</span>
                                    <button className="btn-page" onClick={() => loadResponses(respPage + 1)} disabled={respPage >= respTotalPages || loadingResp}>Siguiente ›</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── TAB: Azure AD Config ── */}
            {activeTab === 'config' && (
                <div className="tab-content">
                    <div className="config-section">
                        <h3>Credenciales Azure AD</h3>
                        <div className="config-form">
                            <div className="form-group">
                                <label>Tenant ID</label>
                                <input type="text" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="config-input" />
                            </div>
                            <div className="form-group">
                                <label>Client ID (Application ID)</label>
                                <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="config-input" />
                            </div>
                            <div className="form-group">
                                <label>Client Secret</label>
                                <input
                                    type="text"
                                    value={clientSecret}
                                    onChange={e => setClientSecret(e.target.value)}
                                    placeholder={hasSecret ? 'Cargando...' : 'Ingresar secret de Azure AD'}
                                    className="config-input"
                                />
                                <small style={{ color: clientSecret && !clientSecret.includes('•') ? '#059669' : '#6b7280' }}>
                                    {hasSecret ? '🔒 Secret configurado en BD' : '⚠️ Sin secret configurado'}
                                </small>
                            </div>
                            <div className="form-group">
                                <label>Cuenta de Servicio (Service Account)</label>
                                <input
                                    type="email"
                                    value={serviceAccount}
                                    onChange={e => setServiceAccount(e.target.value)}
                                    placeholder="soporte@empresa.com"
                                    className="config-input"
                                />
                                <small>Correo del usuario que el sistema usa para acceder a los archivos Excel vía Graph API. Si está vacío, se usa el propietario de cada formulario.</small>
                            </div>
                            <div className="form-group">
                                <label>Frecuencia de Sincronización Automática</label>
                                <select value={syncInterval} onChange={e => setSyncInterval(e.target.value)} className="config-select">
                                    <option value="1">Cada hora</option>
                                    <option value="6">Cada 6 horas</option>
                                    <option value="12">Cada 12 horas</option>
                                    <option value="24">Una vez al día</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={syncEnabled} onChange={e => setSyncEnabled(e.target.checked)} />
                                    <span>Habilitar sincronización automática</span>
                                </label>
                            </div>
                            <div className="button-group">
                                <button className="btn-test" onClick={testConnection}>🔌 Probar Conexión</button>
                                <button className="btn-save" onClick={saveConfig} disabled={savingConfig}>{savingConfig ? '⏳ Guardando...' : '💾 Guardar'}</button>
                                <button style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }} onClick={loadConfig} title="Recargar valores guardados">🔄 Recargar</button>
                            </div>
                            {connectionStatus && (
                                <div className={`connection-status ${connectionStatus.includes('✅') ? 'success' : 'error'}`}>{connectionStatus}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: Historial ── */}
            {activeTab === 'logs' && (
                <div className="tab-content">
                    <div className="sync-logs-section">
                        <h3>Historial de Sincronizaciones</h3>
                        <div className="logs-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th><th>Tipo</th><th>Estado</th>
                                        <th>Procesados</th><th>Nuevos</th><th>Actualizados</th>
                                        <th>Duración</th><th>Iniciado Por</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {syncLogs.length === 0 ? (
                                        <tr><td colSpan={8} className="no-data">Sin registros</td></tr>
                                    ) : syncLogs.map(log => (
                                        <tr key={log.SyncID}>
                                            <td>{fmtDate(log.FechaSync)}</td>
                                            <td>{log.TipoSync}</td>
                                            <td><span className={`status-badge ${log.Estado.toLowerCase()}`}>{log.Estado}</span></td>
                                            <td>{log.RegistrosProcesados}</td>
                                            <td>{log.RegistrosNuevos}</td>
                                            <td>{log.RegistrosActualizados}</td>
                                            <td>{fmtDuration(log.TiempoEjecucionMs)}</td>
                                            <td>{log.IniciadoPor}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editSource && (
                <div className="modal-overlay" onClick={() => setEditSource(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <h3>✏️ Editar formulario</h3>
                        <div className="form-group">
                            <label>Alias</label>
                            <input type="text" value={editAlias} onChange={e => setEditAlias(e.target.value)} className="config-input" />
                        </div>
                        <div className="form-group">
                            <label>Link del Excel</label>
                            <input type="text" value={editExcelUrl} onChange={e => setEditExcelUrl(e.target.value)} className="config-input" />
                            <small>Al cambiar la URL se resetean los IDs — use "Resolver" nuevamente</small>
                        </div>
                        <div className="form-group">
                            <label>Correo del propietario</label>
                            <input type="email" value={editOwnerEmail} onChange={e => setEditOwnerEmail(e.target.value)} className="config-input" />
                            <small>Si cambia el propietario, use "Resolver" nuevamente</small>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-save" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? '⏳ Guardando...' : '💾 Guardar cambios'}</button>
                            <button className="btn-cancel" onClick={() => setEditSource(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Response Detail Modal ── */}
            {detailResponse && (
                <div className="modal-overlay" onClick={() => setDetailResponse(null)}>
                    <div className="modal-box modal-detail" onClick={e => e.stopPropagation()}>
                        <div className="detail-header">
                            <h3>📝 Detalle de respuesta</h3>
                            <button className="btn-close" onClick={() => setDetailResponse(null)}>✕</button>
                        </div>
                        <div className="detail-meta">
                            <span><strong>Formulario:</strong> {detailResponse.FormAlias}</span>
                            <span><strong>Respondente:</strong> {detailResponse.RespondentName || detailResponse.RespondentEmail}</span>
                            <span><strong>Correo:</strong> {detailResponse.RespondentEmail}</span>
                            <span><strong>Fecha:</strong> {fmtDate(detailResponse.SubmittedAt)}</span>
                        </div>
                        <div className="detail-answers">
                            {(() => {
                                let answers: Record<string, any> = {};
                                try { answers = JSON.parse(detailResponse.Answers || '{}'); } catch { }
                                return Object.entries(answers).map(([q, a]) => (
                                    <div key={q} className="answer-row">
                                        <div className="answer-question">{q}</div>
                                        <div className="answer-value">{a == null || a === '' ? <em className="no-answer">Sin respuesta</em> : String(a)}</div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Mapping Modal ── */}
            {mappingSource && (
                <div className="modal-overlay" onClick={() => { setMappingSource(null); setShowUnmapped(false); }}>
                    <div className="modal-box modal-mapping" onClick={e => e.stopPropagation()}>
                        <div className="detail-header">
                            <h3>🔗 Mapeos — {mappingSource.Alias}</h3>
                            <button className="btn-close" onClick={() => { setMappingSource(null); setShowUnmapped(false); }}>✕</button>
                        </div>

                        {mappingLoading ? (
                            <div className="forms-loading">Cargando columnas...</div>
                        ) : (
                            <>
                                <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 16px' }}>
                                    Configure qué campo del formulario corresponde a un <strong>Local (CodAlmacen)</strong> y cuál a una <strong>Persona del Personal</strong>.
                                    Al sincronizar, el sistema intentará resolver estos campos automáticamente.
                                </p>

                                {mappingColumns.length === 0 ? (
                                    <div className="forms-empty" style={{ padding: '12px 0' }}>
                                        <p>⚠️ La tabla aún no tiene columnas de datos. Realice un <strong>Sync</strong> primero para que se creen las columnas.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mapping-fields">
                                            <div className="form-group">
                                                <label>🏪 Campo de Local (CodAlmacen)</label>
                                                <select value={mappingAlmacen} onChange={e => setMappingAlmacen(e.target.value)} className="config-select">
                                                    <option value="">— Sin mapear —</option>
                                                    {mappingColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                                <small>Se buscará en APP_STORE_ALIAS para encontrar el código del local</small>
                                            </div>
                                            <div className="form-group">
                                                <label>👤 Campo de Persona</label>
                                                <select value={mappingPersona} onChange={e => setMappingPersona(e.target.value)} className="config-select">
                                                    <option value="">— Sin mapear —</option>
                                                    {mappingColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                                <small>Se buscará en APP_USUARIOS para encontrar el ID del usuario</small>
                                            </div>
                                        </div>

                                        <div className="mapping-actions">
                                            <button className="btn-save" onClick={saveMappings} disabled={mappingSaving}>
                                                {mappingSaving ? '⏳ Guardando...' : '💾 Guardar Mapeos'}
                                            </button>
                                            <button className="btn-resolve-mapping" onClick={resolveMappings} disabled={mappingResolving}>
                                                {mappingResolving ? '⏳ Resolviendo...' : '🔄 Resolver Pendientes'}
                                            </button>
                                            <button className="btn-unmapped" onClick={() => { loadUnmapped(); loadDistinctUnmapped(); setShowUnmapped(true); setUnmappedTab('byValue'); }}>
                                                🔍 Ver Sin Mapear
                                            </button>
                                            <button className="btn-review-mapping" onClick={() => { if (reviewMappingType === 'CODALMACEN') { setReviewMappingType(null); } else { setReviewMappingType('CODALMACEN'); loadValueMappings('CODALMACEN'); } }}>
                                                {reviewMappingType === 'CODALMACEN' ? '✕ Cerrar' : '🏪 Revisar Locales'}
                                            </button>
                                            <button className="btn-review-mapping" onClick={() => { if (reviewMappingType === 'PERSONA') { setReviewMappingType(null); } else { setReviewMappingType('PERSONA'); loadValueMappings('PERSONA'); } }}>
                                                {reviewMappingType === 'PERSONA' ? '✕ Cerrar' : '👤 Revisar Personas'}
                                            </button>
                                        </div>

                                        {/* Review existing mappings panel */}
                                        {reviewMappingType && (
                                            <div className="review-mappings-panel">
                                                <h4>{reviewMappingType === 'CODALMACEN' ? '🏪 Mapeos de Locales' : '👤 Mapeos de Personas'}</h4>
                                                {valueMappings.filter(m => m.MappingType === reviewMappingType).length === 0 ? (
                                                    <p style={{ color: '#6b7280', fontSize: 13 }}>No hay mapeos manuales guardados para este tipo.</p>
                                                ) : (
                                                    <div className="review-mapping-list">
                                                        {valueMappings.filter(m => m.MappingType === reviewMappingType).map(m => (
                                                            <div className="review-mapping-row" key={m.ID}>
                                                                <span className="review-source">{m.SourceValue}</span>
                                                                <span className="review-arrow">→</span>
                                                                <span className="review-resolved">
                                                                    {m.ResolvedLabel ? `${m.ResolvedLabel} (${m.ResolvedValue})` : m.ResolvedValue}
                                                                </span>
                                                                <button
                                                                    className="review-delete-btn"
                                                                    disabled={deletingMappingId === m.ID}
                                                                    onClick={() => deleteValueMappingById(m.ID)}
                                                                    title="Eliminar mapeo"
                                                                >{deletingMappingId === m.ID ? '⏳' : '🗑️'}</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Stats */}
                                {mappingStats?.hasMappingColumns && mappingStats.stats && (
                                    <div className="mapping-stats">
                                        <h4>📊 Estado de Mapeos</h4>
                                        <div className="stats-grid">
                                            <div className="stat-item">
                                                <span className="stat-label">Total registros</span>
                                                <span className="stat-value">{mappingStats.stats.total}</span>
                                            </div>
                                            <div className="stat-item success">
                                                <span className="stat-label">Con Local</span>
                                                <span className="stat-value">{mappingStats.stats.withCodAlmacen}</span>
                                            </div>
                                            <div className="stat-item warning">
                                                <span className="stat-label">Sin Local</span>
                                                <span className="stat-value">{mappingStats.stats.withoutCodAlmacen}</span>
                                            </div>
                                            <div className="stat-item success">
                                                <span className="stat-label">Con Persona</span>
                                                <span className="stat-value">{mappingStats.stats.withPersonalId}</span>
                                            </div>
                                            <div className="stat-item warning">
                                                <span className="stat-label">Sin Persona</span>
                                                <span className="stat-value">{mappingStats.stats.withoutPersonalId}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Unmapped records */}
                                {showUnmapped && (
                                    <div className="unmapped-section">
                                        <div className="unmapped-tabs">
                                            <button className={`unmapped-tab ${unmappedTab === 'byValue' ? 'active' : ''}`} onClick={() => { setUnmappedTab('byValue'); if (distinctUnmapped.almacen.length === 0 && distinctUnmapped.persona.length === 0) loadDistinctUnmapped(); }}>📋 Por Valor</button>
                                            <button className={`unmapped-tab ${unmappedTab === 'byRecord' ? 'active' : ''}`} onClick={() => setUnmappedTab('byRecord')}>📄 Por Registro ({mappingUnmappedCount})</button>
                                        </div>

                                        {/* ── Tab: Por Valor (manual assignment) ── */}
                                        {unmappedTab === 'byValue' && (
                                            <div className="by-value-section">
                                                {loadingDistinct ? (
                                                    <div className="forms-loading">Cargando valores distintos...</div>
                                                ) : (distinctUnmapped.almacen.length === 0 && distinctUnmapped.persona.length === 0) ? (
                                                    <div style={{ padding: '16px 0' }}>
                                                        <p style={{ color: '#059669', fontSize: 13 }}>✅ No hay valores pendientes de mapear</p>
                                                        {distinctUnmapped.errors.length > 0 && (
                                                            <div style={{ marginTop: 8 }}>
                                                                {distinctUnmapped.errors.map((e, i) => <p key={i} style={{ color: '#dc2626', fontSize: 12 }}>⚠️ {e}</p>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Almacen mappings */}
                                                        {distinctUnmapped.almacen.length > 0 && (
                                                            <div className="mapping-group">
                                                                <h5>🏪 Locales sin mapear ({distinctUnmapped.almacen.length})</h5>
                                                                <div className="mapping-value-list">
                                                                    {distinctUnmapped.almacen.map(item => {
                                                                        const key = `CODALMACEN:${item.sourceValue}`;
                                                                        const sel = selectedMappings[key];
                                                                        return (
                                                                            <div className="mapping-value-row" key={item.sourceValue}>
                                                                                <div className="mv-source">
                                                                                    <span className="mv-value" title={item.sourceValue}>{item.sourceValue}</span>
                                                                                    <span className="mv-count">{item.cnt} reg.</span>
                                                                                </div>
                                                                                <div className="mv-arrow">→</div>
                                                                                <div className="mv-target">
                                                                                    <select
                                                                                        className="mv-select"
                                                                                        value={sel?.value || ''}
                                                                                        onChange={e => {
                                                                                            const opt = storeOptions.find(s => s.CODALMACEN === e.target.value);
                                                                                            setSelectedMappings(p => ({ ...p, [key]: { value: e.target.value, label: opt?.NOMBRE || e.target.value } }));
                                                                                        }}
                                                                                    >
                                                                                        <option value="">Seleccionar local...</option>
                                                                                        {storeOptions.map(s => (
                                                                                            <option key={s.CODALMACEN} value={s.CODALMACEN}>{s.NOMBRE} ({s.CODALMACEN})</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <button
                                                                                    className="mv-save-btn"
                                                                                    disabled={!sel?.value || savingValueMapping === key}
                                                                                    onClick={() => sel && saveValueMapping(item.sourceValue, 'CODALMACEN', sel.value, sel.label)}
                                                                                >{savingValueMapping === key ? '⏳' : '💾'}</button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Persona mappings */}
                                                        {distinctUnmapped.persona.length > 0 && (
                                                            <div className="mapping-group">
                                                                <h5>👤 Personas sin mapear ({distinctUnmapped.persona.length})</h5>
                                                                <div className="mapping-value-list">
                                                                    {distinctUnmapped.persona.map(item => {
                                                                        const key = `PERSONA:${item.sourceValue}`;
                                                                        const sel = selectedMappings[key];
                                                                        const searchVal = personalSearchInput[item.sourceValue] || '';
                                                                        return (
                                                                            <div className="mapping-value-row" key={item.sourceValue}>
                                                                                <div className="mv-source">
                                                                                    <span className="mv-value" title={item.sourceValue}>{item.sourceValue}</span>
                                                                                    <span className="mv-count">{item.cnt} reg.</span>
                                                                                </div>
                                                                                <div className="mv-arrow">→</div>
                                                                                <div className="mv-target mv-target-persona">
                                                                                    {sel ? (
                                                                                        <div className="mv-selected-persona">
                                                                                            <span>{sel.label}</span>
                                                                                            <button className="mv-clear" onClick={() => { setSelectedMappings(p => { const n = { ...p }; delete n[key]; return n; }); }}>✕</button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="mv-persona-search">
                                                                                            <input
                                                                                                type="text"
                                                                                                className="mv-search-input"
                                                                                                placeholder="Buscar persona..."
                                                                                                value={searchVal}
                                                                                                onChange={e => {
                                                                                                    const v = e.target.value;
                                                                                                    setPersonalSearchInput(p => ({ ...p, [item.sourceValue]: v }));
                                                                                                    searchPersonal(v);
                                                                                                }}
                                                                                            />
                                                                                            {searchVal.length >= 2 && personalSearchResults.length > 0 && (
                                                                                                <div className="mv-search-results">
                                                                                                    {personalSearchResults.map(p => (
                                                                                                        <div
                                                                                                            key={p.ID}
                                                                                                            className="mv-search-item"
                                                                                                            onClick={() => {
                                                                                                                setSelectedMappings(prev => ({ ...prev, [key]: { value: p.ID.toString(), label: p.NOMBRE } }));
                                                                                                                setPersonalSearchInput(prev => { const n = { ...prev }; delete n[item.sourceValue]; return n; });
                                                                                                                setPersonalSearchResults([]);
                                                                                                            }}
                                                                                                        >
                                                                                                            <span className="mv-search-name">{p.NOMBRE}</span>
                                                                                                            <span className="mv-search-email">{p.CORREO}</span>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    className="mv-save-btn"
                                                                                    disabled={!sel?.value || savingValueMapping === key}
                                                                                    onClick={() => sel && saveValueMapping(item.sourceValue, 'PERSONA', sel.value, sel.label)}
                                                                                >{savingValueMapping === key ? '⏳' : '💾'}</button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mapping-value-actions">
                                                            <button className="btn-resolve-mapping" onClick={async () => { await resolveMappings(); await loadDistinctUnmapped(); await loadUnmapped(); }} disabled={mappingResolving}>
                                                                {mappingResolving ? '⏳ Resolviendo...' : '🔄 Re-resolver Todo'}
                                                            </button>
                                                            <button className="btn-unmapped" onClick={loadDistinctUnmapped} disabled={loadingDistinct}>
                                                                {loadingDistinct ? '⏳' : '🔄'} Recargar
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* ── Tab: Por Registro (existing row-by-row view) ── */}
                                        {unmappedTab === 'byRecord' && (
                                            <div className="by-record-section">
                                                {mappingUnmapped.length === 0 ? (
                                                    <p style={{ color: '#059669', fontSize: 13, padding: '16px 0' }}>✅ Todos los registros están mapeados correctamente</p>
                                                ) : (
                                                    <div className="unmapped-table-wrap">
                                                        <table className="unmapped-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>ID</th>
                                                                    <th>Correo</th>
                                                                    <th>Fecha</th>
                                                                    {mappingAlmacen && <th>Valor Local</th>}
                                                                    {mappingPersona && <th>Valor Persona</th>}
                                                                    <th>CodAlmacen</th>
                                                                    <th>PersonalID</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {mappingUnmapped.slice(0, 50).map((row: any) => (
                                                                    <tr key={row.ID}>
                                                                        <td>{row.ID}</td>
                                                                        <td>{row.RespondentEmail || '—'}</td>
                                                                        <td>{row.SubmittedAt ? new Date(row.SubmittedAt).toLocaleDateString('es-CR') : '—'}</td>
                                                                        {mappingAlmacen && <td className="unmapped-value">{row._SourceLocal || '—'}</td>}
                                                                        {mappingPersona && <td className="unmapped-value">{row._SourcePersona || '—'}</td>}
                                                                        <td>{row._CODALMACEN || <span className="no-map">❌</span>}</td>
                                                                        <td>{row._PERSONAL_ID ? `✅ ${row._PERSONAL_NOMBRE || row._PERSONAL_ID}` : <span className="no-map">❌</span>}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
