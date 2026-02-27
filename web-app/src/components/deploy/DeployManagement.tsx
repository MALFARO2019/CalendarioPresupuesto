import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from '../ui/Toast';
import {
    fetchDeployLog,
    addDeployLogEntry,
    deployToServer,
    fetchSetupGuide,
    runSetupRemote,
    runSetupLocal,
    fetchServerVersion,
    fetchGitBranches,
    fetchGitStatus,
    commitAndPush,
    fetchNotificacionesVersiones,
    fetchVersionesDisponibles,
    saveNotificacionVersion,
    deleteNotificacionVersion,
    fetchRuta,
    uploadNotificacionImagen,
    API_BASE,
    type DeployLogEntry,
    type SetupGuide,
    type ServerVersionInfo,
    type GitStatus,
    type NotificacionVersion,
} from '../../api';

// ==========================================
// SERVER CONFIG (Multi-Server)
// ==========================================

interface ServerConfig {
    id: string;
    ip: string;
    user: string;
    password: string;
    appDir: string;
    label: string;
}

const DEFAULT_SERVERS: ServerConfig[] = [
    { id: '1', ip: '10.29.1.25', user: 'Administrador', password: 'R0st1p017', appDir: 'C:\\Deploy\\CalendarioPresupuesto', label: 'Servidor Principal' },
];

function loadServers(): ServerConfig[] {
    try {
        const data = localStorage.getItem('deploy_servers');
        if (data) {
            const servers: ServerConfig[] = JSON.parse(data);
            // Ensure appDir uses C:\Deploy path
            let migrated = false;
            servers.forEach(s => {
                if (s.appDir && s.appDir.includes('\\Apps\\')) {
                    s.appDir = s.appDir.replace('\\Apps\\', '\\Deploy\\');
                    migrated = true;
                }
            });
            if (migrated) saveServers(servers);
            return servers;
        }
    } catch { }
    return DEFAULT_SERVERS;
}

function saveServers(servers: ServerConfig[]) {
    localStorage.setItem('deploy_servers', JSON.stringify(servers));
}

/** Format seconds to a human-readable string like "3m 42s" or "15s" */
function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function getDeployTimingHistory(): { durationMinutes: number }[] {
    try {
        return JSON.parse(localStorage.getItem('deploy_timing_history') || '[]');
    } catch { return []; }
}

// ==========================================
// DEPLOY MANAGEMENT COMPONENT
// ==========================================

