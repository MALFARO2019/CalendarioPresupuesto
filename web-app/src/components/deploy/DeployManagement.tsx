import React, { useState, useEffect } from 'react';
import {
    fetchDeployLog,
    addDeployLogEntry,
    deployToServer,
    fetchSetupGuide,
    type DeployLogEntry,
    type SetupGuide,
} from '../../api';

// ==========================================
// DEPLOY MANAGEMENT COMPONENT
// ==========================================

export function DeployManagement() {
    const [activeSection, setActiveSection] = useState<'publish' | 'setup' | 'changelog'>('publish');

    // Publish state
    const [version, setVersion] = useState('');
    const [notes, setNotes] = useState('');
    const [serverIp, setServerIp] = useState('10.29.1.25');
    const [serverUser, setServerUser] = useState('Administrador');
    const [serverPass, setServerPass] = useState('R0st1p017');
    const [appDir, setAppDir] = useState('C:\\Deploy\\CalendarioPresupuesto');
    const [deploying, setDeploying] = useState(false);
    const [deploySteps, setDeploySteps] = useState<{ step: string; status: string; detail?: string }[]>([]);
    const [deployResult, setDeployResult] = useState<'success' | 'error' | null>(null);
    const [showServerConfig, setShowServerConfig] = useState(false);

    // Setup guide state
    const [guide, setGuide] = useState<SetupGuide | null>(null);
    const [guideLoading, setGuideLoading] = useState(false);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    // Changelog state
    const [logEntries, setLogEntries] = useState<DeployLogEntry[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [showAddEntry, setShowAddEntry] = useState(false);
    const [newVersion, setNewVersion] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [newServers, setNewServers] = useState('10.29.1.25');

    // Generate version options from changelog
    const versionOptions = React.useMemo(() => {
        const options: string[] = [];
        // Find last version from log
        const lastEntry = logEntries.length > 0 ? logEntries[0] : null;
        const lastVer = lastEntry?.version || 'v1.0';
        // Parse version: extract major.minor
        const match = lastVer.match(/(\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            // Current + next minors + next major
            options.push(`v${major}.${minor}`);
            options.push(`v${major}.${minor + 1}`);
            options.push(`v${major}.${minor + 2}`);
            options.push(`v${major + 1}.0`);
        } else {
            // Fallback: just try incrementing numeric suffix
            const numMatch = lastVer.match(/(\d+)/);
            const num = numMatch ? parseInt(numMatch[1]) : 1;
            options.push(`v${num}`);
            options.push(`v${num + 1}`);
            options.push(`v${num + 2}`);
        }
        return options;
    }, [logEntries]);

    // Load changelog on mount (needed for version combobox)
    useEffect(() => {
        loadChangelog();
    }, []);

    // Load data when section changes
    useEffect(() => {
        if (activeSection === 'changelog') loadChangelog();
        if (activeSection === 'setup') loadGuide();
    }, [activeSection]);

    const loadChangelog = async () => {
        setLogLoading(true);
        try {
            const log = await fetchDeployLog();
            setLogEntries(log.entries);
        } catch (e: any) {
            console.error('Error loading changelog:', e);
        } finally {
            setLogLoading(false);
        }
    };

    const loadGuide = async () => {
        setGuideLoading(true);
        try {
            const data = await fetchSetupGuide();
            setGuide(data);
        } catch (e: any) {
            console.error('Error loading guide:', e);
        } finally {
            setGuideLoading(false);
        }
    };

    const handleDeploy = async () => {
        if (!version.trim()) {
            alert('El campo de versión es requerido');
            return;
        }
        setDeploying(true);
        setDeployResult(null);
        setDeploySteps([
            { step: 'Verificando conexión', status: 'running' },
            { step: 'Descargando código (git)', status: 'pending' },
            { step: 'Instalando dependencias backend', status: 'pending' },
            { step: 'Construyendo frontend', status: 'pending' },
            { step: 'Reiniciando servicio', status: 'pending' },
        ]);

        try {
            const result = await deployToServer(serverIp, serverUser, serverPass, appDir, version, notes);
            setDeploySteps(result.steps);
            setDeployResult(result.success ? 'success' : 'error');
        } catch (e: any) {
            setDeployResult('error');
            setDeploySteps(prev => prev.map(s =>
                s.status === 'running' ? { ...s, status: 'error', detail: e.message } : s
            ));
        } finally {
            setDeploying(false);
            loadChangelog(); // Reload so version combobox updates
        }
    };

    const handleAddEntry = async () => {
        if (!newVersion.trim()) return;
        try {
            await addDeployLogEntry(newVersion, newNotes, newServers.split(',').map(s => s.trim()).filter(Boolean));
            setShowAddEntry(false);
            setNewVersion('');
            setNewNotes('');
            loadChangelog();
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
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
            case 'running': return '⏳';
            case 'deploying': return '🚀';
            default: return '⏸️';
        }
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'success': return 'text-green-600 bg-green-50 border-green-200';
            case 'error': return 'text-red-600 bg-red-50 border-red-200';
            case 'running':
            case 'deploying': return 'text-amber-600 bg-amber-50 border-amber-200';
            default: return 'text-gray-500 bg-gray-50 border-gray-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Section Tabs */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => setActiveSection('publish')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'publish'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    🚀 Publicar
                </button>
                <button
                    onClick={() => setActiveSection('setup')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'setup'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    📋 Configurar Servidor
                </button>
                <button
                    onClick={() => setActiveSection('changelog')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === 'changelog'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    📜 Bitácora de Versiones
                </button>
            </div>

            {/* ==========================================
                SECTION 1: PUBLISH
               ========================================== */}
            {activeSection === 'publish' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            🚀 Publicar al Servidor
                        </h2>
                        <p className="text-indigo-100 text-sm mt-1">Desplegar los cambios al servidor de producción</p>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* Version & Notes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">
                                    Versión *
                                </label>
                                <select
                                    value={version}
                                    onChange={e => setVersion(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm font-mono transition-all bg-white appearance-none"
                                    disabled={deploying}
                                >
                                    <option value="">Seleccionar versión...</option>
                                    {versionOptions.map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">
                                    Servidor Destino
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={serverIp}
                                        onChange={e => setServerIp(e.target.value)}
                                        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 text-sm font-mono transition-all"
                                        disabled={deploying}
                                    />
                                    <button
                                        onClick={() => setShowServerConfig(!showServerConfig)}
                                        className="px-3 py-3 text-gray-500 hover:text-indigo-600 bg-gray-100 hover:bg-indigo-50 rounded-xl transition-all"
                                        title="Configuración avanzada"
                                    >
                                        ⚙️
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Advanced server config */}
                        {showServerConfig && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Usuario</label>
                                    <input
                                        type="text"
                                        value={serverUser}
                                        onChange={e => setServerUser(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                        disabled={deploying}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contraseña</label>
                                    <input
                                        type="text"
                                        value={serverPass}
                                        onChange={e => setServerPass(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                        disabled={deploying}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Directorio App</label>
                                    <input
                                        type="text"
                                        value={appDir}
                                        onChange={e => setAppDir(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                        disabled={deploying}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">
                                Notas de Cambios
                            </label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Describe los cambios incluidos en esta versión..."
                                rows={3}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all resize-none"
                                disabled={deploying}
                            />
                        </div>

                        {/* Deploy Button */}
                        <button
                            onClick={handleDeploy}
                            disabled={deploying || !version.trim()}
                            className={`w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2 ${deploying
                                ? 'bg-amber-100 text-amber-700 cursor-wait'
                                : deployResult === 'success'
                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                                }`}
                        >
                            {deploying ? (
                                <>
                                    <span className="animate-spin">⏳</span> Publicando...
                                </>
                            ) : deployResult === 'success' ? (
                                <>✅ Publicado Exitosamente — Publicar de Nuevo</>
                            ) : (
                                <>🚀 Publicar en {serverIp}</>
                            )}
                        </button>

                        {/* Deploy Progress */}
                        {deploySteps.length > 0 && (
                            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-700">Progreso del Despliegue</h3>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {deploySteps.map((step, idx) => (
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
                        )}

                        {/* Result Banner */}
                        {deployResult && !deploying && (
                            <div className={`rounded-xl px-5 py-4 border ${deployResult === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <p className={`text-sm font-bold ${deployResult === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                                    {deployResult === 'success'
                                        ? `✅ Versión ${version} publicada exitosamente en ${serverIp}`
                                        : `❌ Error al publicar. Revisa los pasos anteriores para más detalles.`
                                    }
                                </p>
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
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            📋 Configurar Nuevo Servidor
                        </h2>
                        <p className="text-emerald-100 text-sm mt-1">Comandos necesarios para habilitar un nuevo servidor de despliegue</p>
                    </div>

                    <div className="p-6">
                        {guideLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando guía...</div>
                        ) : guide ? (
                            <div className="space-y-6">
                                {guide.sections.map((section, sIdx) => (
                                    <div key={sIdx} className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <h3 className="text-sm font-bold text-gray-800">{section.title}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {section.commands.map((cmd, cIdx) => {
                                                const cmdId = `${sIdx}-${cIdx}`;
                                                return (
                                                    <div key={cIdx} className="px-4 py-3">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className="text-xs font-semibold text-gray-600">{cmd.label}</span>
                                                            <button
                                                                onClick={() => copyToClipboard(cmd.command, cmdId)}
                                                                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${copiedCmd === cmdId
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
                                                                    }`}
                                                            >
                                                                {copiedCmd === cmdId ? '✓ Copiado' : '📋 Copiar'}
                                                            </button>
                                                        </div>
                                                        <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all">
                                                            {cmd.command}
                                                        </pre>
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
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                📜 Bitácora de Versiones
                            </h2>
                            <p className="text-purple-100 text-sm mt-1">Historial de cambios aplicados por versión</p>
                        </div>
                        <button
                            onClick={() => setShowAddEntry(!showAddEntry)}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-all backdrop-blur-sm"
                        >
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
                                        <input
                                            type="text"
                                            value={newVersion}
                                            onChange={e => setNewVersion(e.target.value)}
                                            placeholder="ej: v2.1"
                                            className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:border-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Servidores</label>
                                        <input
                                            type="text"
                                            value={newServers}
                                            onChange={e => setNewServers(e.target.value)}
                                            placeholder="10.29.1.25"
                                            className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:border-purple-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Notas de Cambios</label>
                                    <textarea
                                        value={newNotes}
                                        onChange={e => setNewNotes(e.target.value)}
                                        placeholder="Lista de cambios incluidos en esta versión..."
                                        rows={3}
                                        className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:border-purple-500 resize-none"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setShowAddEntry(false)}
                                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleAddEntry}
                                        disabled={!newVersion.trim()}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-all disabled:opacity-50"
                                    >
                                        Guardar Entrada
                                    </button>
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
        </div>
    );
}
