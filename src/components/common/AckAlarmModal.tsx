import React, { useState } from 'react';
import { X, CheckCircle, ShieldAlert } from 'lucide-react';
import { EventAlarm } from '../../types/motor';

interface AckAlarmModalProps {
  alarm: EventAlarm | null;
  onClose: () => void;
  onConfirm: (alarmId: string, operatorName: string, notes: string) => void;
}

export const AckAlarmModal: React.FC<AckAlarmModalProps> = ({
  alarm,
  onClose,
  onConfirm,
}) => {
  const [operator, setOperator] = useState('E. Davies (Shift Eng.)');
  const [notes, setNotes] = useState('Dispatched technician to inspect bearing lubrication and vibration spectrum.');

  if (!alarm) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(alarm.id, operator, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#0b1322] border border-slate-700 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#090f1c]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Acknowledge Alarm</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-[#080d19] border border-slate-800 rounded-lg text-xs space-y-1">
            <div className="flex justify-between text-slate-400 font-mono">
              <span>{alarm.motorTag} · {alarm.code}</span>
              <span>{alarm.timestamp.slice(11, 19)} UTC</span>
            </div>
            <p className="font-semibold text-white pt-1">{alarm.message}</p>
            <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
              <span>Value: <strong className="text-rose-400">{alarm.valueRecorded}</strong></span>
              <span>Limit: <strong>{alarm.thresholdLimit}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Operator Sign-off / Technician ID
            </label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-[#0e172a] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Root Cause / Immediate Corrective Action Log
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-[#0e172a] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Confirm Acknowledgment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
