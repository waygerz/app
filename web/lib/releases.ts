// Android APK builds published to the public S3 bucket. Add an entry here (and
// deploy webui) each time a new APK is uploaded; they're shown newest first by
// date (list the newer one first if two share a day).
const RELEASES_BASE = 'https://waygerz.s3.us-east-1.amazonaws.com/public/releases';

export type Release = {
  version: string;
  file: string;
  /** ISO date the APK was published. */
  date: string;
  sizeBytes: number;
  /** Short commit the build came from. */
  commit: string;
  notes?: string;
};

const ALL_RELEASES: Release[] = [
  {
    version: '0.1.0',
    file: 'waygerz-0.1.0.apk',
    date: '2026-09-19',
    sizeBytes: 57851354,
    commit: '8fbbdc3',
    notes: 'First public build.',
  },
];

export const RELEASES: Release[] = [...ALL_RELEASES].sort((a, b) => b.date.localeCompare(a.date));

export const releaseUrl = (r: Release) => `${RELEASES_BASE}/${r.file}`;

export function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Date-only ISO strings parse as UTC; format in UTC so the day never shifts.
export function formatReleaseDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
