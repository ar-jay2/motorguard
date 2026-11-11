import React, { useState } from 'react';
import {
  Users,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Copy,
  Check,
  Lock,
  Info,
  Database,
  Eye,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SUPABASE_SQL_SCHEMA } from '../../services/supabase';

export const UserManagementView: React.FC = () => {
  const { user: currentUser, usersList, hasAdminPrivileges } = useAuth();
  const [copiedSql, setCopiedSql] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Non-admin protection guard
  if (!hasAdminPrivileges()) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-[#090f1d] border border-rose-800/80 rounded-2xl text-center space-y-4 my-12">
        <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Access Restricted: Administrator Privileges Required</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          The User Management console is strictly restricted to accounts with the <code className="text-teal-400 font-mono">admin</code> role in <code className="text-teal-400 font-mono">public.profiles</code>. Operators and unauthorized roles do not have permissions to access administration tools.
        </p>
      </div>
    );
  }

  const handleDisabledAction = (actionName: string) => {
    setActionNotice(`Notice: "${actionName}" is disabled on the client. Account creation, role mutations, and full user directory access require a secure Supabase Edge Function utilizing the protected service role key.`);
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Profile counts
  const adminCount = usersList.filter((u) => u.dbRole === 'admin').length;
  const operatorCount = usersList.filter((u) => u.dbRole === 'operator').length;
  const viewerCount = usersList.filter((u) => u.dbRole === 'viewer').length;

  return (
    <div className="space-y-6">
      
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            User Access Management & Supabase Architecture
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Admin console connected to the existing <code className="text-teal-400 font-mono">public.profiles</code> table in Supabase PostgreSQL.
          </p>
        </div>

        <button
          onClick={() => handleDisabledAction('Provision User Account')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-400 bg-slate-800 border border-slate-700/80 rounded-lg cursor-not-allowed opacity-80 self-start sm:self-auto"
          title="Requires secure Supabase Edge Function"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Provision User Account</span>
          <span className="text-[10px] font-mono text-amber-400 font-bold ml-1 px-1 rounded bg-amber-950/60">
            EDGE FUNCTION REQ
          </span>
        </button>
      </div>

      {/* Database Schema & RLS Notice */}
      <div className="p-4 rounded-xl bg-[#090f1d] border border-amber-600/40 text-amber-200 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <span className="font-bold text-white block">
            Existing Database Structure: <code className="font-mono text-teal-300">public.profiles</code> & Self-Read RLS Policy
          </span>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            The database utilizes <code className="font-mono text-teal-300">public.profiles</code> with columns: <code className="font-mono text-slate-200">id (UUID)</code>, <code className="font-mono text-slate-200">full_name (text)</code>, <code className="font-mono text-slate-200">role (text: admin | operator | viewer)</code>, and <code className="font-mono text-slate-200">created_at (timestamptz)</code>.
          </p>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            Because the existing Row Level Security (RLS) policy restricts client-side SELECT queries to <code className="font-mono text-amber-300">auth.uid() = id</code>, only your own authenticated profile is returned directly. Viewing the full multi-user directory and provisioning accounts safely without exposing the service role key requires a backend Supabase Edge Function.
          </p>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-teal-950/90 border border-teal-500/50 text-teal-200 text-xs rounded-lg flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Visible Profiles</span>
            <Database className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-2xl font-bold font-mono text-white mt-1 block tabular-nums">{usersList.length}</span>
          <span className="text-xs text-teal-400 mt-1 block">
            Queried via <code className="text-slate-400 font-mono">public.profiles</code>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Administrators</span>
          <span className="text-2xl font-bold font-mono text-teal-300 mt-1 block tabular-nums">
            {adminCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">Full access & configuration</span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Operators</span>
          <span className="text-2xl font-bold font-mono text-cyan-300 mt-1 block tabular-nums">
            {operatorCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">Monitoring & alarm sign-off</span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Viewers</span>
            <Eye className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-2xl font-bold font-mono text-amber-300 mt-1 block tabular-nums">
            {viewerCount}
          </span>
          <span className="text-xs text-amber-400/80 mt-1 block">Restricted: workspace access denied</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-sm">Authenticated Profile in public.profiles</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live record from Supabase table <code className="text-teal-400 font-mono">public.profiles</code> (governed by self-read RLS policy).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">{usersList.length} Profile(s) Loaded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-mono bg-[#0c1424]">
                <th className="py-2.5 px-4 font-sans">User</th>
                <th className="py-2.5 px-4">Database Role</th>
                <th className="py-2.5 px-4">App Permission</th>
                <th className="py-2.5 px-4">User ID (UUID)</th>
                <th className="py-2.5 px-4">Profile Created</th>
                <th className="py-2.5 px-4 text-right">Mutations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {usersList.length > 0 ? (
                usersList.map((u) => {
                  const isCurrent = currentUser?.id === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-[#0c162b] transition-colors">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {u.fullName}
                          {isCurrent && (
                            <span className="text-[10px] text-teal-400 font-mono px-1 rounded bg-teal-950/80 border border-teal-800/60">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          u.dbRole === 'admin'
                            ? 'bg-teal-950/80 text-teal-300 border border-teal-800/80'
                            : u.dbRole === 'operator'
                            ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                        }`}>
                          {u.dbRole.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <span className="text-slate-300">
                          {u.role === 'admin' ? 'Full Administrator Access' : 'Authorized Operator Access'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {u.id.slice(0, 18)}...
                      </td>

                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {u.createdAt ? u.createdAt.slice(0, 10) : 'N/A'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDisabledAction('Role Modification')}
                            className="px-2.5 py-1 text-xs font-sans rounded bg-[#0c1527] border border-slate-800 text-slate-500 cursor-not-allowed opacity-75"
                            title="Requires secure Edge Function"
                          >
                            <Lock className="w-3 h-3 inline mr-1 text-amber-500/80" />
                            Role
                          </button>

                          <button
                            onClick={() => handleDisabledAction('Profile Administration')}
                            className="px-2.5 py-1 text-xs font-sans rounded bg-[#0c1527] border border-slate-800 text-slate-500 cursor-not-allowed opacity-75"
                            title="Requires secure Edge Function"
                          >
                            <Lock className="w-3 h-3 inline mr-1 text-amber-500/80" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-xs">
                    {currentUser?.role === 'admin'
                      ? 'No user profile loaded yet from public.profiles.'
                      : 'Loading user profiles...'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Architecture Reference Guide */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="font-bold text-white text-sm">Role-Based Access Control (RBAC) Architecture</h2>
              <p className="text-xs text-slate-400">
                Mapped directly from the existing <code className="text-teal-400 font-mono">public.profiles</code> table roles.
              </p>
            </div>
          </div>

          <button
            onClick={handleCopySchema}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors self-start sm:self-auto"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSql ? 'Schema Reference Copied!' : 'Copy Database Architecture'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3.5 bg-[#080d19] rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-sans font-bold text-teal-400 text-xs block">
                1. Database: admin
              </span>
              <span className="text-[10px] text-teal-300 font-mono bg-teal-950/80 px-1.5 py-0.5 rounded border border-teal-800/60">
                admin
              </span>
            </div>
            <ul className="space-y-1 text-slate-300 font-sans list-disc pl-4 text-xs leading-relaxed">
              <li>Full access to all 9 application modules.</li>
              <li>Platform and telemetry configuration.</li>
              <li>Edge node commissioning and network management.</li>
              <li>Access to this User Access Management console.</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#080d19] rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-sans font-bold text-cyan-400 text-xs block">
                2. Database: operator
              </span>
              <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
                authorized_user
              </span>
            </div>
            <ul className="space-y-1 text-slate-300 font-sans list-disc pl-4 text-xs leading-relaxed">
              <li>Dashboard, Plant Map, and Real-time Monitoring.</li>
              <li>Node health tracking and fleet statistics.</li>
              <li>Predictive maintenance analytics and insights.</li>
              <li>Event logs and active alarm acknowledgment.</li>
              <li>Telemetric compliance and shift reports.</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#080d19] rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-sans font-bold text-amber-400 text-xs block">
                3. Database: viewer
              </span>
              <span className="text-[10px] text-amber-300 font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                restricted
              </span>
            </div>
            <ul className="space-y-1 text-slate-300 font-sans list-disc pl-4 text-xs leading-relaxed">
              <li>Restricted read-only role in database.</li>
              <li>Workspace access is strictly denied.</li>
              <li>Prevents unauthorized exposure of plant operations.</li>
              <li>Users are prompted to contact their plant administrator for role elevation.</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};
