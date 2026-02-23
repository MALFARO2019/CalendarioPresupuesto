/**
 * Toast & ConfirmDialog — inline replacements for browser alert()/confirm().
 *
 * Usage:
 *   import { useToast, ToastContainer } from '../ui/Toast';
 *
 *   const { showToast } = useToast();
 *   showToast('Guardado correctamente', 'success');
 *   showToast('Error al guardar', 'error');
 *
 *   // Place <ToastContainer /> once at top-level (e.g. in App or Layout)
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import './Toast.css';

// ─── Types ────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    exiting?: boolean;
}

interface ConfirmOpts {
    message: string;
    title?: string;
    okLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
    showConfirm: (opts: ConfirmOpts) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
}

// ─── Icons ────────────────────────────────────────────────────────
const ICONS: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
};

// ─── Provider ─────────────────────────────────────────────────────
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(0);

    // Confirm dialog state
    const [confirmState, setConfirmState] = useState<{
        opts: ConfirmOpts;
        resolve: (v: boolean) => void;
    } | null>(null);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 260);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = nextId.current++;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => dismissToast(id), 4000);
    }, [dismissToast]);

    const showConfirm = useCallback((opts: ConfirmOpts): Promise<boolean> => {
        return new Promise(resolve => {
            setConfirmState({ opts, resolve });
        });
    }, []);

    const handleConfirmAnswer = useCallback((answer: boolean) => {
        confirmState?.resolve(answer);
        setConfirmState(null);
    }, [confirmState]);

    // Close confirm on Escape key
    useEffect(() => {
        if (!confirmState) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleConfirmAnswer(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [confirmState, handleConfirmAnswer]);

    return (
        <ToastContext.Provider value={{ showToast, showConfirm }}>
            {children}

            {/* Toast stack */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast-item ${t.type}${t.exiting ? ' toast-exit' : ''}`}>
                        <span className="toast-icon">{ICONS[t.type]}</span>
                        <span className="toast-message">{t.message}</span>
                        <button className="toast-close" onClick={() => dismissToast(t.id)}>✕</button>
                    </div>
                ))}
            </div>

            {/* Confirm dialog */}
            {confirmState && (
                <div className="confirm-dialog-overlay" onClick={() => handleConfirmAnswer(false)}>
                    <div className="confirm-dialog-box" onClick={e => e.stopPropagation()}>
                        {confirmState.opts.title && (
                            <h3 className="confirm-dialog-title">{confirmState.opts.title}</h3>
                        )}
                        <p className="confirm-dialog-message">{confirmState.opts.message}</p>
                        <div className="confirm-dialog-actions">
                            <button className="confirm-btn-cancel" onClick={() => handleConfirmAnswer(false)}>
                                {confirmState.opts.cancelLabel || 'Cancelar'}
                            </button>
                            <button
                                className={`confirm-btn-ok${confirmState.opts.destructive ? ' destructive' : ''}`}
                                onClick={() => handleConfirmAnswer(true)}
                                autoFocus
                            >
                                {confirmState.opts.okLabel || 'Aceptar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ToastContext.Provider>
    );
};
