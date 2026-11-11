import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Database,
  Sliders,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  AlertOctagon,
  X,
  Search,
  FileText,
  Info,
} from 'lucide-react';
import { fetchSettings, SettingRecord } from '../../services/telemetryService';
import { useAuth } from '../../context/AuthContext';

interface SettingsViewProps {
  thresholds?: any; // Kept for interface backward compatibility; superseded by live database
  onUpdateThresholds?: (thresholds: any) => void;
  onResetDefaults?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = () => {
  const { hasAdminPrivileges } = useAuth();
  const [settingsList, setSettingsList] = useState<SettingRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load settings directly from public.settings via telemetryService
  const loadSettingsData = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setDbError(null);

    try {
      const records = await fetchSettings();
      setSettingsList(records);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to query public.settings:', err);
      setDbError(err?.message || 'Database error: Could not query public.settings.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    let isMounted = true;

    loadSettingsData(false);

    return () => {
      isMounted = false;
    };
  }, [loadSettingsData]);

  // Non-admin guard
  if (!hasAdminPrivileges()) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-[#090f1d] border border-rose-800/80 rounded-2xl text-center space-y-4 my-12">
        <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Access Restricted: Administrator Privileges Required</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Platform configuration records in <code className="text-teal-400 font-mono">public.settings</code> can only be audited by authenticated users with the <code className="text-teal-400 font-mono">admin</code> role.
        </p>
      </div>
    );
  }

  // Filtered settings list
  const filteredSettings = settingsList.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchKey = (s.setting_key || '').toLowerCase().includes(q);
    const matchVal = (s.setting_value || '').toLowerCase().includes(q);
    const matchDesc = (s.description || '').toLowerCase().includes(q);
    return matchKey || matchVal || matchDesc;
  });

  return (
    <div className="space-y-6">
      
      {/* Title & Live Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Settings className="w-5 h-5 text-teal-400" />
              Platform Settings & System Parameters
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.settings
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Configuration parameters retrieved directly from the Supabase database.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>READ-ONLY (SELECT)</span>
          </span>

          <button
            onClick={() => loadSettingsData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Query latest settings records from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Database Error Banner */}
      {dbError && (
        <div className="p-4 bg-rose-950/90 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Database Connection Error</span>
              <p className="text-rose-300 mt-0.5">{dbError}</p>
              <button
                onClick={() => loadSettingsData(false)}
                className="mt-2 px-3 py-1 bg-rose-900/60 hover:bg-rose-900 border border-rose-600/60 rounded text-[11px] font-semibold text-white transition-colors"
              >
                Retry Query
              </button>
            </div>
          </div>
          <button onClick={() => setDbError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Read-Only Security Policy Notice */}
      <div className="p-4 rounded-xl bg-[#090f1d] border border-amber-600/40 text-amber-200 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-white block">
            Read-Only Authorization Policy Enforced
          </span>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            In compliance with database Row Level Security policies, <code className="font-mono text-teal-300">public.settings</code> is accessible via read-only SELECT queries. Modifying system setpoints, threshold limits, or adding new keys requires administrative backend authorization or a secure Supabase Edge Function.
          </p>
        </div>
      </div>

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Configured Settings</span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block tabular-nums">
            {isLoading ? '...' : settingsList.length}
          </span>
          <span className="text-xs text-teal-400 mt-1 block">
            Queried from <code className="text-slate-400 font-mono">public.settings</code>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Database Table Status</span>
          <span className="text-xl font-bold font-mono text-teal-300 mt-1 block">
            {dbError ? 'Query Failed' : 'Last Query Successful'}
          </span>
          <span className="text-xs text-slate-400 mt-1 block font-mono">
            {lastRefreshedAt ? `Last synced at ${lastRefreshedAt}` : 'Connecting...'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Mutation Controls</span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
            Locked
          </span>
          <span className="text-xs text-slate-400 mt-1 block">Direct client writes restricted</span>
        </div>
      </div>

      {/* Main Settings Display Area */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving configuration records from public.settings...</span>
          </div>
        </div>
      ) : settingsList.length > 0 ? (
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl overflow-hidden space-y-4 p-5">
          {/* Search bar when settings exist */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search setting key or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
              />
            </div>
            <span className="text-xs font-mono text-slate-400">
              {filteredSettings.length} of {settingsList.length} settings visible
            </span>
          </div>

          {/* Settings Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-mono bg-[#0c1424]">
                  <th className="py-2.5 px-4 font-mono">Setting Key</th>
                  <th className="py-2.5 px-4 font-mono">Setting Value</th>
                  <th className="py-2.5 px-4 font-sans">Description</th>
                  <th className="py-2.5 px-4 font-mono text-right">Record ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredSettings.map((item) => (
                  <tr key={item.id} className="hover:bg-[#0c162b] transition-colors">
                    <td className="py-3 px-4 font-bold text-teal-300">
                      {item.setting_key}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded bg-[#080d19] border border-slate-700/80 text-white font-mono text-xs inline-block">
                        {item.setting_value}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-md">
                      {item.description || <span className="text-slate-500 italic">No description provided.</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      #{item.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Professional Empty State as explicitly specified */
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/80 text-teal-400 flex items-center justify-center mx-auto">
            <Sliders className="w-6 h-6 text-teal-400" />
          </div>
          <h2 className="text-base font-bold text-white">No Settings Configured</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
            No configuration records are currently available in the database. Settings will appear here once they are configured.
          </p>
          <div className="pt-2">
            <button
              onClick={() => loadSettingsData(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Check for Settings
            </button>
          </div>
        </div>
      )}

      {/* Schema Reference Guide */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <FileText className="w-4 h-4 text-teal-400" />
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">
            Supabase Settings Schema Architecture
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-slate-300">
          <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">Database Table:</span>
            <span className="text-teal-300 font-bold">public.settings</span>
            <span className="text-slate-500 block text-[11px] pt-1">Queried Columns:</span>
            <span className="text-slate-200">id, setting_key, setting_value, description</span>
          </div>

          <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">Row Level Security (RLS):</span>
            <span className="text-emerald-400 font-bold">SELECT Allowed for Authenticated</span>
            <span className="text-slate-500 block text-[11px] pt-1">Write Access:</span>
            <span className="text-slate-400">Restricted (No direct client write access)</span>
          </div>
        </div>
      </div>

    </div>
  );
};
