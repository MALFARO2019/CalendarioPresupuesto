import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

export interface ComboboxOption {
    value: string;
    label: string;
}

interface SearchableComboboxProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
    options, value, onChange, placeholder = 'Seleccionar...', disabled = false, className = ''
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus input when opening
    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    const filtered = useMemo(() => {
        if (!search.trim()) return options;
        const term = search.toLowerCase();
        return options.filter(o =>
            o.label.toLowerCase().includes(term) ||
            o.value.toLowerCase().includes(term)
        );
    }, [options, search]);

    const selectedLabel = options.find(o => o.value === value)?.label || '';

    return (
        <div ref={ref} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => { setOpen(!open); setSearch(''); }}
                className={`w-full flex items-center justify-between px-3 py-2 border-2 rounded-lg text-sm transition-all text-left
                    ${open ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200 hover:border-gray-300'}
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white cursor-pointer'}
                `}
            >
                <span className={value ? 'text-gray-800' : 'text-gray-400'}>
                    {selectedLabel || placeholder}
                </span>
                <div className="flex items-center gap-1 ml-2">
                    {value && !disabled && (
                        <span
                            onClick={e => { e.stopPropagation(); onChange(''); }}
                            className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                            <X className="w-3 h-3" />
                        </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {open && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                    style={{ maxHeight: 240 }}>
                    {/* Search input */}
                    <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none"
                            />
                        </div>
                    </div>
                    {/* Options */}
                    <div className="overflow-y-auto" style={{ maxHeight: 190 }}>
                        {filtered.length === 0 ? (
                            <p className="text-center text-gray-400 text-xs py-4">Sin resultados</p>
                        ) : (
                            filtered.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                                        ${value === opt.value
                                            ? 'bg-violet-50 text-violet-700 font-medium'
                                            : 'hover:bg-gray-50 text-gray-700'
                                        }
                                    `}
                                >
                                    {value === opt.value && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
                                    <span className={value === opt.value ? '' : 'ml-5'}>{opt.label}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
