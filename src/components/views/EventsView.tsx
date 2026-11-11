import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Search,
  Download,
  RefreshCw,
  Lock,
  Info,
  Database,
  X,
} from 'lucide-react';
import { Motor } from '../../types/motor';
import { fetchEvents, EventLogRecord } from '../../services/telemetryService';

interface EventsViewProps {
  events?: any[]; // Kept for interface backward compatibility; overridden with live Supabase query
  motors?: Motor[];
  onOpenAckModal?: (alarm: any) => void;
  onSelectMotor?: (motor: Motor) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({
  motors = [],
  onSelectMotor,
}) => {
  const [liveEvents, setLiveEvents] = useState<EventLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Filters & Search
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unack' | 'ack'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [ackNotice, setAckNotice] = useState<string | null>(null);

  // Load events from live public.event_logs table via telemetryService
  const loadEventsData = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setDbError(null);

    try {
      const records = await fetchEvents(200);
      setLiveEvents(records);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to query public.event_logs:', err);
      setDbError(err?.message || 'Database query error: Could not fetch records from public.event_logs.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and 15-second automatic refresh polling
  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    loadEventsData(false);

    // 15-second polling interval
    const intervalId = setInterval(() => {
      if (isMounted) {
        loadEventsData(true);
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [loadEventsData]);

  // Read-only acknowledgment click handler
  const handleDisabledAck = (ev: EventLogRecord) => {
    setAckNotice(
      `Notice: Acknowledging event #${ev.id} (${ev.event_type}) is disabled. The existing database Row Level Security policy is read-only (SELECT). Modifying 'acknowledged' in public.event_logs requires an authorized backend Edge Function or UPDATE policy.`
    );
    setTimeout(() => setAckNotice(null), 6000);
  };

  // Filter events
  const filteredEvents = liveEvents.filter((ev) => {
    // Severity filter (case-insensitive safe match)
    if (severityFilter !== 'all') {
      const normSev = (ev.severity || '').toLowerCase();
      if (normSev !== severityFilter.toLowerCase()) {
        return false;
      }
    }

    // Acknowledgment filter (0 = unacknowledged, 1 = acknowledged)
    if (statusFilter === 'unack' && ev.acknowledged === 1) return false;
    if (statusFilter === 'ack' && ev.acknowledged === 0) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = String(ev.id).toLowerCase().includes(q);
      const matchNode = (ev.node_id || '').toLowerCase().includes(q);
      const matchType = (ev.event_type || '').toLowerCase().includes(q);
      const matchDesc = (ev.description || '').toLowerCase().includes(q);
      const matchSev = (ev.severity || '').toLowerCase().includes(q);
      return matchId || matchNode || matchType || matchDesc || matchSev;
    }

    return true;
  });

  // Calculate statistics from live data
  const unackCount = liveEvents.filter((e) => e.acknowledged === 0).length;
  const criticalCount = liveEvents.filter((e) => {
    const s = (e.severity || '').toLowerCase();
    return s === 'high' || s === 'critical' || s === 'trip';
  }).length;
  const warningCount = liveEvents.filter((e) => {
    const s = (e.severity || '').toLowerCase();
    return s === 'warning' || s === 'warn';
  }).length;

  // Export to CSV
  const handleExportAlarms = () => {
    if (liveEvents.length === 0) {
      setExportNotice('No event records available to export.');
      setTimeout(() => setExportNotice(null), 3000);
      return;
    }

    const headers = ['ID', 'Node ID', 'Timestamp', 'Event Type', 'Severity', 'Description', 'Acknowledged'];
    const rows = liveEvents.map((e) => [
      e.id,
      `"${e.node_id || ''}"`,
      `"${e.timestamp || ''}"`,
      `"${e.event_type || ''}"`,
      `"${e.severity || ''}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      e.acknowledged === 1 ? 'Yes' : 'No',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `motorguard_event_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice(`Exported ${liveEvents.length} live event record(s) to CSV.`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  // Safe visual badge helper for any severity value
  const renderSeverityBadge = (severity: string) => {
    const norm = (severity || '').toUpperCase().trim();

    if (norm === 'HIGH' || norm === 'CRITICAL' || norm === 'TRIP') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          {norm}
        </span>
      );
    }

    if (norm === 'WARNING' || norm === 'WARN' || norm === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          {norm}
        </span>
      );
    }

    if (norm === 'INFO' || norm === 'LOW') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          {norm}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/80 font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {norm || 'EVENT'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Live Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Alarm & Protective Trip Event Journal
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950/80 text-teal-300 border border-teal-800/60">
              <Database className="w-3 h-3 text-teal-400" />
              LIVE: public.event_logs
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time audit log from Supabase database. Auto-refreshing every 15 seconds.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => loadEventsData(false)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
            title="Query latest records from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportAlarms}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
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
                onClick={() => loadEventsData(false)}
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

      {/* Acknowledgment Notice Banner */}
      {ackNotice && (
        <div className="p-4 bg-amber-950/90 border border-amber-500/60 rounded-xl text-xs text-amber-200 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Action Restricted (Read-Only Policy)</span>
              <p className="text-amber-300 text-[11px] mt-0.5 leading-relaxed">{ackNotice}</p>
            </div>
          </div>
          <button onClick={() => setAckNotice(null)} className="text-amber-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {exportNotice && (
        <div className="p-3 bg-teal-950/80 border border-teal-500/40 text-teal-300 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Unacknowledged</span>
          <span className={`text-2xl font-bold font-mono mt-1 block tabular-nums ${unackCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {isLoading ? '...' : unackCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">requires operator sign-off</span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">High / Trip Alarms</span>
          <span className="text-2xl font-bold font-mono text-rose-400 mt-1 block tabular-nums">
            {isLoading ? '...' : criticalCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">elevated protective thresholds</span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Warnings Logged</span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block tabular-nums">
            {isLoading ? '...' : warningCount}
          </span>
          <span className="text-xs text-slate-400 mt-1 block">advisory condition alerts</span>
        </div>

        <div className="p-4 rounded-lg bg-[#090f1d] border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Total Live Records</span>
          <span className="text-2xl font-bold font-mono text-teal-300 mt-1 block tabular-nums">
            {isLoading ? '...' : liveEvents.length}
          </span>
          <span className="text-xs text-slate-400 mt-1 block font-mono">
            {lastRefreshedAt ? `Synced at ${lastRefreshedAt}` : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search code, node, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0c1527] border border-slate-700 rounded-lg text-white font-mono focus:border-teal-500 focus:outline-none"
          />
        </div>

        {/* Severity Filters (Zero-pill segmented) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#0c1527] rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                severityFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Severities
            </button>
            <button
              onClick={() => setSeverityFilter('high')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                severityFilter === 'high' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              High
            </button>
            <button
              onClick={() => setSeverityFilter('critical')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                severityFilter === 'critical' ? 'bg-rose-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Critical
            </button>
            <button
              onClick={() => setSeverityFilter('warning')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                severityFilter === 'warning' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Warning
            </button>
            <button
              onClick={() => setSeverityFilter('info')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                severityFilter === 'info' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Info
            </button>
          </div>

          {/* Ack status */}
          <div className="flex items-center gap-1 p-1 bg-[#0c1527] rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('unack')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'unack' ? 'bg-rose-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Unack ({unackCount})
            </button>
            <button
              onClick={() => setStatusFilter('ack')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ack' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ack'd
            </button>
          </div>
        </div>

      </div>

      {/* Events Table */}
      <div className="bg-[#090f1d] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-mono bg-[#0c1424]">
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Node / Motor</th>
                <th className="py-2.5 px-3 font-sans">Description</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-sans text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      <span>Loading records from public.event_logs...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEvents.length > 0 ? (
                filteredEvents.map((ev) => {
                  const targetMotor = motors.find(
                    (m) =>
                      m.tag.toUpperCase() === (ev.node_id || '').toUpperCase() ||
                      m.id.toLowerCase() === (ev.node_id || '').toLowerCase()
                  );
                  const isUnack = ev.acknowledged === 0;

                  return (
                    <tr
                      key={ev.id}
                      className={`hover:bg-[#0c162b] transition-colors ${
                        isUnack &&
                        ((ev.severity || '').toLowerCase() === 'high' ||
                          (ev.severity || '').toLowerCase() === 'critical')
                          ? 'bg-rose-950/20'
                          : ''
                      }`}
                    >
                      {/* Severity */}
                      <td className="py-3 px-3">
                        {renderSeverityBadge(ev.severity)}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        {ev.timestamp || 'N/A'}
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-3 font-bold text-teal-400">
                        {ev.event_type || 'Unspecified Event'}
                      </td>

                      {/* Motor / Node Target */}
                      <td className="py-3 px-3">
                        {targetMotor && onSelectMotor ? (
                          <button
                            onClick={() => onSelectMotor(targetMotor)}
                            className="font-bold text-white hover:text-teal-300 transition-colors text-left font-mono"
                          >
                            {ev.node_id}
                          </button>
                        ) : (
                          <span className="font-bold text-white font-mono">{ev.node_id}</span>
                        )}
                        {targetMotor && (
                          <div className="text-[10px] text-slate-400 font-sans truncate max-w-[140px]">
                            {targetMotor.name}
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-3 px-3 font-sans text-slate-200 max-w-md">
                        <p className="leading-relaxed">{ev.description || 'No description recorded.'}</p>
                      </td>

                      {/* Acknowledgment Status */}
                      <td className="py-3 px-3">
                        {ev.acknowledged === 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-sans text-teal-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                            Acknowledged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-sans text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                            Unacknowledged
                          </span>
                        )}
                      </td>

                      {/* Action (Read-only protected) */}
                      <td className="py-3 px-3 text-right">
                        {ev.acknowledged === 1 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 font-sans font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Signed-off
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDisabledAck(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-400 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded font-sans transition-colors whitespace-nowrap cursor-not-allowed opacity-80 shadow-sm"
                            title="Database acknowledgment requires backend authorization (Read-only policy)"
                          >
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>Acknowledge</span>
                            <span className="text-[9px] font-mono text-amber-400 px-1 rounded bg-amber-950/60 ml-0.5 font-bold">
                              RO
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 font-sans text-xs">
                    {liveEvents.length === 0
                      ? 'No event records found in public.event_logs.'
                      : 'No events match the selected filter criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
