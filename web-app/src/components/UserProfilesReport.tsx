import React, { useState, useMemo } from 'react';
import type { User, Profile } from '../api';
import { Shield, Filter, Copy, CheckCircle, Users, ChevronDown } from 'lucide-react';

interface UserProfilesReportProps {
    users: User[];
    profiles: Profile[];
}

// Permission definition for consistent rendering
const PERMISSIONS = [
    { key: 'accesoTendencia', label: 'Tendencia', bg: 'bg-blue-100', text: 'text-blue-700' },
    { key: 'accesoTactica', label: 'Táctica', bg: 'bg-cyan-100', text: 'text-cyan-700' },
    { key: 'accesoEventos', label: 'Eventos', bg: 'bg-green-100', text: 'text-green-700' },
    { key: 'accesoPresupuesto', label: 'Presupuesto', bg: 'bg-orange-100', text: 'text-orange-700' },
    { key: 'accesoTiempos', label: 'Tiempos', bg: 'bg-blue-100', text: 'text-blue-700' },
    { key: 'accesoEvaluaciones', label: 'Evaluaciones', bg: 'bg-green-100', text: 'text-green-700' },
    { key: 'accesoInventarios', label: 'Inventarios', bg: 'bg-purple-100', text: 'text-purple-700' },
    { key: 'accesoPersonal', label: 'Personal', bg: 'bg-rose-100', text: 'text-rose-700' },
    { key: 'accesoReportes', label: 'Reportes', bg: 'bg-indigo-100', text: 'text-indigo-700' },
] as const;

type FilterValue = 'all' | 'no-profile' | number;

