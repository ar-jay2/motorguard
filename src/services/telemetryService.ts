/**
 * MotorGuard - Supabase Telemetry Data Access Layer (Phase 1)
 *
 * Dedicated typed, read-only data access layer for the existing Supabase database.
 * Strictly uses SELECT queries against:
 *   - public.nodes
 *   - public.sensor_data
 *   - public.event_logs
 *   - public.maintenance_logs
 *   - public.settings
 *
 * DATA INTEGRITY CONTRACT:
 * 1. Read-only: No INSERT, UPDATE, DELETE, UPSERT, or RPC calls.
 * 2. Never coerces NULL sensor measurements into zero (null indicates unmeasured or not applicable).
 * 3. Preserves actual zero measurements (0.00 is a valid reading).
 * 4. Supports single-phase (generic fields) and three-phase (L1/L2/L3 fields) motors accurately.
 * 5. Orders timestamps descending ('YYYY-MM-DD HH:mm:ss' text format) followed by id descending.
 * 6. Does not inject mock data or fallbacks on query failure; throws structured TelemetryServiceError.
 */

import { getSupabaseClient } from './supabaseClient';

// ============================================================================
// Database Record Interfaces (Exact schema mapping)
// ============================================================================

/**
 * Table: public.nodes
 * Columns: id, node_id, name, motor_type, location, active, created_at, updated_at
 * active: INTEGER (1 = active, 0 = inactive)
 */
export interface NodeRecord {
  id: number | string;
  node_id: string; // e.g., 'M001', 'M002', 'M003'
  name: string;
  motor_type: string;
  location: string;
  active: number; // 1 | 0
  created_at: string;
  updated_at: string;
}

/**
 * Table: public.sensor_data
 * Columns:
 * id, node_id, timestamp, voltage, current, power, energy, frequency, power_factor,
 * voltage_l1_l2, voltage_l2_l3, voltage_l3_l1, current_l1, current_l2, current_l3,
 * power_l1, power_l2, power_l3, total_power, temperature, vibration,
 * voltage_imbalance, current_imbalance, status
 *
 * NOTE: Any numeric field can be null. Do not convert null to zero!
 */
export interface SensorDataRecord {
  id: number;
  node_id: string;
  timestamp: string; // TEXT format: 'YYYY-MM-DD HH:mm:ss'
  voltage: number | null;
  current: number | null;
  power: number | null;
  energy: number | null;
  frequency: number | null;
  power_factor: number | null;
  voltage_l1_l2: number | null;
  voltage_l2_l3: number | null;
  voltage_l3_l1: number | null;
  current_l1: number | null;
  current_l2: number | null;
  current_l3: number | null;
  power_l1: number | null;
  power_l2: number | null;
  power_l3: number | null;
  total_power: number | null;
  temperature: number | null;
  vibration: number | null;
  voltage_imbalance: number | null;
  current_imbalance: number | null;
  status: string | null;
}

/**
 * Table: public.event_logs
 * Columns: id, node_id, timestamp, event_type, severity, description, acknowledged
 * acknowledged: INTEGER (0 = unacknowledged, 1 = acknowledged)
 * severity: text (e.g. 'HIGH', 'CRITICAL', 'WARNING', 'INFO')
 */
export interface EventLogRecord {
  id: number | string;
  node_id: string;
  timestamp: string; // TEXT format: 'YYYY-MM-DD HH:mm:ss'
  event_type: string;
  severity: string;
  description: string;
  acknowledged: number; // 0 | 1
}

/**
 * Table: public.maintenance_logs
 * Columns: id, node_id, maintenance_date, description, performed_by
 */
export interface MaintenanceLogRecord {
  id: number | string;
  node_id: string;
  maintenance_date: string;
  description: string;
  performed_by: string;
}

/**
 * Table: public.settings
 * Columns: id, setting_key, setting_value, description
 */
export interface SettingRecord {
  id: number | string;
  setting_key: string;
  setting_value: string;
  description: string | null;
}

// ============================================================================
// Structured Error Handling
// ============================================================================

export class TelemetryServiceError extends Error {
  public table: string;
  public details?: string;
  public originalError?: any;

  constructor(message: string, table: string, details?: string, originalError?: any) {
    super(`[TelemetryService:${table}] ${message}${details ? ` - ${details}` : ''}`);
    this.name = 'TelemetryServiceError';
    this.table = table;
    this.details = details;
    this.originalError = originalError;
  }
}

