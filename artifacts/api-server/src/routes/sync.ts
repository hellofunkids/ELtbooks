import { Router, type IRouter } from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const router: IRouter = Router();

const SYNC_DIR = join(process.cwd(), ".sync");
const SYNC_FILE = join(SYNC_DIR, "store.json");
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LibraryItem { id: string; [key: string]: unknown }
interface SyncData {
  library: LibraryItem[];
  quizzes: Record<string, unknown>;
  exportedAt?: string;
}
interface SyncEntry {
  data: SyncData;
  createdAt: number;
  updatedAt: number;
}

function loadStore(): Record<string, SyncEntry> {
  try {
    if (!existsSync(SYNC_FILE)) return {};
    return JSON.parse(readFileSync(SYNC_FILE, "utf-8")) as Record<string, SyncEntry>;
  } catch {
    return {};
  }
}

function persistStore(store: Record<string, SyncEntry>): void {
  try {
    if (!existsSync(SYNC_DIR)) mkdirSync(SYNC_DIR, { recursive: true });
    writeFileSync(SYNC_FILE, JSON.stringify(store), "utf-8");
  } catch { /* ignore */ }
}

function generateCode(): string {
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

function cleanExpired(store: Record<string, SyncEntry>): Record<string, SyncEntry> {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (now - store[key].createdAt > CODE_TTL_MS) delete store[key];
  }
  return store;
}

// Merge two SyncData payloads — deduplicate library by id, merge quizzes
function mergeData(base: SyncData, incoming: SyncData): SyncData {
  const existingIds = new Set(base.library.map((i) => i.id));
  const newItems = (incoming.library ?? []).filter((i) => !existingIds.has(i.id));

  const mergedLibrary = [...newItems, ...base.library];

  const mergedQuizzes = { ...base.quizzes };
  for (const [id, quiz] of Object.entries(incoming.quizzes ?? {})) {
    if (!mergedQuizzes[id]) mergedQuizzes[id] = quiz;
  }

  return { library: mergedLibrary, quizzes: mergedQuizzes, exportedAt: new Date().toISOString() };
}

function toSyncData(raw: unknown): SyncData {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    library: Array.isArray(obj["library"]) ? (obj["library"] as LibraryItem[]) : [],
    quizzes: (obj["quizzes"] != null && typeof obj["quizzes"] === "object" && !Array.isArray(obj["quizzes"]))
      ? (obj["quizzes"] as Record<string, unknown>)
      : {},
  };
}

// POST /api/sync/push — upload data, receive a 6-char code
router.post("/sync/push", (req, res): void => {
  const body = req.body as Record<string, unknown>;
  const raw = body["data"];
  if (!raw) { res.status(400).json({ error: "data 필드가 필요합니다." }); return; }

  const data = toSyncData(raw);
  const store = cleanExpired(loadStore());

  let code: string;
  let attempts = 0;
  do { code = generateCode(); attempts++; } while (store[code] && attempts < 100);

  const now = Date.now();
  store[code] = { data, createdAt: now, updatedAt: now };
  persistStore(store);

  res.json({ code });
});

