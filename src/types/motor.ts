export type MotorStatus = 'nominal' | 'warning' | 'critical' | 'offline';

export type IsoVibrationZone = 'A' | 'B' | 'C' | 'D'; // ISO 10816-3 Class 1-4

export interface MotorTelemetry {
  vibrationRms: {
    axial: number; // mm/s
    horizontal: number; // mm/s
    vertical: number; // mm/s
    peakDisplacementUm: number; // micrometers
    crestFactor: number;
  };
  bearingTemp: {
    driveEnd: number; // °C
    nonDriveEnd: number; // °C
    ambientTemp: number; // °C
  };
  statorTemp: {
    phaseU: number; // °C
    phaseV: number; // °C
    phaseW: number; // °C
  };
  electrical: {
    currentA: number; // Amps
    currentB: number; // Amps
    currentC: number; // Amps
    voltageAb: number; // Volts
    voltageBc: number; // Volts
    voltageCa: number; // Volts
    powerKw: number; // Active Power kW
    powerFactor: number; // cos phi (0.00 - 1.00)
    thdPercent: number; // Total Harmonic Distortion %
    currentUnbalancePercent: number; // % unbalance
    frequencyHz: number; // 50 / 60 Hz
  };
  insulationResistanceMohm: number; // M-Ohm
  timestamp: string;
}

export interface MotorPredictiveData {
  rulDays: number; // Remaining Useful Life
  failureRiskPercent: number; // 0-100%
  primaryRiskFactor: string; // e.g., 'Outer race bearing spall', 'Dynamic unbalance'
  recommendedAction: string;
  bearingHealthScore: number; // 0-100%
  windingHealthScore: number; // 0-100%
  alignmentScore: number; // 0-100%
  coolingEfficiencyScore: number; // 0-100%
  anomalyDetected: boolean;
}

export interface Motor {
  id: string;
  name: string;
  tag: string; // e.g. "MTR-101A"
  areaId: string;
  areaName: string;
  drivenEquipment: string; // e.g., "Centrifugal Slurry Pump"
  ratedPowerKw: number;
  ratedVoltageV: number;
  ratedCurrentA: number;
  ratedRpm: number;
  poleCount: number;
  frameSize: string;
  mountType: string;
  status: MotorStatus;
  healthIndex: number; // 0-100
  isoZone: IsoVibrationZone;
  runtimeHours: number;
  edgeNodeId: string;
  installDate: string;
  lastMaintenanceDate: string;
  nextScheduledDate: string;
  telemetry: MotorTelemetry;
  predictive: MotorPredictiveData;
  position: { x: number; y: number }; // For schematic plant map (percentage 0-100)
}

export interface EdgeNode {
  id: string;
  name: string;
  tag: string;
  protocol: 'Modbus-TCP' | 'MQTT' | 'OPC-UA' | 'Wireless Mesh';
  ipAddress: string;
  port: number;
  firmwareVersion: string;
  status: 'online' | 'warning' | 'offline';
  connectedMotorIds: string[];
  lastHeartbeat: string;
  packetLossPercent: number;
  cpuTempC: number;
  memoryUsagePercent: number;
  uptimeHours: number;
  location: string;
}

export interface TelemetryHistoryPoint {
  timestamp: string;
  timeLabel: string;
  vibrationRms: number; // mm/s
  bearingTemp: number; // °C
  currentDraw: number; // Amps
  powerKw: number; // kW
  healthIndex: number;
}

export type EventSeverity = 'critical' | 'warning' | 'trip' | 'info';

export interface EventAlarm {
  id: string;
  timestamp: string;
  motorId: string;
  motorName: string;
  motorTag: string;
  severity: EventSeverity;
  category: 'vibration' | 'thermal' | 'electrical' | 'protective' | 'communication';
  code: string; // e.g., "ALM-VIB-01"
  message: string;
  valueRecorded: string;
  thresholdLimit: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  notes?: string;
}

export interface PlantArea {
  id: string;
  name: string;
  code: string;
  description: string;
  motorCount: number;
  totalPowerKw: number;
  alertCount: number;
  healthyCount: number;
  mapBounds: { x: number; y: number; width: number; height: number };
}

export interface ReportItem {
  id: string;
  title: string;
  type: 'vibration_spectrum' | 'energy_audit' | 'iso_compliance' | 'predictive_health' | 'downtime_analysis';
  generatedAt: string;
  period: string;
  author: string;
  fileSize: string;
  format: 'PDF' | 'CSV' | 'JSON';
  status: 'ready' | 'processing';
  summary: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  motorId: string;
  motorName: string;
  motorTag: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'routine';
  scheduledDate: string;
  estimatedHours: number;
  assignedTechnician: string;
  status: 'pending' | 'in_progress' | 'completed';
  diagnosis: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  syncIntervalSeconds: number;
  tablesReady: boolean;
  lastSyncTimestamp: string | null;
}

export interface ThresholdSettings {
  vibrationWarningMmS: number;
  vibrationCriticalMmS: number;
  bearingTempWarningC: number;
  bearingTempCriticalC: number;
  statorTempWarningC: number;
  statorTempCriticalC: number;
  currentUnbalanceWarningPercent: number;
  currentUnbalanceCriticalPercent: number;
  minInsulationResistanceMohm: number;
}
