import React from 'react';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  variant?: 'accent' | 'server' | 'success';
  isPaused?: boolean;
  indeterminate?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function ProgressBar({
  value = 0,
  variant = 'accent',
  isPaused = false,
  indeterminate = false,
  size = 'md',
  className = '',
  ...props
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const containerClasses = [
    'ui-progress-container',
    `ui-progress-container--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const barClasses = [
    'ui-progress-bar',
    `ui-progress-bar--${variant}`,
    isPaused ? 'ui-progress-bar--paused' : '',
    indeterminate ? 'ui-progress-bar--indeterminate' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={containerClasses}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className={barClasses}
        style={indeterminate ? undefined : { width: `${clampedValue}%` }}
      />
    </div>
  );
}
