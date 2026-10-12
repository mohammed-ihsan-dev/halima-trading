/**
 * Small per-admin limit on presigned uploads, as a guard against runaway clients. In-memory,
 * so per server instance — the admin login and short URL lifetime remain the real controls.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FILES_PER_WINDOW = 100;
const hits = new Map<string, number[]>();

export function takeUploadQuota(adminKey: string, files: number, now = Date.now()): boolean {
  const recent = (hits.get(adminKey) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length + files > MAX_FILES_PER_WINDOW) {
    hits.set(adminKey, recent);
    return false;
  }
  hits.set(adminKey, [...recent, ...Array(files).fill(now)]);
  return true;
}
