/**
 * MotorGuard - Supabase Client & Authentication Foundation
 *
 * Exclusively uses real Supabase Authentication and the existing PostgreSQL public.profiles table.
 * No mock users, no local demo authentication bypass, and zero service role key exposure.
 * Administrative user directory and invitation operations are routed through the secure
 * 'manage-users' Supabase Edge Function.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  UserProfile,
  UserRole,
  DatabaseRole,
  ManagedUserRecord,
  InviteUserInput,
  ManageUsersResult,
} from '../types/auth';
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

    // Resolve user email strictly from authenticated Supabase Auth user
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
      email: resolvedEmail,
      fullName: data.full_name || resolvedEmail || 'MotorGuard User',
      role: appRole,
      dbRole: dbRole,
      createdAt: data.created_at || '',
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
 * Updates the currently authenticated user's password using Supabase Auth.
 * Used during the email invitation workflow and password recovery flow.
 */
export async function updateUserPassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase client is not configured.',
    };
  }

  try {
    const { error } = await client.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to establish user password.',
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error updating user password.',
    };
  }
}

/**
 * Returns the canonical invitation redirect URL for MotorGuard.
 * Uses the production domain: https://motorguard-sigma.vercel.app/?mode=setup-password
 */
export function getInvitationRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'motorguard-sigma.vercel.app') {
    return 'https://motorguard-sigma.vercel.app/?mode=setup-password';
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/?mode=setup-password`;
  }
  return 'https://motorguard-sigma.vercel.app/?mode=setup-password';
}

/**
 * Helper to invoke the secure 'manage-users' Supabase Edge Function
 * with session validation and structured error parsing.
 */
async function invokeManageUsers<T>(
  payload: Record<string, unknown>
): Promise<ManageUsersResult<T>> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase client is not configured.',
    };
  }

  // Ensure an active session with access token exists before calling the Edge Function
  const { data: sessionData, error: sessionErr } = await client.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (sessionErr || !accessToken) {
    return {
      success: false,
      status: 401,
      sessionExpired: true,
      error: 'Your authentication session has expired. Please sign in again.',
    };
  }

  try {
    const { data, error } = await client.functions.invoke<T>('manage-users', {
      body: payload,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      let status: number | undefined;
      let serverMessage = error.message || 'Edge Function request failed.';

      // Extract HTTP status and JSON error body from FunctionsHttpError
      const context = (error as { context?: Response }).context;
      if (context && typeof context.status === 'number') {
        status = context.status;
        try {
          const readableContext = typeof context.clone === 'function' ? context.clone() : context;
          const parsedBody = await readableContext.json();
          if (parsedBody && typeof parsedBody.error === 'string' && parsedBody.error.trim()) {
            serverMessage = parsedBody.error;
          }
        } catch {
          // Response body was not JSON; retain fallback message
        }
      }

      if (status === 401) {
        return {
          success: false,
          status: 401,
          sessionExpired: true,
          error: serverMessage || 'Session expired or unauthorized. Please sign in again.',
        };
      }

      if (status === 403) {
        return {
          success: false,
          status: 403,
          permissionDenied: true,
          error: serverMessage || 'Permission denied: Administrator privileges required.',
        };
      }

      // Handle network / undeployed function errors cleanly
      if (
        serverMessage.includes('Failed to send a request to the Edge Function') ||
        serverMessage.includes('Failed to fetch')
      ) {
        return {
          success: false,
          status,
          error:
            'Unable to reach the manage-users Edge Function. Verify that the function is deployed to Supabase and CORS is configured.',
        };
      }

      return {
        success: false,
        status,
        error: serverMessage,
      };
    }

    return {
      success: true,
      status: 200,
      data: data as T,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error invoking the User Management Edge Function.',
    };
  }
}

/**
 * Fetches the full user directory via the 'manage-users' Edge Function (action: 'list_users').
 * Combines Supabase Auth user identity with authoritative public.profiles records on the server.
 */
export async function fetchManagedUsers(): Promise<
  ManageUsersResult<{ users: ManagedUserRecord[]; total: number }>
> {
  return invokeManageUsers<{ users: ManagedUserRecord[]; total: number }>({
    action: 'list_users',
  });
}

/**
 * Invites a new user via email using the 'manage-users' Edge Function (action: 'invite_user').
 * Strictly validates inputs on the server and creates the authoritative public.profiles row.
 */
export async function inviteManagedUser(
  input: InviteUserInput
): Promise<ManageUsersResult<{ message: string; user: ManagedUserRecord }>> {
  return invokeManageUsers<{ message: string; user: ManagedUserRecord }>({
    action: 'invite_user',
    full_name: input.full_name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
  });
}
