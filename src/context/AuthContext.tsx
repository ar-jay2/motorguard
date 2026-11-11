/**
 * MotorGuard - Authentication & RBAC Authorization Context
 *
 * Implements Supabase auth.getSession() and auth.onAuthStateChange().
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
} from '../services/supabaseClient';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  authError: string | null;
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
  const isConfigured = isSupabaseReady();

  // Load initial session and listen for auth state changes from Supabase
  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Restore authenticated session via Supabase auth.getSession()
    const restoreSession = async () => {
      try {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session?.user) {
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }

        // Validate user profile from public.profiles using session user ID
        const { profile, error: profileErr } = await fetchValidatedUserProfile(
          data.session.user.id,
          data.session.user.email
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

      if (event === 'SIGNED_IN' && session?.user) {
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
        // Keep profile synced if needed
        const { profile } = await fetchValidatedUserProfile(session.user.id, session.user.email);
        if (profile) {
          setUser(profile);
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

  // Login handler
  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setAuthError(null);

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
