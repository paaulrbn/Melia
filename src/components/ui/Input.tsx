import React, { forwardRef, useId } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightElement,
      inputSize = 'md',
      fullWidth = false,
      containerClassName = '',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || (label ? `${generatedId}-input` : undefined);

    const wrapperClasses = [
      'ui-input-wrapper',
      fullWidth ? 'ui-input-wrapper--full' : '',
      containerClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const containerClasses = [
      'ui-input-container',
      `ui-input-container--${inputSize}`,
      error ? 'ui-input-container--error' : '',
      leftIcon ? 'ui-input-container--has-left-icon' : '',
      rightElement ? 'ui-input-container--has-right-element' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const fieldClasses = ['ui-input-field', className].filter(Boolean).join(' ');

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={inputId} className="ui-input-label">
            {label}
          </label>
        )}
        <div className={containerClasses}>
          {leftIcon && <span className="ui-input-icon ui-input-icon--left">{leftIcon}</span>}
          <input id={inputId} ref={ref} className={fieldClasses} {...props} />
          {rightElement && (
            <span className="ui-input-element ui-input-element--right">{rightElement}</span>
          )}
        </div>
        {error && <span className="ui-input-error">{error}</span>}
        {!error && helperText && <span className="ui-input-helper">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