function getClientOrThrow(table: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new TelemetryServiceError(
      'Supabase client is uninitialized or missing environment credentials.',
      table
    );
  }
  return client;
}

// Exact column selection strings
const SENSOR_DATA_COLUMNS =
  'id, node_id, timestamp, voltage, current, power, energy, frequency, power_factor, voltage_l1_l2, voltage_l2_l3, voltage_l3_l1, current_l1, current_l2, current_l3, power_l1, power_l2, power_l3, total_power, temperature, vibration, voltage_imbalance, current_imbalance, status';

const NODES_COLUMNS =
  'id, node_id, name, motor_type, location, active, created_at, updated_at';

const EVENT_LOGS_COLUMNS =
  'id, node_id, timestamp, event_type, severity, description, acknowledged';

const MAINTENANCE_LOGS_COLUMNS =
  'id, node_id, maintenance_date, description, performed_by';

const SETTINGS_COLUMNS =
  'id, setting_key, setting_value, description';

// ============================================================================
// Data Access Functions (SELECT only)
// ============================================================================

/**
 * 1. fetchNodes()
 * Retrieves all registered physical motor nodes from public.nodes.
 * Preserves nodes.active as an integer (1 = active, 0 = inactive).
 */
export async function fetchNodes(): Promise<NodeRecord[]> {
  const client = getClientOrThrow('nodes');

  const { data, error } = await client
    .from('nodes')
    .select(NODES_COLUMNS)
    .order('node_id', { ascending: true });

  if (error) {
    throw new TelemetryServiceError('Failed to query nodes', 'nodes', error.message, error);
  }

  return (data || []) as NodeRecord[];
}

/**
 * 2. fetchLatestTelemetryForNode(nodeId)
 * Retrieves the single newest sensor_data record for the specified node_id.
 * Uses text timestamp descending, then id descending.
 * Returns `null` if the node has no sensor_data records (e.g. M002).
 * Preserves all NULL values without coercing them to zero.
 */
export async function fetchLatestTelemetryForNode(nodeId: string): Promise<SensorDataRecord | null> {
  if (!nodeId || !nodeId.trim()) {
    return null;
  }

  const client = getClientOrThrow('sensor_data');

  const { data, error } = await client
    .from('sensor_data')
    .select(SENSOR_DATA_COLUMNS)
    .eq('node_id', nodeId.trim())
    .order('timestamp', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new TelemetryServiceError(
      `Failed to retrieve latest telemetry for node ${nodeId}`,
      'sensor_data',
      error.message,
      error
    );
  }

  // Data can be null if no records exist for this node (e.g., M002)
  return (data as SensorDataRecord | null) ?? null;
}

/**
 * 3. fetchLatestTelemetryForNodes(nodes)
 * Retrieves the latest telemetry record for each given node in parallel.
 * Accepts an array of node_id strings (e.g. ['M001', 'M002', 'M003']) or NodeRecord objects.
 * Returns a dictionary mapping node_id -> SensorDataRecord | null.
 */
export async function fetchLatestTelemetryForNodes(
  nodes: (string | NodeRecord)[]
): Promise<Record<string, SensorDataRecord | null>> {
  if (!nodes || nodes.length === 0) {
    return {};
  }

  const nodeIds = nodes.map((n) => (typeof n === 'string' ? n.trim() : n.node_id.trim()));
  const uniqueIds = Array.from(new Set(nodeIds.filter(Boolean)));

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      const record = await fetchLatestTelemetryForNode(id);
      return { id, record };
    })
  );

  const map: Record<string, SensorDataRecord | null> = {};
  for (const { id, record } of results) {
    map[id] = record;
  }

  return map;
}

/**
 * 4. fetchTelemetryHistory(nodeId, limit)
 * Retrieves historical telemetry records for a given node_id up to `limit` rows.
 * Queries the newest records via timestamp descending, then reverses the list
 * to return them in chronological order (oldest to newest) for charts and time-series plotting.
 * Preserves all actual NULL and zero values.
 */
