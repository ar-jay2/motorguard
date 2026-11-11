import React from 'react';

interface MotorHealthGaugeProps {
  score: number; // 0 - 100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const MotorHealthGauge: React.FC<MotorHealthGaugeProps> = ({
  score,
  size = 'md',
  showLabel = true,
}) => {
  const clampedScore = Math.max(0, Math.min(100, score));

  // Determine color based on threshold
  const getColor = () => {
    if (clampedScore >= 85) return '#14b8a6'; // teal-500
    if (clampedScore >= 65) return '#f59e0b'; // amber-500
    return '#f43f5e'; // rose-500
  };

  const getDimension = () => {
    switch (size) {
      case 'sm':
        return { width: 44, stroke: 4, radius: 18, textClass: 'text-xs' };
      case 'lg':
        return { width: 100, stroke: 8, radius: 42, textClass: 'text-2xl' };
      default:
        return { width: 68, stroke: 6, radius: 28, textClass: 'text-base' };
    }
  };

  const { width, stroke, radius, textClass } = getDimension();
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;
  const strokeColor = getColor();

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={width}
          height={width}
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Background circle */}
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            stroke="#1e293b"
            strokeWidth={stroke}
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <span
          className={`absolute font-mono font-bold text-white tabular-nums ${textClass}`}
        >
          {clampedScore}%
        </span>
      </div>
      {showLabel && (
        <span className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider font-medium">
          Health Index
        </span>
      )}
    </div>
  );
};
