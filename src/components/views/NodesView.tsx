import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  RefreshCw,
  Search,
  Database,
  AlertOctagon,
  Lock,
  X,
  Radio,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { Motor } from '../../types/motor';
import {
  fetchNodes,
  fetchLatestTelemetryForNodes,
  fetchLatestTelemetryForNode,
  NodeRecord,
  SensorDataRecord,
} from '../../services/telemetryService';

interface NodesViewProps {
  nodes?: any[]; // Kept for backward compatibility
  motors?: Motor[];
  onAddNode?: (node: any) => void;
  onSelectMotor?: (motor: Motor) => void;
}

type TelemetryFilterOption = 'all' | 'has_telemetry' | 'no_telemetry';
type InventoryFilterOption = 'all' | 'active' | 'inactive';
type TopologyFilterOption = 'all' | 'single_phase' | 'three_phase';
type SortOption = 'node_id_asc' | 'name_asc' | 'location_asc' | 'telemetry_newest';

export const NodesView: React.FC<NodesViewProps> = ({
  motors = [],
  onSelectMotor,
}) => {
  const [liveNodes, setLiveNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Search, Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [telemetryFilter, setTelemetryFilter] = useState<TelemetryFilterOption>('all');
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilterOption>('all');
  const [topologyFilter, setTopologyFilter] = useState<TopologyFilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('node_id_asc');

  // Node action states
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [refreshingNodeId, setRefreshingNodeId] = useState<string | null>(null);

  // Helper to format raw numeric telemetry values (preserves NULL as 'N/A' and actual zero as '0')
  const formatRawValue = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Load live nodes and their latest sensor telemetry
  const loadNodesData = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setDbError(null);

    try {
      // 1. Fetch nodes from public.nodes
      const nodesData = await fetchNodes();
      setLiveNodes(nodesData);

      // 2. Fetch latest telemetry for all retrieved nodes from public.sensor_data
      if (nodesData.length > 0) {
        const telemetryData = await fetchLatestTelemetryForNodes(nodesData);
        setTelemetryMap(telemetryData);
      } else {
        setTelemetryMap({});
      }

      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to load nodes data:', err);
      setDbError(err?.message || 'Database error: Could not fetch nodes from public.nodes.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and 15-second automatic refresh polling
  useEffect(() => {
    let isMounted = true;

    loadNodesData(false);

    const intervalId = setInterval(() => {
      if (isMounted) {
        loadNodesData(true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [loadNodesData]);

  // Read-only notice for disabled node provisioning
  const handleDisabledProvision = () => {
    setActionNotice(
      'Notice: Node provisioning is disabled in read-only mode. In accordance with database Row Level Security policies, inserting records into public.nodes requires an authorized backend Edge Function or INSERT permission.'
    );
    setTimeout(() => setActionNotice(null), 6000);
  };

  // Dedicated single-node refresh action
  const handleRefreshReading = async (nodeId: string) => {
    setRefreshingNodeId(nodeId);
    try {
      const freshReading = await fetchLatestTelemetryForNode(nodeId);
      setTelemetryMap((prev) => ({
        ...prev,
        [nodeId]: freshReading,
      }));
    } catch (err) {
      console.error(`Failed to refresh reading for node ${nodeId}:`, err);
    } finally {
      setRefreshingNodeId(null);
    }
  };

  // Helper functions for topology classification
  const isSinglePhaseTopology = (motorType: string): boolean => {
    const t = (motorType || '').toLowerCase();
    return t.includes('single') || t.includes('1_phase') || t.includes('1-phase') || t.includes('1phase');
  };

  const isThreePhaseTopology = (motorType: string): boolean => {
    const t = (motorType || '').toLowerCase();
    return (
      t.includes('three') ||
      t.includes('3_phase') ||
      t.includes('3-phase') ||
      t.includes('3phase') ||
      t.includes('poly')
    );
  };

  // Combined Search, Filtering, and Sorting logic
  const filteredAndSortedNodes = useMemo(() => {
    // 1. Filter
    const filtered = liveNodes.filter((node) => {
      // Inventory Status filter (1 = active inventory, 0 = inactive inventory)
      if (inventoryFilter === 'active' && node.active !== 1) return false;
      if (inventoryFilter === 'inactive' && node.active !== 0) return false;

      // Telemetry Presence filter
      const hasTelemetry = Boolean(telemetryMap[node.node_id]);
      if (telemetryFilter === 'has_telemetry' && !hasTelemetry) return false;
      if (telemetryFilter === 'no_telemetry' && hasTelemetry) return false;

      // Motor Topology filter
      if (topologyFilter === 'single_phase' && !isSinglePhaseTopology(node.motor_type)) {
        return false;
      }
      if (topologyFilter === 'three_phase' && !isThreePhaseTopology(node.motor_type)) {
        return false;
      }

      // Dynamic Search query across Node ID, Name, Location, Motor Type
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = (node.node_id || '').toLowerCase().includes(q);
        const matchName = (node.name || '').toLowerCase().includes(q);
        const matchType = (node.motor_type || '').toLowerCase().includes(q);
        const matchLoc = (node.location || '').toLowerCase().includes(q);
        return matchId || matchName || matchType || matchLoc;
      }

      return true;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
      if (sortBy === 'node_id_asc') {
        return a.node_id.localeCompare(b.node_id);
      }
      if (sortBy === 'name_asc') {
        const cmp = (a.name || '').localeCompare(b.name || '');
        return cmp !== 0 ? cmp : a.node_id.localeCompare(b.node_id);
      }
      if (sortBy === 'location_asc') {
        const cmp = (a.location || '').localeCompare(b.location || '');
        return cmp !== 0 ? cmp : a.node_id.localeCompare(b.node_id);
      }
      if (sortBy === 'telemetry_newest') {
        const timeA = telemetryMap[a.node_id]?.timestamp || '';
        const timeB = telemetryMap[b.node_id]?.timestamp || '';

        // Nodes with valid timestamps come before nodes with missing telemetry
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        if (timeA && timeB) {
          const cmp = timeB.localeCompare(timeA);
          if (cmp !== 0) return cmp;
        }
        // Deterministic tie-breaker
        return a.node_id.localeCompare(b.node_id);
      }
      return 0;
    });
  }, [liveNodes, telemetryMap, inventoryFilter, telemetryFilter, topologyFilter, searchQuery, sortBy]);

  // Telemetry status badge helper (displays exact database status without inference)
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

  // Reset all filters and search query
  const handleResetFilters = () => {
    setSearchQuery('');
    setTelemetryFilter('all');
    setInventoryFilter('all');
    setTopologyFilter('all');
    setSortBy('node_id_asc');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    telemetryFilter !== 'all' ||
    inventoryFilter !== 'all' ||
    topologyFilter !== 'all' ||
    sortBy !== 'node_id_asc';

  // KPI Calculations
  const activeCount = liveNodes.filter((n) => n.active === 1).length;
  const inactiveCount = liveNodes.filter((n) => n.active === 0).length;
  const withTelemetryCount = liveNodes.filter((n) => Boolean(telemetryMap[n.node_id])).length;
  const withoutTelemetryCount = liveNodes.filter((n) => !telemetryMap[n.node_id]).length;

  return (
    <div className="space-y-6">
      
      {/* Title & Live Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Cpu className="w-5 h-5 text-teal-400" />
              Motor Inventory & Concentrator Nodes
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.nodes · sensor_data (15s Polling)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Registered industrial motor endpoints and actual telemetry state from Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {lastRefreshedAt && (
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Polled at {lastRefreshedAt}
            </span>
          )}

          <button
            onClick={() => loadNodesData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Query latest nodes and sensor readings from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin text-teal-400' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleDisabledProvision}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-400 bg-slate-800 border border-slate-700/80 rounded-lg cursor-not-allowed opacity-80"
            title="Node registration is read-only pending backend Edge Function"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Provision Node</span>
            <span className="text-[10px] font-mono text-amber-400 font-bold ml-0.5 px-1 rounded bg-amber-950/60">
              RO
            </span>
          </button>
        </div>
      </div>

      {/* Database Error Banner */}
      {dbError && (
        <div className="p-4 bg-rose-950/90 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Database Connection Error</span>
              <p className="text-rose-300 mt-0.5">{dbError}</p>
              <button
                onClick={() => loadNodesData(false)}
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

      {/* Action Notice Banner */}
      {actionNotice && (
        <div className="p-4 bg-amber-950/90 border border-amber-500/60 rounded-xl text-xs text-amber-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Read-Only Operation Enforced</span>
              <p className="text-amber-300 text-[11px] mt-0.5 leading-relaxed">{actionNotice}</p>
            </div>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-amber-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Registered Nodes</span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block tabular-nums">
            {isLoading ? '...' : liveNodes.length}
          </span>
          <span className="text-xs text-slate-400 mt-1 block font-mono">
            {lastRefreshedAt ? `Synced at ${lastRefreshedAt}` : 'Connecting...'}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Inventory Active</span>
          <span className="text-2xl font-bold font-mono text-cyan-400 mt-1 block tabular-nums">
            {isLoading ? '...' : activeCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">
            {inactiveCount} Inactive (nodes.active = 0)
          </span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Telemetry Available</span>
          <span className="text-2xl font-bold font-mono text-teal-300 mt-1 block tabular-nums">
            {isLoading ? '...' : withTelemetryCount}
          </span>
          <span className="text-xs text-teal-400/80 mt-1 block">sensor_data records linked</span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">No Telemetry Recorded</span>
          <span className={`text-2xl font-bold font-mono mt-1 block tabular-nums ${withoutTelemetryCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {isLoading ? '...' : withoutTelemetryCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">e.g. M002 registered</span>
        </div>
      </div>

      {/* Search, Filter, and Sort Control Toolbar */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4 space-y-3">
        
        {/* Top Line: Search Bar + Sort Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Dynamic Search Input with Clear Button */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by Node ID, name, location, or motor type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-teal-400" />
              Sort By:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
            >
              <option value="node_id_asc" className="bg-[#0b1322]">Node ID: A–Z</option>
              <option value="name_asc" className="bg-[#0b1322]">Node Name: A–Z</option>
              <option value="location_asc" className="bg-[#0b1322]">Location: A–Z</option>
              <option value="telemetry_newest" className="bg-[#0b1322]">Latest Telemetry: Newest First</option>
            </select>
          </div>
        </div>

        {/* Bottom Line: Segmented Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Telemetry Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 uppercase font-mono">Telemetry:</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-[#0c1527] rounded-lg border border-slate-800">
                <button
                  onClick={() => setTelemetryFilter('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    telemetryFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({liveNodes.length})
                </button>
                <button
                  onClick={() => setTelemetryFilter('has_telemetry')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    telemetryFilter === 'has_telemetry' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  With Telemetry ({withTelemetryCount})
                </button>
                <button
                  onClick={() => setTelemetryFilter('no_telemetry')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    telemetryFilter === 'no_telemetry' ? 'bg-amber-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  No Telemetry ({withoutTelemetryCount})
                </button>
              </div>
            </div>

            {/* Inventory Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 uppercase font-mono">Inventory:</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-[#0c1527] rounded-lg border border-slate-800">
                <button
                  onClick={() => setInventoryFilter('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    inventoryFilter === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setInventoryFilter('active')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    inventoryFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => setInventoryFilter('inactive')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    inventoryFilter === 'inactive' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Inactive ({inactiveCount})
                </button>
              </div>
            </div>

            {/* Motor Topology Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 uppercase font-mono">Topology:</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-[#0c1527] rounded-lg border border-slate-800">
                <button
                  onClick={() => setTopologyFilter('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    topologyFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTopologyFilter('single_phase')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    topologyFilter === 'single_phase' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Phase
                </button>
                <button
                  onClick={() => setTopologyFilter('three_phase')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    topologyFilter === 'three_phase' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Three Phase
                </button>
              </div>
            </div>
          </div>

          {/* Reset Filters button if any are active */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-amber-400 hover:text-amber-300 font-mono underline underline-offset-2 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Reset All Filters
            </button>
          )}

        </div>

      </div>

      {/* Result Summary Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
        <span>
          Showing <strong className="text-white">{filteredAndSortedNodes.length}</strong> of{' '}
          <strong className="text-white">{liveNodes.length}</strong> registered nodes
        </span>
        {searchQuery.trim() && (
          <span className="text-slate-500">
            Query: "<span className="text-teal-300">{searchQuery.trim()}</span>"
          </span>
        )}
      </div>

      {/* Nodes Cards Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving registered nodes from public.nodes...</span>
          </div>
        </div>
      ) : filteredAndSortedNodes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedNodes.map((node) => {
            const telemetry = telemetryMap[node.node_id] || null;
            const hasTelemetry = Boolean(telemetry);
            const isRefreshingReading = refreshingNodeId === node.node_id;

            // Resolve effective power without coercing null to zero
            const effectivePower =
              telemetry?.total_power !== null && telemetry?.total_power !== undefined
                ? telemetry.total_power
                : telemetry?.power !== null && telemetry?.power !== undefined
                ? telemetry.power
                : null;

            // Resolve motor type presentation
            const motorTypeDisplay = (node.motor_type || 'UNKNOWN').replace('_', ' ').toUpperCase();

            // Match motor in app motor fleet if present
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
                  {/* Card Header: Node ID, Name, Location */}
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
                            title="Inventory flag: nodes.active"
                          >
                            {node.active === 1 ? 'Active (Inventory)' : 'Inactive (Inventory)'}
                          </span>
                        </div>
                        <h2 className="font-bold text-white text-sm mt-1">{node.name || 'Unnamed Motor'}</h2>
                        <span className="text-xs text-slate-400 font-mono block mt-0.5">
                          Location: {node.location || 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    {/* Telemetry Status Indicator */}
                    <div className="text-right">
                      {renderAssetStatusBadge(telemetry?.status, hasTelemetry)}
                    </div>
                  </div>

                  {/* Motor Type & Telemetry Timestamp Banner */}
                  <div className="p-2.5 rounded bg-[#0c1527] border border-slate-800/80 mb-3 space-y-1 text-xs font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Motor Topology:</span>
                      <span className="font-bold text-teal-300">{motorTypeDisplay}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Last Reading:</span>
                      <span className="text-slate-200">
                        {hasTelemetry && telemetry?.timestamp ? telemetry.timestamp : 'No records recorded'}
                      </span>
                    </div>
                  </div>

                  {/* Actual Database Telemetry Metrics */}
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
                    {/* Vibration (Raw value without unverified unit) */}
                    <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                      <span className="text-slate-500 text-[10px] block uppercase">Vibration (Raw)</span>
                      <span className="font-bold text-white block mt-0.5 truncate">
                        {formatRawValue(telemetry?.vibration, 2)}
                      </span>
                    </div>

                    {/* Temperature */}
                    <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                      <span className="text-slate-500 text-[10px] block uppercase">Temperature</span>
                      <span className="font-bold text-white block mt-0.5 truncate">
                        {telemetry?.temperature !== null && telemetry?.temperature !== undefined
                          ? `${telemetry.temperature.toFixed(1)} °C`
                          : 'N/A'}
                      </span>
                    </div>

                    {/* Power (Raw value without unverified unit) */}
                    <div className="p-2 rounded bg-[#0c1424] border border-slate-800/80">
                      <span className="text-slate-500 text-[10px] block uppercase">Power (Raw)</span>
                      <span className="font-bold text-white block mt-0.5 truncate">
                        {formatRawValue(effectivePower, 2)}
                      </span>
                    </div>
                  </div>

                  {/* Node Metadata (created_at / updated_at) */}
                  <div className="text-[11px] font-mono text-slate-500 space-y-0.5 pt-2 border-t border-slate-800/80">
                    <div className="flex justify-between">
                      <span>Created:</span>
                      <span className="text-slate-400">
                        {node.created_at ? node.created_at.slice(0, 10) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Schema Update:</span>
                      <span className="text-slate-400">
                        {node.updated_at ? node.updated_at.slice(0, 10) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
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

                  {/* Real, supported reading refresh operation */}
                  <button
                    onClick={() => handleRefreshReading(node.node_id)}
                    disabled={isRefreshingReading}
                    className="px-3 py-1 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    title="Retrieve latest sensor reading for this node from public.sensor_data"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingReading ? 'animate-spin text-teal-400' : 'text-slate-400'}`} />
                    <span>{isRefreshingReading ? 'Refreshing...' : 'Refresh Reading'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl space-y-3">
          <AlertOctagon className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-white font-medium">
            {liveNodes.length === 0
              ? 'No registered nodes found in public.nodes.'
              : 'No motor nodes match the current search and filter criteria.'}
          </p>
          {hasActiveFilters && liveNodes.length > 0 && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-mono bg-teal-950/80 text-teal-300 hover:text-white border border-teal-800/80 rounded transition-colors"
            >
              Reset Search & Filters
            </button>
          )}
        </div>
      )}

    </div>
  );
};
