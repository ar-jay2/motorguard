import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  icon?: LucideIcon;
  statusVariant?: 'default' | 'nominal' | 'warning' | 'critical' | 'teal';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  subtext,
  trend,
  icon: Icon,
  statusVariant = 'default',
  className = '',
}) => {
  const getVariantStyles = () => {
    switch (statusVariant) {
      case 'teal':
        return 'border-teal-500/30 bg-[#0d1829]';
      case 'nominal':
        return 'border-emerald-500/20 bg-[#0c1626]';
      case 'warning':
        return 'border-amber-500/30 bg-[#16171d]';
      case 'critical':
        return 'border-rose-500/30 bg-[#1a1219]';
      default:
        return 'border-slate-800 bg-[#0c1424]';
    }
  };

  const getAccentColor = () => {
    switch (statusVariant) {
      case 'teal':
        return 'text-teal-400';
      case 'nominal':
        return 'text-emerald-400';
      case 'warning':
        return 'text-amber-400';
      case 'critical':
        return 'text-rose-400';
      default:
        return 'text-teal-400';
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${getVariantStyles()} ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${getAccentColor()}`} />}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400 font-medium">{unit}</span>}
      </div>

      {(subtext || trend) && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-2">
          {subtext && <span className="truncate">{subtext}</span>}
          {trend && (
            <span
              className={`font-mono font-medium ml-auto ${
                trend.isNeutral
                  ? 'text-slate-400'
                  : trend.isPositive
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
