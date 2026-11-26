export type TransferState = 'active' | 'paused' | 'error';

export interface TransferBarProps {
  /** Percentage, or null while waiting (a short segment sweeps the track) */
  readonly value: number | null;
  readonly state?: TransferState;
  /** Id of the element that names the transfer */
  readonly labelledBy?: string;
  readonly label?: string;
  readonly className?: string;
}

/**
 * Thin download bar (movie page, downloads page): white fill on a grey track, grey when
 * paused, red only on an error. Not a live region: read on demand, never announced at
 * each percent.
 */
export function TransferBar({ value, state = 'active', labelledBy, label, className = '' }: Readonly<TransferBarProps>) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div
      className={['ui-transfer-track', className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      aria-valuetext={clamped === null ? 'En attente' : `${clamped} %`}
      data-state={state}
      data-indeterminate={clamped === null ? '' : undefined}
    >
      <div className="ui-transfer-fill" style={clamped === null ? undefined : { width: `${clamped}%` }} />
    </div>
  );
}
