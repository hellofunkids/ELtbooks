import { pool, type PoolClient } from "@workspace/db";

type Listener = (revision: number) => void;
const listeners = new Map<string, Set<Listener>>();
let connecting = false;
let client: PoolClient | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
const released = new WeakSet<PoolClient>();
function release(connection: PoolClient | undefined) {
  if (connection && !released.has(connection)) {
    released.add(connection);
    connection.release(true);
  }
}

async function connect() {
  if (connecting || client || !listeners.size) return;
  connecting = true;
  let acquired: PoolClient | undefined;
  try {
    acquired = await pool.connect();
    if (!listeners.size) { release(acquired); return; }
    const reset = () => {
      if (client === acquired) {
        client = null;
        release(acquired);
        if (listeners.size && !retry) retry = setTimeout(() => { retry = undefined; void connect(); }, 3000);
      }
    };
    acquired.on("error", reset);
    acquired.on("end", reset);
    acquired.on("notification", message => {
      try {
        const payload = JSON.parse(message.payload ?? "") as { roomId: string; revision: number };
        for (const listener of listeners.get(payload.roomId) ?? []) listener(payload.revision);
      } catch { /* Invalid notifications never affect stored data. */ }
    });
    client = acquired;
    await acquired.query("LISTEN elt_sync_changed");
  } catch {
    if (client === acquired) client = null;
    release(acquired);
    if (listeners.size && !retry) retry = setTimeout(() => { retry = undefined; void connect(); }, 3000);
  } finally { connecting = false; }
}
export function subscribeToRoom(roomId: string, listener: Listener): () => void {
  let set = listeners.get(roomId);
  if (!set) listeners.set(roomId, set = new Set());
  set.add(listener);
  void connect();
  return () => {
    set!.delete(listener);
    if (!set!.size) listeners.delete(roomId);
    if (!listeners.size) {
      if (retry) clearTimeout(retry);
      retry = undefined;
      const previous = client;
      client = null;
      release(previous ?? undefined);
    }
  };
}
