import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Info,
  Database,
  Eye,
  RefreshCw,
  UserPlus,
  Mail,
  AlertOctagon,
  LogOut,
  Clock,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SUPABASE_SQL_SCHEMA } from '../../services/supabase';
import { InvitableDatabaseRole } from '../../types/auth';

export const UserManagementView: React.FC = () => {
  const {
    user: currentUser,
    hasAdminPrivileges,
    logout,
    managedUsers,
    usersLoading,
    usersError,
    usersSessionExpired,
    usersPermissionDenied,
    refreshManagedUsers,
    inviteUser,
  } = useAuth();

  const [copiedSql, setCopiedSql] = useState(false);

  // Invitation Modal / Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableDatabaseRole>('operator');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isAdmin = hasAdminPrivileges();

  // Load real user directory via manage-users Edge Function on mount
  useEffect(() => {
    if (isAdmin) {
      refreshManagedUsers();
    }
  }, [isAdmin, refreshManagedUsers]);

  // Non-admin protection guard
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-[#090f1d] border border-rose-800/80 rounded-2xl text-center space-y-4 my-12">
        <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Access Restricted: Administrator Privileges Required</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          The User Management console is strictly restricted to accounts with the{' '}
          <code className="text-teal-400 font-mono">admin</code> role in{' '}
          <code className="text-teal-400 font-mono">public.profiles</code>. Operators and unauthorized roles do not
          have permissions to access administration tools.
        </p>
      </div>
    );
  }

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleOpenInviteModal = () => {
    setInviteError(null);
    setInviteFullName('');
    setInviteEmail('');
    setInviteRole('operator');
    setShowInviteModal(true);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setSuccessNotice(null);

    const trimmedName = inviteFullName.trim();
    const trimmedEmail = inviteEmail.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setInviteError('Full name must be at least 2 characters.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    setIsInviting(true);
    const res = await inviteUser({
      full_name: trimmedName,
      email: trimmedEmail,
      role: inviteRole,
    });
    setIsInviting(false);

    if (!res.success) {
      setInviteError(res.error || 'Failed to send user invitation.');
      return;
    }

    setShowInviteModal(false);
    setInviteFullName('');
    setInviteEmail('');
    setSuccessNotice(
      `Invitation sent to ${trimmedEmail} with authoritative role '${inviteRole}'. The user will establish their password via the invitation link.`
    );
  };

  const formatTimestamp = (ts: string | null): string => {
    if (!ts) return 'N/A';
    if (ts.length >= 19 && ts.includes('T')) {
      return `${ts.slice(0, 10)} ${ts.slice(11, 19)}`;
    }
    return ts.slice(0, 19);
  };

  // Accurate directory counts derived solely from Edge Function results
  const normalizeRole = (role: string | null): string => (role || '').trim().toLowerCase();
  const adminCount = managedUsers.filter(
    (u) => !u.profile_missing && normalizeRole(u.role) === 'admin'
  ).length;
  const operatorCount = managedUsers.filter(
    (u) => !u.profile_missing && normalizeRole(u.role) === 'operator'
  ).length;
  const viewerOrMissingCount = managedUsers.filter((u) => {
    const r = normalizeRole(u.role);
    return u.profile_missing || r === 'viewer' || (r !== 'admin' && r !== 'operator');
  }).length;

  return (
    <div className="space-y-6">
      {/* Title & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-400" />
              User Access Management
            </h1>
            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded">
              EDGE FUNCTION: manage-users
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Live directory combining Supabase Auth identities with authoritative{' '}
            <code className="text-teal-400 font-mono">public.profiles</code> roles.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setSuccessNotice(null);
              refreshManagedUsers();
            }}
            disabled={usersLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh user directory from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin text-teal-400' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleOpenInviteModal}
            disabled={usersSessionExpired || usersPermissionDenied}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite User
          </button>
        </div>
      </div>

      {/* Session Expired or Permission Error Banner */}
      {usersError && (
        <div className="p-4 bg-rose-950/70 border border-rose-800/80 rounded-xl text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">
                {usersSessionExpired
                  ? 'Authentication Session Expired'
                  : usersPermissionDenied
                  ? 'Administrator Authorization Denied'
                  : 'Failed to Load User Directory'}
              </span>
              <span className="text-rose-200/90 mt-0.5 block">{usersError}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {usersSessionExpired ? (
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign In Again
              </button>
            ) : (
              <button
                onClick={refreshManagedUsers}
                className="px-3 py-1.5 bg-rose-900/70 hover:bg-rose-800 text-rose-100 rounded-lg text-xs font-semibold transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Invitation Success Notification */}
      {successNotice && (
        <div className="p-3.5 bg-teal-950/90 border border-teal-500/50 text-teal-200 text-xs rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-teal-400 hover:text-white p-1"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Architecture & Security Boundary Notice */}
      <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-slate-300 text-[11px] leading-relaxed">
          <span className="font-bold text-white block text-xs">
            Server-Verified Email Invitation Architecture
          </span>
          <p>
            User directory queries and account invitations are executed server-side via the{' '}
            <code className="font-mono text-teal-300">manage-users</code> Supabase Edge Function using JWT verification
            and <code className="font-mono text-teal-300">public.profiles</code> admin authorization. Invitations are
            restricted to <code className="font-mono text-slate-200">admin</code> and{' '}
            <code className="font-mono text-slate-200">operator</code> roles; invited users establish their own
            password via email link. Role editing and account suspension are not enabled in this stage.
          </p>
        </div>
      </div>

      {/* Overview Stat Strip (Strictly real values from manage-users) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">
              Total Users
            </span>
            <Database className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-2xl font-bold font-mono text-white mt-1 block tabular-nums">
            {usersLoading ? '—' : managedUsers.length}
          </span>
          <span className="text-xs text-teal-400 mt-1 block">
            Supabase Auth + <code className="text-slate-400 font-mono">profiles</code>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">
            Administrators
          </span>
          <span className="text-2xl font-bold font-mono text-teal-300 mt-1 block tabular-nums">
            {usersLoading ? '—' : adminCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">Database role: admin</span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">
            Authorized Users
          </span>
          <span className="text-2xl font-bold font-mono text-cyan-300 mt-1 block tabular-nums">
            {usersLoading ? '—' : operatorCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">Database role: operator</span>
        </div>

        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">
              Restricted / Missing
            </span>
            <Eye className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-2xl font-bold font-mono text-amber-300 mt-1 block tabular-nums">
            {usersLoading ? '—' : viewerOrMissingCount}
          </span>
          <span className="text-xs text-amber-400/80 mt-1 block">Viewer role or missing profile</span>
        </div>
      </div>

      {/* Users Directory Table */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-white text-sm">Registered & Invited Users Directory</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Retrieved from Supabase Auth and <code className="text-teal-400 font-mono">public.profiles</code>.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {usersLoading ? 'Querying directory...' : `${managedUsers.length} Account(s) Returned`}
          </span>
        </div>

        {usersLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-10 bg-slate-800/70 rounded-lg" />
            <div className="h-10 bg-slate-800/50 rounded-lg" />
            <div className="h-10 bg-slate-800/40 rounded-lg" />
          </div>
        ) : managedUsers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300">
              {usersError ? 'Directory Unavailable' : 'No Users Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {usersError
                ? 'Resolve the connection or permission issue above and click Refresh to reload the directory.'
                : 'No user accounts were returned from Supabase Auth and public.profiles.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-mono bg-[#0c1424]">
                  <th className="py-2.5 px-4 font-sans">User & Email</th>
                  <th className="py-2.5 px-4">Database Role</th>
                  <th className="py-2.5 px-4">App Access</th>
                  <th className="py-2.5 px-4">User ID (UUID)</th>
                  <th className="py-2.5 px-4">Created</th>
                  <th className="py-2.5 px-4 text-right">Last Sign-In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {managedUsers.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const normalizedRole = normalizeRole(u.role);

                  return (
                    <tr key={u.id} className="hover:bg-[#0c162b] transition-colors">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {u.profile_missing ? (
                            <span className="text-rose-300 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                              Profile Missing
                            </span>
                          ) : (
                            <span>{u.full_name || 'Unnamed Profile'}</span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] text-teal-400 font-mono px-1 rounded bg-teal-950/80 border border-teal-800/60">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {u.email ?? 'No email recorded'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {u.profile_missing || !u.role ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80">
                            MISSING PROFILE
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              normalizedRole === 'admin'
                                ? 'bg-teal-950/80 text-teal-300 border border-teal-800/80'
                                : normalizedRole === 'operator'
                                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                            }`}
                          >
                            {normalizedRole.toUpperCase()}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-sans">
                        {u.profile_missing || !u.role ? (
                          <span className="text-rose-400 text-[11px]">Denied (No profile row)</span>
                        ) : normalizedRole === 'admin' ? (
                          <span className="text-teal-300">Administrator</span>
                        ) : normalizedRole === 'operator' ? (
                          <span className="text-cyan-300">Authorized User</span>
                        ) : (
                          <span className="text-amber-400">Denied (Viewer role)</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]" title={u.id}>
                        {u.id.slice(0, 18)}...
                      </td>

                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {formatTimestamp(u.created_at)}
                      </td>

                      <td className="py-3 px-4 text-right text-[11px]">
                        {u.last_sign_in_at ? (
                          <span className="text-slate-300">{formatTimestamp(u.last_sign_in_at)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" />
                            Pending / Never
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
              <li>Full access to all application modules.</li>
              <li>Platform configuration and settings view.</li>
              <li>Access to this User Access Management console.</li>
              <li>Authorized to invite admin and operator accounts.</li>
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
              <li>Nodes, Fleet Statistics, and Predictive Maintenance.</li>
              <li>Events and Reports modules.</li>
              <li>No access to User Management or Settings.</li>
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
              <li>Cannot be invited through this console.</li>
              <li>Prevents unauthorized exposure of plant telemetry.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#0b1322] border border-slate-700 rounded-xl shadow-2xl overflow-hidden text-slate-200">
            <div className="px-6 py-4 border-b border-slate-800 bg-[#090f1c] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-400" />
                <h2 className="font-bold text-white text-base">Invite MotorGuard User</h2>
              </div>
              <button
                onClick={() => !isInviting && setShowInviteModal(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4 text-xs">
              <p className="text-slate-400 leading-relaxed">
                An invitation email will be sent via Supabase Auth. The recipient will set their own password at{' '}
                <code className="text-teal-400 font-mono text-[11px]">?mode=setup-password</code> before signing in.
              </p>

              {inviteError && (
                <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-300 text-xs flex items-start gap-2">
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{inviteError}</span>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="e.g. Elena Vance"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  disabled={isInviting}
                  className="w-full px-3 py-2 bg-[#070c17] border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Corporate Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="user@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={isInviting}
                    className="w-full pl-9 pr-3 py-2 bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Assigned Database Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InvitableDatabaseRole)}
                  disabled={isInviting}
                  className="w-full px-3 py-2 bg-[#070c17] border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-teal-500"
                >
                  <option value="operator">operator — Authorized User (Operational Access)</option>
                  <option value="admin">admin — Administrator (Full System Access)</option>
                </select>
                <span className="block text-[10px] text-slate-500 mt-1">
                  Role is written server-side to <code className="text-teal-400">public.profiles</code>. The{' '}
                  <code>viewer</code> role is excluded because it has no workspace access.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  disabled={isInviting}
                  className="px-3 py-2 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isInviting ? 'Dispatching Invitation...' : 'Send Email Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