export const UserProfilesReport: React.FC<UserProfilesReportProps> = ({ users, profiles }) => {
    const [filter, setFilter] = useState<FilterValue>('all');
    const [copied, setCopied] = useState(false);

    // Build a map profileId → profileName for fast lookup
    const profileMap = useMemo(() => {
        const m = new Map<number, string>();
        profiles.forEach(p => m.set(p.id, p.nombre));
        return m;
    }, [profiles]);

    // Filter users based on selected filter
    const filteredUsers = useMemo(() => {
        if (filter === 'all') return users;
        if (filter === 'no-profile') return users.filter(u => !u.perfilId);
        return users.filter(u => u.perfilId === filter);
    }, [users, filter]);

    // Group users by profile for summary cards
    const profileSummary = useMemo(() => {
        const summary: { id: FilterValue; name: string; count: number; color: string }[] = [];
        // Count per profile
        const counts = new Map<number, number>();
        let noProfileCount = 0;
        users.forEach(u => {
            if (u.perfilId) {
                counts.set(u.perfilId, (counts.get(u.perfilId) || 0) + 1);
            } else {
                noProfileCount++;
            }
        });
        profiles.forEach(p => {
            summary.push({
                id: p.id,
                name: p.nombre,
                count: counts.get(p.id) || 0,
                color: 'bg-indigo-50 border-indigo-200 text-indigo-700'
            });
        });
        if (noProfileCount > 0) {
            summary.push({
                id: 'no-profile',
                name: 'Sin perfil',
                count: noProfileCount,
                color: 'bg-amber-50 border-amber-200 text-amber-700'
            });
        }
        return summary;
    }, [users, profiles]);

    // Copy report to clipboard
    const handleCopy = () => {
        const header = `Reporte de Usuarios — Filtro: ${filter === 'all' ? 'Todos' : filter === 'no-profile' ? 'Sin perfil' : profileMap.get(filter as number) || ''}\n`;
        const divider = '─'.repeat(80) + '\n';
        const lines = filteredUsers.map(u => {
            const profile = u.perfilId ? (profileMap.get(u.perfilId) || '—') : 'Sin perfil';
            const perms = PERMISSIONS.filter(p => (u as any)[p.key]).map(p => p.label).join(', ');
            const canales = u.allowedCanales?.join(', ') || '';
            return `${u.email} | ${u.nombre || '—'} | Perfil: ${profile} | ${u.activo ? 'Activo' : 'Inactivo'}\n  Permisos: ${perms || 'Ninguno'}\n  Canales: ${canales || 'Ninguno'}`;
        });
        navigator.clipboard.writeText(header + divider + lines.join('\n' + divider));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div>
            {/* Title */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-bold text-gray-900">Reporte de Usuarios y Perfiles</h2>
                    <span className="text-xs text-gray-400 ml-1">({filteredUsers.length} de {users.length})</span>
                </div>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all"
                >
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar reporte'}
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-5">
                <button
                    onClick={() => setFilter('all')}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${filter === 'all'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md ring-2 ring-indigo-300'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50'
                        }`}
                >
                    <span className="font-medium truncate">Todos</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${filter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>{users.length}</span>
                </button>
                {profileSummary.map(ps => (
                    <button
                        key={String(ps.id)}
                        onClick={() => setFilter(ps.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${filter === ps.id
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md ring-2 ring-indigo-300'
                            : `${ps.color} hover:shadow-sm`
                            }`}
                    >
                        <span className="font-medium truncate">{ps.name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${filter === ps.id ? 'bg-white/20 text-white' : 'bg-white/60 text-inherit'
                            }`}>{ps.count}</span>
                    </button>
                ))}
            </div>

            {/* Mobile filter select (for extra-small screens where cards overflow) */}
            <div className="block sm:hidden mb-4">
                <div className="relative">
                    <select
                        value={String(filter)}
                        onChange={e => {
                            const v = e.target.value;
                            setFilter(v === 'all' ? 'all' : v === 'no-profile' ? 'no-profile' : Number(v));
                        }}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold bg-white text-gray-700 appearance-none pr-10"
                    >
                        <option value="all">Todos ({users.length})</option>
                        {profileSummary.map(ps => (
                            <option key={String(ps.id)} value={String(ps.id)}>
                                {ps.name} ({ps.count})
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[22%]">Email</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[14%]">Nombre</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase w-[12%]">Perfil</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase">Permisos / Canales</th>
                            <th className="text-center px-2 py-3 text-xs font-bold text-gray-500 uppercase w-[8%]">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">
                                    No hay usuarios que coincidan con el filtro seleccionado.
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map(user => (
                                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]" title={user.email}>{user.email}</span>
                                            {user.esProtegido && (
                                                <div title="Usuario protegido">
                                                    <Shield className="w-4 h-4 text-amber-500" />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600">{user.nombre || '—'}</td>
                                    <td className="px-3 py-2">
                                        {user.perfilId ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                                                <Shield className="w-3 h-3" />
                                                {profileMap.get(user.perfilId) || '—'}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 italic">Sin perfil</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {user.esAdmin && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Admin</span>}
                                            {PERMISSIONS.map(p =>
                                                (user as any)[p.key] ? (
                                                    <span key={p.key} className={`text-[10px] ${p.bg} ${p.text} px-1.5 py-0.5 rounded-full font-medium`}>{p.label}</span>
                                                ) : null
                                            )}
                                        </div>
                                        {user.allowedCanales && user.allowedCanales.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {user.allowedCanales.map((canal: string) => (
                                                    <span key={canal} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{canal}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {user.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                        No hay usuarios que coincidan con el filtro seleccionado.
                    </div>
                ) : (
                    filteredUsers.map(user => (
                        <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{user.email}</span>
                                    {user.esProtegido && <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${user.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {user.activo ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>
                            {user.nombre && <p className="text-xs text-gray-500">{user.nombre}</p>}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Perfil:</span>
                                {user.perfilId ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                                        <Shield className="w-3 h-3" />
                                        {profileMap.get(user.perfilId) || '—'}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-gray-400 italic">Sin perfil</span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {user.esAdmin && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Admin</span>}
                                {PERMISSIONS.map(p =>
                                    (user as any)[p.key] ? (
                                        <span key={p.key} className={`text-[10px] ${p.bg} ${p.text} px-1.5 py-0.5 rounded-full font-medium`}>{p.label}</span>
                                    ) : null
                                )}
                            </div>
                            {user.allowedCanales && user.allowedCanales.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {user.allowedCanales.map((canal: string) => (
                                        <span key={canal} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{canal}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
