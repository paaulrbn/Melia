export interface ChangelogGroup {
  readonly title: string;
  readonly items: string[];
}

export interface ChangelogRelease {
  readonly version: string;
  readonly groups: ChangelogGroup[];
}
