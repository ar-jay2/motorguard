import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resetPasswordForEmail } from '../../services/supabaseClient';

export const LoginPage: React.FC = () => {
  const { login, isLoading, isConfigured, authError, loginSuccessNotice, setLoginSuccessNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    const result = await login(email, password);
    if (!result.success) {
      setErrorMessage(result.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;

    setIsResetting(true);
    setResetError(null);

    const res = await resetPasswordForEmail(resetEmail);
    setIsResetting(false);

    if (res.success) {
      setResetSent(true);
      setTimeout(() => {
        setResetSent(false);
        setShowForgotPassword(false);
        setResetEmail('');
      }, 4000);
    } else {
      setResetError(res.error || 'Could not send reset email.');
    }
  };

  const activeError = errorMessage || authError;

  return (
    <div className="min-h-screen bg-[#060a14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      
      {/* Subtle Industrial Grid Background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#14b8a6 1px, transparent 1px), radial-gradient(#1e293b 1px, #060a14 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-md z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-950/70 border border-teal-500/40 text-teal-400 mb-3 shadow-lg shadow-teal-950/50">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            MotorGuard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Industrial Motor Monitoring, Protection & Predictive Maintenance
          </p>
        </div>

        {/* Configuration Notice if Supabase environment variables are missing */}
        {!isConfigured && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-950/70 border border-amber-600/50 text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Supabase Connection Required</span>
              <p className="text-amber-300/90 text-[11px] mt-0.5 leading-relaxed">
                Please configure <code className="font-mono text-amber-200">VITE_SUPABASE_URL</code> and <code className="font-mono text-amber-200">VITE_SUPABASE_ANON_KEY</code> in your environment to authenticate against the live database.
              </p>
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-[#0b1322] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Operator Sign In
              </h2>
              <span className="text-[11px] text-slate-400">
                Supabase Authentication & Row Level Security
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-950/80 text-teal-300 border border-teal-800/80">
              TLS ENCRYPTED
            </span>
          </div>

          {loginSuccessNotice && (
            <div className="mb-4 p-3.5 rounded-lg bg-teal-950/80 border border-teal-500/50 text-teal-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold block text-teal-300">Account Activated</span>
                <span>{loginSuccessNotice}</span>
              </div>
            </div>
          )}

          {activeError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{activeError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email Field */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Corporate Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="operator@plant.industrial"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-xs bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-950/60"
            >
              <span>{isLoading ? 'Verifying with Supabase Auth...' : 'Sign In to MotorGuard'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

        </div>

        {/* Security Footer Notice */}
        <div className="mt-4 text-center text-[11px] text-slate-500">
          <span>Protected by PostgreSQL Row Level Security (RLS)</span>
          <span className="mx-2">·</span>
          <span>Zero Service Role Keys in Client</span>
        </div>

      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0b1322] border border-slate-700 rounded-xl shadow-2xl p-6 text-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-teal-400" />
              <h3 className="font-bold text-white text-sm">Reset Password</h3>
            </div>

            {resetSent ? (
              <div className="p-4 bg-teal-950/80 border border-teal-500/40 rounded-lg text-teal-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>Password recovery instructions dispatched via Supabase Auth email service.</span>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4 text-xs">
                <p className="text-slate-400 text-xs leading-relaxed">
                  Enter your registered work email. A secure password reset link will be dispatched via Supabase Auth.
                </p>

                {resetError && (
                  <div className="p-2.5 bg-rose-950/80 border border-rose-800/80 rounded text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 mb-1">Corporate Email</label>
                  <input
                    type="email"
                    required
                    placeholder="operator@plant.industrial"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetError(null);
                    }}
                    className="px-3 py-1.5 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white font-semibold rounded-lg transition-colors"
                  >
                    {isResetting ? 'Dispatching...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
