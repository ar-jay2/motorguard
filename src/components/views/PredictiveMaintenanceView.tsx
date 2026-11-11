import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  Clock,
  Wrench,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Database,
  Radio,
  Activity,
  Layers,
  Thermometer,
  Zap,
  Info,
  ChevronRight,
  AlertTriangle,
  HelpCircle,
  FileText,
  User,
  Sliders,
  Check,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Motor, MaintenanceWorkOrder } from '../../types/motor';
import {
  fetchNodes,
  fetchLatestTelemetryForNodes,
  fetchTelemetryHistory,
  fetchEvents,
  fetchMaintenanceLogs,
  NodeRecord,
  SensorDataRecord,
  EventLogRecord,
  MaintenanceLogRecord,
  resolveEffectiveCurrents,
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface PredictiveMaintenanceViewProps {
  motors?: Motor[];
  workOrders?: MaintenanceWorkOrder[];
  onSelectMotor?: (motor: Motor) => void;
  onAddWorkOrder?: (wo: MaintenanceWorkOrder) => void;
}

export const PredictiveMaintenanceView: React.FC<PredictiveMaintenanceViewProps> = ({
  motors = [],
  onSelectMotor,
}) => {
  // Live Supabase state
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogRecord[]>([]);
  const [events, setEvents] = useState<EventLogRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [historyRecords, setHistoryRecords] = useState<SensorDataRecord[]>([]);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Helper to format raw values (preserves NULL as 'N/A' and actual zero as '0')
  const formatRaw = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Helper to format chart timestamp
  const formatTimeLabel = (ts: string) => {
    if (!ts) return '';
    if (ts.length >= 19 && (ts.includes(' ') || ts.includes('T'))) {
      return ts.slice(11, 19);
    }
    return ts;
  };

  // Load all core data from Supabase
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch registered physical nodes, maintenance logs, and events in parallel
      const [fetchedNodes, fetchedMaintenance, fetchedEvents] = await Promise.all([
        fetchNodes(),
        fetchMaintenanceLogs(),
        fetchEvents(100),
      ]);

      setNodes(fetchedNodes);
      setMaintenanceLogs(fetchedMaintenance);
      setEvents(fetchedEvents);

      // Determine default active node
      let activeNodeId = selectedNodeId;
      if (!activeNodeId && fetchedNodes.length > 0) {
        // Prefer first node or M001
        const defaultNode = fetchedNodes.find((n) => n.node_id === 'M001') || fetchedNodes[0];
        activeNodeId = defaultNode.node_id;
        setSelectedNodeId(activeNodeId);
      }

      // 2. Fetch latest telemetry snapshot for all nodes
      const latestMap = await fetchLatestTelemetryForNodes(fetchedNodes);
      setTelemetryMap(latestMap);

      // 3. Fetch historical telemetry for the selected node
      if (activeNodeId) {
        const history = await fetchTelemetryHistory(activeNodeId, 50);
        setHistoryRecords(history);
      }

      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to load predictive maintenance data from Supabase:', err);
      setError(err?.message || 'Failed to query Supabase database records.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedNodeId]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load history when selected node changes
  const handleSelectNode = async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    try {
      const history = await fetchTelemetryHistory(nodeId, 50);
      setHistoryRecords(history);
    } catch (err) {
      console.error(`Failed to load history for ${nodeId}:`, err);
    }
  };

  // Selected node metadata and latest reading
  const activeNode = useMemo(() => {
    return nodes.find((n) => n.node_id === selectedNodeId) || nodes[0] || null;
  }, [nodes, selectedNodeId]);

  const activeTelemetry = useMemo(() => {
    if (!activeNode) return null;
    return telemetryMap[activeNode.node_id] || null;
  }, [activeNode, telemetryMap]);

  // Check topology of selected node
  const isThreePhase = useMemo(() => {
    if (!activeNode) return false;
    const typeStr = (activeNode.motor_type || '').toUpperCase();
    if (typeStr.includes('THREE') || typeStr.includes('3_PHASE') || typeStr.includes('POLY')) {
      return true;
    }
    if (isThreePhaseReading(activeTelemetry)) return true;
    if (historyRecords.some((r) => isThreePhaseReading(r))) return true;
    return false;
  }, [activeNode, activeTelemetry, historyRecords]);

  // Map node_id to motor name for maintenance records
  const nodeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of nodes) {
      map[n.node_id] = n.name;
    }
    return map;
  }, [nodes]);

  // Events related to the active node or recent fleet events
  const nodeEvents = useMemo(() => {
    if (!activeNode) return events.slice(0, 5);
    const filtered = events.filter((e) => e.node_id === activeNode.node_id);
    return filtered.length > 0 ? filtered : events.slice(0, 5);
  }, [events, activeNode]);

  // Chart data prepared from chronological history
  const chartData = useMemo(() => {
    if (!historyRecords || historyRecords.length === 0) return [];
    return historyRecords.map((r, idx) => {
      const point: any = {
        index: idx,
        timestamp: r.timestamp,
        timeLabel: formatTimeLabel(r.timestamp),
        temperature: r.temperature !== null ? r.temperature : null,
        vibration: r.vibration !== null ? r.vibration : null,
      };

      if (isThreePhase) {
        point.current_l1 = r.current_l1 !== null ? r.current_l1 : null;
        point.current_l2 = r.current_l2 !== null ? r.current_l2 : null;
        point.current_l3 = r.current_l3 !== null ? r.current_l3 : null;
      } else {
        point.current = r.current !== null ? r.current : null;
      }

      return point;
    });
  }, [historyRecords, isThreePhase]);

  // Calculate distinct decrowded X-axis ticks (approx 5-6 points)
  const chartTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    if (chartData.length <= 6) return chartData.map((d) => d.timeLabel);
    const step = Math.ceil((chartData.length - 1) / 5);
    const ticks: string[] = [];
    for (let i = 0; i < chartData.length; i += step) {
      ticks.push(chartData[i].timeLabel);
    }
    const lastLabel = chartData[chartData.length - 1].timeLabel;
    if (!ticks.includes(lastLabel)) {
      ticks.push(lastLabel);
    }
    return ticks;
  }, [chartData]);

  // Render Loading Skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div>
            <div className="h-6 w-80 bg-slate-800 rounded mb-2"></div>
            <div className="h-4 w-96 bg-slate-800/60 rounded"></div>
          </div>
          <div className="h-9 w-28 bg-slate-800 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl"></div>
        </div>
        <div className="h-72 bg-slate-900 border border-slate-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Supabase Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-teal-400" />
              Predictive Maintenance & Prognostics Assessment
            </h1>
            <span className="font-mono text-[11px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded">
              DATABASE: public.maintenance_logs & public.sensor_data
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Read-only evaluation of prognostic model readiness, observed physical condition telemetry, and historical maintenance interventions directly from Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshedAt && (
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Refreshed: {lastRefreshedAt}
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-teal-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 bg-rose-950/70 border border-rose-800/80 rounded-xl text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Database query error: {error}</span>
          </div>
          <button
            onClick={() => loadData(true)}
            className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-100 rounded text-xs font-semibold"
          >
            Retry Query
          </button>
        </div>
      )}

      {/* Registered Motor Selector Strip */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800/80 gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-bold text-white">Registered Physical Nodes ({nodes.length})</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Select a motor to inspect real condition telemetry and historical trends
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {nodes.map((n) => {
            const isSelected = activeNode?.node_id === n.node_id;
            const nodeTelemetry = telemetryMap[n.node_id];
            const hasData = nodeTelemetry !== null && nodeTelemetry !== undefined;

            return (
              <button
                key={n.node_id}
                onClick={() => handleSelectNode(n.node_id)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-teal-500 bg-[#0d1a2f] shadow-md ring-1 ring-teal-500/50'
                    : 'border-slate-800 bg-[#0c1424] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded">
                    {n.node_id}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      hasData
                        ? 'text-teal-300 bg-teal-950/50 border border-teal-800/40'
                        : 'text-amber-400 bg-amber-950/40 border border-amber-800/40'
                    }`}
                  >
                    {hasData ? 'TELEMETRY AVAILABLE' : 'NO TELEMETRY'}
                  </span>
                </div>
                <div className="text-xs font-bold text-white truncate">{n.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between mt-1">
                  <span>{n.location || 'Location Unspecified'}</span>
                  <span className="font-mono text-[10px] text-slate-500">{n.motor_type}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mandatory Prognostics Assessment Card: PREDICTION NOT AVAILABLE */}
      <div className="bg-[#090f1d] border border-amber-900/50 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-700/60 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Asset Prognostics & Predictive Health Status</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/80">
                  PREDICTION NOT AVAILABLE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Scientific Remaining Useful Life (RUL), Weibull hazard trajectories, and failure probability models cannot be scientifically supported by the current database state.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3.5 bg-[#0c1527] border border-slate-800/80 rounded-lg text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-slate-200">
            Scientific & Mathematical Justification:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
            <li>
              <strong className="text-slate-300">Missing Run-to-Failure Ground Truth:</strong> Reliable prognostic algorithms (e.g., Weibull distribution, LSTM autoencoders, or degradation extrapolation) require documented historical failure lifecycles and component overhaul timestamps in <code className="text-teal-400">public.maintenance_logs</code>. Currently, 0 historical maintenance interventions exist in the database.
            </li>
            <li>
              <strong className="text-slate-300">Uncalibrated Vibration Telemetry:</strong> The vibration column in <code className="text-teal-400">public.sensor_data</code> stores raw scalar telemetry without confirmed engineering calibration units (e.g. mm/s RMS, g PK) or high-frequency spectral components (FFT bearing fault harmonics BPFO/BPFI). Calculating vibration severity thresholds or bearing ball degradation without spectral feature extraction is invalid.
            </li>
            <li>
              <strong className="text-slate-300">Operational Context & Load Baselines:</strong> The database does not currently provide a verified operating-state signal to establish whether a motor is running, stopped, disconnected, or experiencing a sensor issue. Zero values are presented strictly as recorded measured values (e.g., Recorded current: 0 A, Recorded power: 0), and operating state is not established from available telemetry.
            </li>
            <li>
              <strong className="text-slate-300">Strict Data Integrity Contract:</strong> In accordance with data integrity guidelines, MotorGuard does not fabricate synthetic RUL countdowns, arbitrary percentage health indices, or synthetic work order tickets.
            </li>
          </ul>
        </div>
      </div>

      {/* Prognostics Data Readiness Matrix (Engineering Checklist) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-400" />
              Prognostics Data Readiness Assessment
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Assessing the availability of telemetry, maintenance history, sensor calibration, and event records needed for future predictive maintenance development.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Audit Scope: 4 Fundamental Dimensions
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Telemetry Depth */}
          <div className="p-3.5 bg-[#0c1527] border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                  Telemetry Depth
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-800/50">
                  PARTIAL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {historyRecords.length} historical readings queried for current node. M001 and M003 have sensor records; M002 currently has zero.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
              Requirement: Continuous chronological dataset
            </div>
          </div>

          {/* 2. Maintenance Ground Truth */}
          <div className="p-3.5 bg-[#0c1527] border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  Maintenance Logs
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50">
                  0 RECORDS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <code className="text-teal-400">public.maintenance_logs</code> contains 0 entries. No historical repairs or parts replacements logged.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
              Requirement: Labeled failure events
            </div>
          </div>

          {/* 3. Sensor Calibration & Spectral Data */}
          <div className="p-3.5 bg-[#0c1527] border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Sensor Calibration
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                  UNCALIBRATED
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Vibration column stores raw scalar numbers. High-frequency FFT spectrum and calibrated physical units are not configured.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
              Requirement: Calibrated sensor data & FFT
            </div>
          </div>

          {/* 4. Event & Trip History */}
          <div className="p-3.5 bg-[#0c1527] border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                  Trip Events
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-800/50">
                  {events.length} LOGGED
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Actual safety trip records exist in <code className="text-teal-400">public.event_logs</code>. Available for operational incident correlation.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
              Requirement: Correlated alarm logs
            </div>
          </div>
        </div>
      </div>

      {/* Observed Condition Monitoring (Real Database Telemetry) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              <h2 className="font-bold text-white text-sm">
                Observed Physical Telemetry: {activeNode ? `${activeNode.node_id} – ${activeNode.name}` : 'No Node Selected'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live measurements recorded from field sensors. These represent observed field measurements, not future prognostic predictions (operating state: not established from available telemetry).
            </p>
          </div>

          {activeTelemetry && (
            <div className="text-[11px] font-mono text-slate-400 bg-[#0c1527] px-2.5 py-1 rounded border border-slate-800">
              Timestamp: <span className="text-teal-300 font-bold">{activeTelemetry.timestamp}</span>
            </div>
          )}
        </div>

        {/* Selected Motor Telemetry Snapshot Grid */}
        {!activeTelemetry ? (
          <div className="p-8 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800">
            <Radio className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-300">No Telemetry Recorded</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Node <span className="text-white font-mono">{activeNode?.node_id}</span> ({activeNode?.name}) is registered in <code className="text-teal-400">public.nodes</code>, but currently has no sensor records stored in <code className="text-teal-400">public.sensor_data</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Condition Snapshot KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Temperature */}
              <div className="p-3 bg-[#0c1527] border border-slate-800/80 rounded-lg">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                  Temperature
                </span>
                <div className="text-base font-bold font-mono text-white">
                  {activeTelemetry.temperature !== null ? `${formatRaw(activeTelemetry.temperature, 1)} °C` : 'N/A'}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Thermal sensor</span>
              </div>

              {/* Raw Vibration */}
              <div className="p-3 bg-[#0c1527] border border-slate-800/80 rounded-lg">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  Vibration (Raw)
                </span>
                <div className="text-base font-bold font-mono text-white">
                  {formatRaw(activeTelemetry.vibration, 3)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Uncalibrated raw value</span>
              </div>

              {/* Electrical Current / Phase Currents */}
              <div className="p-3 bg-[#0c1527] border border-slate-800/80 rounded-lg">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <Zap className="w-3.5 h-3.5 text-teal-400" />
                  {isThreePhase ? 'Phase Currents' : 'Current'}
                </span>
                <div className="text-xs font-bold font-mono text-white truncate">
                  {isThreePhase
                    ? `L1: ${formatRaw(activeTelemetry.current_l1, 2)} | L2: ${formatRaw(activeTelemetry.current_l2, 2)} | L3: ${formatRaw(activeTelemetry.current_l3, 2)} A`
                    : `${formatRaw(activeTelemetry.current, 2)} A`}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {isThreePhase ? 'Three-phase line draw' : 'Single-phase current'}
                </span>
              </div>

              {/* Power / Total Power */}
              <div className="p-3 bg-[#0c1527] border border-slate-800/80 rounded-lg">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  Power (Raw)
                </span>
                <div className="text-base font-bold font-mono text-white">
                  {formatRaw(resolveEffectivePower(activeTelemetry), 2)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {activeTelemetry.total_power !== null ? 'total_power' : 'power (raw stored)'}
                </span>
              </div>
            </div>

            {/* Electrical Parameters Detail Bar */}
            <div className="p-3 bg-[#0c1527] border border-slate-800/80 rounded-lg text-xs font-mono text-slate-300">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-500 text-[10px] block">VOLTAGE / LINE VOLTAGES</span>
                  {isThreePhase ? (
                    <span>
                      {formatRaw(activeTelemetry.voltage_l1_l2, 1)} / {formatRaw(activeTelemetry.voltage_l2_l3, 1)} / {formatRaw(activeTelemetry.voltage_l3_l1, 1)} V
                    </span>
                  ) : (
                    <span>{formatRaw(activeTelemetry.voltage, 1)} V</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">FREQUENCY</span>
                  <span>{activeTelemetry.frequency !== null ? `${formatRaw(activeTelemetry.frequency, 1)} Hz` : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">POWER FACTOR</span>
                  <span>{formatRaw(activeTelemetry.power_factor, 2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">RAW ENERGY RECORD</span>
                  <span>{formatRaw(activeTelemetry.energy)}</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-1 font-mono">
                <span>
                  Operating state: <strong className="text-slate-300 font-semibold">Not established from available telemetry</strong>
                </span>
                <span className="text-slate-500 text-[10px]">
                  Zero current and zero power presented strictly as recorded measured values
                </span>
              </div>
            </div>

            {/* Chronological Historical Telemetry Chart */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                  Chronological Telemetry History ({chartData.length} records)
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Observed measurements from public.sensor_data (No future projection)
                </span>
              </div>

              {chartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-500 font-mono border border-slate-800 rounded-lg">
                  No historical records available for {activeNode?.node_id}.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="timeLabel"
                        ticks={chartTicks}
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        fontFamily="JetBrains Mono, monospace"
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        fontFamily="JetBrains Mono, monospace"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0c1424',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                        itemStyle={{ color: '#e2e8f0' }}
                        labelFormatter={(_, payload) => {
                          if (payload && payload.length > 0) {
                            return `Timestamp: ${payload[0].payload.timestamp}`;
                          }
                          return '';
                        }}
                        formatter={(val: any, name: any) => {
                          if (val === null || val === undefined) return ['N/A', name];
                          if (name === 'Temperature (°C)') return [`${Number(val).toFixed(1)} °C`, name];
                          if (name === 'Raw Vibration') return [Number(val).toFixed(3), name];
                          return [Number(val).toFixed(2), name];
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', paddingBottom: '10px' }}
                      />

                      {/* Temperature */}
                      <Line
                        type="monotone"
                        dataKey="temperature"
                        name="Temperature (°C)"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={{ r: 2, fill: '#f43f5e' }}
                        connectNulls={false}
                      />

                      {/* Raw Vibration */}
                      <Line
                        type="monotone"
                        dataKey="vibration"
                        name="Raw Vibration"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 2, fill: '#f59e0b' }}
                        connectNulls={false}
                      />

                      {/* Electrical currents */}
                      {isThreePhase ? (
                        <>
                          <Line
                            type="monotone"
                            dataKey="current_l1"
                            name="Current L1 (A)"
                            stroke="#06b6d4"
                            strokeWidth={1.5}
                            dot={{ r: 1.5, fill: '#06b6d4' }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="current_l2"
                            name="Current L2 (A)"
                            stroke="#10b981"
                            strokeWidth={1.5}
                            dot={{ r: 1.5, fill: '#10b981' }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="current_l3"
                            name="Current L3 (A)"
                            stroke="#a855f7"
                            strokeWidth={1.5}
                            dot={{ r: 1.5, fill: '#a855f7' }}
                            connectNulls={false}
                          />
                        </>
                      ) : (
                        <Line
                          type="monotone"
                          dataKey="current"
                          name="Current (A)"
                          stroke="#14b8a6"
                          strokeWidth={2}
                          dot={{ r: 2, fill: '#14b8a6' }}
                          connectNulls={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Historical Maintenance Ledger (public.maintenance_logs) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-teal-400" />
              <h2 className="font-bold text-white text-sm">
                Maintenance History Ledger (public.maintenance_logs)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified historical service interventions, repairs, and component overhauls recorded in the database.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-[#0c1527] px-2.5 py-1 rounded border border-slate-800">
            {maintenanceLogs.length} Records in public.maintenance_logs
          </span>
        </div>

        {maintenanceLogs.length === 0 ? (
          <div className="p-8 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800">
            <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-300">
              No Maintenance Records Found in public.maintenance_logs
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
              The <code className="text-teal-400">public.maintenance_logs</code> table contains 0 recorded interventions. Under MotorGuard's data integrity rules, simulated work order tickets and synthetic maintenance schedules have been removed.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-400">
              Columns: id, node_id, maintenance_date, description, performed_by
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Log ID</th>
                  <th className="py-2.5 px-3">Motor Node</th>
                  <th className="py-2.5 px-3">Maintenance Date</th>
                  <th className="py-2.5 px-3">Performed By</th>
                  <th className="py-2.5 px-3 font-sans">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {maintenanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#0c162b] transition-colors">
                    <td className="py-3 px-3 text-teal-400 font-bold">{log.id}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white">{log.node_id}</div>
                      <div className="text-[10px] text-slate-400 font-sans">
                        {nodeNameMap[log.node_id] || 'Unknown Motor'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{log.maintenance_date}</td>
                    <td className="py-3 px-3 text-slate-300 font-sans">{log.performed_by}</td>
                    <td className="py-3 px-3 text-slate-200 font-sans">{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operational Events & Trip Logs (public.event_logs) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-teal-400" />
              <h2 className="font-bold text-white text-sm">
                Physical Event & Trip Logs (public.event_logs)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Safety trips and threshold trigger records stored in Supabase.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-[#0c1527] px-2.5 py-1 rounded border border-slate-800">
            {nodeEvents.length} Events Logged
          </span>
        </div>

        {nodeEvents.length === 0 ? (
          <div className="p-6 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800 text-xs text-slate-500 font-mono">
            No events recorded for the selected scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Node</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3 font-sans">Description</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {nodeEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[#0c162b] transition-colors">
                    <td className="py-3 px-3 text-teal-400 font-bold">{evt.id}</td>
                    <td className="py-3 px-3 text-white font-bold">{evt.node_id}</td>
                    <td className="py-3 px-3 text-slate-400">{evt.timestamp}</td>
                    <td className="py-3 px-3 text-slate-300">{evt.event_type}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.severity.toUpperCase() === 'CRITICAL' || evt.severity.toUpperCase() === 'HIGH'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : evt.severity.toUpperCase() === 'WARNING'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {evt.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-200 font-sans">{evt.description}</td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          evt.acknowledged === 1
                            ? 'text-teal-400 bg-teal-950/60 border border-teal-800/50'
                            : 'text-amber-400 bg-amber-950/60 border border-amber-800/50 font-bold'
                        }`}
                      >
                        {evt.acknowledged === 1 ? 'ACK' : 'UNACK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
