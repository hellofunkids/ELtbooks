// Supabase REST API helpers — no npm package needed, uses fetch directly

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LibraryItem { id: string; [key: string]: unknown }
export interface SyncData {
  library: LibraryItem[];
  quizzes: Record<string, unknown>;
  exportedAt?: string;
}
interface SupabaseRow { code: string; data: SyncData; created_at: string; updated_at: string }

function baseHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  };
}

export async function getEntry(code: string): Promise<SupabaseRow | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_codes?code=eq.${encodeURIComponent(code)}&select=*`,
    { headers: baseHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json() as SupabaseRow[];
  if (!rows.length) return null;
  const row = rows[0];
  if (Date.now() - new Date(row.created_at).getTime() > CODE_TTL_MS) {
    await deleteEntry(code);
    return null;
  }
  return row;
}

export async function upsertEntry(code: string, data: SyncData, createdAt?: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const now = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/sync_codes`, {
    method: "POST",
    headers: { ...baseHeaders(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ code, data, created_at: createdAt ?? now, updated_at: now }),
  });
}

export async function deleteEntry(code: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/sync_codes?code=eq.${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
}

export async function codeExists(code: string): Promise<boolean> {
  const entry = await getEntry(code);
  return entry !== null;
}

export function generateCode(): string {
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

export function toSyncData(raw: unknown): SyncData {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    library: Array.isArray(obj["library"]) ? (obj["library"] as LibraryItem[]) : [],
    quizzes:
      obj["quizzes"] != null && typeof obj["quizzes"] === "object" && !Array.isArray(obj["quizzes"])
        ? (obj["quizzes"] as Record<string, unknown>)
        : {},
  };
}

export function mergeData(base: SyncData, incoming: SyncData): SyncData {
  const existingIds = new Set(base.library.map((i) => i.id));
  const newItems = (incoming.library ?? []).filter((i) => !existingIds.has(i.id));
  const mergedLibrary = [...newItems, ...base.library];
  const mergedQuizzes = { ...base.quizzes };
  for (const [id, quiz] of Object.entries(incoming.quizzes ?? {})) {
    if (!mergedQuizzes[id]) mergedQuizzes[id] = quiz;
  }
  return { library: mergedLibrary, quizzes: mergedQuizzes, exportedAt: new Date().toISOString() };
}

// ── sync_data table (room-based persistent sync) ──────────────────────────────

interface SyncDataRow { room_id: string; data: SyncData; updated_at: string }

export function isSupabaseReady(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export async function getRoomData(roomId: string): Promise<SyncData | null> {
  if (!isSupabaseReady()) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_data?room_id=eq.${encodeURIComponent(roomId)}&select=data`,
    { headers: baseHeaders(), signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) throw new Error(`동기화 저장소 조회 실패 (${res.status}). 서버 연결 설정을 확인해주세요.`);
  const rows = await res.json() as Pick<SyncDataRow, "data">[];
  return rows.length ? rows[0].data : null;
}

export async function upsertRoomData(roomId: string, data: SyncData): Promise<void> {
  if (!isSupabaseReady()) throw new Error("Supabase 환경변수가 설정되지 않았습니다. SUPABASE_URL과 SUPABASE_SERVICE_KEY를 Vercel 대시보드에 추가하세요.");
  const now = new Date().toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_data`, {
    method: "POST",
    headers: { ...baseHeaders(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ room_id: roomId, data, updated_at: now }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`동기화 저장소 저장 실패 (${res.status}). 서버 연결 설정을 확인해주세요.`);
  }
}