export async function fetchTelemetryHistory(
  nodeId: string,
  limit: number = 50
): Promise<SensorDataRecord[]> {
  if (!nodeId || !nodeId.trim()) {
    return [];
  }

  const client = getClientOrThrow('sensor_data');
  const safeLimit = Math.max(1, Math.min(limit, 1000));

  const { data, error } = await client
    .from('sensor_data')
    .select(SENSOR_DATA_COLUMNS)
    .eq('node_id', nodeId.trim())
    .order('timestamp', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new TelemetryServiceError(
      `Failed to query telemetry history for node ${nodeId}`,
      'sensor_data',
      error.message,
      error
    );
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Reverse to chronological order (ascending time) for charts
  return (data as SensorDataRecord[]).slice().reverse();
}

/**
 * 5. fetchEvents(limit)
 * Retrieves alarm and safety trip events from public.event_logs.
 * Uses timestamp descending, then id descending.
 * Preserves event_logs.acknowledged as an integer (0 = unack, 1 = ack).
 * Preserves text severities (e.g., 'HIGH', 'CRITICAL', 'WARNING').
 */
export async function fetchEvents(limit: number = 100): Promise<EventLogRecord[]> {
  const client = getClientOrThrow('event_logs');
  const safeLimit = Math.max(1, Math.min(limit, 500));

  const { data, error } = await client
    .from('event_logs')
    .select(EVENT_LOGS_COLUMNS)
    .order('timestamp', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new TelemetryServiceError('Failed to query event_logs', 'event_logs', error.message, error);
  }

  return (data || []) as EventLogRecord[];
}

/**
 * 6. fetchMaintenanceLogs()
 * Retrieves all maintenance logs from public.maintenance_logs.
 * Returns an empty array if no logs exist.
 */
export async function fetchMaintenanceLogs(): Promise<MaintenanceLogRecord[]> {
  const client = getClientOrThrow('maintenance_logs');

  const { data, error } = await client
    .from('maintenance_logs')
    .select(MAINTENANCE_LOGS_COLUMNS)
    .order('maintenance_date', { ascending: false });

  if (error) {
    throw new TelemetryServiceError(
      'Failed to query maintenance_logs',
      'maintenance_logs',
      error.message,
      error
    );
  }

  return (data || []) as MaintenanceLogRecord[];
}

/**
 * 7. fetchSettings()
 * Retrieves platform settings key-value pairs from public.settings.
 * Returns an empty array if no settings are stored.
 */
export async function fetchSettings(): Promise<SettingRecord[]> {
  const client = getClientOrThrow('settings');

  const { data, error } = await client
    .from('settings')
    .select(SETTINGS_COLUMNS)
    .order('setting_key', { ascending: true });

  if (error) {
    throw new TelemetryServiceError('Failed to query settings', 'settings', error.message, error);
  }

  return (data || []) as SettingRecord[];
}

// ============================================================================
// Domain Helpers (Preserving NULL vs Zero & Single vs Three-Phase)
// ============================================================================

/**
 * Determines whether a sensor reading contains three-phase electrical telemetry.
 * E.g., M003 has current_l1/l2/l3 or voltage_l1_l2 populated while M001 uses generic fields.
 */
export function isThreePhaseReading(reading: SensorDataRecord | null): boolean {
  if (!reading) return false;
  return (
    reading.current_l1 !== null ||
    reading.current_l2 !== null ||
    reading.current_l3 !== null ||
    reading.voltage_l1_l2 !== null ||
    reading.power_l1 !== null
  );
}

/**
 * Resolves effective phase currents without coercing NULL to zero.
 * For single-phase (M001), returns generic current with phase currents as null.
 * For three-phase (M003), returns the explicit phase readings.
 */
export function resolveEffectiveCurrents(reading: SensorDataRecord | null): {
  isThreePhase: boolean;
  generic: number | null;
  l1: number | null;
  l2: number | null;
  l3: number | null;
} {
  if (!reading) {
    return { isThreePhase: false, generic: null, l1: null, l2: null, l3: null };
  }

  const threePhase = isThreePhaseReading(reading);
  return {
    isThreePhase: threePhase,
    generic: reading.current,
    l1: reading.current_l1,
    l2: reading.current_l2,
    l3: reading.current_l3,
  };
}

/**
 * Resolves effective active power without coercing NULL to zero.
 * Prefers total_power or power when populated.
 */
export function resolveEffectivePower(reading: SensorDataRecord | null): number | null {
  if (!reading) return null;
  if (reading.total_power !== null) return reading.total_power;
  if (reading.power !== null) return reading.power;
  return null;
}
