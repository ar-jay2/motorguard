/**
 * MotorGuard - Supabase Integration & RLS Authorization Architecture
 *
 * Enforces server-side security via PostgreSQL Row Level Security (RLS)
 * for 'admin' and 'authorized_user' roles.
 */

import { SupabaseConfig } from '../types/motor';

// Direct environment variable retrieval
const envUrl: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL?.trim() || '';
const envKey: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY?.trim() || '';

const LOCAL_STORAGE_KEY = 'motorguard_supabase_config';

/**
 * Returns active Supabase configuration.
 * Environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) take strict precedence
 * and cannot be overridden by localStorage.
 */
export function getSupabaseConfig(): SupabaseConfig {
  // If valid environment variables are defined, strictly use them
  if (envUrl && envKey) {
    return {
      url: envUrl,
      anonKey: envKey,
      isConnected: true,
      syncIntervalSeconds: 30,
      tablesReady: false,
      lastSyncTimestamp: null,
    };
  }

  // Fallback to stored config only if env vars are completely absent
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.url && parsed.anonKey) {
        return {
          url: parsed.url,
          anonKey: parsed.anonKey,
          isConnected: true,
          syncIntervalSeconds: 30,
          tablesReady: false,
          lastSyncTimestamp: null,
        };
      }
    }
  } catch {
    // fallback
  }

  return {
    url: '',
    anonKey: '',
    isConnected: false,
    syncIntervalSeconds: 30,
    tablesReady: false,
    lastSyncTimestamp: null,
  };
}