export function DeployManagement() {
    const { showToast, showConfirm } = useToast();
    const [activeSection, setActiveSection] = useState<'publish' | 'setup' | 'changelog' | 'version-notes' | 'ruta'>('publish');

    // Multi-server state
    const [servers, setServers] = useState<ServerConfig[]>(loadServers);
    const [selectedServerId, setSelectedServerId] = useState<string>(servers[0]?.id || '1');
    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];

    // Publish state
    const [version, setVersion] = useState('');
    const [notes, setNotes] = useState('');
    const [deploying, setDeploying] = useState(false);
    const [deploySteps, setDeploySteps] = useState<{ step: string; status: string; detail?: string }[]>([]);
    const [deployResult, setDeployResult] = useState<'success' | 'error' | null>(null);
    const [deployTiming, setDeployTiming] = useState<{ startTime: string; endTime: string; durationMinutes: number } | null>(null);
    const [deployStartLocal, setDeployStartLocal] = useState<Date | null>(null);
    const [showServerConfig, setShowServerConfig] = useState(false);
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

    // Per-server version tracking
    const [serverVersion, setServerVersion] = useState<ServerVersionInfo | null>(null);
    const [serverVersionLoading, setServerVersionLoading] = useState(false);

    // Setup guide state
    const [guide, setGuide] = useState<SetupGuide | null>(null);
    const [guideLoading, setGuideLoading] = useState(false);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
    const [setupRunning, setSetupRunning] = useState<'remote' | 'local' | 'both' | null>(null);
    const [setupSteps, setSetupSteps] = useState<{ step: string; status: string; detail?: string }[]>([]);
    const [setupResult, setSetupResult] = useState<'success' | 'error' | null>(null);

    // Server management
    const [showAddServer, setShowAddServer] = useState(false);
    const [newServer, setNewServer] = useState<Partial<ServerConfig>>({ ip: '', user: 'Administrador', password: '', appDir: 'C:\\Deploy\\CalendarioPresupuesto', label: '' });

    // Changelog state
    const [logEntries, setLogEntries] = useState<DeployLogEntry[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [showAddEntry, setShowAddEntry] = useState(false);
    const [newVersion, setNewVersion] = useState('');
    const [newNotes, setNewNotes] = useState('');

    // Version Notes state
    const [vnItems, setVnItems] = useState<NotificacionVersion[]>([]);
    const [vnVersiones, setVnVersiones] = useState<string[]>([]);
    const [vnFilterVersion, setVnFilterVersion] = useState<string>('');
    const [vnLoading, setVnLoading] = useState(false);
    const [vnShowForm, setVnShowForm] = useState(false);
    const [vnEditing, setVnEditing] = useState<NotificacionVersion | null>(null);
    const [vnForm, setVnForm] = useState({ VersionId: '', Titulo: '', Texto: '', Tipo: 'mejora', Orden: 0, ImagenUrl: '' });
    const [vnSaving, setVnSaving] = useState(false);
    const [vnUploadingImg, setVnUploadingImg] = useState(false);

    // Ruta state
    const [rutaItems, setRutaItems] = useState<NotificacionVersion[]>([]);
    const [rutaLoading, setRutaLoading] = useState(false);

    // Git branch & status state
    const [branches, setBranches] = useState<string[]>(['main']);
    const [selectedBranch, setSelectedBranch] = useState('main');
    // scenario es auto-seleccionado por el backend, no por el usuario
    const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
    const [gitStatusLoading, setGitStatusLoading] = useState(false);
    const [newServers, setNewServers] = useState('10.29.1.25');

    // Elapsed timer for deploy progress
    const [deployElapsed, setDeployElapsed] = useState(0);
    const deployTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => { if (deployTimerRef.current) clearInterval(deployTimerRef.current); };
    }, []);

    const startDeployTimer = () => {
        setDeployElapsed(0);
        if (deployTimerRef.current) clearInterval(deployTimerRef.current);
        deployTimerRef.current = setInterval(() => setDeployElapsed(prev => prev + 1), 1000);
    };

    const stopDeployTimer = () => {
        if (deployTimerRef.current) { clearInterval(deployTimerRef.current); deployTimerRef.current = null; }
    };

    // Average deploy duration from history (in seconds)
    const avgDeploySeconds = useMemo(() => {
        const history = getDeployTimingHistory();
        if (history.length === 0) return 0;
        return Math.round(history.reduce((s, h) => s + h.durationMinutes * 60, 0) / history.length);
    }, [deploying]); // recalculate when deploy starts/stops

    const lastDeployDuration = useMemo(() => {
        const history = getDeployTimingHistory();
        if (history.length === 0) return 0;
        return Math.round(history[history.length - 1].durationMinutes * 60);
    }, [deploying]);

    // Load server version when selected server changes
    const loadServerVersion = async (ip: string) => {
        setServerVersionLoading(true);
        try {
            const info = await fetchServerVersion(ip);
            setServerVersion(info);
        } catch {
            setServerVersion(null);
        } finally {
            setServerVersionLoading(false);
        }
    };

    useEffect(() => {
        if (selectedServer?.ip) {
            loadServerVersion(selectedServer.ip);
        }
    }, [selectedServerId]);

    // Generate version options based on server's current version
    const versionOptions = React.useMemo(() => {
        const options: string[] = [];
        // Use server version if available, otherwise fallback to changelog
        const currentVer = serverVersion?.version
            || (logEntries.length > 0 ? logEntries[0].version : null)
            || 'v1.0';
        const match = currentVer.match(/(\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            // Current version (re-deploy) + newer versions
            options.push(`v${major}.${minor}`);
            options.push(`v${major}.${minor + 1}`);
            options.push(`v${major}.${minor + 2}`);
            options.push(`v${major + 1}.0`);
        } else {
            const numMatch = currentVer.match(/(\d+)/);
            const num = numMatch ? parseInt(numMatch[1]) : 1;
            options.push(`v${num}`);
            options.push(`v${num + 1}`);
            options.push(`v${num + 2}`);
        }
        return options;
    }, [serverVersion, logEntries]);

    useEffect(() => { loadChangelog(); }, []);

    useEffect(() => {
        if (activeSection === 'changelog') loadChangelog();
        if (activeSection === 'setup') loadGuide();
        if (activeSection === 'version-notes') loadVersionNotes();
        if (activeSection === 'ruta') loadRuta();
    }, [activeSection]);

    // ==========================================
    // VERSION NOTES HANDLERS
    // ==========================================

    const loadVersionNotes = async () => {
        setVnLoading(true);
        try {
            const [items, versiones] = await Promise.all([
                fetchNotificacionesVersiones(vnFilterVersion || undefined),
                fetchVersionesDisponibles()
            ]);
            setVnItems(items);
            setVnVersiones(versiones);
        } catch (e: any) {
            console.error('Error loading version notes:', e);
        } finally { setVnLoading(false); }
    };

    useEffect(() => {
        if (activeSection === 'version-notes') loadVersionNotes();
    }, [vnFilterVersion]);

    const handleVnUploadImagen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
            showToast('La imagen no debe superar los 3 MB', 'error');
            return;
        }
        setVnUploadingImg(true);
        try {
            const url = await uploadNotificacionImagen(file);
            setVnForm(f => ({ ...f, ImagenUrl: url }));
            showToast('Imagen subida', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setVnUploadingImg(false);
        }
    };

    const handleVnSave = async () => {
        if (!vnForm.Titulo.trim() || !vnForm.VersionId.trim()) return;
        setVnSaving(true);
        try {
            await saveNotificacionVersion({
                ...(vnEditing ? { id: vnEditing.Id } : {}),
                VersionId: vnForm.VersionId,
                Titulo: vnForm.Titulo,
                Texto: vnForm.Texto,
                ImagenUrl: vnForm.ImagenUrl,
                Tipo: vnForm.Tipo,
                Orden: vnForm.Orden,
            });
            showToast(vnEditing ? 'Nota actualizada' : 'Nota creada', 'success');
            setVnShowForm(false);
            setVnEditing(null);
            setVnForm({ VersionId: '', Titulo: '', Texto: '', Tipo: 'mejora', Orden: 0, ImagenUrl: '' });
            loadVersionNotes();
        } catch (e: any) {
            showToast('Error: ' + e.message, 'error');
        } finally { setVnSaving(false); }
    };

    const handleVnEdit = (item: NotificacionVersion) => {
        setVnEditing(item);
        setVnForm({ VersionId: item.VersionId, Titulo: item.Titulo, Texto: item.Texto, Tipo: item.Tipo, Orden: item.Orden, ImagenUrl: item.ImagenUrl || '' });
        setVnShowForm(true);
    };

    const handleVnDelete = async (id: number) => {
        if (!await showConfirm({ message: '¿Eliminar esta nota de versión?', destructive: true })) return;
        try {
            await deleteNotificacionVersion(id);
            showToast('Nota eliminada', 'success');
            loadVersionNotes();
        } catch (e: any) { showToast('Error: ' + e.message, 'error'); }
    };

    const handleVnNew = () => {
        setVnEditing(null);
        // Pre-fill version with server version or filter
        const defaultVer = vnFilterVersion || serverVersion?.version || '';
        setVnForm({ VersionId: defaultVer, Titulo: '', Texto: '', Tipo: 'mejora', Orden: vnItems.length, ImagenUrl: '' });
        setVnShowForm(true);
    };

    const vnTipoBadge = (tipo: string) => {
        switch (tipo) {
            case 'mejora': return { emoji: '🟢', label: 'Mejora', cls: 'bg-green-100 text-green-700' };
            case 'corrección': case 'correccion': return { emoji: '🔴', label: 'Corrección', cls: 'bg-red-100 text-red-700' };
            case 'nueva funcionalidad': return { emoji: '🔵', label: 'Nueva', cls: 'bg-blue-100 text-blue-700' };
            default: return { emoji: '⚪', label: tipo, cls: 'bg-gray-100 text-gray-700' };
        }
    };

    // ==========================================
    // RUTA (ROADMAP) HANDLERS
    // ==========================================

    const loadRuta = async () => {
        setRutaLoading(true);
        try {
            const currentVer = serverVersion?.version || 'v0.0';
            const items = await fetchRuta(currentVer);
            setRutaItems(items);
        } catch (e: any) {
            console.error('Error loading ruta:', e);
        } finally { setRutaLoading(false); }
    };

    const loadChangelog = async () => {
        setLogLoading(true);
        try {
            const log = await fetchDeployLog();
            setLogEntries(log.entries);
        } catch (e: any) {
            console.error('Error loading changelog:', e);
        } finally { setLogLoading(false); }
    };

    const loadGuide = async () => {
        setGuideLoading(true);
        try {
            const data = await fetchSetupGuide();
            setGuide(data);
        } catch (e: any) {
            console.error('Error loading guide:', e);
        } finally { setGuideLoading(false); }
    };

    // Load git branches & status
    const loadGitInfo = useCallback(async () => {
        setGitStatusLoading(true);
        try {
            const [branchList, status] = await Promise.all([
                fetchGitBranches(),
                fetchGitStatus(selectedBranch)
            ]);
            setBranches(branchList);
            setGitStatus(status);
        } catch (e) {
            console.warn('Error loading git info:', e);
        } finally {
            setGitStatusLoading(false);
        }
    }, [selectedBranch]);

    useEffect(() => { loadGitInfo(); }, [loadGitInfo]);

    const refreshGitStatus = useCallback(async () => {
        try {
            const status = await fetchGitStatus(selectedBranch);
            setGitStatus(status);
        } catch { /* ignore */ }
    }, [selectedBranch]);

    const handleDeploy = async () => {
        if (!version.trim() || !selectedServer) return;
        setDeploying(true);
        setDeployResult(null);
        setDeployTiming(null);
        setDeployStartLocal(new Date());
        startDeployTimer();

        const hasPendingChanges = gitStatus?.needsCommit || gitStatus?.needsPush;
        const initialSteps: { step: string; status: string; detail?: string }[] = [];

        if (hasPendingChanges) {
            initialSteps.push({ step: 'Subiendo cambios a GitHub', status: 'running' });
        }
        initialSteps.push(
            { step: 'Verificando conexión', status: 'pending' },
            { step: 'Descargando código (git)', status: 'pending' },
            { step: 'Registrando versión', status: 'pending' },
            { step: 'Instalando dependencias backend', status: 'pending' },
            { step: 'Construyendo frontend', status: 'pending' },
            { step: 'Verificando web.config', status: 'pending' },
            { step: 'Garantizando PORT=3000', status: 'pending' },
            { step: 'Verificando infraestructura', status: 'pending' },
            { step: 'Reiniciando servicio', status: 'pending' },
            { step: 'Verificando API', status: 'pending' },
            { step: 'Verificando sitio web', status: 'pending' },
        );
        setDeploySteps(initialSteps);

        try {
            // Step 0: Auto-commit + push if needed
            if (hasPendingChanges) {
                const commitMsg = `Deploy ${version}: ${notes || 'Actualización'}`;
                const pushResult = await commitAndPush(selectedBranch, commitMsg);
                const pushOffset = 0;
                if (pushResult.success) {
                    setDeploySteps(prev => {
                        const updated = [...prev];
                        updated[pushOffset] = {
                            step: 'Subiendo cambios a GitHub',
                            status: 'success',
                            detail: pushResult.steps.map(s => s.detail || s.step).join(' → ')
                        };
                        updated[pushOffset + 1] = { ...updated[pushOffset + 1], status: 'running' };
                        return updated;
                    });
                } else {
                    setDeploySteps(prev => {
                        const updated = [...prev];
                        updated[pushOffset] = {
                            step: 'Subiendo cambios a GitHub',
                            status: 'error',
                            detail: pushResult.steps.find(s => s.status === 'error')?.detail || 'Error al subir'
                        };
                        return updated;
                    });
                    setDeployResult('error');
                    setDeploying(false);
                    return;
                }
                await refreshGitStatus();
            }

            // Remote deploy
            const result = await deployToServer(selectedServer.ip, selectedServer.user, selectedServer.password, selectedServer.appDir, version, notes, selectedBranch);

            // Merge steps: keep the push step (if any), replace the rest
            if (hasPendingChanges) {
                setDeploySteps(prev => [
                    prev[0], // keep push step
                    ...result.steps
                ]);
            } else {
                setDeploySteps(result.steps);
            }
            setDeployResult(result.success ? 'success' : 'error');

            // Save timing data
            if (result.timing) {
                setDeployTiming(result.timing);
                // Save to localStorage for ETA calculation
                try {
                    const history = JSON.parse(localStorage.getItem('deploy_timing_history') || '[]');
                    history.push({ ...result.timing, version, serverIp: selectedServer.ip, date: new Date().toISOString() });
                    // Keep last 10 entries
                    if (history.length > 10) history.splice(0, history.length - 10);
                    localStorage.setItem('deploy_timing_history', JSON.stringify(history));
                } catch { /* non-fatal */ }
            }

            // Refresh server version after successful deploy
            if (result.success) {
                loadServerVersion(selectedServer.ip);
            }
        } catch (e: any) {
            setDeployResult('error');
            setDeploySteps(prev => prev.map(s =>
                s.status === 'running' ? { ...s, status: 'error', detail: e.message } : s
            ));
        } finally {
            stopDeployTimer();
            setDeploying(false);
            loadChangelog();
        }
    };

    // ==========================================
    // SETUP AUTOMATION HANDLERS
    // ==========================================

    const handleRunRemote = async () => {
        if (!selectedServer) return;
        setSetupRunning('remote');
        setSetupResult(null);
        setSetupSteps([{ step: 'Iniciando configuración del servidor...', status: 'running' }]);
        try {
            const result = await runSetupRemote(selectedServer.ip, selectedServer.user, selectedServer.password);
            setSetupSteps(result.steps);
            setSetupResult(result.success ? 'success' : 'error');
        } catch (e: any) {
            setSetupSteps([{ step: 'Error de conexión', status: 'error', detail: e.message }]);
            setSetupResult('error');
        } finally { setSetupRunning(null); }
    };

    const handleRunLocal = async () => {
        if (!selectedServer) return;
        setSetupRunning('local');
        setSetupResult(null);
        setSetupSteps([{ step: 'Configurando máquina local...', status: 'running' }]);
        try {
            const result = await runSetupLocal(selectedServer.ip);
            setSetupSteps(result.steps);
            setSetupResult(result.success ? 'success' : 'error');
        } catch (e: any) {
            setSetupSteps([{ step: 'Error local', status: 'error', detail: e.message }]);
            setSetupResult('error');
        } finally { setSetupRunning(null); }
    };

    const handleRunBoth = async () => {
        if (!selectedServer) return;
        setSetupRunning('both');
        setSetupResult(null);
        setSetupSteps([{ step: 'Configurando máquina local...', status: 'running' }]);

        // Run local first
        let localSteps: typeof setupSteps = [];
        try {
            const localResult = await runSetupLocal(selectedServer.ip);
            localSteps = localResult.steps;
        } catch (e: any) {
            localSteps = [{ step: 'Error local', status: 'error', detail: e.message }];
        }

        // Then remote
        setSetupSteps([...localSteps, { step: 'Configurando servidor remoto...', status: 'running' }]);
        let remoteSteps: typeof setupSteps = [];
        try {
            const remoteResult = await runSetupRemote(selectedServer.ip, selectedServer.user, selectedServer.password);
            remoteSteps = remoteResult.steps;
        } catch (e: any) {
            remoteSteps = [{ step: 'Error remoto', status: 'error', detail: e.message }];
        }

        const allSteps = [...localSteps, ...remoteSteps];
        setSetupSteps(allSteps);
        setSetupResult(allSteps.some(s => s.status === 'error') ? 'error' : 'success');
        setSetupRunning(null);
    };

    // ==========================================
    // SERVER MANAGEMENT
    // ==========================================

    const addServer = () => {
        if (!newServer.ip?.trim()) return;
        const srv: ServerConfig = {
            id: Date.now().toString(),
            ip: newServer.ip!.trim(),
            user: newServer.user || 'Administrador',
            password: newServer.password || '',
            appDir: newServer.appDir || 'C:\\Deploy\\CalendarioPresupuesto',
            label: newServer.label || newServer.ip!.trim(),
        };
        const updated = [...servers, srv];
        setServers(updated);
        saveServers(updated);
        setSelectedServerId(srv.id);
        setShowAddServer(false);
        setNewServer({ ip: '', user: 'Administrador', password: '', appDir: 'C:\\Deploy\\CalendarioPresupuesto', label: '' });
    };

    const removeServer = async (id: string) => {
        if (servers.length <= 1) {
            if (!await showConfirm({ message: '¿Eliminar el último servidor? Se restaurará la configuración por defecto.', destructive: true })) return;
            setServers(DEFAULT_SERVERS);
            saveServers(DEFAULT_SERVERS);
            setSelectedServerId(DEFAULT_SERVERS[0].id);
            return;
        }
        const updated = servers.filter(s => s.id !== id);
        setServers(updated);
        saveServers(updated);
        if (selectedServerId === id) setSelectedServerId(updated[0].id);
    };

    const togglePassword = (fieldId: string) => {
        setShowPasswords(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
    };

    const updateServerField = (id: string, field: keyof ServerConfig, value: string) => {
        const updated = servers.map(s => s.id === id ? { ...s, [field]: value } : s);
        setServers(updated);
        saveServers(updated);
    };

    const handleAddEntry = async () => {
        if (!newVersion.trim()) return;
        try {
            await addDeployLogEntry(newVersion, newNotes, newServers.split(',').map(s => s.trim()).filter(Boolean));
            setShowAddEntry(false);
            setNewVersion('');
            setNewNotes('');
            loadChangelog();
        } catch (e: any) { showToast('Error: ' + e.message, 'error'); }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedCmd(id);
        setTimeout(() => setCopiedCmd(null), 2000);
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'running': return '⏳';
            case 'deploying': return '🚀';
            default: return '⏸️';
        }
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'success': return 'text-green-600 bg-green-50 border-green-200';
            case 'error': return 'text-red-600 bg-red-50 border-red-200';
            case 'warning': return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'running':
            case 'deploying': return 'text-amber-600 bg-amber-50 border-amber-200';
            default: return 'text-gray-500 bg-gray-50 border-gray-200';
        }
    };

    // ==========================================
    // SERVER SELECTOR (render function, NOT component)
    // ==========================================

    const renderServerSelector = (showConfigToggle: boolean) => (
        <div className="space-y-3">
            {/* Server row: dropdown + action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-bold text-gray-600 uppercase">Servidor</label>
                <select
                    value={selectedServerId}
                    onChange={e => setSelectedServerId(e.target.value)}
                    className="flex-1 min-w-[180px] px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 text-sm font-mono transition-all bg-white"
                    disabled={deploying || !!setupRunning}
                >
                    {servers.map(s => (
                        <option key={s.id} value={s.id}>{s.label} ({s.ip})</option>
                    ))}
                </select>

                {/* Always-visible action buttons */}
                <button
                    onClick={() => { setShowAddServer(!showAddServer); setShowServerConfig(false); }}
                    className={`px-3 py-2 text-sm font-semibold rounded-xl transition-all ${showAddServer ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    title="Agregar servidor"
                >
                    + Agregar
                </button>
                {showConfigToggle && (
                    <>
                        <button
                            onClick={() => { setShowServerConfig(!showServerConfig); setShowAddServer(false); }}
                            className={`px-3 py-2 text-sm font-semibold rounded-xl transition-all flex items-center gap-1 ${showServerConfig ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                            title="Editar servidor seleccionado"
                        >
                            ✏️ Editar
                        </button>
                        <button
                            onClick={() => removeServer(selectedServerId)}
                            className="px-3 py-2 text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all flex items-center gap-1"
                            title="Eliminar servidor seleccionado"
                            disabled={deploying || !!setupRunning}
                        >
                            🗑️ Eliminar
                        </button>
                    </>
                )}
            </div>

            {/* Add Server Form */}
            {showAddServer && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-emerald-800 flex items-center gap-2">➕ Agregar Nuevo Servidor</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Nombre / Etiqueta</label>
                            <input type="text" value={newServer.label || ''} onChange={e => setNewServer({ ...newServer, label: e.target.value })}
                                placeholder="ej: Servidor QA" className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">IP del Servidor *</label>
                            <input type="text" value={newServer.ip || ''} onChange={e => setNewServer({ ...newServer, ip: e.target.value })}
                                placeholder="10.29.1.XX" className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm font-mono" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Usuario</label>
                            <input type="text" value={newServer.user || ''} onChange={e => setNewServer({ ...newServer, user: e.target.value })}
                                placeholder="Administrador" className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm font-mono" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Contraseña</label>
                            <div className="relative">
                                <input type={showPasswords['new'] ? 'text' : 'password'} value={newServer.password || ''} onChange={e => setNewServer({ ...newServer, password: e.target.value })}
                                    className="w-full px-3 py-2 pr-10 border border-emerald-200 rounded-lg text-sm font-mono" />
                                <button type="button" onClick={() => togglePassword('new')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm p-1" tabIndex={-1}>
                                    {showPasswords['new'] ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Directorio App</label>
                            <input type="text" value={newServer.appDir || ''} onChange={e => setNewServer({ ...newServer, appDir: e.target.value })}
                                className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm font-mono" />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowAddServer(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all">Cancelar</button>
                        <button onClick={addServer} disabled={!newServer.ip?.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50">Agregar</button>
                    </div>
                </div>
            )}

            {/* Edit selected server config */}
            {showServerConfig && selectedServer && (
                <div className="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                        ✏️ Editando: <span className="text-indigo-600">{selectedServer.label} ({selectedServer.ip})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Nombre / Etiqueta</label>
                            <input type="text" value={selectedServer.label} onChange={e => updateServerField(selectedServer.id, 'label', e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm" disabled={deploying || !!setupRunning} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">IP</label>
                            <input type="text" value={selectedServer.ip} onChange={e => updateServerField(selectedServer.id, 'ip', e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm font-mono" disabled={deploying || !!setupRunning} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Usuario</label>
                            <input type="text" value={selectedServer.user} onChange={e => updateServerField(selectedServer.id, 'user', e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm font-mono" disabled={deploying || !!setupRunning} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Contraseña</label>
                            <div className="relative">
                                <input type={showPasswords['edit'] ? 'text' : 'password'} value={selectedServer.password} onChange={e => updateServerField(selectedServer.id, 'password', e.target.value)}
                                    className="w-full px-3 py-2 pr-10 border border-indigo-200 rounded-lg text-sm font-mono" disabled={deploying || !!setupRunning} />
                                <button type="button" onClick={() => togglePassword('edit')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm p-1" tabIndex={-1}>
                                    {showPasswords['edit'] ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Directorio App</label>
                            <input type="text" value={selectedServer.appDir} onChange={e => updateServerField(selectedServer.id, 'appDir', e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm font-mono" disabled={deploying || !!setupRunning} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={() => setShowServerConfig(false)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all">
                            ✓ Listo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    // ==========================================
    // STEP PROGRESS COMPONENT (shared)
    // ==========================================

    const StepProgress = ({ steps, title }: { steps: { step: string; status: string; detail?: string }[]; title: string }) => (
        <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">{title}</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {steps.map((step, idx) => (
                    <div key={idx} className="px-4 py-3 flex items-start gap-3">
                        <span className="text-lg flex-shrink-0 mt-0.5">{statusIcon(step.status)}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{step.step}</p>
                            {step.detail && (
                                <p className="text-xs text-gray-500 mt-0.5 font-mono break-all">{step.detail}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Section Tabs */}
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => setActiveSection('publish')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'publish'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    🚀 Publicar
                </button>
                <button onClick={() => setActiveSection('version-notes')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'version-notes'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    📝 Notas de Versión
                </button>
                <button onClick={() => setActiveSection('ruta')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'ruta'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    🗺️ Ruta
                </button>
                <button onClick={() => setActiveSection('setup')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'setup'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    📋 Configurar Servidor
                </button>
                <button onClick={() => setActiveSection('changelog')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'changelog'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    📜 Bitácora
                </button>
            </div>

            {/* ==========================================
                SECTION 1: PUBLISH
               ========================================== */}
            {activeSection === 'publish' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">🚀 Publicar al Servidor</h2>
                        <p className="text-indigo-100 text-sm mt-1">Desplegar los cambios al servidor de producción</p>
                    </div>
                    <div className="p-6 space-y-5">
                        {/* Server Selector */}
                        {renderServerSelector(true)}

                        {/* Server Version Badge */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold text-gray-500 uppercase">Versión actual en servidor:</span>
                            {serverVersionLoading ? (
                                <span className="text-xs text-gray-400 animate-pulse">Consultando...</span>
                            ) : serverVersion?.version ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    <span className="text-sm font-bold text-emerald-700 font-mono">{serverVersion.version}</span>
                                    <span className="text-[10px] text-emerald-500">✅</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                                    <span className="text-sm font-medium text-gray-400">Sin versión registrada</span>
                                </span>
                            )}
                            {serverVersion?.date && (
                                <span className="text-[11px] text-gray-400">
                                    Desplegado: {new Date(serverVersion.date).toLocaleDateString('es-CR', {
                                        year: 'numeric', month: 'short', day: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </span>
                            )}
                        </div>

                        {/* Version & Branch */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Versión *</label>
                                <select value={version} onChange={e => setVersion(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm font-mono transition-all bg-white appearance-none"
                                    disabled={deploying}>
                                    <option value="">Seleccionar versión...</option>
                                    {versionOptions.map(v => (
                                        <option key={v} value={v}>{v}{v === serverVersion?.version ? ' (actual)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Rama (Branch)</label>
                                <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm font-mono transition-all bg-white appearance-none"
                                    disabled={deploying}>
                                    {branches.map(b => (
                                        <option key={b} value={b}>{b}{b === gitStatus?.currentBranch ? ' ← actual' : ''}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Git Status Indicator */}
                        {gitStatus && (gitStatus.needsCommit || gitStatus.needsPush) && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <span className="text-lg">⚠️</span>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-amber-800">Cambios pendientes</p>
                                    <p className="text-xs text-amber-600">
                                        {gitStatus.needsCommit && `${gitStatus.uncommittedCount} archivo(s) sin commit`}
                                        {gitStatus.needsCommit && gitStatus.needsPush && ' · '}
                                        {gitStatus.needsPush && `${gitStatus.unpushedCount} commit(s) sin push`}
                                        {' — Se subirán automáticamente al publicar'}
                                    </p>
                                </div>
                                <button onClick={refreshGitStatus} disabled={gitStatusLoading}
                                    className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded-lg text-amber-700 transition-colors"
                                    title="Actualizar estado">
                                    {gitStatusLoading ? '⏳' : '🔄'}
                                </button>
                            </div>
                        )}
                        {gitStatus && !gitStatus.needsCommit && !gitStatus.needsPush && !gitStatusLoading && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100">
                                <span className="text-sm">✅</span>
                                <span className="text-xs text-green-700">Todo al día con GitHub ({selectedBranch})</span>
                                <button onClick={refreshGitStatus} disabled={gitStatusLoading}
                                    className="ml-auto text-xs px-2 py-0.5 bg-green-100 hover:bg-green-200 rounded text-green-600 transition-colors">
                                    🔄
                                </button>
                            </div>
                        )}

                        {/* Notes */}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Notas de Cambios</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Describe los cambios incluidos en esta versión..." rows={3}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all resize-none"
                                disabled={deploying} />
                        </div>

                        {/* Deploy Button */}
                        {/* Last deploy duration badge (visible before deploying) */}
                        {!deploying && lastDeployDuration > 0 && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>📊 Última publicación demoró: <span className="font-bold text-gray-700">{formatDuration(lastDeployDuration)}</span></span>
                                {avgDeploySeconds > 0 && avgDeploySeconds !== lastDeployDuration && (
                                    <span className="text-gray-400">· Promedio: {formatDuration(avgDeploySeconds)}</span>
                                )}
                            </div>
                        )}

                        <button onClick={handleDeploy} disabled={deploying || !version.trim()}
                            className={`w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2 ${deploying
                                ? 'bg-amber-100 text-amber-700 cursor-wait'
                                : deployResult === 'success'
                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'}`}>
                            {deploying ? (
                                <><span className="animate-spin">⏳</span> Publicando... <span className="font-mono text-sm">{formatDuration(deployElapsed)}</span></>
                            ) : deployResult === 'success' ? (
                                <>✅ Publicado — Publicar de Nuevo</>
                            ) : (
                                <>🚀 Publicar en {selectedServer?.ip}</>
                            )}
                        </button>

                        {/* Live progress panel during deploy */}
                        {deploying && (
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 space-y-3">
                                {/* Progress bar */}
                                {avgDeploySeconds > 0 ? (
                                    <>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-semibold text-amber-800">⏱️ Progreso estimado</span>
                                            <span className="font-bold text-amber-700 font-mono">
                                                {Math.min(99, Math.round((deployElapsed / avgDeploySeconds) * 100))}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-amber-100 rounded-full h-3 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000 ease-linear"
                                                style={{
                                                    width: `${Math.min(99, (deployElapsed / avgDeploySeconds) * 100)}%`,
                                                    background: deployElapsed < avgDeploySeconds
                                                        ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                                                        : 'linear-gradient(90deg, #ef4444, #dc2626)',
                                                }}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-amber-700 flex items-center gap-2">
                                        <span className="animate-pulse">📊</span>
                                        <span>Primera publicación — sin estimado previo</span>
                                    </div>
                                )}

                                {/* Stats row */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {/* Elapsed */}
                                    <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">Tiempo</div>
                                        <div className="text-sm font-bold text-amber-800 font-mono">{formatDuration(deployElapsed)}</div>
                                    </div>
                                    {/* Last duration */}
                                    <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">Última vez</div>
                                        <div className="text-sm font-bold text-gray-700 font-mono">
                                            {lastDeployDuration > 0 ? formatDuration(lastDeployDuration) : '—'}
                                        </div>
                                    </div>
                                    {/* ETA */}
                                    <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">ETA</div>
                                        <div className="text-sm font-bold text-amber-800 font-mono">
                                            {avgDeploySeconds > 0 && deployElapsed < avgDeploySeconds
                                                ? formatDuration(avgDeploySeconds - deployElapsed)
                                                : avgDeploySeconds > 0 ? 'Excedido' : '—'}
                                        </div>
                                    </div>
                                    {/* Estimated finish time */}
                                    <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">Hora fin</div>
                                        <div className="text-sm font-bold text-gray-700 font-mono">
                                            {avgDeploySeconds > 0 && deployStartLocal
                                                ? new Date(deployStartLocal.getTime() + avgDeploySeconds * 1000).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
                                                : '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Deploy Progress */}
                        {deploySteps.length > 0 && (
                            <StepProgress steps={deploySteps} title="Progreso del Despliegue" />
                        )}

                        {/* Result Banner */}
                        {deployResult && !deploying && (
                            <div className={`rounded-xl px-5 py-4 border ${deployResult === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <p className={`text-sm font-bold ${deployResult === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                                    {deployResult === 'success'
                                        ? `✅ Versión ${version} publicada exitosamente en ${selectedServer?.ip}`
                                        : `❌ Error al publicar. Revisa los pasos anteriores.`}
                                </p>
                                {deployTiming && (
                                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                        <span>🕐 Inicio: {new Date(deployTiming.startTime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        <span>🏁 Fin: {new Date(deployTiming.endTime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        <span className="font-semibold text-gray-700">⏱️ Duración: {deployTiming.durationMinutes} min</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==========================================
                SECTION 2: SETUP GUIDE
               ========================================== */}
            {activeSection === 'setup' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">📋 Configurar Nuevo Servidor</h2>
                        <p className="text-emerald-100 text-sm mt-1">Preparar servidor y máquina local para despliegue</p>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* Server Selector */}
                        {renderServerSelector(true)}

                        {/* Automation Buttons */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button onClick={handleRunLocal} disabled={!!setupRunning || !selectedServer}
                                className={`py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${setupRunning === 'local'
                                    ? 'bg-blue-100 text-blue-700 cursor-wait'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'}`}>
                                {setupRunning === 'local' ? <><span className="animate-spin">⏳</span> Ejecutando...</> : <>💻 Ejecutar en Local</>}
                            </button>
                            <button onClick={handleRunRemote} disabled={!!setupRunning || !selectedServer}
                                className={`py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${setupRunning === 'remote'
                                    ? 'bg-orange-100 text-orange-700 cursor-wait'
                                    : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200'}`}>
                                {setupRunning === 'remote' ? <><span className="animate-spin">⏳</span> Ejecutando...</> : <>🖥️ Ejecutar en Servidor</>}
                            </button>
                            <button onClick={handleRunBoth} disabled={!!setupRunning || !selectedServer}
                                className={`py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${setupRunning === 'both'
                                    ? 'bg-purple-100 text-purple-700 cursor-wait'
                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200'}`}>
                                {setupRunning === 'both' ? <><span className="animate-spin">⏳</span> Ejecutando...</> : <>⚡ Ejecutar Todo</>}
                            </button>
                        </div>

                        {/* Setup Progress */}
                        {setupSteps.length > 0 && (
                            <StepProgress steps={setupSteps} title="Progreso de Configuración" />
                        )}

                        {/* Setup Result */}
                        {setupResult && !setupRunning && (
                            <div className={`rounded-xl px-5 py-4 border ${setupResult === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <p className={`text-sm font-bold ${setupResult === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                                    {setupResult === 'success'
                                        ? `✅ Configuración completada exitosamente`
                                        : `❌ Algunos pasos fallaron. Revisa los detalles.`}
                                </p>
                            </div>
                        )}

                        {/* Guide Sections */}
                        {guideLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando guía...</div>
                        ) : guide ? (
                            <div className="space-y-6">
                                {guide.sections.map((section, sIdx) => (
                                    <div key={sIdx} className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-800">{section.title}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                                            </div>
                                            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${section.target === 'remote'
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-blue-100 text-blue-700'}`}>
                                                {section.target === 'remote' ? '🖥️ Servidor' : '💻 Local'}
                                            </span>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {section.commands.map((cmd, cIdx) => {
                                                const cmdId = `${sIdx}-${cIdx}`;
                                                return (
                                                    <div key={cIdx} className="px-4 py-3">
                                                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-semibold text-gray-600">{cmd.label}</span>
                                                                {cmd.automatable ? (
                                                                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-green-100 text-green-700">⚡ Auto</span>
                                                                ) : (
                                                                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-700" title={cmd.manualReason || ''}>
                                                                        🔧 Manual
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button onClick={() => copyToClipboard(cmd.command, cmdId)}
                                                                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${copiedCmd === cmdId
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'}`}>
                                                                {copiedCmd === cmdId ? '✓ Copiado' : '📋 Copiar'}
                                                            </button>
                                                        </div>
                                                        <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all">
                                                            {cmd.command}
                                                        </pre>
                                                        {!cmd.automatable && cmd.manualReason && (
                                                            <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                                                                ⚠️ {cmd.manualReason}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-400">No se pudo cargar la guía</div>
                        )}

                        {/* Multi-Server List */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <h3 className="text-sm font-bold text-gray-800">📡 Servidores Configurados</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Servidores registrados para despliegue</p>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {servers.map(srv => (
                                    <div key={srv.id} className={`px-4 py-3 flex items-center justify-between ${srv.id === selectedServerId ? 'bg-indigo-50' : ''}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-lg flex-shrink-0">{srv.id === selectedServerId ? '🟢' : '⚪'}</span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-800">{srv.label}</p>
                                                <p className="text-xs text-gray-500 font-mono">{srv.ip} — {srv.appDir}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {srv.id !== selectedServerId && (
                                                <button onClick={() => setSelectedServerId(srv.id)}
                                                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-semibold transition-all">
                                                    Seleccionar
                                                </button>
                                            )}
                                            <button onClick={() => removeServer(srv.id)}
                                                className="text-xs px-2 py-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==========================================
                SECTION 3: CHANGELOG
               ========================================== */}
            {activeSection === 'changelog' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">📜 Bitácora de Versiones</h2>
                            <p className="text-purple-100 text-sm mt-1">Historial de cambios aplicados por versión</p>
                        </div>
                        <button onClick={() => setShowAddEntry(!showAddEntry)}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-all backdrop-blur-sm">
                            + Nueva Entrada
                        </button>
                    </div>
                    <div className="p-6">
                        {/* Add Entry Form */}
                        {showAddEntry && (
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Versión *</label>
                                        <input type="text" value={newVersion} onChange={e => setNewVersion(e.target.value)}
                                            placeholder="ej: v2.1" className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Servidores</label>
                                        <input type="text" value={newServers} onChange={e => setNewServers(e.target.value)}
                                            placeholder="10.29.1.25" className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:border-purple-500" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Notas de Cambios</label>
                                    <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                                        placeholder="Lista de cambios incluidos en esta versión..." rows={3}
                                        className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:border-purple-500 resize-none" />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setShowAddEntry(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all">Cancelar</button>
                                    <button onClick={handleAddEntry} disabled={!newVersion.trim()} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-all disabled:opacity-50">Guardar Entrada</button>
                                </div>
                            </div>
                        )}

                        {/* Log Entries */}
                        {logLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando bitácora...</div>
                        ) : logEntries.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-400 text-lg mb-2">📜</p>
                                <p className="text-gray-500 text-sm font-medium">Sin entradas en la bitácora</p>
                                <p className="text-gray-400 text-xs mt-1">Las publicaciones se registran automáticamente aquí</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {logEntries.map((entry) => (
                                    <div key={entry.id} className={`border rounded-xl overflow-hidden ${statusColor(entry.status)}`}>
                                        <div className="px-4 py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <span className="text-lg flex-shrink-0">{statusIcon(entry.status)}</span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-bold font-mono">{entry.version}</span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(entry.date).toLocaleDateString('es-CR', {
                                                                year: 'numeric', month: 'short', day: 'numeric',
                                                                hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                        {entry.servers?.length > 0 && (
                                                            <span className="text-xs bg-white/70 rounded-md px-2 py-0.5 font-mono">
                                                                {entry.servers.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {entry.notes && (
                                                        <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{entry.notes}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-400 font-medium flex-shrink-0 ml-2">{entry.deployedBy}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==========================================
                SECTION 4: VERSION NOTES
               ========================================== */}
            {activeSection === 'version-notes' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">📝 Notas de Versión</h2>
                            <p className="text-cyan-100 text-sm mt-1">Administrar las notas que se muestran a los usuarios por versión</p>
                        </div>
                        <button onClick={handleVnNew}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-all backdrop-blur-sm">
                            + Nueva Nota
                        </button>
                    </div>
                    <div className="p-6 space-y-5">
                        {/* Version Filter */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <label className="text-xs font-bold text-gray-600 uppercase">Filtrar por versión</label>
                            <select value={vnFilterVersion} onChange={e => setVnFilterVersion(e.target.value)}
                                className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-mono focus:border-cyan-500 bg-white min-w-[140px]">
                                <option value="">Todas</option>
                                {vnVersiones.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <button onClick={loadVersionNotes} className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">🔄 Refrescar</button>
                        </div>

                        {/* Add/Edit Form */}
                        {vnShowForm && (
                            <div className="bg-cyan-50 border-2 border-cyan-300 rounded-xl p-5 space-y-4">
                                <h4 className="text-sm font-bold text-cyan-800">{vnEditing ? '✏️ Editar Nota' : '➕ Nueva Nota de Versión'}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Versión *</label>
                                        <input type="text" value={vnForm.VersionId} onChange={e => setVnForm(f => ({ ...f, VersionId: e.target.value }))}
                                            placeholder="ej: v2.1" list="vn-version-list"
                                            className="w-full px-3 py-2 border border-cyan-200 rounded-lg text-sm font-mono focus:border-cyan-500" />
                                        <datalist id="vn-version-list">
                                            {vnVersiones.map(v => <option key={v} value={v} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Tipo</label>
                                        <select value={vnForm.Tipo} onChange={e => setVnForm(f => ({ ...f, Tipo: e.target.value }))}
                                            className="w-full px-3 py-2 border border-cyan-200 rounded-lg text-sm focus:border-cyan-500 bg-white">
                                            <option value="mejora">🟢 Mejora</option>
                                            <option value="corrección">🔴 Corrección</option>
                                            <option value="nueva funcionalidad">🔵 Nueva funcionalidad</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Orden</label>
                                        <input type="number" value={vnForm.Orden} onChange={e => setVnForm(f => ({ ...f, Orden: parseInt(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2 border border-cyan-200 rounded-lg text-sm font-mono focus:border-cyan-500" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Título *</label>
                                    <input type="text" value={vnForm.Titulo} onChange={e => setVnForm(f => ({ ...f, Titulo: e.target.value }))}
                                        placeholder="ej: Nuevo módulo de reportes"
                                        className="w-full px-3 py-2 border border-cyan-200 rounded-lg text-sm focus:border-cyan-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Descripción</label>
                                    <textarea value={vnForm.Texto} onChange={e => setVnForm(f => ({ ...f, Texto: e.target.value }))}
                                        placeholder="Descripción detallada del cambio..." rows={3}
                                        className="w-full px-3 py-2 border border-cyan-200 rounded-lg text-sm focus:border-cyan-500 resize-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-cyan-800 uppercase mb-1">Imagen (Opcional)</label>
                                    <div className="flex items-center gap-3">
                                        <label className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${vnUploadingImg ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'}`}>
                                            {vnUploadingImg ? '⏳ Subiendo...' : '📷 Subir Imagen'}
                                            <input type="file" accept="image/*" onChange={handleVnUploadImagen} className="hidden" disabled={vnUploadingImg} />
                                        </label>
                                        {vnForm.ImagenUrl ? (
                                            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                                                <span className="text-xs text-green-700 font-medium truncate max-w-[200px]" title={vnForm.ImagenUrl}>
                                                    {vnForm.ImagenUrl.split('/').pop()}
                                                </span>
                                                <button onClick={() => setVnForm(f => ({ ...f, ImagenUrl: '' }))} className="text-red-500 hover:text-red-700 font-bold ml-1">×</button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Formatos permitidos: JPG, PNG, WEBP</span>
                                        )}
                                    </div>
                                    {vnForm.ImagenUrl && (
                                        <div className="mt-3 relative w-full h-32 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                                            <img src={`${API_BASE.replace('/api', '')}${vnForm.ImagenUrl}`} alt="Vista previa" className="max-h-full max-w-full object-contain" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => { setVnShowForm(false); setVnEditing(null); }}
                                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all">Cancelar</button>
                                    <button onClick={handleVnSave} disabled={vnSaving || vnUploadingImg || !vnForm.Titulo.trim() || !vnForm.VersionId.trim()}
                                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold hover:bg-cyan-700 transition-all disabled:opacity-50">
                                        {vnSaving ? '⏳ Guardando...' : vnEditing ? '✓ Actualizar' : '✓ Crear'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Notes List */}
                        {vnLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando notas de versión...</div>
                        ) : vnItems.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-400 text-lg mb-2">📝</p>
                                <p className="text-gray-500 text-sm font-medium">No hay notas de versión</p>
                                <p className="text-gray-400 text-xs mt-1">Crea una nota para comunicar cambios a los usuarios</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Group by version */}
                                {(() => {
                                    const grouped: Record<string, NotificacionVersion[]> = {};
                                    vnItems.forEach(item => {
                                        if (!grouped[item.VersionId]) grouped[item.VersionId] = [];
                                        grouped[item.VersionId].push(item);
                                    });
                                    return Object.entries(grouped).map(([ver, items]) => (
                                        <div key={ver} className="border border-gray-200 rounded-xl overflow-hidden">
                                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                                                <span className="text-sm font-bold text-gray-700 font-mono">📦 {ver}</span>
                                                <span className="text-xs text-gray-400">{items.length} nota{items.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                                {items.map(item => {
                                                    const badge = vnTipoBadge(item.Tipo);
                                                    return (
                                                        <div key={item.Id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                                            <span className="text-sm mt-0.5">{badge.emoji}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-sm font-semibold text-gray-800">{item.Titulo}</span>
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${badge.cls}`}>{badge.label}</span>
                                                                    <span className="text-[10px] text-gray-400">Orden: {item.Orden}</span>
                                                                    {!item.Activo && <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-gray-200 text-gray-500">Inactivo</span>}
                                                                </div>
                                                                {item.Texto && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{item.Texto}</p>}
                                                                {item.ImagenUrl && (
                                                                    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 inline-block bg-white">
                                                                        <img src={`${API_BASE.replace('/api', '')}${item.ImagenUrl}`} alt="Adjunto" className="max-h-40 max-w-full object-contain" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                                <button onClick={() => handleVnEdit(item)}
                                                                    className="text-xs px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-semibold transition-all">✏️</button>
                                                                <button onClick={() => handleVnDelete(item.Id)}
                                                                    className="text-xs px-2.5 py-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg font-semibold transition-all">🗑️</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==========================================
                SECTION 5: RUTA (ROADMAP)
               ========================================== */}
            {activeSection === 'ruta' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">🗺️ Ruta — Próximas Versiones</h2>
                        <p className="text-amber-100 text-sm mt-1">
                            Notas de versiones futuras (superiores a {serverVersion?.version || 'la versión actual'})
                        </p>
                    </div>
                    <div className="p-6">
                        {/* Current Version Badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-xs font-bold text-gray-500 uppercase">Versión actual:</span>
                            {serverVersionLoading ? (
                                <span className="text-xs text-gray-400 animate-pulse">Consultando...</span>
                            ) : serverVersion?.version ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    <span className="text-sm font-bold text-emerald-700 font-mono">{serverVersion.version}</span>
                                    <span className="text-[10px] text-emerald-500">✅</span>
                                </span>
                            ) : (
                                <span className="text-sm text-gray-400">Sin versión registrada</span>
                            )}
                            <button onClick={loadRuta} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors ml-auto">🔄 Refrescar</button>
                        </div>

                        {rutaLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando ruta...</div>
                        ) : rutaItems.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-400 text-3xl mb-3">🗺️</p>
                                <p className="text-gray-500 text-sm font-medium">No hay versiones futuras planificadas</p>
                                <p className="text-gray-400 text-xs mt-1">Crea notas con versiones superiores a la actual en "Notas de Versión"</p>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* Timeline line */}
                                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-300 via-orange-300 to-red-300" />

                                <div className="space-y-6">
                                    {(() => {
                                        const grouped: Record<string, NotificacionVersion[]> = {};
                                        rutaItems.forEach(item => {
                                            if (!grouped[item.VersionId]) grouped[item.VersionId] = [];
                                            grouped[item.VersionId].push(item);
                                        });
                                        return Object.entries(grouped).map(([ver, items], groupIdx) => (
                                            <div key={ver} className="relative pl-12">
                                                {/* Timeline dot */}
                                                <div className="absolute left-3 top-3 w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-white shadow-md flex items-center justify-center">
                                                    <span className="text-[8px] font-bold text-white">{groupIdx + 1}</span>
                                                </div>

                                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 overflow-hidden">
                                                    <div className="px-4 py-3 bg-amber-100/60 border-b border-amber-200 flex items-center gap-2">
                                                        <span className="text-sm font-bold text-amber-800 font-mono">📦 {ver}</span>
                                                        <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full font-bold">{items.length} cambio{items.length !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="divide-y divide-amber-100">
                                                        {items.map(item => {
                                                            const badge = vnTipoBadge(item.Tipo);
                                                            return (
                                                                <div key={item.Id} className="px-4 py-3 flex items-start gap-3">
                                                                    <span className="text-sm mt-0.5">{badge.emoji}</span>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="text-sm font-semibold text-gray-800">{item.Titulo}</span>
                                                                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${badge.cls}`}>{badge.label}</span>
                                                                        </div>
                                                                        {item.Texto && <p className="text-xs text-gray-600 mt-1">{item.Texto}</p>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
