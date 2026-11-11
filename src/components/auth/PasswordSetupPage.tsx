import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  Mail,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const PasswordSetupPage: React.FC = () => {
  const { setupPasswordEmail, completePasswordSetup, cancelPasswordSetup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation rules
  const hasMinLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasMinLength) {
      setErrorMessage('Password must be at least 8 characters in length.');
      return;
    }

    if (!passwordsMatch) {
      setErrorMessage('The passwords entered do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    const result = await completePasswordSetup(password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to establish password. Please try again or request a new invitation.');
    }
  };

  return (
    <div className="min-h-screen bg-[#060a14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      
      {/* Industrial Grid Background */}
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
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            MotorGuard Edge
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Account Activation & Password Establishment
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0b1322] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Set Your Account Password
              </h2>
              <span className="text-[11px] text-slate-400">
                Verified Invitation via Supabase Auth
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-950/80 text-teal-300 border border-teal-800/80">
              INVITATION VERIFIED
            </span>
          </div>

          {/* Email notice if available */}
          {setupPasswordEmail && (
            <div className="mb-4 p-3 rounded-lg bg-[#070c17] border border-slate-800 flex items-center gap-2.5 text-xs text-slate-300">
              <Mail className="w-4 h-4 text-teal-400 shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 text-[10px] block font-mono">ACTIVATING ACCOUNT FOR</span>
                <span className="font-mono text-white font-semibold">{setupPasswordEmail}</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* New Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 8 characters"
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

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-xs bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Validation Requirements */}
            <div className="p-3 bg-[#070c17] border border-slate-800 rounded-lg space-y-1.5 text-[11px] font-mono">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider block font-medium">
                Security Requirements
              </span>
              <div className="flex items-center gap-2">
                {hasMinLength ? (
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center text-[9px] text-slate-600">
                    •
                  </div>
                )}
                <span className={hasMinLength ? 'text-teal-300' : 'text-slate-400'}>
                  At least 8 characters long
                </span>
              </div>
              <div className="flex items-center gap-2">
                {passwordsMatch ? (
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center text-[9px] text-slate-600">
                    •
                  </div>
                )}
                <span className={passwordsMatch ? 'text-teal-300' : 'text-slate-400'}>
                  Passwords match
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-950/60"
            >
              <span>{isSubmitting ? 'Establishing Password...' : 'Save Password & Complete Activation'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={cancelPasswordSetup}
              disabled={isSubmitting}
              className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors text-center"
            >
              Cancel & Return to Sign In
            </button>
          </form>

        </div>

        {/* Security Footer Notice */}
        <div className="mt-4 text-center text-[11px] text-slate-500">
          <span>Protected by Supabase Authentication & PostgreSQL RLS</span>
        </div>

      </div>

    </div>
  );
};