export function isEnvironmentConfigured(): boolean {
  return Boolean(envUrl && envKey);
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): SupabaseConfig {
  // If valid environment credentials exist, do not allow localStorage to override them
  if (envUrl && envKey) {
    return getSupabaseConfig();
  }

  const current = getSupabaseConfig();
  const updated: SupabaseConfig = {
    ...current,
    ...config,
    isConnected: Boolean((config.url || current.url) && (config.anonKey || current.anonKey)),
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return updated;
}

/**
 * MotorGuard Supabase Database Architecture Reference
 *
 * Reflects the actual database schema in public.profiles:
 * - id (UUID, primary key, references auth.users.id)
 * - full_name (text)
 * - role (text: 'admin', 'operator', 'viewer')
 * - created_at (timestamptz)
 *
 * NOTE: The application reads existing tables and DOES NOT execute DDL or alter database constraints.
 */
export const SUPABASE_SQL_SCHEMA = `-- =========================================================================
-- MotorGuard - Industrial IoT Database Schema Reference
-- Existing Roles: 'admin', 'operator', 'viewer'
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Existing User Profiles Table (public.profiles)
-- -------------------------------------------------------------------------
-- Structure of existing public.profiles table:
--   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   full_name TEXT,
--   role TEXT CHECK (role IN ('admin', 'operator', 'viewer')),
--   created_at TIMESTAMPTZ DEFAULT NOW()

-- RLS on public.profiles:
-- Users can view their own profile (auth.uid() = id)

-- Role Mapping in MotorGuard Web Application:
--   Database role 'admin'    -> Website role 'admin' (full administrative access)
--   Database role 'operator' -> Website role 'authorized_user' (operational monitoring & sign-offs)
--   Database role 'viewer'   -> Restricted read-only role (workspace access denied)

-- -------------------------------------------------------------------------
-- 2. Security Definer Helper Function Reference
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_operator_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'operator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- 5. Motors Table with RLS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.motors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    area_id VARCHAR(50) NOT NULL,
    driven_equipment VARCHAR(255),
    rated_power_kw NUMERIC(10,2) NOT NULL,
    rated_voltage_v NUMERIC(10,2) NOT NULL,
    rated_current_a NUMERIC(10,2) NOT NULL,
    rated_rpm INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'nominal' CHECK (status IN ('nominal', 'warning', 'critical', 'offline')),
    health_index NUMERIC(5,2) DEFAULT 100.00,
    iso_zone CHAR(1) DEFAULT 'A' CHECK (iso_zone IN ('A', 'B', 'C', 'D')),
    edge_node_id VARCHAR(50),
    runtime_hours NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.motors ENABLE ROW LEVEL SECURITY;

-- Read: Both 'admin' and 'authorized_user' can read motor inventory
CREATE POLICY "Authorized users can view motors"
    ON public.motors
    FOR SELECT
    USING (public.is_authorized_user());

-- Write/Modify: Only 'admin' can commission, edit, or delete motors
CREATE POLICY "Admins can insert motors"
    ON public.motors
    FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update motors"
    ON public.motors
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete motors"
    ON public.motors
    FOR DELETE
    USING (public.is_admin());

-- -------------------------------------------------------------------------
-- 6. Telemetry Logs Table (High-Frequency Time-Series) with RLS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    motor_id UUID REFERENCES public.motors(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    vibration_axial_mms NUMERIC(6,3),
    vibration_horizontal_mms NUMERIC(6,3),
    vibration_vertical_mms NUMERIC(6,3),
    bearing_temp_de_c NUMERIC(5,2),
    bearing_temp_nde_c NUMERIC(5,2),
    stator_temp_u_c NUMERIC(5,2),
    stator_temp_v_c NUMERIC(5,2),
    stator_temp_w_c NUMERIC(5,2),
    current_a NUMERIC(8,2),
    current_b NUMERIC(8,2),
    current_c NUMERIC(8,2),
    power_kw NUMERIC(8,2),
    power_factor NUMERIC(4,3),
    unbalance_percent NUMERIC(5,2),
    insulation_resistance_mohm NUMERIC(8,2)
);

ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view telemetry logs"
    ON public.telemetry_logs
    FOR SELECT
    USING (public.is_authorized_user());

CREATE POLICY "Authorized users can append telemetry logs"
    ON public.telemetry_logs
    FOR INSERT
    WITH CHECK (public.is_authorized_user());

CREATE POLICY "Only admins can delete telemetry logs"
    ON public.telemetry_logs
    FOR DELETE
    USING (public.is_admin());

-- -------------------------------------------------------------------------
-- 7. Edge Gateways Table with RLS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.edge_nodes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    firmware_version VARCHAR(50),
    status VARCHAR(20) DEFAULT 'online',
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    packet_loss_percent NUMERIC(5,2) DEFAULT 0
);

ALTER TABLE public.edge_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view edge nodes"
    ON public.edge_nodes
    FOR SELECT
    USING (public.is_authorized_user());

CREATE POLICY "Only admins can manage edge nodes"
    ON public.edge_nodes
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- 8. Alarms & Protective Trip Events with RLS (Allow Event Acknowledgment)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alarm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motor_id UUID REFERENCES public.motors(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'trip', 'info')),
    alarm_code VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    value_recorded VARCHAR(100),
    threshold_limit VARCHAR(100),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alarm_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view alarms"
    ON public.alarm_events
    FOR SELECT
    USING (public.is_authorized_user());

-- Authorized users can acknowledge alarms (UPDATE acknowledged status)
CREATE POLICY "Authorized users can acknowledge alarms"
    ON public.alarm_events
    FOR UPDATE
    USING (public.is_authorized_user())
    WITH CHECK (public.is_authorized_user());

CREATE POLICY "Only admins can delete alarm records"
    ON public.alarm_events
    FOR DELETE
    USING (public.is_admin());

-- -------------------------------------------------------------------------
-- 9. Maintenance Work Orders & Reports with RLS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_orders (
    id VARCHAR(50) PRIMARY KEY,
    motor_id UUID REFERENCES public.motors(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL,
    scheduled_date DATE NOT NULL,
    estimated_hours NUMERIC(4,1),
    assigned_technician TEXT,
    status VARCHAR(30) DEFAULT 'pending',
    diagnosis TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view work orders"
    ON public.maintenance_orders
    FOR SELECT
    USING (public.is_authorized_user());

CREATE POLICY "Authorized users can create work orders"
    ON public.maintenance_orders
    FOR INSERT
    WITH CHECK (public.is_authorized_user());

CREATE POLICY "Authorized users can update work orders"
    ON public.maintenance_orders
    FOR UPDATE
    USING (public.is_authorized_user())
    WITH CHECK (public.is_authorized_user());

CREATE TABLE IF NOT EXISTS public.reports (
    id VARCHAR(50) PRIMARY KEY,
    title TEXT NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    period TEXT,
    author TEXT,
    file_size TEXT,
    format VARCHAR(10),
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view reports"
    ON public.reports
    FOR SELECT
    USING (public.is_authorized_user());

CREATE POLICY "Authorized users can generate reports"
    ON public.reports
    FOR INSERT
    WITH CHECK (public.is_authorized_user());
`;
