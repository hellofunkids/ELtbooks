import React, { useState, useEffect } from "react";
import { useAnalyzeImage } from "@workspace/api-client-react";
import { UploadZone } from "@/components/UploadZone";
import { ResultDisplay } from "@/components/ResultDisplay";
import { Library } from "@/components/Library";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Sparkles, BookOpen, Archive, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useLibrary, type SavedAnalysis } from "@/hooks/use-library";
import type { AnalysisResult } from "@workspace/api-client-react";
import { SyncModal } from "@/components/SyncModal";
import {
  isSupabaseConfigured,
  extractRoomFromUrl,
  getOrCreateRoomId,
  setRoomId,
  startRealtimeSync,
  subscribeSyncState,
  getSyncState,
  type SyncState,
  getLastSyncTime,
} from "@/lib/auto-sync";

type Tab = "analyze" | "library";

function getInitialTab(): Tab {
  try {
    const stored = localStorage.getItem("elt-active-tab");
    if (stored === "library") {
      localStorage.removeItem("elt-active-tab");
      return "library";
    }
  } catch { /* ignore */ }
  return "analyze";
}

export default function Home() {
  const [tab, setTab] = useState<Tab>(getInitialTab);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"image" | "text">("image");
  const [passageText, setPassageText] = useState("");
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadedResult, setLoadedResult] = useState<AnalysisResult | null>(null);
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(getSyncState);

  const analyzeImage = useAnalyzeImage();
  const { items, textbooks, save, remove, removeFolder, updateGrammarCards } = useLibrary();

  useEffect(() => {
    if (!loadedItemId) return;
    const item = items.find(item => item.id === loadedItemId);
    if (item) setLoadedResult(item.result);
  }, [items, loadedItemId]);

  // ── 앱 로드 시 자동 동기화 ───────────────────────────────────────────────
  useEffect(() => {
    // URL에 ?r=ROOMID 가 있으면 저장
    const urlRoom = extractRoomFromUrl();
    if (urlRoom) setRoomId(urlRoom);

    const roomId = getOrCreateRoomId();

    const unsubscribe = subscribeSyncState(setSyncState);
    const stop = startRealtimeSync(roomId);
    return () => { stop(); unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 파일 선택 ──────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const [header, base64] = dataUrl.split(",");
      const mime = header.split(":")[1].split(";")[0];
      setImageBase64(base64);
      setInputMode("image");
      setMimeType(mime);
      setPreviewUrl(dataUrl);
      setLoadedResult(null);
      setLoadedItemId(null);
      analyzeImage.reset();
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setImageBase64(null);
    setMimeType(null);
    setPreviewUrl(null);
    setLoadedResult(null);
    setLoadedItemId(null);
    setPassageText("");
    analyzeImage.reset();
  };

  const handleAnalyze = () => {
    setLoadedItemId(null);
    if (inputMode === "text") {
      if (!passageText.trim()) return;
      setLoadedResult(null);
      analyzeImage.mutate({ data: { text: passageText.trim() } });
      return;
    }
    if (!imageBase64 || !mimeType) return;
    setLoadedResult(null);
    analyzeImage.mutate({ data: { imageBase64, mimeType } });
  };

  // ── 저장 + 자동 업로드 ────────────────────────────────────────────────────
  const handleSave = async (textbook: string, pageLabel: string) => {
    const result = loadedResult ?? analyzeImage.data;
    if (!result) return;
    const id = await save(textbook, pageLabel, inputMode === "text" ? "" : previewUrl ?? "", result);
    setLoadedItemId(id);

    // The library mutation emits a local-change event; the live connection uploads it.
  };

  const handleLoadFromLibrary = (item: SavedAnalysis) => {
    setLoadedItemId(item.id);
    setLoadedResult(item.result);
    setPreviewUrl(item.thumbnailUrl);
    setInputMode(item.thumbnailUrl ? "image" : "text");
    setPassageText(item.thumbnailUrl ? "" : item.result.originalText ?? "");
    setImageBase64(null);
    setMimeType(null);
    analyzeImage.reset();
    setTab("analyze");
  };

  const handleSyncImported = () => {
    window.dispatchEvent(new Event("elt-data-updated"));
  };

  const activeResult: AnalysisResult | null = loadedResult ?? analyzeImage.data ?? null;
  const is503 =
    (analyzeImage.error as any)?.status === 503 ||
    (analyzeImage.error as any)?.response?.status === 503;

  // ── 동기화 상태 뱃지 ──────────────────────────────────────────────────────
  const lastSync = getLastSyncTime();

  return (
    <div className="min-h-[100dvh] w-full pb-20">
      {syncOpen && (
        <SyncModal onClose={() => setSyncOpen(false)} onSynced={handleSyncImported} />
      )}

      {/* Header */}
      <header className="bg-card border-b border-border/40 py-4 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground leading-tight">
                ELT 교재 설명 AI
              </h1>
              <p className="text-xs text-muted-foreground">
                헬로펀키즈 주니어 어학원
              </p>
            </div>
          </div>

          {/* Sync status + button */}
          <button
            onClick={() => setSyncOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl
                       border border-border/50 hover:border-primary/40 hover:bg-primary/5
                       transition-all shrink-0"
            title={syncState.error ?? (lastSync ? `마지막 동기화: ${lastSync.toLocaleTimeString("ko-KR")}` : "실시간 동기화")}
          >
            {(syncState.status === "syncing" || syncState.status === "connecting") && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            )}
            {syncState.status === "live" && (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {(syncState.status === "error" || syncState.status === "offline") && (
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
            )}
            <span className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors">
              {syncState.status === "live" ? "실시간 연결됨"
                : syncState.status === "syncing" ? "동기화 중…"
                : syncState.status === "offline" ? "오프라인 저장"
                : syncState.status === "error" ? "동기화 재시도"
                : "실시간 연결 중…"}
            </span>
          </button>

          {/* Tab buttons */}
          <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
            <button
              onClick={() => setTab("analyze")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === "analyze"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              분석
            </button>
            <button
              onClick={() => setTab("library")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === "library"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              저장소
              {items.length > 0 && (
                <span className="bg-primary/15 text-primary text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {items.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {tab === "library" ? (
          <Library
            items={items}
            textbooks={textbooks}
            onLoad={handleLoadFromLibrary}
            onDelete={remove}
            onDeleteFolder={removeFolder}
          />
        ) : (
          <>
            {/* Upload + Analyze */}
            <div className="flex flex-col gap-6">
              <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="지문 입력 방식">
                {([["image", "사진 업로드"], ["text", "글 붙여넣기"]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={inputMode === mode}
                    disabled={analyzeImage.isPending}
                    onClick={() => {
                      if (inputMode !== mode) {
                        setInputMode(mode);
                        setLoadedResult(null);
                        setLoadedItemId(null);
                        analyzeImage.reset();
                      }
                    }}
                    className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${inputMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >{label}</button>
                ))}
              </div>
              {inputMode === "image" ? (
              <>
              <UploadZone
                onFileSelect={handleFileSelect}
                previewUrl={previewUrl}
                onClear={handleClear}
                isLoading={analyzeImage.isPending}
              />
              <p className="-mt-3 text-xs text-muted-foreground">
                사진의 페이지 번호·머리말·꼬리말·출판 정보는 제외하고 본문 지문과 대화만 분석합니다.
              </p>
              </>
              ) : (
                <div className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-6">
                  <label htmlFor="passage-text" className="text-sm font-semibold text-foreground">영어 지문 붙여넣기</label>
                  <textarea
                    id="passage-text"
                    value={passageText}
                    onChange={event => {
                      setPassageText(event.target.value);
                      setLoadedResult(null);
                      setLoadedItemId(null);
                      analyzeImage.reset();
                    }}
                    disabled={analyzeImage.isPending}
                    maxLength={20000}
                    rows={10}
                    placeholder="분석할 영어 지문을 여기에 붙여넣으세요. 사진 없이도 해석·수업 자료·시험지를 만들 수 있습니다."
                    className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>본문 속 나이·연도·수량은 유지하며 페이지 번호와 출판 정보는 제외합니다.</span>
                    <span className="shrink-0">{passageText.length.toLocaleString()} / 20,000자</span>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="w-full text-lg h-14 font-semibold shadow-md gap-2"
                onClick={handleAnalyze}
                disabled={(inputMode === "text" ? !passageText.trim() : !imageBase64 || !mimeType) || analyzeImage.isPending}
              >
                {analyzeImage.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    분석하기
                  </>
                )}
              </Button>
            </div>

            {/* Error */}
            {analyzeImage.isError && (
              <Card className="mt-8 border-destructive/20 bg-destructive/5">
                <CardContent className="p-6 flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-destructive mb-1">
                      분석 중 오류가 발생했습니다
                    </h3>
                    <p className="text-sm text-destructive/80 leading-relaxed">
                      {is503
                        ? "OpenAI API 키가 설정되지 않았습니다. 호스팅 환경의 비밀값(Secrets)에 OPENAI_API_KEY를 추가해주세요."
                        : (analyzeImage.error as any)?.response?.data?.error ||
                          "네트워크 상태나 이미지 형식을 다시 확인해주세요."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Result */}
            {activeResult && (
              <ResultDisplay
                key={activeResult.originalText}
                result={activeResult}
                existingTextbooks={textbooks}
                onSave={handleSave}
                onGrammarGenerated={(cards) => {
                  const updated = { ...activeResult, grammarWorksheetCards: cards };
                  setLoadedResult(updated);
                  if (loadedItemId) updateGrammarCards(loadedItemId, cards);
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
