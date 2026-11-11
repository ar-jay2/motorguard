/**
 * MotorGuard - Authentication & RBAC Authorization Context
 *
 * Implements Supabase auth.getSession() and auth.onAuthStateChange().
 * Handles PKCE / implicit email invitation callbacks and password setup flow.
 * Validates user profiles directly from the existing public.profiles table.
 * Disables insecure client-side user mutations.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types/auth';
import {
  getSupabaseClient,
  isSupabaseReady,
  signInWithSupabase,
  signOutFromSupabase,
  fetchValidatedUserProfile,
  fetchAllUserProfiles,
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
  usersList: UserProfile[];
  refreshUsersList: () => Promise<void>;
  // Disabled unsafe actions with notice
  createUser: (userData: any) => Promise<{ success: boolean; error: string }>;
  toggleUserStatus: (userId: string) => Promise<{ success: boolean; error: string }>;
  changeUserRole: (userId: string, newRole: UserRole) => Promise<{ success: boolean; error: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isSettingPassword, setIsSettingPassword] = useState<boolean>(false);
  const [setupPasswordEmail, setSetupPasswordEmail] = useState<string | null>(null);
  const [loginSuccessNotice, setLoginSuccessNotice] = useState<string | null>(null);

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
      setAuthError(urlState.errorMsg);
      setIsLoading(false);
      return;
    }

    // If URL explicitly indicates setup-password or invite/recovery mode, set state flag immediately
    if (urlState.isSetup) {
      setIsSettingPassword(true);
    }

    // 1. Restore authenticated session via Supabase auth.getSession()
    const restoreSession = async () => {
      try {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session?.user) {
          if (isMounted) {
            setUser(null);
            // If URL had setup-password but no session or code, let onAuthStateChange handle or wait
            if (!urlState.isSetup) {
              setIsLoading(false);
            }
          }
          return;
        }

        const sessionUser = data.session.user;

        // If in setup mode (invitation or recovery), stay on PasswordSetupPage
        if (urlState.isSetup) {
          if (isMounted) {
            setIsSettingPassword(true);
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
          setUser(null);
          setAuthError(err?.message || 'Error restoring authentication session.');
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    // 2. Subscribe to auth.onAuthStateChange() for real-time auth synchronization
    const { data: authListener } = client.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // Handle password recovery event dispatched by Supabase Auth
      if (event === 'PASSWORD_RECOVERY') {
        setIsSettingPassword(true);
        setSetupPasswordEmail(session?.user?.email || null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Check if this signed-in event was triggered by an invitation callback or recovery link
        const currentUrlState = parseUrlAuthParams();
        const isInSetupMode = isSettingPassword || currentUrlState.isSetup;

        if (isInSetupMode) {
          setIsSettingPassword(true);
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
        setUsersList([]);
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Keep profile synced if normal user is authenticated
        if (!isSettingPassword) {
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
  }, []);

  // Fetch users list when admin is authenticated
  const refreshUsersList = async () => {
    if (user && user.role === 'admin') {
      const list = await fetchAllUserProfiles();
      setUsersList(list);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      refreshUsersList();
    }
  }, [user]);

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
    setIsSettingPassword(false);
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
    setIsSettingPassword(false);
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
    setUsersList([]);
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

  // Disabled unsafe client-side mutations:
  // Account creation, role changes, and administration require secure server-side Edge Functions.
  const createUser = async () => {
    return {
      success: false,
      error: 'Client-side account provisioning is disabled. Privileged account creation requires a secure Supabase Edge Function (manage-users) utilizing the service role key.',
    };
  };

  const toggleUserStatus = async () => {
    return {
      success: false,
      error: 'Client-side activation toggle is disabled. Modification requires the secure Supabase Edge Function with admin verification.',
    };
  };

  const changeUserRole = async () => {
    return {
      success: false,
      error: 'Client-side role mutation is disabled. Role assignment requires the secure Supabase Edge Function.',
    };
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
        usersList,
        refreshUsersList,
        createUser,
        toggleUserStatus,
        changeUserRole,
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
