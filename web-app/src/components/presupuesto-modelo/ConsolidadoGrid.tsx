import React, { useState, useEffect, useCallback } from 'react';
import {
    fetchConsolidadoMensual, saveConsolidadoMensual, initializeConsolidadoYear,
    getUser, type ConsolidadoRow
} from '../../api';

interface Props {
    anoModelo: number;
    nombrePresupuesto: string;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CANALES = ['salon', 'llevar', 'auto', 'express', 'ecommerce', 'ubereats'];
const CANAL_LABELS: Record<string, string> = {
    salon: 'Salón', llevar: 'Llevar', auto: 'AutoPollo',
    express: 'Express', ecommerce: 'ECommerce', ubereats: 'UberEats'
};

interface StoreInfo { code: string; name: string; }

export const ConsolidadoGrid: React.FC<Props> = ({ anoModelo, nombrePresupuesto }) => {
    const user = getUser();
    const canEdit = user?.esAdmin || (user as any)?.editarConsolidado;

    const [rows, setRows] = useState<ConsolidadoRow[]>([]);
    const [storeList, setStoreList] = useState<StoreInfo[]>([]);
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [selectedTipo, setSelectedTipo] = useState<string>('VENTA');
    const [selectedAno, setSelectedAno] = useState<number>(anoModelo);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [initializing, setInitializing] = useState(false);
    const [showInitDialog, setShowInitDialog] = useState(false);
    const [initYear, setInitYear] = useState(anoModelo + 1);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch ALL data for this year (no store/tipo filter) to get store list
            const allData = await fetchConsolidadoMensual(selectedAno);

            // Build store list with code → name mapping
            const storeMap = new Map<string, string>();
            allData.forEach(r => {
                if (r.codAlmacen && !storeMap.has(r.codAlmacen)) {
                    storeMap.set(r.codAlmacen, (r as any).local || r.codAlmacen);
                }
            });
            const stores = Array.from(storeMap.entries())
                .map(([code, name]) => ({ code, name }))
                .sort((a, b) => a.name.localeCompare(b.name));
            setStoreList(stores);

            // Auto-select first store if needed
            const effectiveStore = (selectedStore && storeMap.has(selectedStore))
                ? selectedStore
                : (stores.length > 0 ? stores[0].code : '');
            if (effectiveStore !== selectedStore) setSelectedStore(effectiveStore);

            // Filter to selected store + tipo
            const filtered = allData.filter(r =>
                (!effectiveStore || r.codAlmacen === effectiveStore) &&
                (!selectedTipo || r.tipo === selectedTipo)
            );
            setRows(filtered);
        } catch {
            setRows([]);
            setStoreList([]);
        } finally {
            setLoading(false);
        }
    }, [selectedAno, selectedStore, selectedTipo]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleInitialize = async (year: number) => {
        try {
            setInitializing(true);
            setMessage(null);
            const result = await initializeConsolidadoYear(year);
            setMessage({ type: 'success', text: `✅ Año ${year} inicializado con ${result.inserted} registros` });
            setShowInitDialog(false);
            setSelectedAno(year);
            setSelectedStore('');
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setInitializing(false);
        }
    };

    const filteredRows = rows.sort((a, b) => a.mes - b.mes);

    const handleCellChange = (rowIndex: number, canal: string, value: string) => {
        const numValue = parseFloat(value.replace(/,/g, '')) || 0;
        const updated = [...rows];
        const row = updated[rowIndex];
        if (!row) return;
        (row as any)[canal] = numValue;
        row.total = CANALES.reduce((sum, c) => sum + ((row as any)[c] || 0), 0);
        setRows(updated);
        setDirty(true);
    };

    const handlePaste = (e: React.ClipboardEvent, startRow: number, startCol: number) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const pastedRows = text.split('\n').filter(r => r.trim());
        const updated = [...rows];

        pastedRows.forEach((rowText, ri) => {
            const cells = rowText.split('\t');
            const targetRow = updated[startRow + ri];
            if (!targetRow) return;

            cells.forEach((cell, ci) => {
                const canalIndex = startCol + ci;
                if (canalIndex < CANALES.length) {
                    const val = parseFloat(cell.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
                    (targetRow as any)[CANALES[canalIndex]] = val;
                }
            });
            targetRow.total = CANALES.reduce((sum, c) => sum + ((targetRow as any)[c] || 0), 0);
        });

        setRows(updated);
        setDirty(true);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage(null);
            await saveConsolidadoMensual(filteredRows);
            setMessage({ type: 'success', text: 'Consolidado guardado exitosamente' });
            setDirty(false);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const totales = CANALES.reduce<Record<string, number>>((acc, c) => {
        acc[c] = filteredRows.reduce((sum, r) => sum + ((r as any)[c] || 0), 0);
        return acc;
    }, {});
    const totalGeneral = filteredRows.reduce((sum, r) => sum + (r.total || 0), 0);

    const fmt = (n: number) => {
        if (selectedTipo === 'TRANSACCIONES') return Math.round(n).toLocaleString();
        return n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const selectedStoreName = storeList.find(s => s.code === selectedStore)?.name || selectedStore;

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Year selector */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Año</span>
                    <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                        <button onClick={() => { setSelectedAno(p => p - 1); setSelectedStore(''); setDirty(false); }}
                            className="px-2 py-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors text-sm font-bold">◀</button>
                        <span className="px-3 py-1.5 text-sm font-bold text-gray-800 min-w-[48px] text-center">{selectedAno}</span>
                        <button onClick={() => { setSelectedAno(p => p + 1); setSelectedStore(''); setDirty(false); }}
                            className="px-2 py-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors text-sm font-bold">▶</button>
                    </div>
                </div>

                {/* Store selector — show name, use code as value */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Local</span>
                    <select value={selectedStore} onChange={e => { setSelectedStore(e.target.value); setDirty(false); }}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm min-w-[140px]">
                        {storeList.map(s => (
                            <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                    </select>
                </div>

                {/* Tipo selector */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo</span>
                    <select value={selectedTipo} onChange={e => { setSelectedTipo(e.target.value); setDirty(false); }}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        <option value="VENTA">Ventas</option>
                        <option value="TRANSACCIONES">Transacciones</option>
                        <option value="TQP">TQP</option>
                    </select>
                </div>

                <div className="flex-1" />

                {/* Initialize Year button */}
                {canEdit && (
                    <button onClick={() => { setInitYear(selectedAno + 1); setShowInitDialog(true); }}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center gap-1.5">
                        📆 Nuevo Año
                    </button>
                )}

                {/* Save button */}
                {canEdit && dirty && (
                    <button onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
                        {saving ? '⏳' : '💾'} Guardar
                    </button>
                )}
            </div>

            {/* Initialize Year Dialog */}
            {showInitDialog && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-xl">📆</div>
                        <div className="flex-1">
                            <h3 className="font-bold text-indigo-900">Inicializar Nuevo Año</h3>
                            <p className="text-sm text-indigo-700 mt-1">
                                Se crearán registros vacíos (en cero) para todos los locales, copiando la estructura del año anterior.
                                Después podrá editar los valores directamente o pegar desde Excel.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-indigo-800">Año a inicializar:</span>
                            <input type="number" value={initYear}
                                onChange={e => setInitYear(parseInt(e.target.value))}
                                className="w-24 px-3 py-2 border border-indigo-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <span className="text-xs text-indigo-600">
                            (Se copiarán los locales del {initYear - 1})
                        </span>
                        <div className="flex-1" />
                        <button onClick={() => setShowInitDialog(false)}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                            Cancelar
                        </button>
                        <button onClick={() => handleInitialize(initYear)} disabled={initializing || initYear < 2020 || initYear > 2050}
                            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
                            {initializing ? '⏳ Creando...' : `Crear Año ${initYear}`}
                        </button>
                    </div>
                </div>
            )}

            {/* Messages */}
            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {message.text}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                </div>
            ) : storeList.length === 0 ? (
                <div className="text-center py-16 space-y-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <div className="text-4xl">📭</div>
                    <div className="text-gray-500 font-medium">No hay datos para el año {selectedAno}</div>
                    <p className="text-sm text-gray-400 max-w-md mx-auto">
                        Use el botón <strong>"📆 Nuevo Año"</strong> arriba para inicializar este año
                        con la estructura de locales del año anterior.
                    </p>
                    {canEdit && (
                        <button onClick={() => { setInitYear(selectedAno); setShowInitDialog(true); }}
                            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors">
                            📆 Inicializar Año {selectedAno}
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Store context indicator */}
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                        <span>Mostrando:</span>
                        <span className="font-medium text-gray-600">{selectedStoreName}</span>
                        <span>•</span>
                        <span className="font-medium text-gray-600">{selectedTipo === 'VENTA' ? 'Ventas' : selectedTipo === 'TRANSACCIONES' ? 'Transacciones' : 'TQP'}</span>
                        <span>•</span>
                        <span className="font-medium text-gray-600">{selectedAno}</span>
                        {dirty && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Sin guardar</span>}
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 sticky left-0 bg-gray-50">Mes</th>
                                    {CANALES.map(c => (
                                        <th key={c} className="px-3 py-2.5 text-right text-xs font-bold text-gray-500">{CANAL_LABELS[c]}</th>
                                    ))}
                                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-600 bg-gray-100">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRows.map((row, ri) => (
                                    <tr key={ri} className="hover:bg-emerald-50/50">
                                        <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">{MESES[row.mes - 1]}</td>
                                        {CANALES.map((c, ci) => (
                                            <td key={c} className="px-1 py-1">
                                                {canEdit ? (
                                                    <input
                                                        type="text"
                                                        value={fmt((row as any)[c] || 0)}
                                                        onChange={e => handleCellChange(ri, c, e.target.value)}
                                                        onPaste={e => handlePaste(e, ri, ci)}
                                                        className="w-full px-2 py-1 text-right text-sm font-mono border border-transparent hover:border-gray-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 rounded transition-all bg-transparent"
                                                    />
                                                ) : (
                                                    <span className="block px-2 py-1 text-right text-sm font-mono">{fmt((row as any)[c] || 0)}</span>
                                                )}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 bg-gray-50">{fmt(row.total || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-100 font-bold">
                                <tr>
                                    <td className="px-3 py-2.5 text-gray-700 sticky left-0 bg-gray-100">TOTAL</td>
                                    {CANALES.map(c => (
                                        <td key={c} className="px-3 py-2.5 text-right font-mono text-gray-800">{fmt(totales[c] || 0)}</td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 bg-emerald-50">{fmt(totalGeneral)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Hints */}
                    {dirty && (
                        <div className="flex flex-wrap gap-2 text-xs">
                            {filteredRows.some(r => CANALES.some(c => (r as any)[c] < 0)) && (
                                <span className="bg-red-50 text-red-600 px-2 py-1 rounded">⚠️ Valores negativos detectados</span>
                            )}
                            {selectedTipo === 'TRANSACCIONES' && filteredRows.some(r => CANALES.some(c => !Number.isInteger((r as any)[c]))) && (
                                <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded">⚠️ Transacciones no enteras</span>
                            )}
                            <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">📋 Soporta pegar desde Excel (Ctrl+V)</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
