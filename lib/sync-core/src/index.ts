export const COLLECTIONS = ["library", "quizzesV3", "essaysV3"] as const;
export type Collection = typeof COLLECTIONS[number];
export type Clock = Record<Collection, Record<string, number>>;
export interface LibraryItem { id: string; [key: string]: unknown }
export interface SyncData {
  library: LibraryItem[];
  quizzes: Record<string, unknown>;
  quizzesV3: Record<string, unknown>;
  essaysV3: Record<string, unknown>;
  updated: Clock;
  deleted: Clock;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function clock(value: unknown): Clock {
  const obj = record(value);
  return Object.fromEntries(COLLECTIONS.map(key => [key,
    Object.fromEntries(Object.entries(record(obj[key])).filter(([, time]) =>
      typeof time === "number" && Number.isFinite(time) && time >= 0)),
  ])) as Clock;
}
export function toSyncData(value: unknown): SyncData {
  const raw = record(value);
  return {
    library: Array.isArray(raw.library) ? raw.library.filter(item =>
      item && typeof item === "object" && typeof item.id === "string") : [],
    quizzes: record(raw.quizzes),
    quizzesV3: record(raw.quizzesV3),
    essaysV3: record(raw.essaysV3),
    updated: clock(raw.updated),
    deleted: clock(raw.deleted),
  };
}
function libraryMap(data: SyncData): Record<string, unknown> {
  return Object.fromEntries(data.library.map(item => [item.id, item]));
}
export function mergeSyncData(base: SyncData, incoming: SyncData): SyncData {
  const result = toSyncData({});
  result.quizzes = { ...incoming.quizzes, ...base.quizzes };
  for (const key of COLLECTIONS) {
    const a = key === "library" ? libraryMap(base) : base[key];
    const b = key === "library" ? libraryMap(incoming) : incoming[key];
    const merged: Record<string, unknown> = {};
    const ids = new Set([...Object.keys(a), ...Object.keys(b),
      ...Object.keys(base.deleted[key]), ...Object.keys(incoming.deleted[key])]);
    for (const id of ids) {
      const fallback = (item: unknown) => key === "library"
        ? Date.parse(String(record(item).savedAt ?? "")) || 0 : 0;
      const at = base.updated[key][id] ?? fallback(a[id]);
      const bt = incoming.updated[key][id] ?? fallback(b[id]);
      const deleted = Math.max(base.deleted[key][id] ?? 0, incoming.deleted[key][id] ?? 0);
      const updated = Math.max(at, bt);
      if (deleted) result.deleted[key][id] = deleted;
      if (updated) result.updated[key][id] = updated;
      if (deleted && deleted >= updated) continue;
      let winner = b[id] !== undefined && (a[id] === undefined || bt > at) ? b[id] : a[id];
      if (key === "library" && a[id] && b[id] && at === bt) {
        const thumbnail = record(b[id]).thumbnailUrl;
        if (typeof thumbnail === "string" && thumbnail.startsWith("/api/sync/assets/")) {
          winner = { ...record(winner), thumbnailUrl: thumbnail };
        }
      }
      if (winner !== undefined) merged[id] = winner;
    }
    if (key === "library") {
      result.library = (Object.values(merged) as LibraryItem[]).sort((x, y) =>
        String(y.savedAt ?? "").localeCompare(String(x.savedAt ?? "")));
    } else result[key] = merged;
  }
  return result;
}
