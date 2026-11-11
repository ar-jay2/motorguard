/**
 * MotorGuard - Supabase Client & Authentication Foundation
 *
 * Exclusively uses real Supabase Authentication and the existing PostgreSQL public.profiles table.
 * No mock users, no local demo authentication bypass, and zero service role key exposure.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserRole, DatabaseRole } from '../types/auth';
import { getSupabaseConfig } from './supabase';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Validates and initializes the Supabase client directly from environment variables.
 * Never uses masked keys or service role keys.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getSupabaseConfig();
  const url = config.url?.trim();
  const anonKey = config.anonKey?.trim();

  // Validate that both URL and key exist and are valid non-masked strings
  if (!url || !anonKey || anonKey.includes('••••')) {
    return null;
  }

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function isSupabaseReady(): boolean {
  return getSupabaseClient() !== null;
}

/**
 * Retrieves and validates the user profile from the EXISTING public.profiles table
 * using the authenticated Supabase user ID (auth.uid()).
 *
 * Database table schema:
 * - id (UUID, PK -> auth.users.id)
 * - full_name (text)
 * - role (text: 'admin', 'operator', 'viewer')
 * - created_at (timestamptz)
 *
 * Role mapping rules:
 * - 'admin'    -> Website role 'admin' (full access)
 * - 'operator' -> Website role 'authorized_user' (operational monitoring, events, reports)
 * - 'viewer'   -> Restricted read-only role. Denies workspace access with a clear message.
 * - Missing/unrecognized -> Denies workspace access and triggers sign out.
 */
export async function fetchValidatedUserProfile(
  userId: string,
  userEmail?: string
): Promise<{ profile: UserProfile | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { profile: null, error: 'Supabase client is not configured.' };
  }

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return {
        profile: null,
        error: `Database error querying public.profiles: ${error.message}`,
      };
    }

    if (!data) {
      return {
        profile: null,
        error: 'User profile not found in public.profiles. An administrator must provision your profile before access is granted.',
      };
    }

    const rawRole = (data.role || '').toLowerCase().trim();

    // Enforce viewer role restriction: MotorGuard requires operator or admin access
    if (rawRole === 'viewer') {
      return {
        profile: null,
        error: "Access Denied: Your account has the 'viewer' role in public.profiles. MotorGuard requires an 'operator' or 'admin' account for operational telemetry and safety controls. Please request an account upgrade from your plant administrator.",
      };
    }

    let appRole: UserRole;
    let dbRole: DatabaseRole;

    if (rawRole === 'admin') {
      appRole = 'admin';
      dbRole = 'admin';
    } else if (rawRole === 'operator') {
      appRole = 'authorized_user';
      dbRole = 'operator';
    } else {
      return {
        profile: null,
        error: `Access Denied: Unrecognized role '${data.role}' in public.profiles. Expected 'admin', 'operator', or 'viewer'.`,
      };
    }

    // Resolve user email
    let resolvedEmail = userEmail || '';
    if (!resolvedEmail) {
      try {
        const { data: authUser } = await client.auth.getUser();
        resolvedEmail = authUser.user?.email || '';
      } catch {
        // non-blocking
      }
    }

    const profile: UserProfile = {
      id: data.id,
      email: resolvedEmail || `${userId.slice(0, 8)}@motorguard.internal`,
      fullName: data.full_name || resolvedEmail.split('@')[0] || 'MotorGuard User',
      role: appRole,
      dbRole: dbRole,
      createdAt: data.created_at || new Date().toISOString(),
      jobTitle: dbRole === 'admin' ? 'Plant System Administrator' : 'Lead Reliability Operator',
      facility: 'North Refining Complex #4',
    };

    return { profile };
  } catch (err: any) {
    return {
      profile: null,
      error: err?.message || 'Database error while retrieving user profile.',
    };
  }
}

export interface AuthResponse {
  success: boolean;
  user?: UserProfile;
  error?: string;
}

/**
 * Signs in via Supabase Auth using email and password, then validates profile in public.profiles.
 * Never grants access through local demo credentials.
 */
export async function signInWithSupabase(email: string, pass: string): Promise<AuthResponse> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    });

    if (error || !data.user) {
      return {
        success: false,
        error: error?.message || 'Invalid login credentials.',
      };
    }

    // Retrieve and validate database profile from public.profiles
    const { profile, error: profileError } = await fetchValidatedUserProfile(
      data.user.id,
      data.user.email
    );

    if (profileError || !profile) {
      // Profile is invalid, missing, or viewer — immediately revoke Supabase auth session
      await client.auth.signOut();
      return {
        success: false,
        error: profileError || 'Access denied: Profile does not exist in public.profiles.',
      };
    }

    return {
      success: true,
      user: profile,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error during authentication.',
    };
  }
}

/**
 * Signs out via Supabase Auth.
 */
export async function signOutFromSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (err) {
      console.error('Error during Supabase signOut:', err);
    }
  }
}

/**
 * Sends password reset email via Supabase Auth.
 */
export async function resetPasswordForEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch reset email.' };
  }
}

/**
 * Fetches user profiles from public.profiles.
 * In the existing database schema, RLS restricts client queries to auth.uid() = id,
 * so this returns the current user's profile row.
 */
export async function fetchAllUserProfiles(): Promise<UserProfile[]> {
  const client = getSupabaseClient();
  if (!client) {
    return [];
  }

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('Could not query public.profiles:', error?.message);
      return [];
    }

    // Get current auth user email if available
    const { data: authData } = await client.auth.getUser();
    const currentAuthUser = authData.user;

    return data.map((d) => {
      const rawRole = (d.role || '').toLowerCase().trim();
      let appRole: UserRole = 'authorized_user';
      let dbRole: DatabaseRole = 'operator';

      if (rawRole === 'admin') {
        appRole = 'admin';
        dbRole = 'admin';
      } else if (rawRole === 'viewer') {
        appRole = 'authorized_user';
        dbRole = 'viewer';
      }

      const isSelf = currentAuthUser?.id === d.id;
      const email = isSelf && currentAuthUser?.email ? currentAuthUser.email : `${d.id.slice(0, 8)}@motorguard.internal`;

      return {
        id: d.id,
        email: email,
        fullName: d.full_name || 'System User',
        role: appRole,
        dbRole: dbRole,
        createdAt: d.created_at,
        jobTitle: dbRole === 'admin' ? 'Plant Administrator' : dbRole === 'operator' ? 'Reliability Operator' : 'Plant Viewer',
        facility: 'North Refining Complex #4',
      };
    });
  } catch (err) {
    console.error('Error querying public.profiles:', err);
    return [];
  }
}
