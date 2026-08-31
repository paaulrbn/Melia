import React, { forwardRef } from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default';
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'rounded';
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = 'default',
      size = 'md',
      shape = 'rounded',
      className = '',
      'aria-label': ariaLabel,
      title,
      ...props
    },
    ref
  ) => {
    const classNames = [
      'ui-icon-btn',
      `ui-icon-btn--${variant}`,
      `ui-icon-btn--${size}`,
      `ui-icon-btn--${shape}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type="button"
        className={classNames}
        aria-label={ariaLabel}
        title={title || ariaLabel}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
