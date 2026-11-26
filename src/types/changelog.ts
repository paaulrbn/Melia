export interface ChangelogGroup {
  readonly title: string;
  readonly items: string[];
}

export interface ChangelogRelease {
  readonly version: string;
  /** Release day, ISO format (YYYY-MM-DD). Optional. */
  readonly date?: string;
  readonly groups: ChangelogGroup[];
}
