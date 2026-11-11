import React, { useState } from 'react';
import {
  X,
  Gauge,
  Activity,
  Flame,
  Zap,
  ShieldAlert,
  Clock,
  Wrench,
  Download,
  CheckCircle,
} from 'lucide-react';
import { Motor } from '../../types/motor';
import { StatusBadge } from './StatusBadge';
import { IsoZoneIndicator } from './IsoZoneIndicator';
import { MotorHealthGauge } from './MotorHealthGauge';

interface MotorDetailModalProps {
  motor: Motor | null;
  onClose: () => void;
  onScheduleMaintenance?: (motor: Motor) => void;
}

export const MotorDetailModal: React.FC<MotorDetailModalProps> = ({
  motor,
  onClose,
  onScheduleMaintenance,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'predictive' | 'specifications'>('telemetry');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  if (!motor) return null;

  const handleSimulateInspection = () => {
    setActionNotice('Diagnostic snapshot exported to offline buffer.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const motorImagePath = '/src/assets/images/industrial_motor_cutaway_1794325631559.jpg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0b1322] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#090f1c]">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-teal-400 bg-teal-950/60 border border-teal-800/60 px-2 py-0.5 rounded">
                  {motor.tag}
                </span>
                <h2 className="text-lg font-bold text-white">{motor.name}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span>{motor.areaName}</span>
                <span aria-hidden="true">·</span>
                <span>{motor.drivenEquipment}</span>
                <span aria-hidden="true">·</span>
                <StatusBadge status={motor.status} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action notice toast if triggered */}
        {actionNotice && (
          <div className="bg-teal-950/80 border-b border-teal-500/40 text-teal-300 text-xs px-6 py-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-400" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800/80 bg-[#0c1424]">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'telemetry'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Telemetry & Sensors
          </button>
          <button
            onClick={() => setActiveTab('predictive')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'predictive'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Predictive Health & RUL
          </button>
          <button
            onClick={() => setActiveTab('specifications')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'specifications'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Nameplate & Node Configuration
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top Quick Status Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#080d19] p-4 rounded-lg border border-slate-800">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block">Health Index</span>
              <div className="flex items-center gap-2 mt-1">
                <MotorHealthGauge score={motor.healthIndex} size="sm" showLabel={false} />
                <span className="font-mono text-xl font-bold text-white tabular-nums">{motor.healthIndex}%</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block">Vibration Severity</span>
              <div className="mt-1.5">
                <IsoZoneIndicator zone={motor.isoZone} showExplanation={true} />
              </div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block">Remaining Useful Life</span>
              <div className="mt-1 font-mono text-xl font-bold text-teal-300 tabular-nums">
                {motor.predictive.rulDays} <span className="text-xs font-normal text-slate-400">Days</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block">Total Runtime</span>
              <div className="mt-1 font-mono text-xl font-bold text-slate-200 tabular-nums">
                {motor.runtimeHours.toLocaleString()} <span className="text-xs font-normal text-slate-400">Hours</span>
              </div>
            </div>
          </div>

          {/* Tab 1: Live Telemetry */}
          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              
              {/* Asset Visual & Mechanical Vibration Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Visual rendering */}
                <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#090e1a] flex flex-col items-center justify-center min-h-[160px]">
                  <img
                    src={motorImagePath}
                    alt={`${motor.name} Industrial Induction Motor`}
                    className="w-full h-44 object-cover object-center"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      // Fallback if image unavailable
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="p-3 w-full border-t border-slate-800/80 bg-[#0a101f] text-xs flex justify-between items-center">
                    <span className="text-slate-400 font-mono">Frame: {motor.frameSize}</span>
                    <span className="text-teal-400 font-mono">{motor.ratedRpm} RPM</span>
                  </div>
                </div>

                {/* 3-Axis Vibration */}
                <div className="md:col-span-2 bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                      <Activity className="w-4 h-4 text-teal-400" />
                      Tri-Axial Vibration (ISO 10816 Velocity RMS)
                    </div>
                    <span className="text-xs text-slate-400 font-mono">Peak: {motor.telemetry.vibrationRms.peakDisplacementUm} μm</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block">Axial (Z-Axis)</span>
                      <span className="text-lg font-mono font-bold text-white tabular-nums">
                        {motor.telemetry.vibrationRms.axial.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-slate-400">mm/s</span>
                      </span>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-teal-400 h-full rounded-full"
                          style={{ width: `${Math.min(100, (motor.telemetry.vibrationRms.axial / 5.0) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block">Horizontal (X-Axis)</span>
                      <span className="text-lg font-mono font-bold text-white tabular-nums">
                        {motor.telemetry.vibrationRms.horizontal.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-slate-400">mm/s</span>
                      </span>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            motor.telemetry.vibrationRms.horizontal > 3.0 ? 'bg-amber-400' : 'bg-teal-400'
                          }`}
                          style={{ width: `${Math.min(100, (motor.telemetry.vibrationRms.horizontal / 5.0) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block">Vertical (Y-Axis)</span>
                      <span className="text-lg font-mono font-bold text-white tabular-nums">
                        {motor.telemetry.vibrationRms.vertical.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-slate-400">mm/s</span>
                      </span>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-teal-400 h-full rounded-full"
                          style={{ width: `${Math.min(100, (motor.telemetry.vibrationRms.vertical / 5.0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                    <span>Crest Factor: <strong className="font-mono text-slate-200">{motor.telemetry.vibrationRms.crestFactor.toFixed(2)}</strong></span>
                    <span>Class Limit: <strong className="font-mono text-slate-200">4.5 mm/s (Trip)</strong></span>
                  </div>
                </div>
              </div>

              {/* Thermal & Electrical Rows */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Thermal Sensor Block */}
                <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 mb-3 border-b border-slate-800">
                    <Flame className="w-4 h-4 text-amber-400" />
                    Thermal RTD Sensors (°C)
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Drive End (DE) Bearing</span>
                      <span className="font-mono font-bold text-sm text-white tabular-nums">
                        {motor.telemetry.bearingTemp.driveEnd.toFixed(1)} °C
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Non-Drive End (NDE) Bearing</span>
                      <span className="font-mono font-bold text-sm text-white tabular-nums">
                        {motor.telemetry.bearingTemp.nonDriveEnd.toFixed(1)} °C
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Stator Winding (U / V / W)</span>
                      <span className="font-mono font-bold text-sm text-teal-300 tabular-nums">
                        {motor.telemetry.statorTemp.phaseU.toFixed(1)} / {motor.telemetry.statorTemp.phaseV.toFixed(1)} / {motor.telemetry.statorTemp.phaseW.toFixed(1)} °C
                      </span>
                    </div>
                  </div>
                </div>

                {/* Electrical Power & Current Balance */}
                <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 mb-3 border-b border-slate-800">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    3-Phase Electrical Signatures
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Active Power & Power Factor</span>
                      <span className="font-mono font-bold text-sm text-white tabular-nums">
                        {motor.telemetry.electrical.powerKw.toFixed(1)} kW · cos φ {motor.telemetry.electrical.powerFactor.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Phase Currents (Ia / Ib / Ic)</span>
                      <span className="font-mono font-bold text-sm text-white tabular-nums">
                        {motor.telemetry.electrical.currentA.toFixed(1)}A · {motor.telemetry.electrical.currentB.toFixed(1)}A · {motor.telemetry.electrical.currentC.toFixed(1)}A
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0e172a] border border-slate-800/60">
                      <span className="text-xs text-slate-300">Current Unbalance & THD</span>
                      <span className={`font-mono font-bold text-sm tabular-nums ${
                        motor.telemetry.electrical.currentUnbalancePercent > 5.0 ? 'text-rose-400' : 'text-slate-200'
                      }`}>
                        {motor.telemetry.electrical.currentUnbalancePercent.toFixed(1)}% unbalance · {motor.telemetry.electrical.thdPercent.toFixed(1)}% THD
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 2: Predictive Maintenance */}
          {activeTab === 'predictive' && (
            <div className="space-y-6">
              <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-teal-400" />
                    <h3 className="font-bold text-white text-sm">Predictive Reliability Assessment</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                    motor.predictive.anomalyDetected
                      ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                      : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                  }`}>
                    {motor.predictive.anomalyDetected ? 'Anomaly Active' : 'Normal Operating Envelope'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="bg-[#0e172a] p-4 rounded border border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">Identified Fault Pattern</span>
                    <p className="text-sm font-semibold text-white">{motor.predictive.primaryRiskFactor}</p>
                    <span className="text-xs text-slate-400 mt-2 block">
                      Failure Probability (Next 30 Days):{' '}
                      <strong className={`font-mono ${motor.predictive.failureRiskPercent > 30 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {motor.predictive.failureRiskPercent}%
                      </strong>
                    </span>
                  </div>

                  <div className="bg-[#0e172a] p-4 rounded border border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">Recommended Engineering Action</span>
                    <p className="text-sm text-teal-300 font-medium">{motor.predictive.recommendedAction}</p>
                  </div>
                </div>

                {/* Subsystem Health Breakdown */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Subsystem Degradation Breakdown</span>
                  
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Bearing Assembly</span>
                        <span className="font-mono font-bold">{motor.predictive.bearingHealthScore}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-teal-400 h-full rounded-full"
                          style={{ width: `${motor.predictive.bearingHealthScore}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Stator Winding & Insulation</span>
                        <span className="font-mono font-bold">{motor.predictive.windingHealthScore}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-cyan-400 h-full rounded-full"
                          style={{ width: `${motor.predictive.windingHealthScore}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Shaft Alignment & Coupling</span>
                        <span className="font-mono font-bold">{motor.predictive.alignmentScore}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full"
                          style={{ width: `${motor.predictive.alignmentScore}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Cooling & Airflow Path</span>
                        <span className="font-mono font-bold">{motor.predictive.coolingEfficiencyScore}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-400 h-full rounded-full"
                          style={{ width: `${motor.predictive.coolingEfficiencyScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Nameplate Specs */}
          {activeTab === 'specifications' && (
            <div className="bg-[#090f1d] border border-slate-800 rounded-lg p-5">
              <h3 className="font-bold text-white text-sm pb-3 mb-4 border-b border-slate-800">
                Electrical Nameplate & Commissioning Specifications
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Rated Output Power</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.ratedPowerKw} kW</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Rated Voltage / Phases</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.ratedVoltageV} V · 3-Phase</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Full Load Current</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.ratedCurrentA} Amps</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Synchronous / Rated RPM</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.ratedRpm} RPM ({motor.poleCount} Poles)</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">IEC Frame Size</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.frameSize}</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Mounting Arrangement</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{motor.mountType}</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Assigned Edge Gateway Node</span>
                  <span className="text-sm font-mono font-bold text-teal-400 mt-0.5 block">{motor.edgeNodeId}</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Commissioning Date</span>
                  <span className="text-sm font-mono font-bold text-slate-300 mt-0.5 block">{motor.installDate}</span>
                </div>
                <div className="bg-[#0e172a] p-3 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">Next Scheduled Inspection</span>
                  <span className="text-sm font-mono font-bold text-slate-300 mt-0.5 block">{motor.nextScheduledDate}</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#090f1c] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Last Telemetry Sync: {motor.telemetry.timestamp.slice(11, 19)} UTC</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSimulateInspection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Snapshot
            </button>
            {onScheduleMaintenance && (
              <button
                onClick={() => {
                  onScheduleMaintenance(motor);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors shadow-sm"
              >
                <Wrench className="w-3.5 h-3.5" />
                Schedule Maintenance
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
