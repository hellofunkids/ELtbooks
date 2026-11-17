import { toSyncData, type Collection } from "@workspace/sync-core";

export const SYNC_KEYS = {
  library: "elt-library-v1", quizzesV3: "elt-quiz-v3", essaysV3: "elt-essay-v3",
} as const;
export const META_KEY = "elt-sync-meta-v1";
export const DATA_UPDATED = "elt-data-updated";
export const LOCAL_CHANGED = "elt-local-changed";
export interface SyncMetadata {
  updated: ReturnType<typeof toSyncData>["updated"];
  deleted: ReturnType<typeof toSyncData>["deleted"];
  sequence: number;
  dirty: boolean;
}
export function readSyncMetadata(): SyncMetadata {
  const raw = JSON.parse(localStorage.getItem(META_KEY) ?? "{}");
  const data = toSyncData(raw);
  return { updated: data.updated, deleted: data.deleted, sequence: raw.sequence ?? 0, dirty: Boolean(raw.dirty) };
}
export function notifyLocalChange(collection: Collection, ids: string[], deleted = false): void {
  if (!ids.length) return;
  const meta = readSyncMetadata();
  const clocks = [...Object.values(meta.updated), ...Object.values(meta.deleted)];
  const time = Math.max(Date.now(), ...clocks.flatMap(clock => Object.values(clock))) + 1;
  for (const id of ids) (deleted ? meta.deleted : meta.updated)[collection][id] = time;
  meta.sequence++;
  meta.dirty = true;
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  window.dispatchEvent(new Event(LOCAL_CHANGED));
}
