import type { ReactNode } from 'react';

interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  /** One sentence under the title, when the section needs context */
  readonly description?: ReactNode;
  readonly children: ReactNode;
}

/** A titled block of the settings page: plain heading above one or more grouped lists. */
export function SettingsSection({ id, title, description, children }: Readonly<SettingsSectionProps>) {
  const titleId = `${id}-title`;
  return (
    <section className="settings-section" aria-labelledby={titleId}>
      <header className="settings-section-head">
        <h3 className="settings-section-title" id={titleId}>
          {title}
        </h3>
        {description && <p className="settings-section-description">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export type ConnectionState = 'ok' | 'error' | 'missing';

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  ok: 'Connecté',
  error: 'Injoignable',
  missing: 'À configurer',
};

/** Connection status, sober: one grey word, red only when the server does not answer. */
export function ConnectionStatus({ state }: Readonly<{ state: ConnectionState }>) {
  return (
    <span className="settings-status" data-state={state}>
      {CONNECTION_LABELS[state]}
    </span>
  );
}

interface SettingsGroupHeadProps {
  readonly id: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}

/** Small title of a grouped list inside a section (one server), with an optional status. */
export function SettingsGroupHead({ id, title, trailing }: Readonly<SettingsGroupHeadProps>) {
  return (
    <div className="settings-group-head">
      <h4 className="settings-group-title" id={id}>
        {title}
      </h4>
      {trailing}
    </div>
  );
}
