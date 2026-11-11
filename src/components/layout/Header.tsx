import React, { useState, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  Play,
  Pause,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { NavModule } from './Sidebar';
import { Motor } from '../../types/motor';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  currentModule: NavModule;
  onOpenMobileMenu: () => void;
  unacknowledgedAlertCount: number;
  onAlertClick: () => void;
  motors: Motor[];
  onSelectMotor: (motor: Motor) => void;
  isLiveStreaming: boolean;
  onToggleLiveStream: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModule,
  onOpenMobileMenu,
  unacknowledgedAlertCount,
  onAlertClick,
  motors,
  onSelectMotor,
  isLiveStreaming,
  onToggleLiveStream,
}) => {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState('North Refining Complex #4');
  const [currentTime, setCurrentTime] = useState('');

  // Clock updating in UTC/Shift format
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter motors based on search query
  const filteredMotors = searchQuery.trim()
    ? motors.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.drivenEquipment.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#090f1d]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-6 flex items-center justify-between gap-4">
      
      {/* Left: Hamburger & Breadcrumb */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="hidden sm:inline text-slate-500">MotorGuard</span>
          <span className="hidden sm:inline text-slate-600" aria-hidden="true">/</span>
          <span className="text-white font-semibold text-sm tracking-tight">{currentModule}</span>
        </div>

        {/* Facility Selector */}
        <div className="hidden md:flex items-center ml-4 pl-4 border-l border-slate-800/80">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0c1527] border border-slate-800 text-xs text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <select
              value={selectedFacility}
              onChange={(e) => setSelectedFacility(e.target.value)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value="North Refining Complex #4" className="bg-[#0b1322]">North Refining Complex #4</option>
              <option value="Chemical Transfer Yard B" className="bg-[#0b1322]">Chemical Transfer Yard B</option>
              <option value="Crusher Substation #1" className="bg-[#0b1322]">Crusher Substation #1</option>
            </select>
          </div>
        </div>
      </div>

      {/* Middle: Motor Search Bar with Suggestions */}
      <div className="relative flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search motor tag, name, equipment (e.g. MTR-101A)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-[#0b1424] border border-slate-800 focus:border-teal-500 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none transition-all font-mono"
          />
        </div>

        {/* Search Results Dropdown */}
        {searchFocused && filteredMotors.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#0b1424] border border-slate-700/80 rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-1.5 space-y-0.5">
              {filteredMotors.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelectMotor(m);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center justify-between p-2 text-left hover:bg-slate-800/80 rounded text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-teal-400 bg-teal-950/60 border border-teal-800/40 px-1.5 py-0.5 rounded text-[10px]">
                      {m.tag}
                    </span>
                    <span className="text-white font-medium">{m.name}</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">{m.areaName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Telemetry Stream Controls & System Alerts */}
      <div className="flex items-center gap-2.5 shrink-0">
        
        {/* Live Stream Play/Pause Toggle */}
        <button
          onClick={onToggleLiveStream}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors whitespace-nowrap ${
            isLiveStreaming
              ? 'bg-teal-950/40 border-teal-500/40 text-teal-300 hover:bg-teal-900/40'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={isLiveStreaming ? 'Pause real-time stream' : 'Resume real-time stream'}
        >
          {isLiveStreaming ? (
            <>
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping inline-block" />
              <Pause className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden md:inline">Live 2s</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Paused</span>
            </>
          )}
        </button>

        {/* Live Clock */}
        <div className="hidden xl:block font-mono text-xs text-slate-400 tabular-nums px-2 py-1 bg-[#0c1424] rounded border border-slate-800">
          {currentTime || 'Synchronizing...'}
        </div>

        {/* Alarm Bell Button */}
        <button
          onClick={onAlertClick}
          className="relative p-2 rounded-lg bg-[#0b1424] border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
          title={`${unacknowledgedAlertCount} unacknowledged alarms`}
          aria-label="View alarm events"
        >
          <Bell className="w-4 h-4 text-slate-300" />
          {unacknowledgedAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white font-mono animate-pulse">
              {unacknowledgedAlertCount}
            </span>
          )}
        </button>

        {/* User Mini Badge */}
        {user && (
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
            <div className="text-right">
              <span className="font-semibold text-white block text-[11px] leading-tight truncate max-w-[110px]">
                {user.fullName.split(' ')[0]}
              </span>
              <span className={`text-[9px] font-mono font-bold uppercase ${
                user.role === 'admin' ? 'text-teal-400' : 'text-cyan-400'
              }`}>
                {user.role === 'admin' ? 'admin' : 'authorized'}
              </span>
            </div>
          </div>
        )}
      </div>

    </header>
  );
};
