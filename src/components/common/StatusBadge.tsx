import React from 'react';
import { MotorStatus, EventSeverity } from '../../types/motor';

interface StatusBadgeProps {
  status: MotorStatus | EventSeverity | 'online';
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showLabel = true,
  className = '',
  size = 'md',
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'nominal':
      case 'online':
        return {
          label: 'Nominal',
          color: 'text-emerald-400',
          dot: 'bg-emerald-500',
          border: 'border-emerald-500/30',
        };
      case 'warning':
        return {
          label: 'Warning',
          color: 'text-amber-400',
          dot: 'bg-amber-500',
          border: 'border-amber-500/30',
        };
      case 'critical':
      case 'trip':
        return {
          label: status === 'trip' ? 'Trip Activated' : 'Critical Alarm',
          color: 'text-rose-400',
          dot: 'bg-rose-500',
          border: 'border-rose-500/30',
        };
      case 'offline':
        return {
          label: 'Offline (Service)',
          color: 'text-slate-400',
          dot: 'bg-slate-500',
          border: 'border-slate-600/30',
        };
      case 'info':
        return {
          label: 'Info',
          color: 'text-cyan-400',
          dot: 'bg-cyan-500',
          border: 'border-cyan-500/30',
        };
      default:
        return {
          label: String(status),
          color: 'text-slate-300',
          dot: 'bg-slate-400',
          border: 'border-slate-500/30',
        };
    }
  };

  const config = getStatusConfig();
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-xs font-medium';

  return (
    <span className={`inline-flex items-center gap-1.5 ${textSize} ${config.color} ${className}`}>
      <span className={`inline-block rounded-full ${dotSize} ${config.dot}`} aria-hidden="true" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};
