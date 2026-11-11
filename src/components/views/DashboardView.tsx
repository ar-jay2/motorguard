import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Zap,
  AlertOctagon,
  Radio,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Database,
  Layers,
  Thermometer,
  Bell,
  Clock,
  X,
  ChevronRight,
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
import { Motor, PlantArea, TelemetryHistoryPoint } from '../../types/motor';
import {
  fetchNodes,
  fetchLatestTelemetryForNodes,
  fetchEvents,
  fetchTelemetryHistory,
  NodeRecord,
  SensorDataRecord,
  EventLogRecord,
  resolveEffectiveCurrents,
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface DashboardViewProps {
  motors?: Motor[];
  areas?: PlantArea[];
  telemetryHistory?: TelemetryHistoryPoint[];
  onSelectMotor?: (motor: Motor) => void;
  onNavigateToPlantMap?: () => void;
  onNavigateToEvents?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  motors = [],
  onSelectMotor,
  onNavigateToPlantMap,
  onNavigateToEvents,
}) => {
  // State for live Supabase data
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [recentEvents, setRecentEvents] = useState<EventLogRecord[]>([]);
  
  // Historical chart state
  const [selectedChartNodeId, setSelectedChartNodeId] = useState<string>('');
  const [chartHistory, setChartHistory] = useState<SensorDataRecord[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Helper to format raw numeric telemetry values (preserves NULL as 'N/A' and actual zero as '0')
  const formatRawValue = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Helper to format timestamp label for chart X-axis
  const formatTimeLabel = (ts: string) => {
    if (!ts) return '';
    if (ts.length >= 19 && (ts.includes(' ') || ts.includes('T'))) {
      return ts.slice(11, 19);
    }
    return ts;
  };

  // Main data loader function
  const loadDashboardData = useCallback(async (isBackground: boolean = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch nodes and recent events concurrently
      const [nodeList, eventList] = await Promise.all([
        fetchNodes(),
        fetchEvents(50),
      ]);

      // 2. Fetch latest telemetry for all registered nodes in parallel
      const telemetryRecordMap = await fetchLatestTelemetryForNodes(nodeList);

      setNodes(nodeList);
      setRecentEvents(eventList);
      setTelemetryMap(telemetryRecordMap);
      setLastRefreshedAt(new Date().toLocaleTimeString());

      // Auto-select first node with telemetry for the chart if not selected yet
      setSelectedChartNodeId((prev) => {
        if (prev && nodeList.some((n) => n.node_id === prev)) {
          return prev;
        }
        const firstWithTelemetry = nodeList.find((n) => Boolean(telemetryRecordMap[n.node_id]));
        return firstWithTelemetry ? firstWithTelemetry.node_id : nodeList[0]?.node_id || '';
      });
    } catch (err: any) {
      console.error('Failed to load dashboard data from Supabase:', err);
      setError(err?.message || 'Database error: Could not query Supabase tables.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and 15-second polling interval
  useEffect(() => {
    let isMounted = true;

    loadDashboardData(false);

    const intervalId = setInterval(() => {
      if (isMounted) {
        loadDashboardData(true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [loadDashboardData]);

  // Load telemetry history whenever the selected chart node changes
  useEffect(() => {
    if (!selectedChartNodeId) {
      setChartHistory([]);
      return;
    }

    let isMounted = true;
    const loadHistory = async () => {
      setIsLoadingChart(true);
      try {
        const hist = await fetchTelemetryHistory(selectedChartNodeId, 50);
        if (isMounted) {
          setChartHistory(hist);
        }
      } catch (err) {
        console.error(`Failed to load history for node ${selectedChartNodeId}:`, err);
        if (isMounted) {
          setChartHistory([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingChart(false);
        }
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [selectedChartNodeId]);

  // KPI Calculations strictly using actual database records
  const totalRegisteredNodes = nodes.length;
  
  const nodesWithTelemetryCount = useMemo(() => {
    return nodes.filter((n) => Boolean(telemetryMap[n.node_id])).length;
  }, [nodes, telemetryMap]);

  const nodesWithoutTelemetryCount = useMemo(() => {
    return nodes.filter((n) => !telemetryMap[n.node_id]).length;
  }, [nodes, telemetryMap]);

  const recentUnacknowledgedEventsCount = useMemo(() => {
    return recentEvents.filter((e) => e.acknowledged === 0).length;
  }, [recentEvents]);

  const activeInventoryCount = useMemo(() => {
    return nodes.filter((n) => n.active === 1).length;
  }, [nodes]);

  // Node Map for fast name lookups in events table
  const nodeLookup = useMemo(() => {
    const map = new Map<string, NodeRecord>();
    for (const node of nodes) {
      map.set(node.node_id.toUpperCase(), node);
    }
    return map;
  }, [nodes]);

  // Selected chart node record and topology determination
  const selectedChartNode = useMemo(() => {
    return nodes.find((n) => n.node_id === selectedChartNodeId) || null;
  }, [nodes, selectedChartNodeId]);

  const selectedChartLatestTelemetry = telemetryMap[selectedChartNodeId] || null;

  const isChartNodeThreePhase = useMemo(() => {
    const rawType = (selectedChartNode?.motor_type || '').toUpperCase();
    if (rawType.includes('THREE') || rawType.includes('3') || rawType.includes('POLY')) {
      return true;
    }
    if (isThreePhaseReading(selectedChartLatestTelemetry)) {
      return true;
    }
    return chartHistory.some((rec) => isThreePhaseReading(rec));
  }, [selectedChartNode?.motor_type, selectedChartLatestTelemetry, chartHistory]);

  // Compute ~5-6 evenly-spaced timestamp tick values for the chart
  const chartTicks = useMemo(() => {
    if (!chartHistory || chartHistory.length === 0) return [];
    if (chartHistory.length <= 6) {
      return chartHistory.map((item) => item.timestamp);
    }
    const desiredTickCount = 6;
    const step = (chartHistory.length - 1) / (desiredTickCount - 1);
    const selected: string[] = [];
    for (let i = 0; i < desiredTickCount; i++) {
      const idx = Math.min(Math.round(i * step), chartHistory.length - 1);
      const ts = chartHistory[idx]?.timestamp;
      if (ts && !selected.includes(ts)) {
        selected.push(ts);
      }
    }
    return selected;
  }, [chartHistory]);

  // Status badge displaying actual database telemetry status without inference
  const renderAssetStatusBadge = (statusValue: string | null | undefined, hasTelemetry: boolean) => {
    if (!hasTelemetry) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/60">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          No Telemetry
        </span>
      );
    }

    const rawStatus = (statusValue ?? '').trim();
    if (!rawStatus) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          Status: N/A
        </span>
      );
    }

    const upper = rawStatus.toUpperCase();
    let colorStyle = 'bg-slate-800 text-slate-300 border-slate-700';
    let dotColor = 'bg-slate-400';

    if (upper === 'NORMAL' || upper === 'NOMINAL' || upper === 'ONLINE') {
      colorStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      dotColor = 'bg-emerald-400';
    } else if (upper === 'WARNING' || upper === 'WARN') {
      colorStyle = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      dotColor = 'bg-amber-400';
    } else if (upper === 'CRITICAL' || upper === 'ALARM' || upper === 'TRIP' || upper === 'ERROR' || upper === 'HIGH') {
      colorStyle = 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      dotColor = 'bg-rose-400';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${colorStyle}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        Status: {rawStatus}
      </span>
    );
  };

  // Severity badge for recent events
  const renderSeverityBadge = (severity: string) => {
    const upper = (severity || '').toUpperCase();
    if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'TRIP') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80">
          {upper}
        </span>
      );
    }
    if (upper === 'WARNING' || upper === 'WARN') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
          {upper}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
        {upper || 'INFO'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header & Refresh Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-400" />
              Plant Motor Fleet Live Telemetry Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.nodes · sensor_data (15s Polling)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time condition monitoring, electrical measurements, and recent alarms directly from Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {lastRefreshedAt && (
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Polled at {lastRefreshedAt}
            </span>
          )}

          {onNavigateToPlantMap && (
            <button
              onClick={onNavigateToPlantMap}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-300 bg-teal-950/50 hover:bg-teal-900/50 border border-teal-500/30 rounded-lg transition-colors"
            >
              <span>Plant Map</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}

          {onNavigateToEvents && (
            <button
              onClick={onNavigateToEvents}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/50 hover:bg-rose-900/50 border border-rose-500/30 rounded-lg transition-colors"
            >
              <span>View Events ({recentUnacknowledgedEventsCount})</span>
            </button>
          )}

          <button
            onClick={() => loadDashboardData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Refresh latest telemetry from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin text-teal-400' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Database Error Banner */}
      {error && (
        <div className="p-4 bg-rose-950/90 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Database Query Error</span>
              <p className="text-rose-300 mt-0.5">{error}</p>
              <button
                onClick={() => loadDashboardData(false)}
                className="mt-2 px-3 py-1 bg-rose-900/60 hover:bg-rose-900 border border-rose-600/60 rounded text-[11px] font-semibold text-white transition-colors"
              >
                Retry Query
              </button>
            </div>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fleet Overview KPIs (Calculated strictly from database records) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* KPI 1: Registered Nodes */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium uppercase tracking-wider text-[11px]">Registered Nodes</span>
            <Radio className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-white tabular-nums">
              {isLoading ? '...' : totalRegisteredNodes}
            </span>
            <span className="text-xs text-slate-400">Total</span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Query: public.nodes</span>
          </div>
        </div>

        {/* KPI 2: Nodes with Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium uppercase tracking-wider text-[11px]">With Telemetry</span>
            <Activity className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-teal-300 tabular-nums">
              {isLoading ? '...' : nodesWithTelemetryCount}
            </span>
            <span className="text-xs text-slate-400">/ {totalRegisteredNodes}</span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Active sensor_data records</span>
          </div>
        </div>

        {/* KPI 3: Nodes without Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium uppercase tracking-wider text-[11px]">No Telemetry</span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-amber-300 tabular-nums">
              {isLoading ? '...' : nodesWithoutTelemetryCount}
            </span>
            <span className="text-xs text-slate-400">Nodes</span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Awaiting sensor readings</span>
          </div>
        </div>

        {/* KPI 4: Recent Unacknowledged Events */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium uppercase tracking-wider text-[11px]">Recent Unack Events</span>
            <Bell className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-rose-300 tabular-nums">
              {isLoading ? '...' : recentUnacknowledgedEventsCount}
            </span>
            <span className="text-xs text-slate-400">Events</span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>From latest {recentEvents.length} fetched</span>
          </div>
        </div>

        {/* KPI 5: Inventory Active Flag (nodes.active = 1) */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium uppercase tracking-wider text-[11px]">Inventory Active</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-cyan-300 tabular-nums">
              {isLoading ? '...' : `${activeInventoryCount} / ${totalRegisteredNodes}`}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Flag: nodes.active = 1</span>
          </div>
        </div>

      </div>

      {/* Dynamic Motor Overview Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Monitored Motor Inventory & Latest Telemetry</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Current readings per physical node retrieved directly from public.nodes and public.sensor_data.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {nodes.length} Registered Node{nodes.length === 1 ? '' : 's'}
          </span>
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading registered nodes and sensor data from Supabase...</span>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
            No motor nodes found in public.nodes.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => {
              const telemetry = telemetryMap[node.node_id] || null;
              const hasTelemetry = Boolean(telemetry);

              // Topology detection without guessing
              const rawType = (node.motor_type || '').toUpperCase();
              const isThreePhase =
                rawType.includes('THREE') ||
                rawType.includes('3') ||
                rawType.includes('POLY') ||
                isThreePhaseReading(telemetry);

              const effectiveCurrents = resolveEffectiveCurrents(telemetry);
              const effectivePower = resolveEffectivePower(telemetry);

              // Match motor in app motor fleet if present (for inspect modal)
              const matchedMotor = motors.find(
                (m) =>
                  m.tag.toUpperCase() === node.node_id.toUpperCase() ||
                  m.id.toLowerCase() === node.node_id.toLowerCase()
              );

              return (
                <div
                  key={node.id}
                  className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    {/* Header: Node ID, Name, Status */}
                    <div className="flex items-start justify-between pb-3 mb-3 border-b border-slate-800 gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-lg bg-[#0c162b] border border-slate-700/80 text-teal-400 shrink-0 mt-0.5">
                          <Radio className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-teal-300 bg-teal-950/80 border border-teal-800/80 px-2 py-0.5 rounded">
                              {node.node_id}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                node.active === 1
                                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                              title="Inventory status flag (nodes.active)"
                            >
                              {node.active === 1 ? 'Active (Inventory)' : 'Inactive (Inventory)'}
                            </span>
                          </div>
                          <h3 className="font-bold text-white text-sm mt-1">{node.name || 'Unnamed Motor'}</h3>
                          <span className="text-xs text-slate-400 font-mono block mt-0.5">
                            Location: {node.location || 'Unassigned'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        {renderAssetStatusBadge(telemetry?.status, hasTelemetry)}
                      </div>
                    </div>

                    {/* Topology & Reading Timestamp */}
                    <div className="p-2.5 rounded bg-[#0c1527] border border-slate-800/80 mb-3 space-y-1 text-xs font-mono">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[11px]">Topology:</span>
                        <span className="font-bold text-teal-300">
                          {(node.motor_type || 'UNKNOWN').replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[11px]">Last Reading:</span>
                        <span className="text-slate-200">
                          {hasTelemetry && telemetry?.timestamp ? telemetry.timestamp : 'No records recorded'}
                        </span>
                      </div>
                    </div>

                    {/* Telemetry Measurements Grid */}
                    {!hasTelemetry ? (
                      <div className="p-4 rounded bg-[#0c1424] border border-slate-800/80 text-center text-xs font-mono text-amber-400/90 my-2">
                        No telemetry records available in public.sensor_data
                      </div>
                    ) : isThreePhase ? (
                      /* Three-Phase Measurements */
                      <div className="space-y-2 mb-2 font-mono text-xs">
                        {/* Voltages L-L */}
                        <div className="p-2.5 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block mb-1">Line Voltages (L-L)</span>
                          <div className="grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="text-slate-400">L1-L2: </span>
                              <span className="font-bold text-white">
                                {telemetry?.voltage_l1_l2 !== null && telemetry?.voltage_l1_l2 !== undefined
                                  ? `${telemetry.voltage_l1_l2.toFixed(1)} V`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">L2-L3: </span>
                              <span className="font-bold text-white">
                                {telemetry?.voltage_l2_l3 !== null && telemetry?.voltage_l2_l3 !== undefined
                                  ? `${telemetry.voltage_l2_l3.toFixed(1)} V`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">L3-L1: </span>
                              <span className="font-bold text-white">
                                {telemetry?.voltage_l3_l1 !== null && telemetry?.voltage_l3_l1 !== undefined
                                  ? `${telemetry.voltage_l3_l1.toFixed(1)} V`
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Phase Currents */}
                        <div className="p-2.5 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block mb-1">Phase Currents</span>
                          <div className="grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="text-slate-400">I L1: </span>
                              <span className="font-bold text-teal-300">
                                {effectiveCurrents.l1 !== null && effectiveCurrents.l1 !== undefined
                                  ? `${effectiveCurrents.l1.toFixed(2)} A`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">I L2: </span>
                              <span className="font-bold text-cyan-300">
                                {effectiveCurrents.l2 !== null && effectiveCurrents.l2 !== undefined
                                  ? `${effectiveCurrents.l2.toFixed(2)} A`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">I L3: </span>
                              <span className="font-bold text-amber-300">
                                {effectiveCurrents.l3 !== null && effectiveCurrents.l3 !== undefined
                                  ? `${effectiveCurrents.l3.toFixed(2)} A`
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Power, Temp, Vibration */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                            <span className="text-slate-500 text-[10px] block uppercase">Power (Raw)</span>
                            <span className="font-bold text-white block mt-0.5 truncate">
                              {formatRawValue(effectivePower, 2)}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                            <span className="text-slate-500 text-[10px] block uppercase">Temp</span>
                            <span className="font-bold text-white block mt-0.5 truncate">
                              {telemetry?.temperature !== null && telemetry?.temperature !== undefined
                                ? `${telemetry.temperature.toFixed(1)} °C`
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                            <span className="text-slate-500 text-[10px] block uppercase">Vib (Raw)</span>
                            <span className="font-bold text-teal-300 block mt-0.5 truncate">
                              {formatRawValue(telemetry?.vibration, 2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Single-Phase Measurements */
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2">
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Voltage</span>
                          <span className="font-bold text-white block mt-0.5 truncate">
                            {telemetry?.voltage !== null && telemetry?.voltage !== undefined
                              ? `${telemetry.voltage.toFixed(1)} V`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Current</span>
                          <span className="font-bold text-teal-300 block mt-0.5 truncate">
                            {telemetry?.current !== null && telemetry?.current !== undefined
                              ? `${telemetry.current.toFixed(2)} A`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Power (Raw)</span>
                          <span className="font-bold text-white block mt-0.5 truncate">
                            {formatRawValue(effectivePower, 2)}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Temp</span>
                          <span className="font-bold text-white block mt-0.5 truncate">
                            {telemetry?.temperature !== null && telemetry?.temperature !== undefined
                              ? `${telemetry.temperature.toFixed(1)} °C`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Vib (Raw)</span>
                          <span className="font-bold text-teal-300 block mt-0.5 truncate">
                            {formatRawValue(telemetry?.vibration, 2)}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block uppercase">Power Factor</span>
                          <span className="font-bold text-slate-200 block mt-0.5 truncate">
                            {formatRawValue(telemetry?.power_factor, 2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setSelectedChartNodeId(node.node_id)}
                      className={`px-2.5 py-1 text-xs rounded font-mono transition-colors border ${
                        selectedChartNodeId === node.node_id
                          ? 'bg-teal-900/60 text-teal-300 border-teal-600/60 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                      }`}
                    >
                      {selectedChartNodeId === node.node_id ? 'Viewing History' : 'Plot History'}
                    </button>

                    {matchedMotor && onSelectMotor ? (
                      <button
                        onClick={() => onSelectMotor(matchedMotor)}
                        className="px-2.5 py-1 text-xs text-teal-300 hover:text-white bg-teal-950/60 hover:bg-teal-900 border border-teal-700/60 rounded font-sans transition-colors inline-flex items-center gap-1"
                      >
                        <span>Inspect Dossier</span>
                      </button>
                    ) : (
                      <span className="text-slate-500 font-mono text-[11px]">Database Record #{node.id}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical Telemetry Charts Section */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              <h2 className="font-bold text-white text-sm">
                Chronological Telemetry Trend ({selectedChartNode?.node_id || 'None'} - {selectedChartNode?.name || 'No Node Selected'})
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Historical readings from public.sensor_data ({chartHistory.length} records). NULL values plotted as gaps.
            </p>
          </div>

          {/* Node selector dropdown for chart */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium">Chart Node:</label>
            <select
              value={selectedChartNodeId}
              onChange={(e) => setSelectedChartNodeId(e.target.value)}
              disabled={isLoading || nodes.length === 0}
              className="px-3 py-1 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.node_id} className="bg-[#0b1322]">
                  {node.node_id} - {node.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoadingChart ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span>Querying historical records from public.sensor_data...</span>
            </div>
          </div>
        ) : chartHistory.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-sans text-xs bg-[#0c1424] border border-slate-800/80 rounded-xl">
            No historical sensor records logged in public.sensor_data for motor {selectedChartNodeId || 'selected'}.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Current Draw History */}
            <div className="bg-[#0c1424] border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-white">
                  {isChartNodeThreePhase ? '3-Phase Current Draw History (Amperes)' : 'Current Draw History (Amperes)'}
                </span>
                <span className="font-mono text-teal-400 text-[11px]">Historical Database Records</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartHistory} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      ticks={chartTicks.length > 0 ? chartTicks : undefined}
                      interval={0}
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      fontFamily="JetBrains Mono, monospace"
                      tickFormatter={formatTimeLabel}
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
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                      itemStyle={{ color: '#e2e8f0' }}
                      labelFormatter={(label) => `Timestamp: ${label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }} />
                    {isChartNodeThreePhase ? (
                      <>
                        <Line
                          type="monotone"
                          dataKey="current_l1"
                          name="Current L1"
                          stroke="#14b8a6"
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="current_l2"
                          name="Current L2"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="current_l3"
                          name="Current L3"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
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
                        dot={false}
                        connectNulls={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Thermal & Vibration History */}
            <div className="bg-[#0c1424] border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-white">Temperature (°C) & Raw Vibration History</span>
                <span className="font-mono text-amber-400 text-[11px]">Dual Sensor Metric</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartHistory} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      ticks={chartTicks.length > 0 ? chartTicks : undefined}
                      interval={0}
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      fontFamily="JetBrains Mono, monospace"
                      tickFormatter={formatTimeLabel}
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
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                      itemStyle={{ color: '#e2e8f0' }}
                      labelFormatter={(label) => `Timestamp: ${label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }} />
                    <Line
                      type="monotone"
                      dataKey="temperature"
                      name="Temperature (°C)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="vibration"
                      name="Vibration (Raw)"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Recent Events Log (public.event_logs) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-400" />
              <h2 className="font-bold text-white text-sm">Recent Alarms & Fault Events</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest incident and warning logs retrieved from public.event_logs.
            </p>
          </div>

          {onNavigateToEvents && (
            <button
              onClick={onNavigateToEvents}
              className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1 font-mono"
            >
              <span>View All in Events Module</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {recentEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-sans text-xs bg-[#0c1424] border border-slate-800/80 rounded-xl">
            No events currently logged in public.event_logs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-mono">
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Motor Node</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {recentEvents.slice(0, 8).map((evt) => {
                  const matchedNode = nodeLookup.get(evt.node_id.toUpperCase());
                  return (
                    <tr key={evt.id} className="hover:bg-[#0c162b] transition-colors">
                      <td className="py-2.5 px-3">
                        {renderSeverityBadge(evt.severity)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-white">{evt.node_id}</span>
                        {matchedNode && (
                          <span className="text-[11px] text-slate-400 block font-sans">
                            {matchedNode.name}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {evt.event_type}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-200 max-w-xs truncate">
                        {evt.description}
                      </td>
                      <td className="py-2.5 px-3">
                        {evt.acknowledged === 1 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Acknowledged (1)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Unacknowledged (0)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 text-[11px] whitespace-nowrap">
                        {evt.timestamp}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
