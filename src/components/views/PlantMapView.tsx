import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Factory,
  Layers,
  MapPin,
  AlertTriangle,
  Info,
  RefreshCw,
  Radio,
  Thermometer,
  Activity,
  Zap,
  X,
  AlertOctagon,
  Database,
  Building2,
} from 'lucide-react';
import { Motor, PlantArea } from '../../types/motor';
import {
  fetchNodes,
  fetchLatestTelemetryForNodes,
  NodeRecord,
  SensorDataRecord,
  resolveEffectiveCurrents,
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface PlantMapViewProps {
  motors?: Motor[];
  areas?: PlantArea[]; // Kept for backward compatibility
  onSelectMotor?: (motor: Motor) => void;
}

export const PlantMapView: React.FC<PlantMapViewProps> = ({
  motors = [],
  onSelectMotor,
}) => {
  // Live Supabase state
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Helper to format raw numeric telemetry values: preserves NULL as 'N/A' and actual zero as '0'
  const formatRawValue = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Main data loader function
  const loadPlantMapData = useCallback(async (isBackground: boolean = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch registered nodes from public.nodes
      const nodeList = await fetchNodes();

      // 2. Fetch latest telemetry for all nodes in parallel
      const telemetryRecordMap = await fetchLatestTelemetryForNodes(nodeList);

      setNodes(nodeList);
      setTelemetryMap(telemetryRecordMap);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to load plant map data from Supabase:', err);
      setError(err?.message || 'Database error: Could not query public.nodes or public.sensor_data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and 15-second background polling
  useEffect(() => {
    let isMounted = true;

    loadPlantMapData(false);

    const intervalId = setInterval(() => {
      if (isMounted) {
        loadPlantMapData(true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [loadPlantMapData]);

  // Group registered nodes dynamically by their literal location string
  const groupedLocations = useMemo(() => {
    const groups: Record<string, NodeRecord[]> = {};

    for (const node of nodes) {
      const locKey = (node.location || '').trim() || 'Location Not Specified';
      if (!groups[locKey]) {
        groups[locKey] = [];
      }
      groups[locKey].push(node);
    }

    return groups;
  }, [nodes]);

  // List of unique location keys for the filter control
  const uniqueLocationKeys = useMemo(() => {
    return Object.keys(groupedLocations).sort();
  }, [groupedLocations]);

  // Filtered location entries based on selected location
  const filteredLocationEntries = useMemo(() => {
    if (selectedLocation === 'all') {
      return Object.entries(groupedLocations);
    }
    return Object.entries(groupedLocations).filter(([loc]) => loc === selectedLocation);
  }, [groupedLocations, selectedLocation]);

  // Summary counts
  const totalNodesCount = nodes.length;
  const nodesWithTelemetryCount = useMemo(() => {
    return nodes.filter((n) => Boolean(telemetryMap[n.node_id])).length;
  }, [nodes, telemetryMap]);

  const nodesWithoutTelemetryCount = useMemo(() => {
    return nodes.filter((n) => !telemetryMap[n.node_id]).length;
  }, [nodes, telemetryMap]);

  const activeInventoryCount = useMemo(() => {
    return nodes.filter((n) => n.active === 1).length;
  }, [nodes]);

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

  return (
    <div className="space-y-6">
      
      {/* Title & Polling Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Factory className="w-5 h-5 text-teal-400" />
              Plant Facility Location Overview
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              DATABASE: public.nodes · sensor_data (15s Polling)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Logical plant asset distribution and sensor condition grouped by registered physical locations.
          </p>
        </div>

        {/* Refresh & Last Polled */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {lastRefreshedAt && (
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Polled at {lastRefreshedAt}
            </span>
          )}

          <button
            onClick={() => loadPlantMapData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Refresh latest location telemetry from Supabase"
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
                onClick={() => loadPlantMapData(false)}
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

      {/* Location Architecture Notice Banner */}
      <div className="p-3.5 bg-[#0c1527] border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-white">Logical Facility Location Overview</span>
          <p className="text-slate-400 leading-relaxed">
            Physical coordinates and floor-plan positions are not configured in <code className="font-mono text-teal-300">public.nodes</code>. 
            Assets are grouped strictly by the literal text recorded in the database <code className="font-mono text-slate-200">location</code> column. 
            No spatial proximity or physical layout is inferred.
          </p>
        </div>
      </div>

      {/* Facility Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        
        {/* KPI 1: Unique Location Groups */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Locations</span>
            <Building2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-white tabular-nums">
              {isLoading ? '...' : uniqueLocationKeys.length}
            </span>
            <span className="text-xs text-slate-400">Groups</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">Distinct location tags</span>
        </div>

        {/* KPI 2: Total Registered Nodes */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Registered Nodes</span>
            <Radio className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-white tabular-nums">
              {isLoading ? '...' : totalNodesCount}
            </span>
            <span className="text-xs text-slate-400">Motors</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">From public.nodes</span>
        </div>

        {/* KPI 3: Reporting Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-3.5">
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
          <span className="text-[10px] font-mono text-slate-500 block mt-1">Active sensor records</span>
        </div>

        {/* KPI 4: Awaiting Telemetry */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Awaiting Telemetry</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-amber-300 tabular-nums">
              {isLoading ? '...' : nodesWithoutTelemetryCount}
            </span>
            <span className="text-xs text-slate-400">Nodes</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">e.g. M002 registered</span>
        </div>

        {/* KPI 5: Inventory Active Flag */}
        <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-3.5 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium uppercase tracking-wider text-[11px]">Inventory Active</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-bold text-cyan-300 tabular-nums">
              {isLoading ? '...' : `${activeInventoryCount} / ${totalNodesCount}`}
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 block mt-1">nodes.active = 1</span>
        </div>

      </div>

      {/* Dynamic Location Filter Segmented Control */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Facility Location Filter:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0c1527] rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setSelectedLocation('all')}
            className={`px-3 py-1.5 rounded font-medium transition-colors ${
              selectedLocation === 'all'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Locations ({nodes.length})
          </button>
          {uniqueLocationKeys.map((locKey) => {
            const count = groupedLocations[locKey]?.length || 0;
            return (
              <button
                key={locKey}
                onClick={() => setSelectedLocation(locKey)}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  selectedLocation === locKey
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {locKey} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Location-Grouped Panels Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving registered plant motor locations from Supabase...</span>
          </div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="p-16 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          No registered motor nodes found in public.nodes.
        </div>
      ) : filteredLocationEntries.length === 0 ? (
        <div className="p-12 text-center text-slate-400 font-sans text-xs bg-[#090f1d] border border-slate-800 rounded-xl">
          No motor nodes match the selected location filter.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredLocationEntries.map(([locationName, locationNodes]) => {
            const nodesWithTel = locationNodes.filter((n) => Boolean(telemetryMap[n.node_id])).length;
            const nodesWithoutTel = locationNodes.length - nodesWithTel;

            return (
              <div
                key={locationName}
                className="bg-[#090f1d] border border-slate-800 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Location Group Header */}
                <div className="p-4 bg-[#0c1527] border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-950/60 border border-teal-600/40 text-teal-400 shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white tracking-tight">
                          {locationName}
                        </h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-950/80 text-teal-300 border border-teal-800/80">
                          {locationNodes.length} Motor{locationNodes.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                        Database location column value: <strong className="text-slate-200">"{locationName}"</strong>
                      </span>
                    </div>
                  </div>

                  {/* Location status summary */}
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 self-start sm:self-auto">
                    <span className="text-emerald-400">
                      {nodesWithTel} with telemetry
                    </span>
                    {nodesWithoutTel > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-400">
                          {nodesWithoutTel} awaiting readings
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Motors Grid inside this Location */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {locationNodes.map((node) => {
                    const telemetry = telemetryMap[node.node_id] || null;
                    const hasTelemetry = Boolean(telemetry);

                    // Topology detection
                    const rawType = (node.motor_type || '').toUpperCase();
                    const isThreePhase =
                      rawType.includes('THREE') ||
                      rawType.includes('3') ||
                      rawType.includes('POLY') ||
                      isThreePhaseReading(telemetry);

                    const effectiveCurrents = resolveEffectiveCurrents(telemetry);
                    const effectivePower = resolveEffectivePower(telemetry);

                    // Match motor in fleet array for inspect modal callback
                    const matchedMotor = motors.find(
                      (m) =>
                        m.tag.toUpperCase() === node.node_id.toUpperCase() ||
                        m.id.toLowerCase() === node.node_id.toLowerCase()
                    );

                    return (
                      <div
                        key={node.id}
                        className="bg-[#0c1424] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
                      >
                        <div>
                          {/* Motor Card Header */}
                          <div className="flex items-start justify-between pb-2.5 mb-2.5 border-b border-slate-800 gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
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
                              <h3 className="font-bold text-white text-sm mt-1">
                                {node.name || 'Unnamed Motor'}
                              </h3>
                            </div>

                            {renderAssetStatusBadge(telemetry?.status, hasTelemetry)}
                          </div>

                          {/* Topology and Reading Timestamp */}
                          <div className="text-[11px] font-mono text-slate-400 space-y-1 mb-3 bg-[#080d1a] p-2 rounded border border-slate-800/60">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Topology:</span>
                              <span className="font-bold text-teal-300">
                                {(node.motor_type || 'UNKNOWN').replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Last Telemetry:</span>
                              <span className="text-slate-200">
                                {hasTelemetry && telemetry?.timestamp ? telemetry.timestamp : 'No records recorded'}
                              </span>
                            </div>
                          </div>

                          {/* Telemetry Measurements */}
                          {!hasTelemetry ? (
                            <div className="p-4 rounded bg-[#080d1a] border border-amber-900/40 text-center text-xs font-mono text-amber-300/90 my-1">
                              <span>No telemetry records available in public.sensor_data</span>
                              <div className="mt-1 text-[10px] text-slate-500">
                                Motor registered in location "{locationName}"
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2 text-xs font-mono">
                              
                              {/* Thermal and Vibration */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 rounded bg-[#080d1a] border border-slate-800/70">
                                  <span className="text-[10px] text-slate-500 uppercase block">Temperature</span>
                                  <span className="font-bold text-white block mt-0.5 truncate">
                                    {telemetry?.temperature !== null && telemetry?.temperature !== undefined
                                      ? `${telemetry.temperature.toFixed(1)} °C`
                                      : 'N/A'}
                                  </span>
                                </div>
                                <div className="p-2 rounded bg-[#080d1a] border border-slate-800/70">
                                  <span className="text-[10px] text-slate-500 uppercase block">Vibration (Raw)</span>
                                  <span className="font-bold text-teal-300 block mt-0.5 truncate">
                                    {formatRawValue(telemetry?.vibration, 2)}
                                  </span>
                                </div>
                              </div>

                              {/* Electrical Telemetry */}
                              {isThreePhase ? (
                                <div className="p-2 rounded bg-[#080d1a] border border-slate-800/70 space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Current (L1/L2/L3):</span>
                                    <span className="text-teal-300 font-bold">
                                      {effectiveCurrents.l1 !== null ? effectiveCurrents.l1.toFixed(1) : 'N/A'} /{' '}
                                      {effectiveCurrents.l2 !== null ? effectiveCurrents.l2.toFixed(1) : 'N/A'} /{' '}
                                      {effectiveCurrents.l3 !== null ? effectiveCurrents.l3.toFixed(1) : 'N/A'} A
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Measured Power (Raw):</span>
                                    <span className="text-white font-bold">
                                      {formatRawValue(effectivePower, 2)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 rounded bg-[#080d1a] border border-slate-800/70 space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Current:</span>
                                    <span className="text-teal-300 font-bold">
                                      {telemetry?.current !== null && telemetry?.current !== undefined
                                        ? `${telemetry.current.toFixed(2)} A`
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Line Voltage:</span>
                                    <span className="text-white font-bold">
                                      {telemetry?.voltage !== null && telemetry?.voltage !== undefined
                                        ? `${telemetry.voltage.toFixed(1)} V`
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Measured Power (Raw):</span>
                                    <span className="text-white font-bold">
                                      {formatRawValue(effectivePower, 2)}
                                    </span>
                                  </div>
                                </div>
                              )}

                            </div>
                          )}
                        </div>

                        {/* Card Footer Actions */}
                        <div className="mt-3.5 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-mono text-[10px]">
                            ID #{node.id} · Node {node.node_id}
                          </span>

                          {matchedMotor && onSelectMotor ? (
                            <button
                              onClick={() => onSelectMotor(matchedMotor)}
                              className="px-2.5 py-1 text-xs text-teal-300 hover:text-white bg-teal-950/60 hover:bg-teal-900 border border-teal-700/60 rounded font-sans transition-colors inline-flex items-center gap-1"
                            >
                              <span>Inspect Dossier</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400">Registered</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
