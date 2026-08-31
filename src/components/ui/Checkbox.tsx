import React, { forwardRef } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      checked,
      disabled,
      className = '',
      containerClassName = '',
      id,
      ...props
    },
    ref
  ) => {
    const containerClasses = [
      'ui-checkbox-container',
      disabled ? 'ui-checkbox-container--disabled' : '',
      containerClassName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={containerClasses}>
        <div className="ui-checkbox-box-wrapper">
          <input
            id={id}
            type="checkbox"
            ref={ref}
            checked={checked}
            disabled={disabled}
            className={`ui-checkbox-input ${className}`}
            {...props}
          />
          <div className="ui-checkbox-custom">
            <Check className="ui-checkbox-icon" size={12} strokeWidth={3} />
          </div>
        </div>
        {label && <span className="ui-checkbox-label">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
