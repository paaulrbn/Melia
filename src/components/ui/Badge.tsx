import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'accent' | 'server' | 'success' | 'neutral';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export function Badge({
  variant = 'accent',
  size = 'md',
  children,
  className = '',
  ...props
}: BadgeProps) {
  const classNames = [
    'ui-badge',
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} {...props}>
      {children}
    </span>
  );
}
