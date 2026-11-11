import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  Filter,
  Layers,
  Activity,
  ShieldAlert,
  Wrench,
  Calendar,
  Clock,
  AlertOctagon,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  ChevronDown,
  Database,
  X,
} from 'lucide-react';
import { ReportItem } from '../../types/motor';
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
  resolveEffectivePower,
  isThreePhaseReading,
} from '../../services/telemetryService';

interface ReportsViewProps {
  reports?: ReportItem[];
  onGenerateReport?: (report: ReportItem) => void;
}

export type ReportCategory = 'inventory' | 'telemetry' | 'events' | 'maintenance';

export const ReportsView: React.FC<ReportsViewProps> = () => {
  // Live Supabase state
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorDataRecord | null>>({});
  const [telemetryHistories, setTelemetryHistories] = useState<Record<string, SensorDataRecord[]>>({});
  const [events, setEvents] = useState<EventLogRecord[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogRecord[]>([]);

  // Selection & filter state
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('inventory');
  const [selectedMotorFilter, setSelectedMotorFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationTimestamp, setGenerationTimestamp] = useState<string>('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Helper to format raw values (preserves NULL as 'N/A' and actual zero as '0')
  const formatRaw = (val: number | string | null | undefined, decimals?: number): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return decimals !== undefined ? val.toFixed(decimals) : val.toString();
    }
    return String(val);
  };

  // Helper to escape CSV fields
  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Map node_id -> NodeRecord
  const nodeMap = useMemo(() => {
    const map: Record<string, NodeRecord> = {};
    for (const n of nodes) {
      map[n.node_id] = n;
    }
    return map;
  }, [nodes]);

  // Load all necessary Supabase data
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch nodes, events, maintenance logs
      const [fetchedNodes, fetchedEvents, fetchedMaintenance] = await Promise.all([
        fetchNodes(),
        fetchEvents(100),
        fetchMaintenanceLogs(),
      ]);

      setNodes(fetchedNodes);
      setEvents(fetchedEvents);
      setMaintenanceLogs(fetchedMaintenance);

      // 2. Fetch latest telemetry snapshot for inventory status
      const latestMap = await fetchLatestTelemetryForNodes(fetchedNodes);
      setTelemetryMap(latestMap);

      // 3. Fetch telemetry history (up to 50 records) for each registered node
      const historyMap: Record<string, SensorDataRecord[]> = {};
      await Promise.all(
        fetchedNodes.map(async (n) => {
          try {
            const hist = await fetchTelemetryHistory(n.node_id, 50);
            historyMap[n.node_id] = hist;
          } catch (err) {
            console.error(`Failed to load history for ${n.node_id}:`, err);
            historyMap[n.node_id] = [];
          }
        })
      );
      setTelemetryHistories(historyMap);

      const now = new Date();
      setGenerationTimestamp(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    } catch (err: any) {
      console.error('Failed to query Supabase records for reports:', err);
      setError(err?.message || 'Failed to query Supabase database records.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered rows for Motor Inventory Report
  const inventoryReportData = useMemo(() => {
    return nodes
      .filter((n) => selectedMotorFilter === 'ALL' || n.node_id === selectedMotorFilter)
      .map((n) => {
        const hasTelemetry = telemetryMap[n.node_id] !== null && telemetryMap[n.node_id] !== undefined;
        const historyCount = telemetryHistories[n.node_id]?.length || 0;
        return {
          node_id: n.node_id,
          name: n.name,
          motor_type: n.motor_type,
          location: n.location || 'Unspecified',
          inventory_status: n.active === 1 ? 'Active Inventory (1)' : 'Inactive Inventory (0)',
          active_raw: n.active,
          telemetry_status: hasTelemetry
            ? `Telemetry Available (${historyCount} records)`
            : 'No Telemetry',
          has_telemetry: hasTelemetry,
          created_at: n.created_at || 'N/A',
        };
      });
  }, [nodes, selectedMotorFilter, telemetryMap, telemetryHistories]);

  // Filtered rows for Motor Telemetry Report
  const telemetryReportData = useMemo(() => {
    const records: Array<SensorDataRecord & { motor_name: string; motor_type: string }> = [];

    const targetNodes =
      selectedMotorFilter === 'ALL'
        ? nodes
        : nodes.filter((n) => n.node_id === selectedMotorFilter);

    for (const node of targetNodes) {
      const history = telemetryHistories[node.node_id] || [];
      for (const rec of history) {
        // Date filtering based on timestamp prefix 'YYYY-MM-DD'
        const recDate = rec.timestamp.slice(0, 10);
        if (startDate && recDate < startDate) continue;
        if (endDate && recDate > endDate) continue;

        records.push({
          ...rec,
          motor_name: node.name,
          motor_type: node.motor_type,
        });
      }
    }

    // Sort descending by timestamp, then id
    return records.sort((a, b) => {
      const cmp = b.timestamp.localeCompare(a.timestamp);
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }, [nodes, selectedMotorFilter, telemetryHistories, startDate, endDate]);

  // Filtered rows for Events and Alarms Report
  const eventsReportData = useMemo(() => {
    return events.filter((evt) => {
      if (selectedMotorFilter !== 'ALL' && evt.node_id !== selectedMotorFilter) {
        return false;
      }
      if (selectedSeverity !== 'ALL' && evt.severity.toUpperCase() !== selectedSeverity) {
        return false;
      }
      const evtDate = evt.timestamp.slice(0, 10);
      if (startDate && evtDate < startDate) return false;
      if (endDate && evtDate > endDate) return false;
      return true;
    });
  }, [events, selectedMotorFilter, selectedSeverity, startDate, endDate]);

  // Filtered rows for Maintenance History Report
  const maintenanceReportData = useMemo(() => {
    return maintenanceLogs.filter((log) => {
      if (selectedMotorFilter !== 'ALL' && log.node_id !== selectedMotorFilter) {
        return false;
      }
      const logDate = log.maintenance_date ? log.maintenance_date.slice(0, 10) : '';
      if (startDate && logDate && logDate < startDate) return false;
      if (endDate && logDate && logDate > endDate) return false;
      return true;
    });
  }, [maintenanceLogs, selectedMotorFilter, startDate, endDate]);

  // Record count for active report
  const currentRecordCount = useMemo(() => {
    switch (selectedCategory) {
      case 'inventory':
        return inventoryReportData.length;
      case 'telemetry':
        return telemetryReportData.length;
      case 'events':
        return eventsReportData.length;
      case 'maintenance':
        return maintenanceReportData.length;
      default:
        return 0;
    }
  }, [selectedCategory, inventoryReportData, telemetryReportData, eventsReportData, maintenanceReportData]);

  // Export CSV handler
  const handleExportCsv = () => {
    let csvRows: string[][] = [];
    let fileName = `motorguard_${selectedCategory}_report_${generationTimestamp.replace(/[- :]/g, '')}.csv`;

    if (selectedCategory === 'inventory') {
      csvRows.push([
        'Node ID',
        'Motor Name',
        'Motor Topology',
        'Location',
        'Inventory Status',
        'Inventory Flag Raw',
        'Telemetry Availability',
        'Registered Timestamp',
      ]);
      inventoryReportData.forEach((row) => {
        csvRows.push([
          row.node_id,
          row.name,
          row.motor_type,
          row.location,
          row.inventory_status,
          String(row.active_raw),
          row.telemetry_status,
          row.created_at,
        ]);
      });
    } else if (selectedCategory === 'telemetry') {
      csvRows.push([
        'Timestamp',
        'Node ID',
        'Motor Name',
        'Motor Topology',
        'Temperature (C)',
        'Vibration (Raw)',
        'Voltage (V)',
        'Current (A)',
        'Power (Raw)',
        'Voltage L1-L2 (V)',
        'Voltage L2-L3 (V)',
        'Voltage L3-L1 (V)',
        'Current L1 (A)',
        'Current L2 (A)',
        'Current L3 (A)',
        'Power L1 (Raw)',
        'Power L2 (Raw)',
        'Power L3 (Raw)',
        'Total Power (Raw)',
        'Frequency (Hz)',
        'Power Factor',
        'Energy (Raw Stored)',
      ]);
      telemetryReportData.forEach((row) => {
        csvRows.push([
          row.timestamp,
          row.node_id,
          row.motor_name,
          row.motor_type,
          row.temperature !== null ? String(row.temperature) : '',
          row.vibration !== null ? String(row.vibration) : '',
          row.voltage !== null ? String(row.voltage) : '',
          row.current !== null ? String(row.current) : '',
          row.power !== null ? String(row.power) : '',
          row.voltage_l1_l2 !== null ? String(row.voltage_l1_l2) : '',
          row.voltage_l2_l3 !== null ? String(row.voltage_l2_l3) : '',
          row.voltage_l3_l1 !== null ? String(row.voltage_l3_l1) : '',
          row.current_l1 !== null ? String(row.current_l1) : '',
          row.current_l2 !== null ? String(row.current_l2) : '',
          row.current_l3 !== null ? String(row.current_l3) : '',
          row.power_l1 !== null ? String(row.power_l1) : '',
          row.power_l2 !== null ? String(row.power_l2) : '',
          row.power_l3 !== null ? String(row.power_l3) : '',
          row.total_power !== null ? String(row.total_power) : '',
          row.frequency !== null ? String(row.frequency) : '',
          row.power_factor !== null ? String(row.power_factor) : '',
          row.energy !== null ? String(row.energy) : '',
        ]);
      });
    } else if (selectedCategory === 'events') {
      csvRows.push([
        'Event ID',
        'Node ID',
        'Motor Name',
        'Timestamp',
        'Event Type',
        'Severity',
        'Description',
        'Acknowledged Flag',
        'Acknowledgment Status',
      ]);
      eventsReportData.forEach((row) => {
        csvRows.push([
          String(row.id),
          row.node_id,
          nodeMap[row.node_id]?.name || 'Unknown',
          row.timestamp,
          row.event_type,
          row.severity,
          row.description,
          String(row.acknowledged),
          row.acknowledged === 1 ? 'Acknowledged (1)' : 'Unacknowledged (0)',
        ]);
      });
    } else if (selectedCategory === 'maintenance') {
      csvRows.push([
        'Log ID',
        'Node ID',
        'Motor Name',
        'Maintenance Date',
        'Performed By',
        'Description',
      ]);
      maintenanceReportData.forEach((row) => {
        csvRows.push([
          String(row.id),
          row.node_id,
          nodeMap[row.node_id]?.name || 'Unknown',
          row.maintenance_date,
          row.performed_by,
          row.description,
        ]);
      });
    }

    if (csvRows.length <= 1) {
      setExportNotice('Cannot export: No records match the current filter selection.');
      setTimeout(() => setExportNotice(null), 4000);
      return;
    }

    const csvContent = csvRows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice(`Exported ${csvRows.length - 1} records to "${fileName}" successfully.`);
    setTimeout(() => setExportNotice(null), 4000);
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="h-24 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-24 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-24 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-24 bg-slate-900 border border-slate-800 rounded-xl"></div>
        </div>
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl"></div>
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
              <FileSpreadsheet className="w-5 h-5 text-teal-400" />
              Database Reports & Telemetry Export
            </h1>
            <span className="font-mono text-[11px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded">
              DATABASE: Live Supabase Query (On-Demand CSV Export)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Data-backed reports compiled directly from public.nodes, public.sensor_data, public.event_logs, and public.maintenance_logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {generationTimestamp && (
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Compiled: {generationTimestamp}
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

      {/* Query Error Notice */}
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

      {/* Export Toast / Status */}
      {exportNotice && (
        <div className="p-3 bg-teal-950/90 border border-teal-500/50 text-teal-300 text-xs rounded-lg flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Informative Architecture Notice */}
      <div className="p-3 bg-[#0c1527] border border-slate-800 rounded-lg text-xs text-slate-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-300">Live Client-Side Report Compilation:</strong> Reports and CSV exports are generated dynamically in memory from actual database tables. There is currently no report storage table in Supabase; reports are not persisted remotely. Telemetry history is limited to the latest 50 records per node, and event records are limited to the latest 100 entries.
        </div>
      </div>

      {/* Report Category Selection Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* A. Motor Inventory */}
        <button
          onClick={() => setSelectedCategory('inventory')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedCategory === 'inventory'
              ? 'border-teal-500 bg-[#0d1a2f] shadow-md ring-1 ring-teal-500/50'
              : 'border-slate-800 bg-[#090f1d] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-1.5 py-0.5 rounded">
              REPORT A
            </span>
            <Layers className="w-4 h-4 text-teal-400" />
          </div>
          <h2 className="text-sm font-bold text-white">Motor Inventory</h2>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            Registered motors, topology, location, inventory status, and telemetry presence.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>Source: public.nodes</span>
            <span className="text-slate-300 font-bold">{nodes.length} assets</span>
          </div>
        </button>

        {/* B. Motor Telemetry */}
        <button
          onClick={() => setSelectedCategory('telemetry')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedCategory === 'telemetry'
              ? 'border-teal-500 bg-[#0d1a2f] shadow-md ring-1 ring-teal-500/50'
              : 'border-slate-800 bg-[#090f1d] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-1.5 py-0.5 rounded">
              REPORT B
            </span>
            <Activity className="w-4 h-4 text-teal-400" />
          </div>
          <h2 className="text-sm font-bold text-white">Motor Telemetry</h2>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            Chronological sensor readings, temp (°C), raw vibration, single & three-phase electrical values.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>Source: public.sensor_data</span>
            <span className="text-slate-300 font-bold">Latest 50 / node</span>
          </div>
        </button>

        {/* C. Events & Alarms */}
        <button
          onClick={() => setSelectedCategory('events')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedCategory === 'events'
              ? 'border-teal-500 bg-[#0d1a2f] shadow-md ring-1 ring-teal-500/50'
              : 'border-slate-800 bg-[#090f1d] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-1.5 py-0.5 rounded">
              REPORT C
            </span>
            <ShieldAlert className="w-4 h-4 text-teal-400" />
          </div>
          <h2 className="text-sm font-bold text-white">Events & Alarms</h2>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            Safety trips, thresholds, warning severities, and acknowledgment flags.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>Source: public.event_logs</span>
            <span className="text-slate-300 font-bold">{events.length} records</span>
          </div>
        </button>

        {/* D. Maintenance History */}
        <button
          onClick={() => setSelectedCategory('maintenance')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedCategory === 'maintenance'
              ? 'border-teal-500 bg-[#0d1a2f] shadow-md ring-1 ring-teal-500/50'
              : 'border-slate-800 bg-[#090f1d] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-950/70 border border-teal-800/60 px-1.5 py-0.5 rounded">
              REPORT D
            </span>
            <Wrench className="w-4 h-4 text-teal-400" />
          </div>
          <h2 className="text-sm font-bold text-white">Maintenance History</h2>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            Actual maintenance interventions, service dates, descriptions, and technicians.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>Source: public.maintenance_logs</span>
            <span className="text-slate-300 font-bold">{maintenanceLogs.length} logs</span>
          </div>
        </button>
      </div>

      {/* Filter & Action Controls Bar */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Report Filters & Scope</h2>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Selected: <strong className="text-teal-300">{currentRecordCount} records</strong> match current criteria
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Motor Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Target Motor</label>
            <select
              value={selectedMotorFilter}
              onChange={(e) => setSelectedMotorFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">All Registered Motors ({nodes.length})</option>
              {nodes.map((n) => (
                <option key={n.node_id} value={n.node_id}>
                  {n.node_id} – {n.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start (if applicable) */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Date Range End (if applicable) */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Severity Filter (Events only) or Clear Filter */}
          <div>
            {selectedCategory === 'events' ? (
              <>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Severity</label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-teal-500"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="WARNING">WARNING</option>
                  <option value="INFO">INFO</option>
                </select>
              </>
            ) : (
              <div className="flex flex-col justify-end h-full">
                <button
                  onClick={() => {
                    setSelectedMotorFilter('ALL');
                    setStartDate('');
                    setEndDate('');
                    setSelectedSeverity('ALL');
                  }}
                  className="w-full py-1.5 px-3 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-center"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Date Filter Clear Pill */}
        {(startDate || endDate || selectedMotorFilter !== 'ALL' || selectedSeverity !== 'ALL') && (
          <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span>Active Filters:</span>
            {selectedMotorFilter !== 'ALL' && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                Motor: {selectedMotorFilter}
              </span>
            )}
            {startDate && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                From: {startDate}
              </span>
            )}
            {endDate && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                To: {endDate}
              </span>
            )}
            {selectedSeverity !== 'ALL' && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                Severity: {selectedSeverity}
              </span>
            )}
            <button
              onClick={() => {
                setSelectedMotorFilter('ALL');
                setStartDate('');
                setEndDate('');
                setSelectedSeverity('ALL');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-0.5 ml-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Report Table & CSV Export Header */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-base">
                {selectedCategory === 'inventory' && 'Motor Inventory Report (public.nodes)'}
                {selectedCategory === 'telemetry' && 'Motor Sensor Telemetry Report (public.sensor_data)'}
                {selectedCategory === 'events' && 'Operational Events & Alarms Report (public.event_logs)'}
                {selectedCategory === 'maintenance' && 'Maintenance History Ledger Report (public.maintenance_logs)'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Compiled at <span className="text-slate-200 font-mono">{generationTimestamp}</span> · Contains{' '}
              <strong className="text-teal-300 font-mono">{currentRecordCount}</strong> database records matching selected criteria.
            </p>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={currentRecordCount === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm self-start sm:self-auto"
            title="Download actual records as a standard CSV file"
          >
            <Download className="w-4 h-4" />
            Export Filtered CSV ({currentRecordCount})
          </button>
        </div>

        {/* =========================================================================
            REPORT A: Motor Inventory Table
            ========================================================================= */}
        {selectedCategory === 'inventory' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Node ID</th>
                  <th className="py-2.5 px-3 font-sans">Motor Name</th>
                  <th className="py-2.5 px-3">Topology</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Inventory Status</th>
                  <th className="py-2.5 px-3">Telemetry Availability</th>
                  <th className="py-2.5 px-3 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {inventoryReportData.map((row) => (
                  <tr key={row.node_id} className="hover:bg-[#0c162b] transition-colors">
                    <td className="py-3 px-3 text-teal-400 font-bold">{row.node_id}</td>
                    <td className="py-3 px-3 font-bold text-white font-sans">{row.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                        {row.motor_type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{row.location}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.active_raw === 1
                            ? 'bg-teal-950/60 text-teal-300 border border-teal-800/50'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {row.inventory_status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[11px] font-medium ${
                          row.has_telemetry ? 'text-teal-300' : 'text-amber-400'
                        }`}
                      >
                        {row.telemetry_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 text-[11px]">{row.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* =========================================================================
            REPORT B: Motor Telemetry Table
            ========================================================================= */}
        {selectedCategory === 'telemetry' && (
          <div>
            {telemetryReportData.length === 0 ? (
              <div className="p-8 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800">
                <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-300">No Telemetry Records Found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  No records in <code className="text-teal-400">public.sensor_data</code> match the selected motor and date range.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Node</th>
                      <th className="py-2.5 px-3 font-sans">Motor Name</th>
                      <th className="py-2.5 px-3">Temp (°C)</th>
                      <th className="py-2.5 px-3">Vib (Raw)</th>
                      <th className="py-2.5 px-3">Voltage / Phase</th>
                      <th className="py-2.5 px-3">Current / Phase (A)</th>
                      <th className="py-2.5 px-3">Power (Raw)</th>
                      <th className="py-2.5 px-3">Frequency</th>
                      <th className="py-2.5 px-3 text-right">Energy (Raw)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {telemetryReportData.map((rec) => {
                      const threePhase = isThreePhaseReading(rec);
                      return (
                        <tr key={`${rec.node_id}-${rec.id}`} className="hover:bg-[#0c162b] transition-colors">
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">{rec.timestamp}</td>
                          <td className="py-3 px-3 text-teal-400 font-bold">{rec.node_id}</td>
                          <td className="py-3 px-3 text-white font-sans truncate max-w-[140px]">{rec.motor_name}</td>
                          <td className="py-3 px-3 text-slate-200">
                            {rec.temperature !== null ? `${formatRaw(rec.temperature, 1)} °C` : 'N/A'}
                          </td>
                          <td className="py-3 px-3 text-slate-200">{formatRaw(rec.vibration, 3)}</td>
                          <td className="py-3 px-3 text-slate-300">
                            {threePhase ? (
                              <span className="text-[10px]">
                                {formatRaw(rec.voltage_l1_l2, 0)}/{formatRaw(rec.voltage_l2_l3, 0)}/{formatRaw(rec.voltage_l3_l1, 0)} V
                              </span>
                            ) : (
                              <span>{formatRaw(rec.voltage, 1)} V</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {threePhase ? (
                              <span className="text-[10px]">
                                {formatRaw(rec.current_l1, 2)}/{formatRaw(rec.current_l2, 2)}/{formatRaw(rec.current_l3, 2)} A
                              </span>
                            ) : (
                              <span>{formatRaw(rec.current, 2)} A</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-200">
                            {formatRaw(resolveEffectivePower(rec), 2)}
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {rec.frequency !== null ? `${formatRaw(rec.frequency, 1)} Hz` : 'N/A'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">{formatRaw(rec.energy)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            REPORT C: Events & Alarms Table
            ========================================================================= */}
        {selectedCategory === 'events' && (
          <div>
            {eventsReportData.length === 0 ? (
              <div className="p-8 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800">
                <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-300">No Events Found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  No records in <code className="text-teal-400">public.event_logs</code> match the selected filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3">Event ID</th>
                      <th className="py-2.5 px-3">Node</th>
                      <th className="py-2.5 px-3 font-sans">Motor Name</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Event Type</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3 font-sans">Description</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {eventsReportData.map((evt) => (
                      <tr key={evt.id} className="hover:bg-[#0c162b] transition-colors">
                        <td className="py-3 px-3 text-teal-400 font-bold">{evt.id}</td>
                        <td className="py-3 px-3 text-white font-bold">{evt.node_id}</td>
                        <td className="py-3 px-3 text-slate-300 font-sans">{nodeMap[evt.node_id]?.name || 'Unknown'}</td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{evt.timestamp}</td>
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
                            {evt.acknowledged === 1 ? 'ACK (1)' : 'UNACK (0)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            REPORT D: Maintenance History Table
            ========================================================================= */}
        {selectedCategory === 'maintenance' && (
          <div>
            {maintenanceReportData.length === 0 ? (
              <div className="p-8 text-center bg-[#0c1527] rounded-xl border border-dashed border-slate-800">
                <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-300">
                  No Maintenance Records Found in public.maintenance_logs
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  The <code className="text-teal-400">public.maintenance_logs</code> table currently contains 0 records in Supabase. In accordance with data integrity guidelines, no mock maintenance history or synthetic work orders are generated.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-400">
                  Table schema: id, node_id, maintenance_date, description, performed_by
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3">Log ID</th>
                      <th className="py-2.5 px-3">Node</th>
                      <th className="py-2.5 px-3 font-sans">Motor Name</th>
                      <th className="py-2.5 px-3">Maintenance Date</th>
                      <th className="py-2.5 px-3">Performed By</th>
                      <th className="py-2.5 px-3 font-sans">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {maintenanceReportData.map((log) => (
                      <tr key={log.id} className="hover:bg-[#0c162b] transition-colors">
                        <td className="py-3 px-3 text-teal-400 font-bold">{log.id}</td>
                        <td className="py-3 px-3 text-white font-bold">{log.node_id}</td>
                        <td className="py-3 px-3 text-slate-300 font-sans">{nodeMap[log.node_id]?.name || 'Unknown'}</td>
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
        )}
      </div>
    </div>
  );
};
