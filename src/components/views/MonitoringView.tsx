import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Zap,
  Sliders,
  RefreshCw,
  AlertOctagon,
  Radio,
  Layers,
  Database,
  X,
  Clock,
  Thermometer,
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
  fetchLatestTelemetryForNode,
  fetchTelemetryHistory,
  NodeRecord,
  SensorDataRecord,
  resolveEffectiveCurrents,
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface MonitoringViewProps {
  motors?: Motor[]; // Kept for interface backward compatibility
  onSelectMotor?: (motor: Motor) => void;
  onSimulateValueChange?: (motorId: string, changes: Partial<Motor>) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = () => {
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [latestTelemetry, setLatestTelemetry] = useState<SensorDataRecord | null>(null);
  const [history, setHistory] = useState<SensorDataRecord[]>([]);

  const [isLoadingNodes, setIsLoadingNodes] = useState<boolean>(true);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // 1. Load registered nodes from public.nodes on mount
  useEffect(() => {
    let isMounted = true;

    const loadInitialNodes = async () => {
      setIsLoadingNodes(true);
      setDbError(null);
      try {
        const nodeList = await fetchNodes();
        if (isMounted) {
          setNodes(nodeList);
          if (nodeList.length > 0) {
            setSelectedNodeId(nodeList[0].node_id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load nodes:', err);
        if (isMounted) {
          setDbError(err?.message || 'Database error: Could not query public.nodes.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingNodes(false);
        }
      }
    };

    loadInitialNodes();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load latest telemetry and history for the currently selected node
  const loadNodeTelemetry = useCallback(
    async (nodeId: string, isBackground: boolean = false) => {
      if (!nodeId) return;

      if (!isBackground) {
        setIsLoadingTelemetry(true);
      } else {
        setIsRefreshing(true);
      }
      setDbError(null);

      try {
        const [latest, hist] = await Promise.all([
          fetchLatestTelemetryForNode(nodeId),
          fetchTelemetryHistory(nodeId, 50),
        ]);

        setLatestTelemetry(latest);
        setHistory(hist);
        setLastRefreshedAt(new Date().toLocaleTimeString());
      } catch (err: any) {
        console.error(`Failed to load telemetry for node ${nodeId}:`, err);
        setDbError(err?.message || `Database error: Could not query telemetry for ${nodeId}.`);
      } finally {
        setIsLoadingTelemetry(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  // Fetch telemetry whenever selectedNodeId changes, and refresh every 15 seconds
  useEffect(() => {
    if (!selectedNodeId) return;

    let isMounted = true;

    // Load immediately
    loadNodeTelemetry(selectedNodeId, false);

    // 15-second automatic refresh polling
    const intervalId = setInterval(() => {
      if (isMounted) {
        loadNodeTelemetry(selectedNodeId, true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedNodeId, loadNodeTelemetry]);

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId) || null;

  // Determine topology dynamically from the node's motor_type and actual phase fields:
  // 1. Check node's motor_type (e.g. 'THREE', '3_PHASE', '3-PHASE', '3PHASE', 'POLYPHASE')
  // 2. Check latest telemetry record for actual phase fields (current_l1/l2/l3, voltage_l1_l2, etc.)
  // 3. Check historical records for any actual populated phase fields
  const isThreePhase = React.useMemo(() => {
    const rawType = (selectedNode?.motor_type || '').toUpperCase();
    if (rawType.includes('THREE') || rawType.includes('3') || rawType.includes('POLY')) {
      return true;
    }
    if (isThreePhaseReading(latestTelemetry)) {
      return true;
    }
    return history.some((rec) => isThreePhaseReading(rec));
  }, [selectedNode?.motor_type, latestTelemetry, history]);

  const hasTelemetry = latestTelemetry !== null;

  // Effective current & power helpers
  const effectiveCurrents = resolveEffectiveCurrents(latestTelemetry);
  const effectivePower = resolveEffectivePower(latestTelemetry);

  // Helper to format timestamp label for chart X-axis
  const formatTimeLabel = (ts: string) => {
    if (!ts) return '';
    if (ts.length >= 19 && (ts.includes(' ') || ts.includes('T'))) {
      return ts.slice(11, 19);
    }
    return ts;
  };

  // Helper to format raw numeric telemetry values: preserves NULL as 'N/A' and actual zero as '0'
  const formatRawValue = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Compute evenly-spaced timestamp tick values (~5 to 7 ticks) across the historical dataset
  const chartTicks = React.useMemo(() => {
    if (!history || history.length === 0) return [];
    if (history.length <= 6) {
      return history.map((item) => item.timestamp);
    }
    const desiredTickCount = 6;
    const step = (history.length - 1) / (desiredTickCount - 1);
    const selectedTicks: string[] = [];
    for (let i = 0; i < desiredTickCount; i++) {
      const index = Math.min(Math.round(i * step), history.length - 1);
      const ts = history[index]?.timestamp;
      if (ts && !selectedTicks.includes(ts)) {
        selectedTicks.push(ts);
      }
    }
    return selectedTicks;
  }, [history]);

  // Status badge displaying the actual database status without inference
  const renderAssetStatusBadge = (statusValue: string | null | undefined, hasRecord: boolean) => {
    if (!hasRecord) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/60">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          No Telemetry Available
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

    // Display the actual database status text
    const upper = rawStatus.toUpperCase();
    let colorStyle = 'bg-slate-800 text-slate-300 border-slate-700';
    let dotColor = 'bg-slate-400';

    if (upper === 'NORMAL' || upper === 'NOMINAL' || upper === 'ONLINE') {
      colorStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      dotColor = 'bg-emerald-400';
    } else if (upper === 'WARNING' || upper === 'WARN') {
      colorStyle = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      dotColor = 'bg-amber-400';
    } else if (upper === 'CRITICAL' || upper === 'ALARM' || upper === 'TRIP' || upper === 'ERROR') {
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

  return (
    <div className="space-y-6">
      
      {/* Top Header & Node Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-400" />
              High-Resolution Condition Monitoring Console
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.sensor_data (15s Polling)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Displaying actual motor measurements and electrical telemetry from Supabase.
          </p>
        </div>

        {/* Node Dropdown Selector & Refresh */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <label className="text-xs text-slate-400 font-medium">Monitored Node:</label>
          <select
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            disabled={isLoadingNodes || nodes.length === 0}
            className="px-3 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.node_id} className="bg-[#0b1322]">
                {node.node_id} - {node.name} ({(node.motor_type || 'UNKNOWN').replace('_', ' ')})
              </option>
            ))}
          </select>

          <button
            onClick={() => loadNodeTelemetry(selectedNodeId, false)}
            disabled={isLoadingTelemetry || isRefreshing || !selectedNodeId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Refresh latest telemetry from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoadingTelemetry ? 'animate-spin text-teal-400' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Database Error Banner */}
      {dbError && (
        <div className="p-4 bg-rose-950/90 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Database Query Error</span>
              <p className="text-rose-300 mt-0.5">{dbError}</p>
              <button
                onClick={() => loadNodeTelemetry(selectedNodeId, false)}
                className="mt-2 px-3 py-1 bg-rose-900/60 hover:bg-rose-900 border border-rose-600/60 rounded text-[11px] font-semibold text-white transition-colors"
              >
                Retry Query
              </button>
            </div>
          </div>
          <button onClick={() => setDbError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected Asset Banner */}
      {selectedNode && (
        <div className="p-4 rounded-xl bg-[#090f1d] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-teal-950/60 border border-teal-600/40 text-teal-400">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-teal-400 bg-teal-950/80 border border-teal-800/80 px-2 py-0.5 rounded">
                  {selectedNode.node_id}
                </span>
                <h2 className="text-base font-bold text-white">{selectedNode.name}</h2>
                {renderAssetStatusBadge(latestTelemetry?.status, hasTelemetry)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span>Location: <strong className="text-slate-200">{selectedNode.location || 'Unassigned'}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Topology: <strong className="text-teal-300 font-mono">{(selectedNode.motor_type || 'UNKNOWN').replace('_', ' ')}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Active Flag: <strong className="text-slate-200 font-mono">{selectedNode.active === 1 ? '1 (Active)' : '0 (Inactive)'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Last Reading:</span>
              <strong className="text-white">
                {latestTelemetry?.timestamp || 'No telemetry recorded'}
              </strong>
            </span>
            {lastRefreshedAt && (
              <span className="text-slate-500 text-[11px]">
                (Polled at {lastRefreshedAt})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isLoadingTelemetry ? (
        <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving actual telemetry from public.sensor_data...</span>
          </div>
        </div>
      ) : !hasTelemetry ? (
        /* Explicit Empty State for nodes without telemetry records */
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/80 text-amber-400 flex items-center justify-center mx-auto">
            <Radio className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-base font-bold text-white">No Telemetry Available</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
            No telemetry records are currently available in <code className="font-mono text-teal-300">public.sensor_data</code> for motor <strong className="text-white font-mono">{selectedNode?.node_id}</strong> ({selectedNode?.name}).
          </p>
          <div className="pt-2 text-xs font-mono text-slate-500">
            Location: {selectedNode?.location || 'N/A'} · Topology: {selectedNode?.motor_type || 'N/A'}
          </div>
        </div>
      ) : (
        /* Actual Telemetry Display */
        <div className="space-y-6">
          
          {/* Telemetry Metric Cards */}
          {isThreePhase ? (
            /* Three-Phase Cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: 3-Phase Voltages */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Line Voltages (L-L)</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">V L1-L2:</span>
                    <span className="font-bold text-white">
                      {latestTelemetry?.voltage_l1_l2 !== null && latestTelemetry?.voltage_l1_l2 !== undefined
                        ? `${latestTelemetry.voltage_l1_l2.toFixed(1)} V`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">V L2-L3:</span>
                    <span className="font-bold text-white">
                      {latestTelemetry?.voltage_l2_l3 !== null && latestTelemetry?.voltage_l2_l3 !== undefined
                        ? `${latestTelemetry.voltage_l2_l3.toFixed(1)} V`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">V L3-L1:</span>
                    <span className="font-bold text-white">
                      {latestTelemetry?.voltage_l3_l1 !== null && latestTelemetry?.voltage_l3_l1 !== undefined
                        ? `${latestTelemetry.voltage_l3_l1.toFixed(1)} V`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono flex justify-between text-slate-400">
                  <span>Imbalance:</span>
                  <span className="text-teal-300 font-bold">
                    {latestTelemetry?.voltage_imbalance !== null && latestTelemetry?.voltage_imbalance !== undefined
                      ? `${latestTelemetry.voltage_imbalance.toFixed(2)}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Card 2: 3-Phase Currents */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Phase Currents</span>
                  <Activity className="w-4 h-4 text-teal-400" />
                </div>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">I L1:</span>
                    <span className="font-bold text-teal-300">
                      {effectiveCurrents.l1 !== null && effectiveCurrents.l1 !== undefined
                        ? `${effectiveCurrents.l1.toFixed(2)} A`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">I L2:</span>
                    <span className="font-bold text-cyan-300">
                      {effectiveCurrents.l2 !== null && effectiveCurrents.l2 !== undefined
                        ? `${effectiveCurrents.l2.toFixed(2)} A`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">I L3:</span>
                    <span className="font-bold text-amber-300">
                      {effectiveCurrents.l3 !== null && effectiveCurrents.l3 !== undefined
                        ? `${effectiveCurrents.l3.toFixed(2)} A`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono flex justify-between text-slate-400">
                  <span>Current Imbalance:</span>
                  <span className="text-teal-300 font-bold">
                    {latestTelemetry?.current_imbalance !== null && latestTelemetry?.current_imbalance !== undefined
                      ? `${latestTelemetry.current_imbalance.toFixed(2)}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Card 3: Power Telemetry (Raw without unverified units) */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Measured Power (Raw)</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {formatRawValue(effectivePower, 2)}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] font-mono text-slate-400 border-t border-slate-800 pt-2">
                  <div className="flex justify-between">
                    <span>Power Factor (cos φ):</span>
                    <span className="text-white font-bold">
                      {formatRawValue(latestTelemetry?.power_factor, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Frequency:</span>
                    <span className="text-white font-bold">
                      {latestTelemetry?.frequency !== null && latestTelemetry?.frequency !== undefined
                        ? `${latestTelemetry.frequency.toFixed(2)} Hz`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Energy (Raw):</span>
                    <span className="text-slate-300">
                      {formatRawValue(latestTelemetry?.energy)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Temperature & Vibration */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Physical Condition</span>
                  <Thermometer className="w-4 h-4 text-amber-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Temperature</span>
                    <span className="text-lg font-bold text-white block mt-0.5">
                      {latestTelemetry?.temperature !== null && latestTelemetry?.temperature !== undefined
                        ? `${latestTelemetry.temperature.toFixed(1)} °C`
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Vibration (Raw)</span>
                    <span className="text-lg font-bold text-teal-300 block mt-0.5">
                      {formatRawValue(latestTelemetry?.vibration, 2)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                  Raw vibration value displayed without physical unit.
                </div>
              </div>
            </div>
          ) : (
            /* Single-Phase Cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Voltage */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Line Voltage</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {latestTelemetry?.voltage !== null && latestTelemetry?.voltage !== undefined
                      ? `${latestTelemetry.voltage.toFixed(1)} V`
                      : 'N/A'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex justify-between border-t border-slate-800 pt-2 font-mono">
                  <span>Frequency:</span>
                  <span className="text-white">
                    {latestTelemetry?.frequency !== null && latestTelemetry?.frequency !== undefined
                      ? `${latestTelemetry.frequency.toFixed(2)} Hz`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Card 2: Current */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Measured Current</span>
                  <Activity className="w-4 h-4 text-teal-400" />
                </div>
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-2xl font-bold text-teal-300 tabular-nums">
                    {latestTelemetry?.current !== null && latestTelemetry?.current !== undefined
                      ? `${latestTelemetry.current.toFixed(2)} A`
                      : 'N/A'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex justify-between border-t border-slate-800 pt-2 font-mono">
                  <span>Power Factor (cos φ):</span>
                  <span className="text-white">
                    {formatRawValue(latestTelemetry?.power_factor, 2)}
                  </span>
                </div>
              </div>

              {/* Card 3: Measured Power (Raw without unverified units) */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Measured Power (Raw)</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {formatRawValue(effectivePower, 2)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex justify-between border-t border-slate-800 pt-2 font-mono">
                  <span>Energy (Raw):</span>
                  <span className="text-slate-300">
                    {formatRawValue(latestTelemetry?.energy)}
                  </span>
                </div>
              </div>

              {/* Card 4: Temperature & Vibration */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium uppercase tracking-wider">Physical Sensors</span>
                  <Thermometer className="w-4 h-4 text-amber-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Temperature</span>
                    <span className="text-lg font-bold text-white block mt-0.5">
                      {latestTelemetry?.temperature !== null && latestTelemetry?.temperature !== undefined
                        ? `${latestTelemetry.temperature.toFixed(1)} °C`
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Vibration (Raw)</span>
                    <span className="text-lg font-bold text-teal-300 block mt-0.5">
                      {formatRawValue(latestTelemetry?.vibration, 2)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                  Raw vibration value displayed without physical unit.
                </div>
              </div>
            </div>
          )}

          {/* Historical Telemetry Charts */}
          {history.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Chart 1: Current Time-Series */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div>
                    <h2 className="font-bold text-white text-sm">
                      {isThreePhase ? '3-Phase Current Draw History (Amperes)' : 'Current Draw History (Amperes)'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Chronological readings from public.sensor_data ({history.length} records).
                    </p>
                  </div>
                  <span className="font-mono text-xs text-teal-400">Historical Database Records</span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
                      
                      {isThreePhase ? (
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

              {/* Chart 2: Temperature & Vibration History */}
              <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div>
                    <h2 className="font-bold text-white text-sm">
                      Thermal & Vibration Telemetry History
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Temperature (°C) and raw vibration sensor points ({history.length} records).
                    </p>
                  </div>
                  <span className="font-mono text-xs text-amber-400">Dual Sensor Metric</span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
          ) : (
            <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400 font-sans">
              No historical sensor records logged yet for {selectedNode?.node_id}.
            </div>
          )}

        </div>
      )}

    </div>
  );
};
