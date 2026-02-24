import React, { useState, useRef, useCallback } from 'react';
import { X, GripVertical, Check } from 'lucide-react';
import type { Evento } from '../api';

interface EventReorderModalProps {
    eventos: Evento[];
    onSave: (orderedIds: number[]) => Promise<void>;
    onClose: () => void;
}

export const EventReorderModal: React.FC<EventReorderModalProps> = ({ eventos, onSave, onClose }) => {
    const [items, setItems] = useState<Evento[]>([...eventos]);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
        // Make the drag image semi-transparent
        const el = e.currentTarget as HTMLElement;
        setTimeout(() => { el.style.opacity = '0.3'; }, 0);
    }, []);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
        // Perform the actual reorder
        if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
            setItems(prev => {
                const next = [...prev];
                const [moved] = next.splice(dragIdx, 1);
                next.splice(overIdx, 0, moved);
                return next;
            });
        }
        setDragIdx(null);
        setOverIdx(null);
    }, [dragIdx, overIdx]);

    const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverIdx(idx);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(items.map(ev => ev.IDEVENTO));
            onClose();
        } catch {
            setSaving(false);
        }
    };

    // Move item with buttons (mobile fallback)
    const moveItem = (fromIdx: number, toIdx: number) => {
        if (toIdx < 0 || toIdx >= items.length) return;
        setItems(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return next;
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800">Ordenar Tipos de Eventos</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Help text */}
                <div className="px-5 py-2 bg-indigo-50 text-indigo-700 text-xs font-medium">
                    Arrastra las tarjetas o usa las flechas ▲▼ para reordenar
                </div>

                {/* Scrollable list */}
                <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-1.5">
                    {items.map((evento, idx) => (
                        <div
                            key={evento.IDEVENTO}
                            draggable
                            onDragStart={e => handleDragStart(e, idx)}
                            onDragEnd={handleDragEnd}
                            onDragOver={e => handleDragOver(e, idx)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all select-none
                                ${overIdx === idx && dragIdx !== null && dragIdx !== idx
                                    ? 'border-indigo-400 bg-indigo-50'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'}
                                ${dragIdx === idx ? 'opacity-30' : ''}`}
                        >
                            {/* Drag handle + position number */}
                            <div className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                                <GripVertical className="w-4 h-4" />
                                <span className="text-xs font-bold text-gray-400 w-5 text-center">{idx + 1}</span>
                            </div>

                            {/* Event info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{evento.EVENTO || '(Sin nombre)'}</p>
                                <div className="flex gap-1.5 mt-0.5">
                                    {evento.ESFERIADO === 'S' && (
                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Feriado</span>
                                    )}
                                    {evento.USARENPRESUPUESTO === 'S' && (
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Presupuesto</span>
                                    )}
                                    {evento.ESINTERNO === 'S' && (
                                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Interno</span>
                                    )}
                                </div>
                            </div>

                            {/* Up/Down buttons (mobile-friendly) */}
                            <div className="flex flex-col gap-0.5">
                                <button
                                    onClick={() => moveItem(idx, idx - 1)}
                                    disabled={idx === 0}
                                    className="p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                                >▲</button>
                                <button
                                    onClick={() => moveItem(idx, idx + 1)}
                                    disabled={idx === items.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                                >▼</button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-semibold transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                        <Check className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Guardar Orden'}
                    </button>
                </div>
            </div>
        </div>
    );
};
