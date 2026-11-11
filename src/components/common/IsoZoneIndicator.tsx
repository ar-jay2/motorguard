import React from 'react';
import { IsoVibrationZone } from '../../types/motor';

interface IsoZoneIndicatorProps {
  zone: IsoVibrationZone;
  showExplanation?: boolean;
}

export const IsoZoneIndicator: React.FC<IsoZoneIndicatorProps> = ({ zone, showExplanation = false }) => {
  const getZoneDetails = () => {
    switch (zone) {
      case 'A':
        return {
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          meaning: 'Zone A · Rigid / New',
          range: '< 1.8 mm/s',
        };
      case 'B':
        return {
          color: 'text-teal-300',
          bg: 'bg-teal-500/10 border-teal-500/20',
          meaning: 'Zone B · Acceptable',
          range: '1.8 - 2.8 mm/s',
        };
      case 'C':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          meaning: 'Zone C · Unsatisfactory',
          range: '2.8 - 4.5 mm/s',
        };
      case 'D':
        return {
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/20',
          meaning: 'Zone D · Unacceptable / Damage',
          range: '> 4.5 mm/s',
        };
    }
  };

  const details = getZoneDetails();

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded border ${details.bg} ${details.color}`}>
        ISO {zone}
      </span>
      {showExplanation && (
        <span className="text-xs text-slate-400">
          {details.meaning} ({details.range})
        </span>
      )}
    </div>
  );
};
