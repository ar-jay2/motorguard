import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  Clock,
  Zap,
  TrendingUp,
  RefreshCw,
  Database,
  Radio,
  AlertOctagon,
  Activity,
  Layers,
  Thermometer,
  Bell,
  X,
  ChevronRight,
  Info,
  Calendar,
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
import { Motor } from '../../types/motor';
import {
  fetchNodes,
  fetchLatestTelemetryForNodes,
  fetchTelemetryHistory,
  fetchEvents,
  NodeRecord,
  SensorDataRecord,
  EventLogRecord,
  resolveEffectiveCurrents,
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface StatisticsViewProps {
  motors?: Motor[]; // Kept for backward compatibility
  onSelectMotor?: (motor: Motor) => void;
}

interface MetricStats {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  motors = [],
  onSelectMotor,
}) => {
  // Live Supabase state
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [events, setEvents] = useState<EventLogRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [nodeHistories, setNodeHistories] = useState<Record<string, SensorDataRecord[]>>({});

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Helper to compute min, max, avg excluding NULL/undefined while strictly preserving zero
  const calculateStats = (values: (number | null | undefined)[]): MetricStats => {
    const valid = values.filter((v): v is number => v !== null && v !== undefined && typeof v === 'number');
    if (valid.length === 0) {
      return { count: 0, min: null, max: null, avg: null };
    }
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const sum = valid.reduce((acc, val) => acc + val, 0);
    const avg = sum / valid.length;
    return { count: valid.length, min, max, avg };
  };

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

  // Main data loader function
  const loadStatisticsData = useCallback(async (isBackground: boolean = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch registered nodes and recent events concurrently
      const [nodeList, eventList] = await Promise.all([
        fetchNodes(),
        fetchEvents(100),
      ]);

      // 2. Fetch latest telemetry for all nodes
      const latestMap = await fetchLatestTelemetryForNodes(nodeList);

      // 3. Fetch chronological historical sample (up to 50 records) for each registered node
      const historiesMap: Record<string, SensorDataRecord[]> = {};
      await Promise.all(
        nodeList.map(async (n) => {
          try {
            const hist = await fetchTelemetryHistory(n.node_id, 50);
            historiesMap[n.node_id] = hist;
          } catch (err) {
            console.error(`Failed to fetch history for ${n.node_id}:`, err);
            historiesMap[n.node_id] = [];
          }
        })
      );

      setNodes(nodeList);
      setEvents(eventList);
      setTelemetryMap(latestMap);
      setNodeHistories(historiesMap);
      setLastRefreshedAt(new Date().toLocaleTimeString());

      // Auto-select first node with history if current selection is not valid
      setSelectedNodeId((prev) => {
        if (prev && nodeList.some((n) => n.node_id === prev)) {
          return prev;
        }
        const firstWithRecords = nodeList.find((n) => (historiesMap[n.node_id] || []).length > 0);
        return firstWithRecords ? firstWithRecords.node_id : nodeList[0]?.node_id || '';
      });
    } catch (err: any) {
      console.error('Failed to query statistics data from Supabase:', err);
      setError(err?.message || 'Database error: Could not query Supabase tables.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and 15-second background polling
  useEffect(() => {
    let isMounted = true;

    loadStatisticsData(false);

    const intervalId = setInterval(() => {
      if (isMounted) {
        loadStatisticsData(true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [loadStatisticsData]);

  // Selected node and its history
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.node_id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const selectedNodeHistory = useMemo(() => {
    return nodeHistories[selectedNodeId] || [];
  }, [nodeHistories, selectedNodeId]);

  const selectedNodeLatest = telemetryMap[selectedNodeId] || null;

  // Topology of the selected node
  const isSelectedNodeThreePhase = useMemo(() => {
    const rawType = (selectedNode?.motor_type || '').toUpperCase();
    if (rawType.includes('THREE') || rawType.includes('3') || rawType.includes('POLY')) {
      return true;
    }
    if (isThreePhaseReading(selectedNodeLatest)) {
      return true;
    }
    return selectedNodeHistory.some((rec) => isThreePhaseReading(rec));
  }, [selectedNode?.motor_type, selectedNodeLatest, selectedNodeHistory]);

  // Statistical calculations for the selected node's sampled history (up to 50 records)
  const statsTemperature = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.temperature));
  }, [selectedNodeHistory]);

  const statsVibration = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.vibration));
  }, [selectedNodeHistory]);

  const statsCurrent = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.current));
  }, [selectedNodeHistory]);

  const statsVoltage = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.voltage));
  }, [selectedNodeHistory]);

  const statsPower = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => resolveEffectivePower(h)));
  }, [selectedNodeHistory]);

  const statsCurrentL1 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.current_l1));
  }, [selectedNodeHistory]);

  const statsCurrentL2 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.current_l2));
  }, [selectedNodeHistory]);

  const statsCurrentL3 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.current_l3));
  }, [selectedNodeHistory]);

  const statsVoltageL1L2 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.voltage_l1_l2));
  }, [selectedNodeHistory]);

  const statsVoltageL2L3 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.voltage_l2_l3));
  }, [selectedNodeHistory]);

  const statsVoltageL3L1 = useMemo(() => {
    return calculateStats(selectedNodeHistory.map((h) => h.voltage_l3_l1));
  }, [selectedNodeHistory]);

  // Timestamp bounds of the sampled history
  const historyTimestampRange = useMemo(() => {
    if (selectedNodeHistory.length === 0) return null;
    const earliest = selectedNodeHistory[0].timestamp;
    const latest = selectedNodeHistory[selectedNodeHistory.length - 1].timestamp;
    return { earliest, latest };
  }, [selectedNodeHistory]);

  // Evenly spaced ticks (~5–6 ticks) for chart X-axis
  const chartTicks = useMemo(() => {
    if (!selectedNodeHistory || selectedNodeHistory.length === 0) return [];
    if (selectedNodeHistory.length <= 6) {
      return selectedNodeHistory.map((item) => item.timestamp);
    }
    const desiredTickCount = 6;
    const step = (selectedNodeHistory.length - 1) / (desiredTickCount - 1);
    const selected: string[] = [];
    for (let i = 0; i < desiredTickCount; i++) {
      const idx = Math.min(Math.round(i * step), selectedNodeHistory.length - 1);
      const ts = selectedNodeHistory[idx]?.timestamp;
      if (ts && !selected.includes(ts)) {
        selected.push(ts);
      }
    }
    return selected;
  }, [selectedNodeHistory]);

  // Fleet overview counts
  const totalNodesCount = nodes.length;
  const nodesWithTelemetryCount = useMemo(() => {
    return nodes.filter((n) => (nodeHistories[n.node_id] || []).length > 0 || Boolean(telemetryMap[n.node_id])).length;
  }, [nodes, nodeHistories, telemetryMap]);

  const nodesWithoutTelemetryCount = totalNodesCount - nodesWithTelemetryCount;

  // Event log statistics (from fetched records)
  const eventStats = useMemo(() => {
    const totalFetched = events.length;
    const unacknowledged = events.filter((e) => e.acknowledged === 0).length;
    const acknowledged = events.filter((e) => e.acknowledged === 1).length;

    const severityCounts: Record<string, number> = {};
    for (const e of events) {
      const sev = (e.severity || 'UNKNOWN').toUpperCase();
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    }

    return { totalFetched, unacknowledged, acknowledged, severityCounts };
  }, [events]);

  return (
    <div className="space-y-6">
      
      {/* Title & Polling Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-400" />
              Motor Telemetry Statistics & Historical Distribution
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.sensor_data · event_logs (15s Polling)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Statistical calculations (Min, Max, Mean) computed strictly from actual Supabase records.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {lastRefreshedAt && (
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Polled at {lastRefreshedAt}
            </span>
          )}

          <button
            onClick={() => loadStatisticsData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Refresh statistics calculations from Supabase"
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
                onClick={() => loadStatisticsData(false)}
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

      {/* Statistical Scope & Integrity Notice */}
      <div className="p-3.5 bg-[#0c1527] border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-white">Data Scope & Verification Standard</span>
          <p className="text-slate-400 leading-relaxed">
            All statistical aggregates below are derived exclusively from real records in <code className="font-mono text-teal-300">public.sensor_data</code> and <code className="font-mono text-teal-300">public.event_logs</code>. 
            Telemetry calculations cover up to the latest 50 chronological records per node. 
            NULL values are excluded from averages; actual zero readings are strictly preserved. 
            No synthetic health index, ISO compliance score, failure probability, or unverified energy integration is calculated.
          </p>
        </div>
      </div>

      {/* Fleet Inventory & Records Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        
        {/* KPI 1: Registered Nodes */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Registered Nodes</span>
            <Radio className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-white tabular-nums">
              {isLoading ? '...' : totalNodesCount}
            </span>
            <span className="text-xs text-slate-400">Total</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">From public.nodes</span>
        </div>

        {/* KPI 2: Nodes with Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">With Telemetry</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-emerald-300 tabular-nums">
              {isLoading ? '...' : nodesWithTelemetryCount}
            </span>
            <span className="text-xs text-slate-400">/ {totalNodesCount}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">Has sensor records</span>
        </div>

        {/* KPI 3: Nodes Awaiting Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">No Telemetry</span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-amber-300 tabular-nums">
              {isLoading ? '...' : nodesWithoutTelemetryCount}
            </span>
            <span className="text-xs text-slate-400">Nodes</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">e.g. M002 registered</span>
        </div>

        {/* KPI 4: Fetched Event Logs Sample */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Recent Events Sample</span>
            <Bell className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-cyan-300 tabular-nums">
              {isLoading ? '...' : eventStats.totalFetched}
            </span>
            <span className="text-xs text-slate-400">Records</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">
            {eventStats.unacknowledged} Unack · {eventStats.acknowledged} Ack
          </span>
        </div>

      </div>

      {/* Node Historical Statistical Profile Section */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-5">
        
        {/* Section Header with Node Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              <h2 className="font-bold text-white text-sm">
                Statistical Summary for Node: {selectedNode?.node_id || 'None'} ({selectedNode?.name || 'No Node Selected'})
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Calculated across the latest {selectedNodeHistory.length} chronological records in public.sensor_data.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium whitespace-nowrap">Select Motor Node:</label>
            <select
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              disabled={isLoading || nodes.length === 0}
              className="px-3 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.node_id} className="bg-[#0b1322]">
                  {n.node_id} - {n.name} ({(n.motor_type || 'UNKNOWN').replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Empty state if node has no telemetry records */}
        {selectedNodeHistory.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-sans text-xs bg-[#0c1424] border border-slate-800/80 rounded-xl space-y-2">
            <AlertOctagon className="w-8 h-8 text-amber-400 mx-auto" />
            <span className="font-bold text-white text-sm block">No Telemetry Records Available</span>
            <p className="text-slate-400 max-w-md mx-auto">
              Motor <strong className="text-white font-mono">{selectedNode?.node_id}</strong> ({selectedNode?.name}) has zero records recorded in <code className="font-mono text-teal-300">public.sensor_data</code>.
            </p>
            <span className="text-[11px] font-mono text-slate-500 block">
              Topology: {selectedNode?.motor_type || 'N/A'} · Location: {selectedNode?.location || 'N/A'}
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Sampling Metadata Strip */}
            <div className="p-3 rounded-lg bg-[#0c1527] border border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
              <div className="flex items-center gap-3">
                <span>
                  Sample Records: <strong className="text-teal-300">{selectedNodeHistory.length}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Topology: <strong className="text-white">{(selectedNode?.motor_type || 'UNKNOWN').replace('_', ' ').toUpperCase()}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Location: <strong className="text-slate-200">{selectedNode?.location || 'Unassigned'}</strong>
                </span>
              </div>
              {historyTimestampRange && (
                <div className="text-slate-500 text-[11px]">
                  Time Span: {historyTimestampRange.earliest} → {historyTimestampRange.latest}
                </div>
              )}
            </div>

            {/* Statistical Cards Grid (Min, Max, Mean) */}
            {isSelectedNodeThreePhase ? (
              /* Three-Phase Statistical Cards */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
                
                {/* Stat Card 1: 3-Phase Current Draws */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-2 font-sans font-medium">Phase Currents (A)</span>
                  <div className="space-y-2">
                    <div className="border-b border-slate-800/60 pb-1">
                      <span className="text-teal-300 font-bold block text-[11px]">Current L1 (n={statsCurrentL1.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsCurrentL1.min, 2)} A</span>
                        <span>Max: {formatRaw(statsCurrentL1.max, 2)} A</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsCurrentL1.avg, 2)} A</span>
                      </div>
                    </div>
                    <div className="border-b border-slate-800/60 pb-1">
                      <span className="text-cyan-300 font-bold block text-[11px]">Current L2 (n={statsCurrentL2.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsCurrentL2.min, 2)} A</span>
                        <span>Max: {formatRaw(statsCurrentL2.max, 2)} A</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsCurrentL2.avg, 2)} A</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-amber-300 font-bold block text-[11px]">Current L3 (n={statsCurrentL3.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsCurrentL3.min, 2)} A</span>
                        <span>Max: {formatRaw(statsCurrentL3.max, 2)} A</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsCurrentL3.avg, 2)} A</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stat Card 2: Line Voltages L-L */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-2 font-sans font-medium">Line Voltages L-L (V)</span>
                  <div className="space-y-2">
                    <div className="border-b border-slate-800/60 pb-1">
                      <span className="text-slate-400 font-bold block text-[11px]">V L1-L2 (n={statsVoltageL1L2.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsVoltageL1L2.min, 1)} V</span>
                        <span>Max: {formatRaw(statsVoltageL1L2.max, 1)} V</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsVoltageL1L2.avg, 1)} V</span>
                      </div>
                    </div>
                    <div className="border-b border-slate-800/60 pb-1">
                      <span className="text-slate-400 font-bold block text-[11px]">V L2-L3 (n={statsVoltageL2L3.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsVoltageL2L3.min, 1)} V</span>
                        <span>Max: {formatRaw(statsVoltageL2L3.max, 1)} V</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsVoltageL2L3.avg, 1)} V</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[11px]">V L3-L1 (n={statsVoltageL3L1.count})</span>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-0.5">
                        <span>Min: {formatRaw(statsVoltageL3L1.min, 1)} V</span>
                        <span>Max: {formatRaw(statsVoltageL3L1.max, 1)} V</span>
                        <span className="font-bold text-white">Avg: {formatRaw(statsVoltageL3L1.avg, 1)} V</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stat Card 3: Measured Power (Raw) */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase block mb-2 font-sans font-medium">Power (Raw Value)</span>
                    <span className="text-[10px] text-slate-500 block mb-1">Sample size: {statsPower.count} records</span>
                    <div className="space-y-1.5 text-xs text-slate-300 mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Minimum:</span>
                        <span className="font-bold text-white">{formatRaw(statsPower.min, 2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Maximum:</span>
                        <span className="font-bold text-white">{formatRaw(statsPower.max, 2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800/80 pt-1.5 text-teal-300 font-bold">
                        <span>Mean / Avg:</span>
                        <span>{formatRaw(statsPower.avg, 2)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 block pt-2 mt-2 border-t border-slate-800/80">
                    Source unit unverified in schema.
                  </span>
                </div>

                {/* Stat Card 4: Temperature & Vibration */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase block mb-2 font-sans font-medium">Thermal & Vibration</span>
                    <div className="space-y-2">
                      <div className="border-b border-slate-800/60 pb-1.5">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Temperature (°C)</span>
                          <span className="text-slate-500 font-sans">n={statsTemperature.count}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-300 mt-1">
                          <span>Min: {formatRaw(statsTemperature.min, 1)} °C</span>
                          <span>Max: {formatRaw(statsTemperature.max, 1)} °C</span>
                          <span className="font-bold text-amber-300">Avg: {formatRaw(statsTemperature.avg, 1)} °C</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Vibration (Raw)</span>
                          <span className="text-slate-500 font-sans">n={statsVibration.count}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-300 mt-1">
                          <span>Min: {formatRaw(statsVibration.min, 2)}</span>
                          <span>Max: {formatRaw(statsVibration.max, 2)}</span>
                          <span className="font-bold text-teal-300">Avg: {formatRaw(statsVibration.avg, 2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 block pt-2 mt-2 border-t border-slate-800/80">
                    Raw sensor value without physical unit.
                  </span>
                </div>

              </div>
            ) : (
              /* Single-Phase Statistical Cards */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
                
                {/* Stat Card 1: Measured Current */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-1 font-sans font-medium">Measured Current (A)</span>
                  <span className="text-[10px] text-slate-500 block mb-2">Sample size: {statsCurrent.count} records</span>
                  <div className="space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Minimum:</span>
                      <span className="font-bold text-white">{formatRaw(statsCurrent.min, 2)} A</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Maximum:</span>
                      <span className="font-bold text-white">{formatRaw(statsCurrent.max, 2)} A</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800/80 pt-1.5 text-teal-300 font-bold">
                      <span>Mean / Avg:</span>
                      <span>{formatRaw(statsCurrent.avg, 2)} A</span>
                    </div>
                  </div>
                </div>

                {/* Stat Card 2: Measured Voltage */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-1 font-sans font-medium">Line Voltage (V)</span>
                  <span className="text-[10px] text-slate-500 block mb-2">Sample size: {statsVoltage.count} records</span>
                  <div className="space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Minimum:</span>
                      <span className="font-bold text-white">{formatRaw(statsVoltage.min, 1)} V</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Maximum:</span>
                      <span className="font-bold text-white">{formatRaw(statsVoltage.max, 1)} V</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800/80 pt-1.5 text-teal-300 font-bold">
                      <span>Mean / Avg:</span>
                      <span>{formatRaw(statsVoltage.avg, 1)} V</span>
                    </div>
                  </div>
                </div>

                {/* Stat Card 3: Measured Power (Raw) */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-1 font-sans font-medium">Power (Raw Value)</span>
                  <span className="text-[10px] text-slate-500 block mb-2">Sample size: {statsPower.count} records</span>
                  <div className="space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Minimum:</span>
                      <span className="font-bold text-white">{formatRaw(statsPower.min, 2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Maximum:</span>
                      <span className="font-bold text-white">{formatRaw(statsPower.max, 2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800/80 pt-1.5 text-teal-300 font-bold">
                      <span>Mean / Avg:</span>
                      <span>{formatRaw(statsPower.avg, 2)}</span>
                    </div>
                  </div>
                </div>

                {/* Stat Card 4: Temperature & Vibration */}
                <div className="p-4 rounded-lg bg-[#0c1424] border border-slate-800">
                  <span className="text-slate-400 text-[11px] uppercase block mb-2 font-sans font-medium">Thermal & Vibration</span>
                  <div className="space-y-2">
                    <div className="border-b border-slate-800/60 pb-1.5">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Temperature (°C)</span>
                        <span className="text-slate-500 font-sans">n={statsTemperature.count}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-1">
                        <span>Min: {formatRaw(statsTemperature.min, 1)} °C</span>
                        <span>Max: {formatRaw(statsTemperature.max, 1)} °C</span>
                        <span className="font-bold text-amber-300">Avg: {formatRaw(statsTemperature.avg, 1)} °C</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Vibration (Raw)</span>
                        <span className="text-slate-500 font-sans">n={statsVibration.count}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300 mt-1">
                        <span>Min: {formatRaw(statsVibration.min, 2)}</span>
                        <span>Max: {formatRaw(statsVibration.max, 2)}</span>
                        <span className="font-bold text-teal-300">Avg: {formatRaw(statsVibration.avg, 2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Historical Charts for the Selected Node */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              
              {/* Chart 1: Current Draw Trend */}
              <div className="bg-[#0c1424] border border-slate-800/80 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="font-bold text-white">
                    {isSelectedNodeThreePhase ? '3-Phase Current Draw History (A)' : 'Current Draw History (A)'}
                  </span>
                  <span className="font-mono text-teal-400 text-[11px]">Chronological Database Records</span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedNodeHistory} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
                      
                      {isSelectedNodeThreePhase ? (
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

              {/* Chart 2: Thermal & Vibration Trend */}
              <div className="bg-[#0c1424] border border-slate-800/80 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="font-bold text-white">Temperature (°C) & Raw Vibration History</span>
                  <span className="font-mono text-amber-400 text-[11px]">Dual Sensor Trend</span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedNodeHistory} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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

          </div>
        )}

      </div>

      {/* Fleet Comparative Statistics Matrix (Table) */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-bold text-white text-sm">Fleet Nodes Statistical Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Statistical range (Min / Max / Mean) across sampled chronological records per registered node.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 font-sans">Node / Name</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Topology</th>
                <th className="py-2.5 px-3 text-center">Sample Records</th>
                <th className="py-2.5 px-3 text-right">Temp Range (°C)</th>
                <th className="py-2.5 px-3 text-right">Vib Range (Raw)</th>
                <th className="py-2.5 px-3 text-right">Power Range (Raw)</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {nodes.map((node) => {
                const history = nodeHistories[node.node_id] || [];
                const tempS = calculateStats(history.map((h) => h.temperature));
                const vibS = calculateStats(history.map((h) => h.vibration));
                const pwrS = calculateStats(history.map((h) => resolveEffectivePower(h)));

                return (
                  <tr
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.node_id)}
                    className={`cursor-pointer transition-colors ${
                      selectedNodeId === node.node_id ? 'bg-[#0c162b]' : 'hover:bg-[#0c162b]/50'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span className="font-sans font-bold text-white block">{node.name}</span>
                      <span className="text-teal-400 text-[11px]">{node.node_id}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {node.location || 'Unassigned'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {(node.motor_type || 'UNKNOWN').replace('_', ' ').toUpperCase()}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {history.length > 0 ? (
                        <span className="px-2 py-0.5 rounded text-[11px] bg-teal-950/80 text-teal-300 border border-teal-800/80">
                          {history.length} records
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] bg-amber-950/60 text-amber-400 border border-amber-800/60">
                          0 (No Telemetry)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {tempS.count > 0 ? (
                        <span>
                          {formatRaw(tempS.min, 1)} – {formatRaw(tempS.max, 1)} °C{' '}
                          <span className="text-amber-400 font-bold">({formatRaw(tempS.avg, 1)} avg)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {vibS.count > 0 ? (
                        <span>
                          {formatRaw(vibS.min, 2)} – {formatRaw(vibS.max, 2)}{' '}
                          <span className="text-teal-300 font-bold">({formatRaw(vibS.avg, 2)} avg)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {pwrS.count > 0 ? (
                        <span>
                          {formatRaw(pwrS.min, 2)} – {formatRaw(pwrS.max, 2)}{' '}
                          <span className="text-white font-bold">({formatRaw(pwrS.avg, 2)} avg)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.node_id);
                        }}
                        className={`px-2.5 py-1 text-xs rounded font-sans transition-colors border ${
                          selectedNodeId === node.node_id
                            ? 'bg-teal-600 text-white border-teal-500'
                            : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                        }`}
                      >
                        {selectedNodeId === node.node_id ? 'Active' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Event Log Distribution Breakdown */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h2 className="font-bold text-white text-sm">Event Log Category Distribution</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown computed from the latest {eventStats.totalFetched} records retrieved from public.event_logs.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {eventStats.unacknowledged} Unacknowledged (0) · {eventStats.acknowledged} Acknowledged (1)
          </span>
        </div>

        {eventStats.totalFetched === 0 ? (
          <div className="p-8 text-center text-slate-400 font-sans text-xs bg-[#0c1424] border border-slate-800/80 rounded-xl">
            No events found in public.event_logs.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            {Object.entries(eventStats.severityCounts).map(([sev, count]) => (
              <div key={sev} className="p-3 rounded-lg bg-[#0c1424] border border-slate-800/80">
                <span className="text-slate-400 text-[10px] uppercase block mb-1">
                  Severity: {sev}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-white tabular-nums">{count}</span>
                  <span className="text-[11px] text-slate-400">events</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">
                  {((count / eventStats.totalFetched) * 100).toFixed(1)}% of sampled logs
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
