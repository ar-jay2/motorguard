export type UserRole = 'admin' | 'authorized_user';

export type DatabaseRole = 'admin' | 'operator' | 'viewer';

export type InvitableDatabaseRole = 'admin' | 'operator';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole; // Mapped application role ('admin' or 'authorized_user')
  dbRole: DatabaseRole; // Raw database role from public.profiles
  createdAt: string;
}

export interface ManagedUserRecord {
  id: string;
  email: string | null;
  full_name: string | null;
  role: DatabaseRole | string | null;
  profile_missing: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface InviteUserInput {
  full_name: string;
  email: string;
  role: InvitableDatabaseRole;
}

export interface ManageUsersResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  sessionExpired?: boolean;
  permissionDenied?: boolean;
}

export interface AuthState {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
