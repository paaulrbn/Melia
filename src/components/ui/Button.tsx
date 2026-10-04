import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const classNames = [
      'ui-btn',
      `ui-btn--${variant}`,
      `ui-btn--${size}`,
      fullWidth ? 'ui-btn--full' : '',
      isLoading ? 'ui-btn--loading' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    let spinnerSize = 18;
    if (size === 'sm') {
      spinnerSize = 16;
    } else if (size === 'lg') {
      spinnerSize = 20;
    }

    return (
      <button
        ref={ref}
        className={classNames}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="ui-btn-spinner" size={spinnerSize} />
        ) : (
          leftIcon && <span className="ui-btn-icon ui-btn-icon--left">{leftIcon}</span>
        )}
        {children && <span className="ui-btn-label">{children}</span>}
        {!isLoading && rightIcon && (
          <span className="ui-btn-icon ui-btn-icon--right">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
