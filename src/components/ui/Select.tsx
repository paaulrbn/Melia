import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  selectSize?: 'sm' | 'md';
  fullWidth?: boolean;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      options,
      children,
      selectSize = 'md',
      fullWidth = false,
      containerClassName = '',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || (label ? `${generatedId}-select` : undefined);

    const wrapperClasses = [
      'ui-select-wrapper',
      fullWidth ? 'ui-select-wrapper--full' : '',
      containerClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const containerClasses = [
      'ui-select-container',
      `ui-select-container--${selectSize}`,
      error ? 'ui-select-container--error' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const selectClasses = ['ui-select-field', className].filter(Boolean).join(' ');

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={selectId} className="ui-select-label">
            {label}
          </label>
        )}
        <div className={containerClasses}>
          <select id={selectId} ref={ref} className={selectClasses} {...props}>
            {options
              ? options.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="ui-select-chevron" size={16} />
        </div>
        {error && <span className="ui-select-error">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
