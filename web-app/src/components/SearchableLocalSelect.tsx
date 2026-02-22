import React, { useState, useRef, useEffect } from 'react';

interface SearchableLocalSelectProps {
    value: string;
    onChange: (val: string) => void;
    groups: string[];
    individualStores: string[];
    className?: string;
}

/**
 * Searchable dropdown for LOCAL filter.
 * Shows groups and individual stores with a search input to quickly find options.
 */
export const SearchableLocalSelect: React.FC<SearchableLocalSelectProps> = ({
    value, onChange, groups, individualStores, className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const filteredGroups = groups.filter(g =>
        g.toLowerCase().includes(search.toLowerCase())
    );
    const filteredStores = individualStores.filter(s =>
        s.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch('');
    };

    // Handle keyboard navigation: Enter on single result, Escape to close
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsOpen(false);
            setSearch('');
        } else if (e.key === 'Enter') {
            const all = [...filteredGroups, ...filteredStores];
            if (all.length === 1) {
                handleSelect(all[0]);
            }
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Display button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="block w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-white font-semibold text-gray-700 text-sm transition-all hover:border-indigo-300 text-left flex items-center justify-between gap-2"
            >
                <span className="truncate">{value || 'Seleccionar...'}</span>
                <svg className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border-2 border-indigo-200 rounded-xl shadow-xl overflow-hidden" style={{ minWidth: '200px' }}>
                    {/* Search input */}
                    <div className="p-2 border-b border-gray-100">
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="🔍 Buscar local..."
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        />
                    </div>

                    {/* Options list */}
                    <div className="max-h-60 overflow-y-auto overscroll-contain">
                        {filteredGroups.length > 0 && (
                            <>
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">Grupos</div>
                                {filteredGroups.map(g => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => handleSelect(g)}
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${value === g ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700'}`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </>
                        )}
                        {filteredStores.length > 0 && (
                            <>
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">Locales</div>
                                {filteredStores.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => handleSelect(s)}
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${value === s ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </>
                        )}
                        {filteredGroups.length === 0 && filteredStores.length === 0 && (
                            <div className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
