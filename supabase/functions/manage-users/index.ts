import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PRODUCTION_ORIGIN = 'https://motorguard-sigma.vercel.app';
const INVITE_REDIRECT_URL = 'https://motorguard-sigma.vercel.app/?mode=setup-password';

const ALLOWED_ORIGINS = new Set<string>([
  PRODUCTION_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const AI_STUDIO_PREVIEW_ORIGIN_REGEX = /^https:\/\/ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type InvitableRole = 'admin' | 'operator';

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
}

interface ManagedUserResponse {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  profile_missing: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || AI_STUDIO_PREVIEW_ORIGIN_REGEX.test(origin);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    headers['Access-Control-Allow-Origin'] = PRODUCTION_ORIGIN;
  }

  return headers;
}

function jsonResponse(
  req: Request,
  status: number,
  payload: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

async function fetchAllAuthUsers(
  adminClient: SupabaseClient
): Promise<{ users: User[]; error: string | null }> {
  const allUsers: User[] = [];
  let page = 1;
  const perPage = 200;
  const maxPages = 100;

  while (page <= maxPages) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error('[manage-users] Failed to list Auth users on page', page, error.message);
      return { users: [], error: 'Failed to retrieve user directory from authentication service.' };
    }

    const batch = data?.users ?? [];
    allUsers.push(...batch);

    if (batch.length < perPage || (data && 'nextPage' in data && !data.nextPage)) {
      return { users: allUsers, error: null };
    }

    page += 1;
  }

  console.error('[manage-users] Auth user directory exceeded pagination limit of', maxPages, 'pages.');
  return {
    users: [],
    error: 'User directory pagination limit exceeded. Please contact the system administrator.',
  };
}

