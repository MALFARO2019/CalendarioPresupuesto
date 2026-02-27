// ============================================================
// AjusteListaPanel — Panel lateral con ajustes del mes
// ============================================================

import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Copy, Unlink, Link2, Check, X } from 'lucide-react';
import { useAjusteStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { fmtFull, fmtPct, getEstadoBadgeClass, formatFecha } from './helpers';
import { REDISTRIBUCION_LABELS } from './types';
import type { AjustePresupuesto } from './types';

export const AjusteListaPanel: React.FC = () => {
    const { ajustes, selectedAjusteId, isAdmin, canAdjust, canApprove } = useAjusteStore(
        useShallow(s => ({
            ajustes: s.ajustes,
            selectedAjusteId: s.selectedAjusteId,
            isAdmin: s.isAdmin,
            canAdjust: s.canAdjust,
            canApprove: s.canApprove,
        }))
    );
    const selectAjuste = useAjusteStore(s => s.selectAjuste);
    const openCreateForm = useAjusteStore(s => s.openCreateForm);
    const openEditForm = useAjusteStore(s => s.openEditForm);
    const deleteAjuste = useAjusteStore(s => s.deleteAjuste);
    const disassociateAjuste = useAjusteStore(s => s.disassociateAjuste);
    const aprobarRechazarAjuste = useAjusteStore(s => s.aprobarRechazarAjuste);
    const openModal = useAjusteStore(s => s.openModal);

    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    const handleDelete = async (id: number) => {
        if (deleteConfirm === id) {
            await deleteAjuste(id);
            setDeleteConfirm(null);
        } else {
            setDeleteConfirm(id);
            // Auto-dismiss after 3s
            setTimeout(() => setDeleteConfirm(prev => prev === id ? null : prev), 3000);
        }
    };

    const handleCopy = (ajuste: AjustePresupuesto) => {
        selectAjuste(ajuste.id);
        openModal('copiar');
    };

    const handleRechazar = (id: number) => {
        const motivo = window.prompt("Por favor, indique el motivo del rechazo:");
        if (motivo !== null) {
            if (motivo.trim() === '') {
                useAjusteStore.getState().setMessage({ ok: false, text: "Debe indicar un motivo para rechazar el ajuste" });
                return;
            }
            aprobarRechazarAjuste(id, 'Rechazado', motivo.trim());
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-gray-800 text-sm">Ajustes del mes</h3>
                    <p className="text-[10px] text-gray-400">
                        Historial visible, editable y borrable
                    </p>
                </div>
                {canAdjust && (
                    <button
                        onClick={() => openCreateForm()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nuevo
                    </button>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {ajustes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <span className="text-3xl mb-2 opacity-30">📋</span>
                        <p className="text-sm">No hay ajustes para este mes</p>
                    </div>
                ) : (
                    ajustes.map(ajuste => (
                        <AjusteItem
                            key={ajuste.id}
                            ajuste={ajuste}
                            isSelected={selectedAjusteId === ajuste.id}
                            isDeleteConfirm={deleteConfirm === ajuste.id}
                            isAdmin={isAdmin}
                            canAdjust={canAdjust}
                            canApprove={canApprove}
                            onSelect={() => selectAjuste(ajuste.id === selectedAjusteId ? null : ajuste.id)}
                            onEdit={() => openEditForm(ajuste)}
                            onDelete={() => handleDelete(ajuste.id)}
                            onCopy={() => handleCopy(ajuste)}
                            onDisassociate={() => disassociateAjuste(ajuste.id)}
                            onAprobar={() => aprobarRechazarAjuste(ajuste.id, 'Aprobado')}
                            onRechazar={() => handleRechazar(ajuste.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

// ── Individual ajuste item ──

const AjusteItem: React.FC<{
    ajuste: AjustePresupuesto;
    isSelected: boolean;
    isDeleteConfirm: boolean;
    isAdmin: boolean;
    canAdjust: boolean;
    canApprove: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopy: () => void;
    onDisassociate: () => void;
    onAprobar: () => void;
    onRechazar: () => void;
}> = ({ ajuste, isSelected, isDeleteConfirm, isAdmin, canAdjust, canApprove, onSelect, onEdit, onDelete, onCopy, onDisassociate, onAprobar, onRechazar }) => {
    const isPendiente = ajuste.estado === 'Pendiente';

    return (
        <div
            onClick={onSelect}
            className={`px-4 py-3 cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                } ${isPendiente ? 'ring-1 ring-amber-200 ring-inset' : ''}`}
        >
            {/* Top row: ID + Estado */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sm text-gray-800">{ajuste.idFormateado}</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${getEstadoBadgeClass(ajuste.estado)}`}>
                    {ajuste.estado}
                </span>
            </div>

            {/* Info row */}
            <div className="text-[11px] text-gray-500 space-y-0.5">
                <div className="leading-tight">
                    <span className="text-gray-400">{formatFecha(ajuste.fechaAplicacion)}</span><br />
                    Creado por: <strong className="font-medium text-gray-600">{ajuste.usuario}</strong>
                    {ajuste.usuarioAprueba && (
                        <>
                            <br />Aprobado por: <strong className="font-medium text-gray-600">{ajuste.usuarioAprueba}</strong>
                        </>
                    )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span>Tipo: <strong className="text-gray-700">{ajuste.metodoAjuste === 'Porcentaje' ? '%' : 'Monto'}</strong></span>
                    <span>Delta: <strong className={ajuste.valorAjuste >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {ajuste.metodoAjuste === 'Porcentaje' ? fmtPct(ajuste.valorAjuste) : fmtFull(ajuste.valorAjuste)}
                    </strong></span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span>Canal: <strong className="text-gray-700">{ajuste.canal}</strong></span>
                    <span>Regla: <strong className="text-gray-700">{REDISTRIBUCION_LABELS[ajuste.redistribucion]}</strong></span>
                </div>
                {ajuste.comentario && (
                    <div className="mt-1 text-gray-600 break-words line-clamp-2" title={ajuste.comentario}>
                        💬 {ajuste.comentario}
                    </div>
                )}
                {ajuste.estado === 'Rechazado' && ajuste.motivoRechazo && (
                    <div className="mt-1 text-rose-600 break-words line-clamp-2" title={ajuste.motivoRechazo}>
                        ❌ Rechazado: {ajuste.motivoRechazo}
                    </div>
                )}
            </div>

            {/* Associated badge */}
            {ajuste.estado === 'Asociado' && ajuste.ajustePrincipalId && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600">
                    <Link2 className="w-3 h-3" />
                    <span>Asociado a {ajuste.ajustePrincipalId}</span>
                </div>
            )}

            {/* Actions */}
            {canAdjust && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                        onClick={e => { e.stopPropagation(); onEdit(); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                        <Pencil className="w-3 h-3" /> Editar
                    </button>
                    {isAdmin && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(); }}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${isDeleteConfirm
                                ? 'bg-red-600 text-white'
                                : 'text-gray-600 bg-gray-100 hover:bg-red-50 hover:text-red-600'
                                }`}
                        >
                            <Trash2 className="w-3 h-3" /> {isDeleteConfirm ? '¿Confirmar?' : 'Borrar'}
                        </button>
                    )}
                    {ajuste.estado === 'Asociado' && (
                        <button
                            onClick={e => { e.stopPropagation(); onDisassociate(); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-orange-600 bg-orange-50 rounded-md hover:bg-orange-100 transition-colors"
                        >
                            <Unlink className="w-3 h-3" /> Desasociar
                        </button>
                    )}
                </div>
            )}
            {canApprove && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {isPendiente && (
                        <>
                            <button
                                onClick={e => { e.stopPropagation(); onAprobar(); }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
                            >
                                <Check className="w-3 h-3" /> Aprobar
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); onRechazar(); }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-rose-600 bg-rose-50 rounded-md hover:bg-rose-100 transition-colors"
                            >
                                <X className="w-3 h-3" /> Rechazar
                            </button>
                        </>
                    )}
                </div>
            )}
            {canAdjust && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                        onClick={e => { e.stopPropagation(); onCopy(); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                        <Copy className="w-3 h-3" /> Copiar
                    </button>
                </div>
            )}
        </div>
    );
};
