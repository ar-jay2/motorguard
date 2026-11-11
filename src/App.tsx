/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import {
  Sidebar,
  NavModule,
} from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/views/DashboardView';
import { PlantMapView } from './components/views/PlantMapView';
import { MonitoringView } from './components/views/MonitoringView';
import { NodesView } from './components/views/NodesView';
import { StatisticsView } from './components/views/StatisticsView';
import { PredictiveMaintenanceView } from './components/views/PredictiveMaintenanceView';
import { EventsView } from './components/views/EventsView';
import { ReportsView } from './components/views/ReportsView';
import { UserManagementView } from './components/views/UserManagementView';
import { SettingsView } from './components/views/SettingsView';

import { MotorDetailModal } from './components/common/MotorDetailModal';
import { AckAlarmModal } from './components/common/AckAlarmModal';

import {
  INITIAL_MOTORS,
  PLANT_AREAS,
  INITIAL_EDGE_NODES,
  INITIAL_EVENTS,
  INITIAL_WORK_ORDERS,
  INITIAL_REPORTS,
  HISTORICAL_FLEET_TELEMETRY,
  INITIAL_THRESHOLDS,
} from './data/mockMotorData';
import {
  Motor,
  EdgeNode,
  EventAlarm,
  MaintenanceWorkOrder,
  ReportItem,
  ThresholdSettings,
} from './types/motor';
import { ShieldAlert, X } from 'lucide-react';

