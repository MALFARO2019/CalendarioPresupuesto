import React, { useState } from 'react';
import { login, adminLogin, API_BASE } from '../api';
import { Mail, Lock, Loader2, AlertCircle, Settings } from 'lucide-react';

interface LoginPageProps {
    onLoginSuccess: () => void;
    onAdminAccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onAdminAccess }) => {
    const [email, setEmail] = useState('');
    const [clave, setClave] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    // Admin access state
    const [showAdminAccess, setShowAdminAccess] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminError, setAdminError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('Ingrese su correo electrónico');
            return;
        }
        if (!clave.trim()) {
            setError('Ingrese su clave de acceso');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await login(email.trim(), clave.trim());
            if (result.success) {
                onLoginSuccess();
            } else {
                setError(result.error || 'Error al iniciar sesión');
            }
        } catch (err: any) {
            setError('No se pudo conectar al servidor. Verifique que el servidor esté ejecutándose. Revisar conexión al VPN de Rosti.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!forgotEmail.trim()) {
            setError('Ingrese su correo electrónico');
            return;
        }

        setSendingEmail(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE}/auth/send-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail.trim() })
            });

            const data = await response.json();

            if (response.ok) {
                setEmailSent(true);
                setTimeout(() => {
                    setShowForgotPassword(false);
                    setEmailSent(false);
                    setForgotEmail('');
                }, 3000);
            } else {
                setError(data.error || 'Error al enviar el correo');
            }
        } catch (err) {
            setError('No se pudo conectar al servidor. Revisar conexión al VPN de Rosti.');
        } finally {
            setSendingEmail(false);
        }
    };

    const handleAdminLogin = async () => {
        if (!adminPassword.trim()) {
            setAdminError('Ingrese la clave de administrador');
            return;
        }

        setAdminLoading(true);
        setAdminError('');

        try {
            const result = await adminLogin(adminPassword.trim());
            if (result.success) {
                setShowAdminAccess(false);
                setAdminPassword('');
                onAdminAccess();
            } else {
                setAdminError(result.error || 'Clave incorrecta');
            }
        } catch (err: any) {
            setAdminError('No se pudo conectar al servidor.');
        } finally {
            setAdminLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-red-600 via-orange-600 to-red-700 flex items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-400 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse" style={{ animationDelay: '4s' }}></div>
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo / Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-3xl mb-6 shadow-2xl p-3">
                        <img src="/LogoRosti.png" alt="Rosti" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">KPIs Rosti</h1>
                    <p className="text-orange-100 text-sm">Ingrese sus credenciales para acceder</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-white/80 mb-2">
                                Correo Electrónico
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                    placeholder="usuario@empresa.com"
                                    className="w-full pl-12 pr-4 py-4 bg-white/10 border-2 border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all text-sm font-medium"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-white/80 mb-2">
                                Clave de Acceso
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                <input
                                    type="password"
                                    value={clave}
                                    onChange={(e) => { setClave(e.target.value); setError(''); }}
                                    placeholder="••••••"
                                    className="w-full pl-12 pr-4 py-4 bg-white/10 border-2 border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all text-sm font-medium tracking-[0.3em]"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3">
                                <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0" />
                                <span className="text-red-200 text-sm">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Verificando...
                                </>
                            ) : (
                                'Ingresar'
                            )}
                        </button>

                        {/* Forgot Password Link */}
                        <div className="text-center space-y-2">
                            <button
                                type="button"
                                onClick={() => { setShowForgotPassword(true); setError(''); setForgotEmail(email); }}
                                className="text-white/60 hover:text-white text-xs font-medium transition-colors"
                            >
                                ¿Olvidaste tu clave?
                            </button>
                            <div>
                                <button
                                    type="button"
                                    onClick={() => { setShowAdminAccess(true); setAdminError(''); setAdminPassword(''); }}
                                    className="text-white/40 hover:text-white/70 text-xs font-medium transition-colors flex items-center gap-1 mx-auto"
                                >
                                    <Settings className="w-3 h-3" />
                                    Acceso Administrador
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Forgot Password Modal */}
                    {showForgotPassword && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                                {emailSent ? (
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">¡Correo enviado!</h3>
                                        <p className="text-gray-600 text-sm">
                                            Te hemos enviado tu clave de acceso a <strong>{forgotEmail}</strong>
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Recuperar Clave</h3>
                                        <p className="text-gray-600 text-sm mb-6">
                                            Ingresa tu correo electrónico y te enviaremos tu clave de acceso
                                        </p>

                                        <div className="mb-4">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Correo Electrónico
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                <input
                                                    type="email"
                                                    value={forgotEmail}
                                                    onChange={(e) => { setForgotEmail(e.target.value); setError(''); }}
                                                    placeholder="usuario@empresa.com"
                                                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                <span className="text-red-700 text-sm">{error}</span>
                                            </div>
                                        )}

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => { setShowForgotPassword(false); setError(''); setForgotEmail(''); }}
                                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all text-sm"
                                                disabled={sendingEmail}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleForgotPassword}
                                                disabled={sendingEmail}
                                                className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {sendingEmail ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Enviando...
                                                    </>
                                                ) : (
                                                    'Enviar Clave'
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Admin Access Modal */}
                    {showAdminAccess && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                                        <Settings className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800">Acceso Administrador</h3>
                                </div>
                                <p className="text-gray-500 text-sm mb-6">
                                    Ingrese la clave de administrador para acceder a la configuración del sistema.
                                </p>

                                <div className="mb-4">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Clave de Administrador
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="password"
                                            value={adminPassword}
                                            onChange={(e) => { setAdminPassword(e.target.value); setAdminError(''); }}
                                            placeholder="••••••••"
                                            className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all text-sm tracking-[0.2em]"
                                            autoFocus
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
                                        />
                                    </div>
                                </div>

                                {adminError && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <span className="text-red-700 text-sm">{adminError}</span>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setShowAdminAccess(false); setAdminError(''); setAdminPassword(''); }}
                                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all text-sm"
                                        disabled={adminLoading}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleAdminLogin}
                                        disabled={adminLoading}
                                        className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {adminLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Verificando...
                                            </>
                                        ) : (
                                            <>
                                                <Settings className="w-4 h-4" />
                                                Ingresar
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* Version Indicator */}
                <div className="mt-8 text-center text-xs text-indigo-200 opacity-60">
                    v2.0 - FIX
                </div>
            </div>
        </div>
    );
};
