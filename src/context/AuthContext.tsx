/**
 * MotorGuard - Authentication & RBAC Authorization Context
 *
 * Implements Supabase auth.getSession() and auth.onAuthStateChange().
 * Handles PKCE / implicit email invitation callbacks and password setup flow.
 * Validates user profiles directly from the existing public.profiles table.
 * Disables insecure client-side user mutations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  UserProfile,
  UserRole,
  ManagedUserRecord,
  InviteUserInput,
  ManageUsersResult,
} from '../types/auth';
import {
  getSupabaseClient,
  isSupabaseReady,
  signInWithSupabase,
  signOutFromSupabase,
  fetchValidatedUserProfile,
  fetchManagedUsers,
  inviteManagedUser,
  updateUserPassword,
} from '../services/supabaseClient';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  authError: string | null;
  // Invitation & Password Setup state
  isSettingPassword: boolean;
  setupPasswordEmail: string | null;
  loginSuccessNotice: string | null;
  setLoginSuccessNotice: (msg: string | null) => void;
  completePasswordSetup: (password: string) => Promise<{ success: boolean; error?: string }>;
  cancelPasswordSetup: () => Promise<void>;
  // Standard auth methods
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  canAccessModule: (moduleName: string) => boolean;
  hasAdminPrivileges: () => boolean;
  // Admin User Management via Edge Function ('manage-users')
  managedUsers: ManagedUserRecord[];
  usersLoading: boolean;
  usersError: string | null;
  usersSessionExpired: boolean;
  usersPermissionDenied: boolean;
  refreshManagedUsers: () => Promise<void>;
  inviteUser: (
    input: InviteUserInput
  ) => Promise<ManageUsersResult<{ message: string; user: ManagedUserRecord }>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Admin User Management state (populated exclusively from manage-users Edge Function)
  const [managedUsers, setManagedUsers] = useState<ManagedUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSessionExpired, setUsersSessionExpired] = useState<boolean>(false);
  const [usersPermissionDenied, setUsersPermissionDenied] = useState<boolean>(false);

  // Password setup / invitation state
  const [isSettingPassword, setIsSettingPassword] = useState<boolean>(false);
  const isSettingPasswordRef = useRef<boolean>(false);
  const [setupPasswordEmail, setSetupPasswordEmail] = useState<string | null>(null);
  const [loginSuccessNotice, setLoginSuccessNotice] = useState<string | null>(null);

  const updateSetupPasswordMode = useCallback((active: boolean) => {
    isSettingPasswordRef.current = active;
    setIsSettingPassword(active);
  }, []);

  const isConfigured = isSupabaseReady();

  // Helper to inspect current URL for Supabase Auth errors or invitation mode
  const parseUrlAuthParams = () => {
    if (typeof window === 'undefined') {
      return { isSetup: false, hasError: false, errorMsg: null };
    }

    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

    // 1. Check for error indicators (e.g. otp_expired, access_denied)
    const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
    const errorDesc = searchParams.get('error_description') || hashParams.get('error_description');
    const rawError = searchParams.get('error') || hashParams.get('error');

    if (errorCode === 'otp_expired') {
      // Clean up invalid URL parameters
      window.history.replaceState(null, '', window.location.pathname);
      return {
        isSetup: false,
        hasError: true,
        errorMsg:
          'The invitation or password reset link has expired or has already been used. Please request a new invitation from your plant administrator.',
      };
    }

    if (rawError || errorCode) {
      window.history.replaceState(null, '', window.location.pathname);
      const cleanMsg = errorDesc
        ? decodeURIComponent(errorDesc).replace(/\+/g, ' ')
        : 'The invitation link is invalid or has expired.';
      return {
        isSetup: false,
        hasError: true,
        errorMsg: cleanMsg,
      };
    }

    // 2. Check for invitation / recovery triggers
    const mode = searchParams.get('mode');
    const type = searchParams.get('type') || hashParams.get('type');
    const isSetup = mode === 'setup-password' || type === 'invite' || type === 'recovery';

    return {
      isSetup,
      hasError: false,
      errorMsg: null,
    };
  };

  // Load initial session and listen for auth state changes from Supabase
  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // First, check URL for errors or invite/recovery parameters
    const urlState = parseUrlAuthParams();
    if (urlState.hasError) {
      updateSetupPasswordMode(false);
      setAuthError(urlState.errorMsg);
      setIsLoading(false);
    } else if (urlState.isSetup) {
      // If URL explicitly indicates setup-password or invite/recovery mode, set state flag immediately
      updateSetupPasswordMode(true);
    }

    // 1. Restore authenticated session via Supabase auth.getSession()
    const restoreSession = async () => {
      try {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session?.user) {
          if (isMounted) {
            setUser(null);
            if (urlState.isSetup) {
              updateSetupPasswordMode(false);
              setSetupPasswordEmail(null);
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', window.location.pathname);
              }
              setAuthError(
                error?.message ||
                  'The invitation or password setup link is invalid, expired, or missing a session. Please request a new invitation from your plant administrator.'
              );
            }
            setIsLoading(false);
          }
          return;
        }

        const sessionUser = data.session.user;

        // If in setup mode (invitation or recovery), stay on PasswordSetupPage
        if (urlState.isSetup || isSettingPasswordRef.current) {
          if (isMounted) {
            updateSetupPasswordMode(true);
            setSetupPasswordEmail(sessionUser.email || null);
            setIsLoading(false);
          }
          return;
        }

        // Standard session: Validate user profile from public.profiles
        const { profile, error: profileErr } = await fetchValidatedUserProfile(
          sessionUser.id,
          sessionUser.email
        );

        if (isMounted) {
          if (profile) {
            setUser(profile);
            setAuthError(null);
          } else {
            // Profile missing, viewer role, or unsupported: revoke session
            await client.auth.signOut();
            setUser(null);
            setAuthError(profileErr || 'Access denied or profile not found in public.profiles.');
          }
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          updateSetupPasswordMode(false);
          setUser(null);
          setAuthError(err?.message || 'Error restoring authentication session.');
          setIsLoading(false);
        }
      }
    };

    if (!urlState.hasError) {
      restoreSession();
    }

    // 2. Subscribe to auth.onAuthStateChange() for real-time auth synchronization
    const { data: authListener } = client.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // Handle password recovery event dispatched by Supabase Auth
      if (event === 'PASSWORD_RECOVERY') {
        updateSetupPasswordMode(true);
        setSetupPasswordEmail(session?.user?.email || null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Check if this signed-in event was triggered by an invitation callback or recovery link
        const currentUrlState = parseUrlAuthParams();
        const isInSetupMode = isSettingPasswordRef.current || currentUrlState.isSetup;

        if (isInSetupMode) {
          updateSetupPasswordMode(true);
          setSetupPasswordEmail(session.user.email || null);
          setUser(null);
          setIsLoading(false);
          return;
        }

        // Standard user login: validate profile
        setIsLoading(true);
        const { profile, error: profileErr } = await fetchValidatedUserProfile(
          session.user.id,
          session.user.email
        );

        if (profile) {
          setUser(profile);
          setAuthError(null);
        } else {
          await client.auth.signOut();
          setUser(null);
          setAuthError(profileErr || 'Account not found or restricted in public.profiles.');
        }
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setManagedUsers([]);
        setUsersError(null);
        setUsersSessionExpired(false);
        setUsersPermissionDenied(false);
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Keep profile synced if normal user is authenticated
        if (!isSettingPasswordRef.current) {
          const { profile } = await fetchValidatedUserProfile(session.user.id, session.user.email);
          if (profile) {
            setUser(profile);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [updateSetupPasswordMode]);

  // Load real user directory from the 'manage-users' Edge Function
  const refreshManagedUsers = useCallback(async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setUsersLoading(true);
    setUsersError(null);
    setUsersSessionExpired(false);
    setUsersPermissionDenied(false);

    const res = await fetchManagedUsers();

    if (res.success && res.data) {
      setManagedUsers(res.data.users || []);
    } else {
      setUsersError(res.error || 'Failed to load user directory.');
      if (res.sessionExpired) {
        setUsersSessionExpired(true);
      }
      if (res.permissionDenied) {
        setUsersPermissionDenied(true);
      }
    }

    setUsersLoading(false);
  }, [user]);

  // Invite user via the 'manage-users' Edge Function and refresh directory upon success
  const inviteUser = useCallback(
    async (
      input: InviteUserInput
    ): Promise<ManageUsersResult<{ message: string; user: ManagedUserRecord }>> => {
      const res = await inviteManagedUser(input);

      if (res.sessionExpired) {
        setUsersSessionExpired(true);
      }
      if (res.permissionDenied) {
        setUsersPermissionDenied(true);
      }

      if (res.success) {
        await refreshManagedUsers();
      }

      return res;
    },
    [refreshManagedUsers]
  );

  // Complete password setup workflow: save password via Supabase Auth, sign out, and return to login
  const completePasswordSetup = async (
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const result = await updateUserPassword(password);

    if (!result.success) {
      setIsLoading(false);
      return result;
    }

    // Sign out the temporary invitation session to require explicit login with new credentials
    await signOutFromSupabase();
    setUser(null);
    updateSetupPasswordMode(false);
    setSetupPasswordEmail(null);
    setIsLoading(false);

    // Clean up invitation callback URL query string and hash fragments
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    setLoginSuccessNotice(
      'Your password has been established successfully. Please sign in with your corporate email and new password.'
    );

    return { success: true };
  };

  // Cancel password setup: clear state and return to login screen
  const cancelPasswordSetup = async () => {
    setIsLoading(true);
    await signOutFromSupabase();
    setUser(null);
    updateSetupPasswordMode(false);
    setSetupPasswordEmail(null);
    setIsLoading(false);

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // Login handler
  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setAuthError(null);
    setLoginSuccessNotice(null);

    const result = await signInWithSupabase(email, pass);
    setIsLoading(false);

    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }

    const err = result.error || 'Authentication failed.';
    setAuthError(err);
    return { success: false, error: err };
  };

  // Logout handler
  const logout = async () => {
    setIsLoading(true);
    await signOutFromSupabase();
    setUser(null);
    setManagedUsers([]);
    setUsersError(null);
    setUsersSessionExpired(false);
    setUsersPermissionDenied(false);
    setAuthError(null);
    setLoginSuccessNotice(null);
    setIsLoading(false);
  };

  // RBAC Permission checks based strictly on the database role
  const canAccessModule = (moduleName: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    // Authorized User ('operator') allowed modules
    const authorizedUserAllowed = [
      'Dashboard',
      'Plant Map',
      'Monitoring',
      'Nodes',
      'Statistics',
      'Predictive Maintenance',
      'Events',
      'Reports',
    ];

    return authorizedUserAllowed.includes(moduleName);
  };

  const hasAdminPrivileges = (): boolean => {
    return Boolean(user && user.role === 'admin');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: Boolean(user),
        isLoading,
        isConfigured,
        authError,
        isSettingPassword,
        setupPasswordEmail,
        loginSuccessNotice,
        setLoginSuccessNotice,
        completePasswordSetup,
        cancelPasswordSetup,
        login,
        logout,
        canAccessModule,
        hasAdminPrivileges,
        managedUsers,
        usersLoading,
        usersError,
        usersSessionExpired,
        usersPermissionDenied,
        refreshManagedUsers,
        inviteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