// POST /api/sync/merge/:code — bi-directional: send local data, get merged result back
// Server merges stored data with incoming local data, persists merged, returns it.
router.post("/sync/merge/:code", (req, res): void => {
  const raw = req.params["code"] ?? "";
  const code = raw.toUpperCase().replace(/\s/g, "").trim();

  const store = loadStore();
  const entry = store[code];

  if (!entry) {
    res.status(404).json({ error: "코드를 찾을 수 없습니다. 코드가 만료됐거나 잘못됐습니다." });
    return;
  }
  if (Date.now() - entry.createdAt > CODE_TTL_MS) {
    delete store[code]; persistStore(store);
    res.status(404).json({ error: "동기화 코드가 만료됐습니다 (유효기간 7일)." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const incoming = toSyncData(body["data"]);

  const merged = mergeData(entry.data, incoming);

  store[code] = { ...entry, data: merged, updatedAt: Date.now() };
  persistStore(store);

  res.json({ data: merged, added: merged.library.length - entry.data.library.length });
});

// GET /api/sync/pull/:code — legacy one-way pull (kept for compatibility)
router.get("/sync/pull/:code", (req, res): void => {
  const raw = req.params["code"] ?? "";
  const code = raw.toUpperCase().replace(/\s/g, "").trim();

  const store = loadStore();
  const entry = store[code];

  if (!entry) {
    res.status(404).json({ error: "코드를 찾을 수 없습니다. 코드가 만료됐거나 잘못됐습니다." });
    return;
  }
  if (Date.now() - entry.createdAt > CODE_TTL_MS) {
    delete store[code]; persistStore(store);
    res.status(404).json({ error: "동기화 코드가 만료됐습니다 (유효기간 7일)." });
    return;
  }

  res.json({ data: entry.data });
});

// ── Supabase helpers (sync_data 테이블) ──────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

function supabaseHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  };
}

function isSupabaseReady(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabaseGet(roomId: string): Promise<SyncData | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_data?room_id=eq.${encodeURIComponent(roomId)}&select=data`,
    { headers: supabaseHeaders(), signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) throw new Error(`동기화 저장소 조회 실패 (${res.status}). 서버 연결 설정을 확인해주세요.`);
  const rows = await res.json() as Array<{ data: SyncData }>;
  return rows.length ? rows[0].data : null;
}

async function supabasePut(roomId: string, data: SyncData): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_data`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ room_id: roomId, data, updated_at: now }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`동기화 저장소 저장 실패 (${res.status}). 서버 연결 설정을 확인해주세요.`);
  }
}

function syncErrorMessage(error: unknown): string {
  const err = error as { message?: string; name?: string; cause?: { code?: string } };
  if (err?.cause?.code === "ENOTFOUND" || err?.cause?.code === "EAI_AGAIN") {
    return "동기화 저장소 주소에 연결할 수 없습니다. Supabase 프로젝트 상태와 서버의 SUPABASE_URL을 확인해주세요. 이 기기의 저장 자료는 유지됩니다.";
  }
  if (err?.message === "fetch failed" || err?.name === "TimeoutError") {
    return "동기화 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하거나 Supabase 연결 설정을 확인해주세요. 이 기기의 저장 자료는 유지됩니다.";
  }
  return err?.message ?? "동기화 저장소 오류입니다. 이 기기의 저장 자료는 유지됩니다.";
}

// ── Room-based auto-sync ──────────────────────────────────────────────────────

// PUT /api/sync/room/:roomId — 데이터 업서트/병합 (자동 동기화 push)
router.put("/sync/room/:roomId", (req, res): void => {
  const roomId = (req.params["roomId"] ?? "").trim();
  if (!roomId || roomId.length < 6) {
    res.status(400).json({ error: "유효하지 않은 방 코드입니다." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const incoming = toSyncData(body);

  if (isSupabaseReady()) {
    // Supabase 우선: 기존 데이터와 병합 후 저장
    supabaseGet(roomId)
      .then((existing) => {
        const merged = existing ? mergeData(existing, incoming) : incoming;
        return supabasePut(roomId, merged);
      })
      .then(() => {
        res.json({ ok: true, updatedAt: new Date().toISOString(), storage: "supabase" });
      })
      .catch((e: unknown) => {
        res.status(503).json({ error: syncErrorMessage(e) });
      });
    return;
  }

  // 폴백: 파일 저장소
  const store = loadStore();
  const existing = store[roomId];
  const now = Date.now();
  if (existing) {
    const merged = mergeData(existing.data, incoming);
    store[roomId] = { ...existing, data: merged, updatedAt: now };
  } else {
    store[roomId] = { data: incoming, createdAt: now, updatedAt: now };
  }
  persistStore(store);
  res.json({ ok: true, updatedAt: now, storage: "file" });
});

// GET /api/sync/room/:roomId — 데이터 조회 (자동 동기화 pull)
router.get("/sync/room/:roomId", (req, res): void => {
  const roomId = (req.params["roomId"] ?? "").trim();
  if (!roomId || roomId.length < 6) {
    res.status(400).json({ error: "유효하지 않은 방 코드입니다." });
    return;
  }

  if (isSupabaseReady()) {
    supabaseGet(roomId)
      .then((data) => { res.json({ data: data ?? null }); })
      .catch((e: unknown) => { res.status(503).json({ error: syncErrorMessage(e) }); });
    return;
  }

  // 폴백: 파일 저장소
  const store = loadStore();
  const entry = store[roomId];
  res.json({ data: entry ? entry.data : null });
});

export default router;