async function fetchAllProfiles(
  adminClient: SupabaseClient
): Promise<{ profiles: ProfileRow[]; error: string | null }> {
  const allProfiles: ProfileRow[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await adminClient
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('[manage-users] Failed to query public.profiles:', error.message);
      return { profiles: [], error: 'Failed to retrieve user profiles.' };
    }

    const rows = (data ?? []) as ProfileRow[];
    allProfiles.push(...rows);

    if (rows.length < batchSize) {
      break;
    }

    from += batchSize;
  }

  return { profiles: allProfiles, error: null };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }

  // 2. Restrict HTTP methods to POST
  if (req.method !== 'POST') {
    return jsonResponse(req, 405, {
      error: 'Method not allowed. Only POST requests are supported.',
    });
  }

  // 3. Read server-only environment secrets
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[manage-users] Missing required Supabase server environment variables.');
    return jsonResponse(req, 500, {
      error: 'Server configuration error. Administrative service is unavailable.',
    });
  }

  // 4. Require and validate Authorization Bearer token
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(req, 401, {
      error: 'Missing or malformed Authorization header.',
    });
  }

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    return jsonResponse(req, 401, {
      error: 'Authentication token is empty.',
    });
  }

  // Server-side admin client (never exposed to browser)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // 5. Authenticate caller via Supabase Auth getUser(token)
  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
  const caller = authData?.user;

  if (authError || !caller?.id) {
    return jsonResponse(req, 401, {
      error: 'Invalid or expired authentication session. Please sign in again.',
    });
  }

  // 6. Verify caller's authoritative role from public.profiles (never trust user_metadata or request body)
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', caller.id)
    .maybeSingle();

  if (callerProfileError) {
    console.error('[manage-users] Failed verifying caller profile for user:', caller.id, callerProfileError.message);
    return jsonResponse(req, 500, {
      error: 'Unable to verify administrator permissions.',
    });
  }

  if (!callerProfile) {
    return jsonResponse(req, 403, {
      error: 'Forbidden: Caller profile does not exist in public.profiles.',
    });
  }

  const callerRole = String(callerProfile.role ?? '').trim().toLowerCase();
  if (callerRole !== 'admin') {
    return jsonResponse(req, 403, {
      error: 'Forbidden: Administrator privileges are required for this operation.',
    });
  }

  // 7. Parse and validate JSON request body
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse(req, 400, { error: 'Request body must be a JSON object.' });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(req, 400, { error: 'Invalid JSON request body.' });
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';

  // ---------------------------------------------------------------------------
  // ACTION: list_users
  // ---------------------------------------------------------------------------
  if (action === 'list_users') {
    const [{ users: authUsers, error: authListErr }, { profiles, error: profilesErr }] =
      await Promise.all([fetchAllAuthUsers(adminClient), fetchAllProfiles(adminClient)]);

    if (authListErr) {
      return jsonResponse(req, 500, { error: authListErr });
    }
    if (profilesErr) {
      return jsonResponse(req, 500, { error: profilesErr });
    }

    const profileMap = new Map<string, ProfileRow>();
    for (const profile of profiles) {
      profileMap.set(profile.id, profile);
    }

    const combinedUsers: ManagedUserResponse[] = authUsers.map((authUser) => {
      const profile = profileMap.get(authUser.id);
      const hasProfile = Boolean(profile);

      return {
        id: authUser.id,
        email: authUser.email ?? null,
        full_name: profile?.full_name ?? null,
        role: profile?.role ?? null,
        profile_missing: !hasProfile,
        created_at: profile?.created_at ?? authUser.created_at ?? null,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
      };
    });

    // Sort newest first by created_at
    combinedUsers.sort((a, b) => {
      const timeA = a.created_at ? Date.parse(a.created_at) : 0;
      const timeB = b.created_at ? Date.parse(b.created_at) : 0;
      return timeB - timeA;
    });

    return jsonResponse(req, 200, {
      users: combinedUsers,
      total: combinedUsers.length,
    });
  }

  // ---------------------------------------------------------------------------
  // ACTION: invite_user
  // ---------------------------------------------------------------------------
  if (action === 'invite_user') {
    const rawFullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawRole = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';

    // Validate full_name
    if (rawFullName.length < 2 || rawFullName.length > 120) {
      return jsonResponse(req, 400, {
        error: 'Full name must be between 2 and 120 characters.',
      });
    }

    if (/[\r\n\t\0]/.test(rawFullName)) {
      return jsonResponse(req, 400, {
        error: 'Full name contains invalid control characters.',
      });
    }

    // Validate email
    if (!rawEmail || rawEmail.length > 254 || !EMAIL_REGEX.test(rawEmail)) {
      return jsonResponse(req, 400, {
        error: 'Please provide a valid email address.',
      });
    }

    // Validate role strictly (only admin and operator are permitted for workspace invitations)
    if (rawRole === 'viewer') {
      return jsonResponse(req, 400, {
        error: "Inviting users with the 'viewer' role is disabled because viewer accounts do not have workspace access.",
      });
    }

    if (rawRole !== 'admin' && rawRole !== 'operator') {
      return jsonResponse(req, 400, {
        error: "Invalid role. Allowed invitation roles are 'admin' and 'operator'.",
      });
    }

    const validatedRole: InvitableRole = rawRole;

    // Check for duplicate registered or already-invited email
    const { users: existingAuthUsers, error: checkErr } = await fetchAllAuthUsers(adminClient);
    if (checkErr) {
      return jsonResponse(req, 500, { error: checkErr });
    }

    const duplicateUser = existingAuthUsers.find(
      (u) => (u.email ?? '').trim().toLowerCase() === rawEmail
    );

    if (duplicateUser) {
      return jsonResponse(req, 409, {
        error: 'A user account or pending invitation already exists for this email address.',
      });
    }

    // Dispatch email invitation via Supabase Admin Auth
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      rawEmail,
      {
        redirectTo: INVITE_REDIRECT_URL,
        data: {
          full_name: rawFullName,
        },
      }
    );

    if (inviteError || !inviteData?.user?.id) {
      console.error('[manage-users] inviteUserByEmail failed:', inviteError?.message);
      const errMsg = inviteError?.message?.toLowerCase() ?? '';
      if (errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists')) {
        return jsonResponse(req, 409, {
          error: 'A user account or pending invitation already exists for this email address.',
        });
      }
      if (errMsg.includes('rate limit')) {
        return jsonResponse(req, 429, {
          error: 'Email invitation rate limit exceeded. Please wait before sending another invitation.',
        });
      }
      return jsonResponse(req, 400, {
        error: 'Failed to dispatch invitation email. Please verify email address and Supabase SMTP configuration.',
      });
    }

    const invitedUser = inviteData.user;

    // Create/upsert the authoritative profile record in public.profiles
    const { data: upsertedProfile, error: profileInsertError } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: invitedUser.id,
          full_name: rawFullName,
          role: validatedRole,
        },
        { onConflict: 'id' }
      )
      .select('id, full_name, role, created_at')
      .single();

    if (profileInsertError || !upsertedProfile) {
      console.error(
        '[manage-users] Profile creation failed for invited user:',
        invitedUser.id,
        profileInsertError?.message
      );

      // Roll back the newly created Auth user to avoid an orphaned account without a profile
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(invitedUser.id);
      if (rollbackError) {
        console.error(
          '[manage-users] CRITICAL: Rollback deleteUser failed for orphaned Auth user:',
          invitedUser.id,
          rollbackError.message
        );
        return jsonResponse(req, 500, {
          error:
            'Failed to create user profile AND failed to roll back the newly created Auth user. Administrator cleanup in Supabase Auth is required.',
        });
      }

      return jsonResponse(req, 500, {
        error: 'Failed to create authoritative user profile. The invitation was rolled back cleanly.',
      });
    }

    console.info(
      `[manage-users] Admin ${caller.id} invited user ${invitedUser.id} with role '${validatedRole}'.`
    );

    const createdRecord: ManagedUserResponse = {
      id: upsertedProfile.id,
      email: invitedUser.email ?? rawEmail,
      full_name: upsertedProfile.full_name,
      role: upsertedProfile.role,
      profile_missing: false,
      created_at: upsertedProfile.created_at ?? invitedUser.created_at ?? null,
      last_sign_in_at: invitedUser.last_sign_in_at ?? null,
    };

    return jsonResponse(req, 200, {
      message: 'Invitation dispatched and authoritative profile created.',
      user: createdRecord,
    });
  }

  // ---------------------------------------------------------------------------
  // Unsupported action
  // ---------------------------------------------------------------------------
  return jsonResponse(req, 400, {
    error: `Unsupported action '${action || 'none'}'. Supported actions are 'list_users' and 'invite_user'.`,
  });
});