function MotorGuardAppContent() {
  const { isAuthenticated, isLoading, user, role, canAccessModule } = useAuth();
  const [currentModule, setCurrentModule] = useState<NavModule>('Dashboard');
  const [motors, setMotors] = useState<Motor[]>(INITIAL_MOTORS);
  const [areas] = useState(PLANT_AREAS);
  const [edgeNodes, setEdgeNodes] = useState<EdgeNode[]>(INITIAL_EDGE_NODES);
  const [events, setEvents] = useState<EventAlarm[]>(INITIAL_EVENTS);
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>(INITIAL_WORK_ORDERS);
  const [reports, setReports] = useState<ReportItem[]>(INITIAL_REPORTS);
  const [thresholds, setThresholds] = useState<ThresholdSettings>(INITIAL_THRESHOLDS);

  // Modals & Inspection State
  const [inspectedMotor, setInspectedMotor] = useState<Motor | null>(null);
  const [alarmToAck, setAlarmToAck] = useState<EventAlarm | null>(null);
  const [accessDeniedNotice, setAccessDeniedNotice] = useState<string | null>(null);

  // Layout State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);

  // Role-based route guard
  useEffect(() => {
    if (isAuthenticated && !canAccessModule(currentModule)) {
      setAccessDeniedNotice(`Access restricted: The ${currentModule} module requires administrator privileges.`);
      setCurrentModule('Dashboard');
      setTimeout(() => setAccessDeniedNotice(null), 4000);
    }
  }, [currentModule, role, isAuthenticated]);

  // Live IoT telemetry jitter loop (creates subtle, realistic sensor jitter)
  useEffect(() => {
    if (!isLiveStreaming || !isAuthenticated) return;

    const timer = setInterval(() => {
      setMotors((prevMotors) =>
        prevMotors.map((m) => {
          if (m.status === 'offline') return m;

          const vibJitter = (Math.random() - 0.5) * 0.04;
          const tempJitter = (Math.random() - 0.5) * 0.1;
          const currentJitter = (Math.random() - 0.5) * 1.2;

          const newAxial = Math.max(0.1, +(m.telemetry.vibrationRms.axial + vibJitter).toFixed(2));
          const newHoriz = Math.max(0.1, +(m.telemetry.vibrationRms.horizontal + vibJitter).toFixed(2));
          const newDE = Math.max(20, +(m.telemetry.bearingTemp.driveEnd + tempJitter).toFixed(1));

          return {
            ...m,
            telemetry: {
              ...m.telemetry,
              vibrationRms: {
                ...m.telemetry.vibrationRms,
                axial: newAxial,
                horizontal: newHoriz,
              },
              bearingTemp: {
                ...m.telemetry.bearingTemp,
                driveEnd: newDE,
              },
              electrical: {
                ...m.telemetry.electrical,
                currentA: Math.max(0, +(m.telemetry.electrical.currentA + currentJitter).toFixed(1)),
              },
              timestamp: new Date().toISOString(),
            },
          };
        })
      );
    }, 2500);

    return () => clearInterval(timer);
  }, [isLiveStreaming, isAuthenticated]);

  // If loading session state, show clean splash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#060a14] flex items-center justify-center text-slate-400 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          <span>Verifying MotorGuard Session & Permissions...</span>
        </div>
      </div>
    );
  }

  // Requirement 6: Redirect unauthenticated users to the login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Handle module selection with role permission check
  const handleSelectModule = (mod: NavModule) => {
    if (canAccessModule(mod)) {
      setCurrentModule(mod);
    } else {
      setAccessDeniedNotice(`Access denied: Administrator privileges required for "${mod}".`);
      setTimeout(() => setAccessDeniedNotice(null), 4000);
    }
  };

  // Alarm acknowledgment
  const handleConfirmAck = (alarmId: string, operatorName: string, notes: string) => {
    const operatorSignature = `${user?.fullName || operatorName} (${role === 'admin' ? 'Admin' : 'Authorized User'})`;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === alarmId
          ? {
              ...e,
              acknowledged: true,
              acknowledgedBy: operatorSignature,
              acknowledgedAt: new Date().toISOString(),
              notes,
            }
          : e
      )
    );
  };

  const handleAddWorkOrder = (wo: MaintenanceWorkOrder) => {
    setWorkOrders((prev) => [wo, ...prev]);
  };

  const handleAddNode = (node: EdgeNode) => {
    setEdgeNodes((prev) => [...prev, node]);
  };

  const handleGenerateReport = (report: ReportItem) => {
    setReports((prev) => [report, ...prev]);
  };

  const handleScheduleMaintenanceFromModal = (motor: Motor) => {
    const newWo: MaintenanceWorkOrder = {
      id: `wo-2026-${Math.floor(1200 + Math.random() * 800)}`,
      motorId: motor.id,
      motorName: motor.name,
      motorTag: motor.tag,
      title: `Scheduled Inspection: ${motor.name}`,
      priority: motor.status === 'critical' ? 'urgent' : motor.status === 'warning' ? 'high' : 'medium',
      scheduledDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      estimatedHours: 3.0,
      assignedTechnician: user?.fullName || 'D. Vance / Reliability Team',
      status: 'pending',
      diagnosis: motor.predictive.recommendedAction,
    };
    handleAddWorkOrder(newWo);
    setCurrentModule('Predictive Maintenance');
  };

  const handleSimulateValueChange = (motorId: string, changes: Partial<Motor>) => {
    setMotors((prev) =>
      prev.map((m) => (m.id === motorId ? { ...m, ...changes } : m))
    );
  };

  const unacknowledgedAlertCount = events.filter((e) => !e.acknowledged).length;

  return (
    <div className="min-h-screen bg-[#080d1a] text-slate-100 flex font-sans antialiased selection:bg-teal-500/30 selection:text-teal-200">
      
      {/* Sidebar Navigation */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={handleSelectModule}
        unacknowledgedAlertCount={unacknowledgedAlertCount}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Viewport */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header */}
        <Header
          currentModule={currentModule}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          unacknowledgedAlertCount={unacknowledgedAlertCount}
          onAlertClick={() => setCurrentModule('Events')}
          motors={motors}
          onSelectMotor={(m) => setInspectedMotor(m)}
          isLiveStreaming={isLiveStreaming}
          onToggleLiveStream={() => setIsLiveStreaming(!isLiveStreaming)}
        />

        {/* Role Access Denied Toast Notice */}
        {accessDeniedNotice && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-rose-950/80 border border-rose-500/50 rounded-lg text-rose-200 text-xs flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{accessDeniedNotice}</span>
            </div>
            <button
              onClick={() => setAccessDeniedNotice(null)}
              className="p-1 text-rose-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dynamic Module Content View */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {currentModule === 'Dashboard' && (
            <DashboardView
              motors={motors}
              areas={areas}
              telemetryHistory={HISTORICAL_FLEET_TELEMETRY}
              onSelectMotor={(m) => setInspectedMotor(m)}
              onNavigateToPlantMap={() => setCurrentModule('Plant Map')}
              onNavigateToEvents={() => setCurrentModule('Events')}
            />
          )}

          {currentModule === 'Plant Map' && (
            <PlantMapView
              motors={motors}
              areas={areas}
              onSelectMotor={(m) => setInspectedMotor(m)}
            />
          )}

          {currentModule === 'Monitoring' && (
            <MonitoringView
              motors={motors}
              onSelectMotor={(m) => setInspectedMotor(m)}
              onSimulateValueChange={handleSimulateValueChange}
            />
          )}

          {currentModule === 'Nodes' && (
            <NodesView
              nodes={edgeNodes}
              motors={motors}
              onAddNode={handleAddNode}
              onSelectMotor={(m) => setInspectedMotor(m)}
            />
          )}

          {currentModule === 'Statistics' && (
            <StatisticsView
              motors={motors}
              onSelectMotor={(m) => setInspectedMotor(m)}
            />
          )}

          {currentModule === 'Predictive Maintenance' && (
            <PredictiveMaintenanceView
              motors={motors}
              workOrders={workOrders}
              onSelectMotor={(m) => setInspectedMotor(m)}
              onAddWorkOrder={handleAddWorkOrder}
            />
          )}

          {currentModule === 'Events' && (
            <EventsView
              events={events}
              motors={motors}
              onOpenAckModal={(alarm) => setAlarmToAck(alarm)}
              onSelectMotor={(m) => setInspectedMotor(m)}
            />
          )}

          {currentModule === 'Reports' && (
            <ReportsView
              reports={reports}
              onGenerateReport={handleGenerateReport}
            />
          )}

          {currentModule === 'User Management' && (
            <UserManagementView />
          )}

          {currentModule === 'Settings' && (
            <SettingsView
              thresholds={thresholds}
              onUpdateThresholds={setThresholds}
              onResetDefaults={() => setThresholds(INITIAL_THRESHOLDS)}
            />
          )}
        </main>
      </div>

      {/* Deep-Dive Technical Motor Modal */}
      {inspectedMotor && (
        <MotorDetailModal
          motor={inspectedMotor}
          onClose={() => setInspectedMotor(null)}
          onScheduleMaintenance={handleScheduleMaintenanceFromModal}
        />
      )}

      {/* Alarm Acknowledgment Modal */}
      {alarmToAck && (
        <AckAlarmModal
          alarm={alarmToAck}
          onClose={() => setAlarmToAck(null)}
          onConfirm={handleConfirmAck}
        />
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MotorGuardAppContent />
    </AuthProvider>
  );
}
