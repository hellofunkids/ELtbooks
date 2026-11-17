import { useState, useRef, useEffect } from "react";
import {
  X, Link2, Copy, CheckCircle, AlertCircle, Loader2,
  RefreshCw, WifiOff, Wifi, FileDown, FileUp, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isSupabaseConfigured,
  isSupabaseUrlInvalid,
  isRoomFixed,
  getOrCreateRoomId,
  buildShareUrl,
  autoSync,
  getLastSyncTime,
  readLocalPayload,
  mergePayload,
  getSyncState,
  subscribeSyncState,
} from "@/lib/auto-sync";

// ── JSON 파일 내보내기 ────────────────────────────────────────────────────────

function exportToFile(payload: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── JSON 파일 가져오기 + 병합 ─────────────────────────────────────────────────

function mergeFromFile(incoming: Record<string, unknown>): { added: number } {
  return mergePayload(incoming);
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface SyncModalProps {
  onClose: () => void;
  onSynced: () => void;
}

type Tab = "auto" | "file";

export function SyncModal({ onClose, onSynced }: SyncModalProps) {
  const configured = isSupabaseConfigured();
  const urlInvalid = isSupabaseUrlInvalid();
  const roomFixed = isRoomFixed();
  // 고정 방 코드가 있으면 자동 탭이 기본 (Supabase 오류 안내를 보여주기 위함)
  const [tab, setTab] = useState<Tab>(roomFixed ? "auto" : "file");

  // ── 자동 동기화 상태 ──────────────────────────────────────────────────────
  const roomId = configured ? getOrCreateRoomId() : null;
  const shareUrl = (!roomFixed && roomId) ? buildShareUrl(roomId) : null;

  const [linkCopied, setLinkCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ added: number } | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(() => getLastSyncTime());
  const [liveState, setLiveState] = useState(getSyncState);

  useEffect(() => {
    const unsubscribe = subscribeSyncState(state => {
      setLiveState(state);
      setSyncError(state.error);
      setLastSync(getLastSyncTime());
    });
    setSyncError(getSyncState().error);
    const iv = setInterval(() => setLastSync(getLastSyncTime()), 1000);
    return () => { clearInterval(iv); unsubscribe(); };
  }, []);

  // The Home connection stays subscribed even while this dialog is closed.

  const handleLinkCopy = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); }
    catch { /* noop */ }
  };

  const handleAutoSync = async () => {
    if (!roomId) return;
    setSyncing(true); setSyncError(null); setSyncResult(null);
    try {
      const result = await autoSync(roomId);
      setSyncResult(result);
      setLastSync(getLastSyncTime());
      if (result.added > 0) onSynced();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "동기화 실패. 인터넷 연결을 확인해주세요.");
    } finally { setSyncing(false); }
  };

  // ── 파일 내보내기/가져오기 상태 ──────────────────────────────────────────
  const [fileImportResult, setFileImportResult] = useState<{ added: number } | null>(null);
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const payload = readLocalPayload();
      const library = await Promise.all(payload.library.map(async item => {
        const url = item.thumbnailUrl;
        if (typeof url !== "string" || !url.startsWith("/api/sync/assets/")) return item;
        const response = await fetch(url);
        if (!response.ok) throw new Error("교재 이미지를 백업하지 못했습니다. 인터넷 연결을 확인해주세요.");
        const blob = await response.blob();
        const thumbnailUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("교재 이미지 백업에 실패했습니다."));
          reader.readAsDataURL(blob);
        });
        return { ...item, thumbnailUrl };
      }));
      const today = new Date().toISOString().slice(0, 10);
      exportToFile({ ...payload, library }, `elt-backup-${today}.json`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "백업을 만들지 못했습니다.");
    } finally { setExporting(false); }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileImportError(null);
    setFileImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        if (!parsed.library && !parsed.quizzes) {
          throw new Error("올바른 백업 파일이 아닙니다.");
        }
        const result = mergeFromFile(parsed);
        if (roomId) void handleAutoSync();
        setFileImportResult(result);
        if (result.added > 0) onSynced();
      } catch (err) {
        setFileImportError(err instanceof Error ? err.message : "파일을 읽을 수 없습니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <p className="font-bold text-foreground">기기 간 동기화</p>
            <p className="text-xs text-muted-foreground">학원 · 집 · 어디서든 데이터 이동</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted/60 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border/30">
          <button
            onClick={() => setTab("file")}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors
              ${tab === "file" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            파일 내보내기/가져오기
          </button>
          <button
            onClick={() => setTab("auto")}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors
              ${tab === "auto" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wifi className="w-3.5 h-3.5" />
            실시간 동기화
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── 파일 탭 ─────────────────────────────────────────────────────── */}
          {tab === "file" && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 leading-relaxed">
                <strong>가장 확실한 방법</strong> — 집 컴퓨터에서 파일로 내보낸 뒤,
                학원 컴퓨터에서 그 파일을 가져오면 됩니다. 인터넷 연결이 없어도 동작합니다.
              </div>

              {/* 내보내기 */}
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  📤 이 기기 데이터 내보내기
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    현재 저장된 교재 분석과 시험지를 <strong className="text-foreground">JSON 파일</strong>로 다운로드합니다.
                  </p>
                  {exportError && <p className="text-sm text-destructive">{exportError}</p>}
                  <Button onClick={() => void handleFileExport()} disabled={exporting} className="w-full gap-2">
                    <FileDown className="w-4 h-4" />
                    {exporting ? "이미지와 자료 백업 중…" : "JSON 파일로 내보내기"}
                  </Button>
                </div>
              </div>

              {/* 가져오기 */}
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  📥 다른 기기 데이터 가져오기
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    다른 기기에서 내보낸 JSON 파일을 선택하면 데이터가 합쳐집니다.
                    기존 데이터는 삭제되지 않습니다.
                  </p>

                  {fileImportError && (
                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {fileImportError}
                    </div>
                  )}

                  {fileImportResult ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      {fileImportResult.added > 0
                        ? `${fileImportResult.added}개 항목이 추가됐습니다! 저장소를 확인해보세요.`
                        : "이미 최신 상태입니다. 새 항목이 없어요."}
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={handleFileImport}
                      />
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <FileUp className="w-4 h-4" />
                        JSON 파일 선택해서 가져오기
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                이메일이나 카카오톡으로 파일을 전송하면 어디서든 가져올 수 있어요
              </p>
            </>
          )}

          {/* ── 자동 동기화 탭 ───────────────────────────────────────────────── */}
          {tab === "auto" && (
            <>
              {!configured && urlInvalid && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span>
                    <strong>VITE_SUPABASE_URL 형식이 잘못됐습니다.</strong><br />
                    <span className="text-xs leading-relaxed">
                      Vercel 환경변수에서 값이{" "}
                      <code className="bg-red-100 px-1 rounded font-mono">https://xxxx.supabase.co</code>{" "}
                      형식인지 확인하세요. 앞에 <code className="bg-red-100 px-1 rounded font-mono">https://</code>가 빠져있을 수 있습니다.
                    </span>
                  </span>
                </div>
              )}

              {!configured && !urlInvalid && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>Supabase 연결 정보가 없습니다. 아래 안내를 따라 환경변수를 추가하세요.</span>
                </div>
              )}

              {configured && roomFixed && (
                <>
                  {/* 자동 동기화 활성 상태 */}
                  <div className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${liveState.status === "live" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                    <Wifi className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-900">
                        {liveState.status === "live" ? "실시간 동기화 연결됨"
                          : liveState.status === "offline" ? "오프라인 — 이 기기에 저장 중"
                          : syncError ? "연결 확인 중 — 자동 재시도"
                          : "실시간 동기화 연결 중"}
                      </p>
                      <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                        교재·시험지·서술형 자료를 서버 저장소에 보관합니다.<br />
                        <strong>저장·변경 사항이 다른 기기에도 새로고침 없이 반영됩니다.</strong>
                      </p>
                    </div>
                  </div>

                  {lastSync && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      마지막 동기화: <span className="font-semibold text-foreground">{timeAgo(lastSync)}</span>
                    </div>
                  )}

                  {syncError && (
                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {syncError}
                    </div>
                  )}

                  {syncResult && !syncError && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      {syncResult.added > 0
                        ? `${syncResult.added}개 항목이 추가됐습니다!`
                        : "이미 최신 상태입니다."}
                    </div>
                  )}

                  <Button
                    onClick={() => void handleAutoSync()}
                    disabled={syncing}
                    size="lg"
                    className="w-full gap-2 h-12 rounded-2xl"
                  >
                    {syncing
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> 동기화 중…</>
                      : <><RefreshCw className="w-4 h-4" /> 지금 동기화</>}
                  </Button>

                  {/* Vercel 설정 안내 */}
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      연결이 끊겨도 자료는 유지됩니다
                    </div>
                    <div className="p-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                      <p>인터넷이 끊기면 이 기기에 저장하고, 연결이 복구되면 자동으로 다시 전송합니다.</p>
                      <p>모든 기기에서 같은 게시된 앱 주소를 사용하세요. 같은 동기화 코드를 사용하면 같은 서버 저장소에 연결됩니다.</p>
                    </div>
                  </div>
                </>
              )}

              {configured && !roomFixed && shareUrl && (
                <>
                  <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 space-y-1.5">
                    <p className="text-sm font-bold text-foreground">📲 처음 설정 방법 (1회만)</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
                      <li>아래 링크를 <strong className="text-foreground">복사</strong>하세요</li>
                      <li>다른 기기에서 이 링크를 열어 <strong className="text-foreground">북마크</strong> 저장</li>
                      <li>이후엔 북마크로 열기만 하면 <strong className="text-foreground">자동 동기화</strong> ✅</li>
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> 내 동기화 링크
                    </label>
                    <div className="bg-muted/40 border border-border/50 rounded-xl px-3 py-2.5 text-xs font-mono text-muted-foreground break-all leading-relaxed">
                      {shareUrl}
                    </div>
                    <Button onClick={handleLinkCopy} variant="outline" className="w-full gap-2 rounded-2xl">
                      {linkCopied ? <><CheckCircle className="w-4 h-4 text-emerald-600" />복사됨!</> : <><Copy className="w-4 h-4" />링크 복사</>}
                    </Button>
                  </div>
                  <Button onClick={() => void handleAutoSync()} disabled={syncing} size="lg" className="w-full gap-2 h-12 rounded-2xl">
                    {syncing ? <><Loader2 className="w-4 h-4 animate-spin" />동기화 중…</> : <><RefreshCw className="w-4 h-4" />지금 동기화</>}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
