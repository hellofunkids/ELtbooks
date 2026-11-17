import { mergeSyncData, toSyncData, type SyncData } from "@workspace/sync-core";
import { DATA_UPDATED, LOCAL_CHANGED, META_KEY, SYNC_KEYS, readSyncMetadata } from "./sync-events";

const FIXED_ROOM_ID = (import.meta.env.VITE_SYNC_ROOM_ID as string | undefined) ?? "";
const ROOM_KEY = "elt-sync-room-v1";
const LAST_SYNC_KEY = "elt-last-sync-v1";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const isSupabaseConfigured = () => true; // Compatibility with the existing UI; storage is now Replit.
export const isSupabaseUrlInvalid = () => false;
export const isRoomFixed = () => Boolean(FIXED_ROOM_ID);
export function getRoomId(): string | null {
  return FIXED_ROOM_ID || localStorage.getItem(ROOM_KEY);
}
export function setRoomId(id: string): void {
  if (!FIXED_ROOM_ID) localStorage.setItem(ROOM_KEY, id);
}
export function getOrCreateRoomId(): string {
  const existing = getRoomId();
  if (existing) return existing;
  const id = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  setRoomId(id);
  return id;
}
export function buildShareUrl(roomId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("r", roomId);
  return url.toString();
}
export function extractRoomFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("r");
  return id && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null;
}
export function readLocalPayload(): SyncData & Record<string, unknown> {
  const metadata = readSyncMetadata();
  return toSyncData({
    library: JSON.parse(localStorage.getItem(SYNC_KEYS.library) ?? "[]"),
    quizzes: JSON.parse(localStorage.getItem("elt-quiz-v1") ?? "{}"),
    quizzesV3: JSON.parse(localStorage.getItem(SYNC_KEYS.quizzesV3) ?? "{}"),
    essaysV3: JSON.parse(localStorage.getItem(SYNC_KEYS.essaysV3) ?? "{}"),
    ...metadata,
  }) as SyncData & Record<string, unknown>;
}
export function mergePayload(incoming: unknown): { added: number; changed: boolean } {
  const before = readLocalPayload();
  const data = mergeSyncData(before, toSyncData(incoming));
  const added = data.library.filter(item => !before.library.some(existing => existing.id === item.id)).length;
  const changed = JSON.stringify(data) !== JSON.stringify(before);
  if (!changed) return { added: 0, changed: false };
  const meta = readSyncMetadata();
  const values: Record<string, string> = {
    [SYNC_KEYS.library]: JSON.stringify(data.library),
    [SYNC_KEYS.quizzesV3]: JSON.stringify(data.quizzesV3),
    [SYNC_KEYS.essaysV3]: JSON.stringify(data.essaysV3),
    "elt-quiz-v1": JSON.stringify(data.quizzes),
    [META_KEY]: JSON.stringify({ ...meta, updated: data.updated, deleted: data.deleted }),
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, localStorage.getItem(key)]));
  try {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  } catch {
    for (const [key, value] of Object.entries(previous)) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    throw new Error("이 기기의 저장 공간이 부족합니다. 기존 자료를 유지했습니다. 파일로 먼저 백업해주세요.");
  }
  window.dispatchEvent(new Event(DATA_UPDATED));
  return { added, changed };
}
export function getLastSyncTime(): Date | null {
  const value = localStorage.getItem(LAST_SYNC_KEY);
  return value ? new Date(value) : null;
}
function markSynced(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}
async function request(roomId: string, options: RequestInit): Promise<{ data: unknown; revision: number; storage: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${BASE}/api/sync/room/${encodeURIComponent(roomId)}`, {
      ...options, cache: "no-store", signal: controller.signal,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "동기화 저장소에 연결하지 못했습니다.");
    if (body.storage !== "replit" || !body.data || typeof body.revision !== "number") {
      throw new Error("게시된 앱에 이전 동기화 서버가 남아 있습니다. 최신 버전을 다시 게시해주세요.");
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("동기화 연결 시간이 초과됐습니다. 자료는 유지되며 다시 시도합니다.");
    throw error;
  } finally { clearTimeout(timer); }
}
export async function syncPush(roomId: string): Promise<{ added: number; changed: boolean }> {
  const sequence = readSyncMetadata().sequence;
  const result = await request(roomId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readLocalPayload()),
  });
  const merged = mergePayload(result.data);
  const meta = readSyncMetadata();
  if (sequence === meta.sequence) localStorage.setItem(META_KEY, JSON.stringify({ ...meta, dirty: false }));
  markSynced();
  return merged;
}
export async function syncPull(roomId: string, recordSuccess = true) {
  const result = await request(roomId, { method: "GET" });
  const merged = mergePayload(result.data);
  if (recordSuccess) markSynced();
  return merged;
}
export async function autoSync(roomId: string) {
  const pulled = await syncPull(roomId, false);
  const pushed = await syncPush(roomId);
  return { added: pulled.added + pushed.added, changed: pulled.changed || pushed.changed };
}

export type SyncState = { status: "connecting" | "syncing" | "live" | "offline" | "error"; error: string | null };
let state: SyncState = { status: "connecting", error: null };
const subscribers = new Set<(state: SyncState) => void>();
export const getSyncState = () => state;
export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function publish(status: SyncState["status"], error: string | null = null) {
  state = { status, error };
  for (const listener of subscribers) listener(state);
}
export function startRealtimeSync(roomId: string): () => void {
  let stopped = false;
  let working = false;
  let pullPending = false;
  let pushPending = false;
  let connected = false;
  let delay = 3000;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const run = async (push: boolean) => {
    pullPending = true;
    pushPending ||= push;
    if (working || stopped) return;
    if (!navigator.onLine) { publish("offline", "오프라인입니다. 이 기기에 저장하고 재연결 시 자동 전송합니다."); return; }
    working = true;
    while (pullPending && !stopped) {
      const write = pushPending;
      pullPending = false;
      pushPending = false;
      publish("syncing");
      try {
        if (write) await autoSync(roomId); else await syncPull(roomId);
        if (stopped) break;
        delay = 3000;
        if (retry) clearTimeout(retry);
        retry = undefined;
        publish(connected ? "live" : "connecting");
      } catch (error) {
        if (stopped) break;
        pushPending ||= write;
        publish("error", error instanceof Error ? error.message : "연결에 실패했습니다. 자동으로 다시 시도합니다.");
        retry = setTimeout(() => { retry = undefined; void run(pushPending || readSyncMetadata().dirty); }, delay);
        delay = Math.min(delay * 2, 30_000);
        break;
      }
    }
    working = false;
  };
  const source = new EventSource(`${BASE}/api/sync/events/${encodeURIComponent(roomId)}`);
  const ready = () => { connected = true; void run(readSyncMetadata().dirty); };
  source.addEventListener("ready", ready);
  source.addEventListener("change", () => { connected = true; void run(readSyncMetadata().dirty); });
  source.addEventListener("unavailable", () => { connected = false; publish("error", "실시간 저장소를 확인할 수 없습니다. 연결되면 자동으로 다시 동기화합니다."); });
  source.onerror = () => { connected = false; publish(navigator.onLine ? "connecting" : "offline", "연결이 끊겼습니다. 자료를 유지하고 자동으로 재연결합니다."); };
  const localChange = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void run(true), 350);
  };
  const online = () => void run(true);
  const offline = () => publish("offline", "오프라인입니다. 자료는 이 기기에 저장됩니다.");
  const visible = () => { if (document.visibilityState === "visible") void run(readSyncMetadata().dirty); };
  const storageChange = (event: StorageEvent) => {
    if (event.key && [...Object.values(SYNC_KEYS), META_KEY].includes(event.key)) {
      window.dispatchEvent(new Event(DATA_UPDATED));
      if (readSyncMetadata().dirty) localChange();
    }
  };
  window.addEventListener(LOCAL_CHANGED, localChange);
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  window.addEventListener("storage", storageChange);
  document.addEventListener("visibilitychange", visible);
  void run(true); // Upload pre-existing browser materials during the first connection.
  return () => {
    stopped = true;
    source.close();
    if (debounce) clearTimeout(debounce);
    if (retry) clearTimeout(retry);
    window.removeEventListener(LOCAL_CHANGED, localChange);
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
    window.removeEventListener("storage", storageChange);
    document.removeEventListener("visibilitychange", visible);
  };
}
