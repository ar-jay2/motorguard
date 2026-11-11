export type UserRole = 'admin' | 'authorized_user';

export type DatabaseRole = 'admin' | 'operator' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole; // Mapped application role ('admin' or 'authorized_user')
  dbRole: DatabaseRole; // Raw database role from public.profiles
  createdAt: string;
  jobTitle?: string;
  facility?: string;
}

export interface AuthState {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
