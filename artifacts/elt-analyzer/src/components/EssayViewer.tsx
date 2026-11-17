import { useState, useEffect, useRef } from "react";
import { Printer, RotateCcw, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisResult } from "@workspace/api-client-react";
import { loadEssayEntry, saveEssayEntry, clearEssayEntry } from "@/lib/essay-storage";
import { DATA_UPDATED } from "@/lib/sync-events";

// ── 학생용 시험지 HTML ────────────────────────────────────────────────────────

function buildStudentHtml(questions: string[], title: string): string {
  const rows = questions
    .map(
      (q, i) => `
    <div class="essay-block">
      <p class="q-label">에세이 ${i + 1}</p>
      <p class="q-text">${q.replace(/\n/g, "<br>")}</p>
      <p class="answer-guide">본문의 사실을 영어 완전한 문장 2~3개(약 2~3줄)로 쓰세요.</p>
      <div class="essay-area"></div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} — 에세이 서술형</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif; font-size:11pt; color:#111; line-height:1.7; margin:0; padding:0; }
  .header { text-align:center; border-top:3px double #222; border-bottom:3px double #222; padding:10px 0; margin-bottom:16px; }
  .header h1 { font-size:16pt; margin:0 0 3px; font-weight:bold; }
  .header .sub { font-size:10pt; color:#444; }
  .name-row { display:flex; gap:24px; border:1px solid #ccc; padding:7px 14px; margin-bottom:18px; font-size:11pt; }
  .name-row span { display:inline-block; min-width:120px; border-bottom:1px solid #888; margin-left:6px; }
  .essay-block { margin-bottom:24px; page-break-inside:avoid; }
  .q-label { font-size:10pt; font-weight:bold; color:#fff; background:#333; display:inline-block; padding:2px 10px; border-radius:3px; margin-bottom:6px; }
  .q-text { font-size:11pt; font-weight:bold; margin:0 0 10px; }
  .answer-guide { font-size:9pt; color:#555; margin:0 0 5px; }
  .essay-area { border:1px solid #ccc; border-radius:4px; min-height:130px; padding:8px 10px; background:repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #ddd 31px, #ddd 32px); }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>${title}</h1>
  <div class="sub">에세이 서술형</div>
</div>
<div class="name-row">이름: <span>&nbsp;</span> 반: <span style="min-width:80px">&nbsp;</span> 점수: <span style="min-width:80px">&nbsp;</span></div>
${rows}
</body>
</html>`;
}

// ── 정답지 HTML ───────────────────────────────────────────────────────────────

function buildAnswerKeyHtml(questions: string[], answers: string[], title: string): string {
  const rows = questions
    .map(
      (q, i) => `
    <div class="essay-block">
      <p class="q-label">에세이 ${i + 1}</p>
      <p class="q-text">${q.replace(/\n/g, "<br>")}</p>
      <div class="answer-area">
        <p class="answer-label">▶ 모범 답안</p>
        <p class="answer-text">${
          answers[i]
            ? answers[i].replace(/\n/g, "<br>")
            : "<em style='color:#999'>답안 없음</em>"
        }</p>
      </div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} — 에세이 정답지 (교사용)</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif; font-size:11pt; color:#111; line-height:1.7; margin:0; padding:0; }
  .header { text-align:center; border-top:3px double #b91c1c; border-bottom:3px double #b91c1c; padding:10px 0; margin-bottom:16px; }
  .header h1 { font-size:16pt; margin:0 0 3px; font-weight:bold; }
  .header .sub { font-size:10pt; color:#b91c1c; font-weight:bold; }
  .essay-block { margin-bottom:24px; page-break-inside:avoid; }
  .q-label { font-size:10pt; font-weight:bold; color:#fff; background:#7f1d1d; display:inline-block; padding:2px 10px; border-radius:3px; margin-bottom:6px; }
  .q-text { font-size:11pt; font-weight:bold; margin:0 0 10px; }
  .answer-area { border:2px solid #fca5a5; border-radius:4px; background:#fff5f5; padding:10px 14px; }
  .answer-label { font-size:9.5pt; font-weight:bold; color:#b91c1c; margin:0 0 6px; }
  .answer-text { font-size:11pt; margin:0; color:#111; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>${title}</h1>
  <div class="sub">✦ 에세이 정답지 (교사·원장 전용) ✦</div>
</div>
${rows}
</body>
</html>`;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

interface EssayViewerProps {
  result: AnalysisResult;
  title: string;
  itemId: string;
}

type EssayTab = "write" | "answerkey";

export function EssayViewer({ result, title, itemId }: EssayViewerProps) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [activeTab, setActiveTab] = useState<EssayTab>("write");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  const textareaRefs = [
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
  ];

  useEffect(() => {
    const refresh = () => {
      const entry = loadEssayEntry(itemId);
      if (entry && Array.isArray(entry.questions) && entry.questions.length === 3) {
        setQuestions(entry.questions);
        setAnswers(Array.isArray(entry.answers) ? entry.answers : ["", "", ""]);
        setSavedAt("저장·동기화됨");
      } else {
        setQuestions([]);
        setAnswers(["", "", ""]);
        setSavedAt(null);
      }
    };
    refresh();
    window.addEventListener(DATA_UPDATED, refresh);
    return () => window.removeEventListener(DATA_UPDATED, refresh);
  }, [itemId]);

  const persist = (qs: string[], ans: string[]) => {
    saveEssayEntry(itemId, { questions: qs, answers: ans });
    setSavedAt(
      new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const setAnswer = (i: number, val: string) => {
    setAnswers((prev) => {
      const next = prev.map((a, idx) => (idx === i ? val : a));
      persist(questions, next);
      return next;
    });
  };

  const handleReset = () => {
    clearEssayEntry(itemId);
    setQuestions([]);
    setAnswers(["", "", ""]);
    setSavedAt(null);
    setGenError(null);
  };

  const generateQA = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const response = await fetch("/api/essay-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalText: result.originalText ?? "",
          topic: result.topic ?? "",
          vocabulary: result.vocabulary ?? "",
          grammar: result.grammar ?? "",
        }),
      });
      const data = await response.json() as {
        questions?: string[];
        answers?: string[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.questions) || !Array.isArray(data.answers)) {
        setGenError(data.error ?? "문제 생성에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      const qs: string[] = [data.questions[0] ?? "", data.questions[1] ?? "", data.questions[2] ?? ""];
      const ans: string[] = [data.answers[0] ?? "", data.answers[1] ?? "", data.answers[2] ?? ""];
      setQuestions(qs);
      setAnswers(ans);
      persist(qs, ans);
      // 생성 후 질문 영역으로 스크롤
      setTimeout(() => {
        questionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      console.error("Essay generation error:", e);
      setGenError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  };

  const printStudent = () => {
    const html = buildStudentHtml(questions, title);
    const win = window.open("", "_blank");
    if (!win) { alert("팝업이 차단됐습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const printAnswerKey = () => {
    const html = buildAnswerKeyHtml(questions, answers, title);
    const win = window.open("", "_blank");
    if (!win) { alert("팝업이 차단됐습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const hasQuestions = Array.isArray(questions) && questions.length === 3;
  const hasAnyAnswer = Array.isArray(answers) && answers.some((a) => a.trim().length > 0);

  return (
    <div className="space-y-4">

      {/* 서브 탭 */}
      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab("write")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "write"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          ✏️ 문제 + 모범 답안
        </button>
        <button
          onClick={() => setActiveTab("answerkey")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "answerkey"
              ? "border-red-500 text-red-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          🔐 정답지
          {hasQuestions && (
            <span className="ml-1 text-[10px] bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-bold">
              저장됨
            </span>
          )}
        </button>
      </div>

      {/* ── 문제 + 모범 답안 탭 ── */}
      {activeTab === "write" && (
        <div className="space-y-4">

          {/* 에러 메시지 */}
          {genError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="shrink-0 font-bold">⚠️</span>
              <span>{genError}</span>
            </div>
          )}

          {/* 문제 없는 상태 — 생성 안내 */}
          {!hasQuestions && !generating && (
            <div className="text-center py-8 space-y-3 border border-dashed border-border/60 rounded-2xl bg-muted/20">
              <p className="text-2xl">📝</p>
              <p className="text-sm font-semibold text-foreground">AI 에세이 문제·모범 답안 자동 생성</p>
              <p className="text-xs text-muted-foreground px-4">
                생성할 때마다 <strong>다른 유형</strong>의 문제가 출제됩니다<br />
                본문의 사실 2~3개를 찾아 영어 완전한 문장 2~3개(약 2~3줄)로 쓰는 문제입니다. 의견·상상·요약을 쓰지 않습니다.
              </p>
              <Button
                onClick={generateQA}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-5 text-sm mt-2"
              >
                <Sparkles className="w-4 h-4" />
                ✨ AI 문제·답안 생성하기
              </Button>
            </div>
          )}

          {/* 로딩 상태 */}
          {generating && (
            <div className="flex flex-col items-center gap-3 py-10 border border-dashed border-violet-200 rounded-2xl bg-violet-50">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm font-semibold text-violet-700">AI가 문제와 모범 답안을 생성하고 있습니다…</p>
              <p className="text-xs text-violet-500">약 10~20초 소요됩니다</p>
            </div>
          )}

          {/* 생성된 문제 + 답안 */}
          {hasQuestions && !generating && (
            <div className="space-y-4" ref={questionsRef}>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-3">
                <span>
                  <strong>✅ AI 생성 완료</strong> — 답안은 직접 수정 가능하며 자동 저장됩니다.
                  {savedAt && <span className="ml-1 text-emerald-600 text-xs">· {savedAt} 저장됨</span>}
                </span>
              </div>

              {questions.map((q, i) => (
                <div key={i} className="rounded-2xl border border-border/40 overflow-hidden shadow-sm">
                  <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center gap-2">
                    <span className="bg-white text-gray-800 text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold">에세이 질문 {i + 1}</span>
                  </div>
                  <div className="bg-white px-4 pt-3 pb-1">
                    <p className="text-sm font-semibold text-foreground leading-relaxed mb-3 whitespace-pre-line">{q}</p>
                  </div>
                  <div className="bg-gray-50 px-4 pb-4 pt-2 border-t border-border/20">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">📌 모범 답안 · 영어 2~3문장, 약 2~3줄 (수정 가능)</p>
                    <textarea
                      ref={textareaRefs[i]}
                      value={answers[i] ?? ""}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      placeholder="본문의 구체적인 사실을 찾아 영어 문장 2~3개로 쓰세요…"
                      rows={5}
                      className="w-full resize-y rounded-xl border-2 border-border/40 bg-white px-4 py-3
                                 text-sm text-foreground leading-relaxed
                                 focus:outline-none focus:border-primary/50
                                 placeholder:text-muted-foreground/50 transition-colors"
                    />
                  </div>
                </div>
              ))}

              {/* 하단 버튼들 */}
              <div className="flex flex-col gap-2 pt-1">
                <Button onClick={printStudent} variant="outline" className="w-full gap-2">
                  <Printer className="w-4 h-4" />
                  📄 학생용 PDF 출력 (빈 칸)
                </Button>
                <Button
                  onClick={generateQA}
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  2~3줄 답안형 문제로 다시 생성
                </Button>
                <Button
                  onClick={handleReset}
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-muted-foreground text-xs"
                >
                  <RotateCcw className="w-3 h-3" /> 초기화
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                ※ 브라우저 인쇄 창 → "PDF로 저장" 선택하세요
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 정답지 탭 ── */}
      {activeTab === "answerkey" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
            <span>🔐</span>
            <span>원장·교사 전용 정답지입니다. 학생에게 보여주지 마세요.</span>
          </div>

          {!hasQuestions ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">아직 생성된 에세이 문제가 없습니다.</p>
              <Button
                onClick={() => setActiveTab("write")}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                문제 + 모범 답안 탭에서 AI 생성하기
              </Button>
            </div>
          ) : (
            <>
              {questions.map((q, i) => (
                <div key={i} className="rounded-2xl border border-red-200 overflow-hidden shadow-sm">
                  <div className="bg-red-700 text-white px-4 py-2.5 flex items-center gap-2">
                    <span className="bg-white text-red-700 text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold">에세이 질문 {i + 1}</span>
                  </div>
                  <div className="bg-white px-4 pt-3 pb-2">
                    <p className="text-sm font-semibold text-foreground leading-relaxed whitespace-pre-line">{q}</p>
                  </div>
                  <div className="bg-red-50 px-4 py-3 border-t border-red-100">
                    <p className="text-xs font-bold text-red-700 mb-1.5">▶ 모범 답안</p>
                    {answers[i] ? (
                      <p className="text-sm text-foreground whitespace-pre-wrap">{answers[i]}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">답안 없음</p>
                    )}
                  </div>
                </div>
              ))}

              {hasAnyAnswer && (
                <Button
                  onClick={printAnswerKey}
                  className="w-full gap-2 bg-red-700 hover:bg-red-800 text-white"
                >
                  <Printer className="w-4 h-4" />
                  🔐 정답지 PDF 인쇄 (교사용)
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-center">
                ※ 브라우저 인쇄 창 → "PDF로 저장" 선택하세요
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
