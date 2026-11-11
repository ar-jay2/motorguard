import React from 'react';
import {
  LayoutDashboard,
  Factory,
  Activity,
  Cpu,
  BarChart3,
  ShieldAlert,
  AlertTriangle,
  FileText,
  Settings,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  Database,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavModule =
  | 'Dashboard'
  | 'Plant Map'
  | 'Monitoring'
  | 'Nodes'
  | 'Statistics'
  | 'Predictive Maintenance'
  | 'Events'
  | 'Reports'
  | 'User Management'
  | 'Settings';

interface SidebarProps {
  currentModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  unacknowledgedAlertCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItemConfig {
  id: NavModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  adminOnly?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  unacknowledgedAlertCount,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user, role, logout, canAccessModule } = useAuth();

  const allNavItems: NavItemConfig[] = [
    { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'Plant Map', label: 'Plant Map', icon: Factory },
    { id: 'Monitoring', label: 'Monitoring', icon: Activity },
    { id: 'Nodes', label: 'Nodes', icon: Cpu },
    { id: 'Statistics', label: 'Statistics', icon: BarChart3 },
    { id: 'Predictive Maintenance', label: 'Predictive Maintenance', icon: ShieldAlert },
    {
      id: 'Events',
      label: 'Events',
      icon: AlertTriangle,
      badge: unacknowledgedAlertCount > 0 ? unacknowledgedAlertCount : undefined,
    },
    { id: 'Reports', label: 'Reports', icon: FileText },
    { id: 'User Management', label: 'User Management', icon: Users, adminOnly: true },
    { id: 'Settings', label: 'Settings', icon: Settings, adminOnly: true },
  ];

  // Filter based on user's role permissions
  const navItems = allNavItems.filter((item) => {
    if (item.adminOnly) {
      return role === 'admin';
    }
    return canAccessModule(item.id);
  });

  const handleSelect = (module: NavModule) => {
    onSelectModule(module);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-[#070c17] border-r border-slate-800/90 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand Header: Display MotorGuard */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-[#090f1d]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-teal-400" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm tracking-tight text-white whitespace-nowrap">
                  MotorGuard
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                  Industrial IoT
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-teal-400" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative ${
                  isActive
                    ? 'bg-teal-950/50 text-teal-300 border border-teal-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                )}

                {/* Badge alert count */}
                {item.badge !== undefined && (
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isCollapsed
                        ? 'absolute top-1 right-1 bg-rose-600 text-white'
                        : 'ml-auto bg-rose-950/90 text-rose-300 border border-rose-800/80'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Profile & Sign Out Section */}
        {user && (
          <div className="p-3 border-t border-slate-800/90 bg-[#090f1d]/90">
            {!isCollapsed ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate text-left">
                      <div className="text-xs font-bold text-white truncate">{user.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{user.email}</div>
                    </div>
                  </div>

                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                    user.role === 'admin'
                      ? 'bg-teal-950 text-teal-300 border border-teal-800'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  }`}>
                    {user.role === 'admin' ? 'ADMIN' : 'OPERATOR'}
                  </span>
                </div>

                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[#0c1527] hover:bg-rose-950/40 border border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 text-[11px] font-medium transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={logout}
                className="w-full p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 flex items-center justify-center transition-colors"
                title={`Sign out (${user.fullName})`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
