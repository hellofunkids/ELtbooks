import { useState, useEffect } from "react";
import { X, FileDown, Loader2, AlertCircle, BookOpen, Save, CheckCircle, RefreshCw, Gamepad2, PenLine, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedAnalysis } from "@/hooks/use-library";
import { StudentQuiz } from "@/components/StudentQuiz";
import { EssayViewer } from "@/components/EssayViewer";
import { loadSavedQuiz, saveQuiz, deleteSavedQuiz } from "@/lib/quiz-storage";
import { DATA_UPDATED } from "@/lib/sync-events";
export type { McqQuestion, ShortQuestion, UnscrambleQuestion, QuizQuestion, QuizData } from "@/lib/quiz-types";
import type { McqQuestion, ShortQuestion, UnscrambleQuestion, QuizData } from "@/lib/quiz-types";

// ── PDF generation ───────────────────────────────────────────────────────────

const CUTLINE = 5; // 5개 이하 오답 = 합격

function buildPrintHtml(data: QuizData, showAnswers: boolean): string {
  const mcq = data.questions.filter((q) => q.type === "mcq") as McqQuestion[];
  const short = data.questions.filter((q) => q.type === "short") as ShortQuestion[];
  const unscramble = data.questions.filter((q) => q.type === "unscramble") as UnscrambleQuestion[];
  const total = data.questions.length;

  const renderMcq = (q: McqQuestion) => `
    <div class="question">
      <p class="q-num">${q.number}. ${q.question}</p>
      <div class="options">
        ${q.options.map((o) => `<p class="option">${o}</p>`).join("")}
      </div>
      ${showAnswers ? `<p class="answer-key">▶ 정답: ${q.answer}${q.explanation ? `<br><span class="explanation">${q.explanation}</span>` : ""}</p>` : ""}
    </div>`;

  const renderShort = (q: ShortQuestion) => `
    <div class="question">
      <p class="q-num">${q.number}. ${q.question.replace(/\n/g, "<br>")}</p>
      ${showAnswers
        ? `<p class="answer-key">▶ 정답: ${q.answer}${q.sourceText ? `<br><span class="explanation">본문 근거: ${q.sourceText}</span>` : ""}</p>`
        : `<div class="write-area"></div>`}
    </div>`;

  const renderUnscramble = (q: UnscrambleQuestion) => `
    <div class="question">
      <p class="q-num">${q.number}. ${q.question}</p>
      <p class="words-box">[ ${q.words.join(" / ")} ]</p>
      ${showAnswers
        ? `<p class="answer-key">▶ 정답: ${q.answer}</p>`
        : `<div class="write-area"></div>`}
    </div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${data.title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
    font-size: 11pt; color: #111; line-height: 1.6; margin: 0; padding: 0;
  }
  .header {
    text-align: center;
    border-top: 3px double #222; border-bottom: 3px double #222;
    padding: 10px 0; margin-bottom: 12px;
  }
  .header h1 { font-size: 16pt; margin: 0 0 3px; font-weight: bold; }
  .header .meta { font-size: 10pt; color: #444; }
  .cutline-box {
    display: flex; justify-content: center; gap: 24px;
    background: #f0f4ff; border: 1px solid #b0c4f8;
    padding: 6px 16px; margin-bottom: 12px;
    font-size: 10pt; border-radius: 4px; text-align: center;
  }
  .cutline-box .item { display: flex; flex-direction: column; }
  .cutline-box .label { font-size: 9pt; color: #555; }
  .cutline-box .value { font-weight: bold; font-size: 11pt; color: #1a3a8f; }
  .name-score {
    display: flex; justify-content: space-between;
    border: 1px solid #ccc; padding: 7px 14px;
    margin-bottom: 14px; font-size: 11pt;
  }
  .name-score span { display: inline-block; min-width: 130px; border-bottom: 1px solid #888; margin-left: 8px; }
  .part-header {
    background: #333; color: #fff; font-size: 11pt; font-weight: bold;
    padding: 5px 12px; margin: 18px 0 10px;
  }
  .question { margin-bottom: 16px; page-break-inside: avoid; }
  .q-num { font-weight: bold; margin: 0 0 4px; }
  .options { margin-left: 16px; }
  .option { margin: 2px 0; }
  .words-box {
    background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;
    padding: 6px 12px; margin: 6px 0; font-weight: bold; letter-spacing: 0.05em;
  }
  .write-area { border-bottom: 1px solid #888; min-height: 36px; margin: 8px 0; }
  .answer-key { color: #c00; font-weight: bold; margin: 4px 0 0 16px; font-size: 10.5pt; }
  .explanation { font-weight: normal; color: #666; font-size: 10pt; }
  .answer-notice {
    background: #fff3cd; border: 1px solid #ffc107;
    padding: 6px 12px; margin-bottom: 12px; font-size: 10pt; border-radius: 4px;
  }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <h1>${data.title}</h1>
  <div class="meta">${showAnswers ? "✦ 정답 및 해설지 (원장·교사용) ✦" : "파이널 테스트"}</div>
</div>

<div class="cutline-box">
  <div class="item"><span class="label">총 문항</span><span class="value">${total}문제</span></div>
  <div class="item"><span class="label">합격 기준</span><span class="value">오답 ${CUTLINE}개 이하</span></div>
  <div class="item"><span class="label">최소 정답</span><span class="value">${total - CUTLINE}개 이상</span></div>
</div>

${showAnswers
  ? `<div class="answer-notice">⚠ 이 문서는 교사·원장용 정답지입니다. 학생에게 배부하지 마세요.</div>`
  : `<div class="name-score">
  이름: <span>&nbsp;</span>
  반: <span style="min-width:80px">&nbsp;</span>
  점수: <span style="min-width:80px">&nbsp;</span>
</div>`}

<div class="part-header">Part A │ 객관식 (1~${mcq.length}번) · 각 3점</div>
${mcq.map(renderMcq).join("")}

<div class="part-header">Part B │ 서술형 (${short[0]?.number}~${short[short.length - 1]?.number}번) · 각 4점</div>
<p>본문에서 질문의 정답을 찾아 필요한 영어 단어·구절만 쓰세요. 문장 전체나 자신의 생각, 요약을 쓰는 문제가 아닙니다.</p>
${short.map(renderShort).join("")}

<div class="part-header">Part C │ 문장 배열 (${unscramble[0]?.number}~${unscramble[unscramble.length - 1]?.number}번) · 각 4점</div>
${unscramble.map(renderUnscramble).join("")}

</body>
</html>`;
}

function printPDF(data: QuizData, showAnswers: boolean) {
  const html = buildPrintHtml(data, showAnswers);
  const win = window.open("", "_blank");
  if (!win) { alert("팝업이 차단됐습니다. 팝업 허용 후 다시 시도해주세요."); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

// ── Quiz preview ─────────────────────────────────────────────────────────────

function QuizPreview({ data }: { data: QuizData }) {
  const mcq = data.questions.filter((q) => q.type === "mcq") as McqQuestion[];
  const short = data.questions.filter((q) => q.type === "short") as ShortQuestion[];
  const unscramble = data.questions.filter((q) => q.type === "unscramble") as UnscrambleQuestion[];

  return (
    <div className="space-y-5 text-sm">
      <section>
        <div className="bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded-t-lg">
          Part A │ 객관식 ({mcq.length}문제 · 각 3점)
        </div>
        <div className="border border-t-0 border-border/40 rounded-b-lg p-4 space-y-4 bg-white">
          {mcq.map((q) => (
            <div key={q.number}>
              <p className="font-semibold mb-1">{q.number}. {q.question}</p>
              <div className="pl-3 space-y-0.5 text-muted-foreground">
                {q.options.map((o, i) => <p key={i}>{o}</p>)}
              </div>
              <p className="mt-1 pl-3 text-[12px] text-red-600 font-semibold">▶ 정답: {q.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded-t-lg">
          Part B │ 서술형 ({short.length}문제 · 각 4점)
        </div>
        <div className="border border-t-0 border-border/40 rounded-b-lg p-4 space-y-4 bg-white">
          {short.map((q) => (
            <div key={q.number}>
              <p className="font-semibold mb-1 whitespace-pre-line">{q.number}. {q.question}</p>
                <p className="text-[12px] text-red-600 font-semibold pl-3">▶ 정답: {q.answer}</p>
                {q.sourceText && <p className="text-xs text-muted-foreground pl-3">본문 근거: {q.sourceText}</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded-t-lg">
          Part C │ 문장 배열 ({unscramble.length}문제 · 각 4점)
        </div>
        <div className="border border-t-0 border-border/40 rounded-b-lg p-4 space-y-4 bg-white">
          {unscramble.map((q) => (
            <div key={q.number}>
              <p className="font-semibold mb-1">{q.number}. {q.question}</p>
              <p className="bg-gray-100 rounded px-3 py-1.5 text-xs font-mono font-bold border border-gray-200 mb-1">
                [ {q.words.join(" / ")} ]
              </p>
              <p className="text-[12px] text-red-600 font-semibold pl-3">▶ 정답: {q.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface QuizViewerProps {
  item: SavedAnalysis;
  onClose: () => void;
}

type ActiveTab = "finaltest" | "answerkey" | "essay";

export function QuizViewer({ item, onClose }: QuizViewerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("finaltest");
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [savedQuizExists, setSavedQuizExists] = useState(false);
  const [studentMode, setStudentMode] = useState(false);

  // On open, check for saved quiz
  useEffect(() => {
    const refresh = () => {
      const saved = loadSavedQuiz(item.id);
      setSavedQuizExists(Boolean(saved));
      setQuiz(saved);
      setIsSaved(Boolean(saved));
    };
    refresh();
    window.addEventListener(DATA_UPDATED, refresh);
    return () => window.removeEventListener(DATA_UPDATED, refresh);
  }, [item.id]);

  const generateQuiz = async () => {
    setLoading(true);
    setError(null);
    setIsSaved(false);
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textbook: item.textbook,
          pageLabel: item.pageLabel,
          topic: item.result.topic,
          originalText: item.result.originalText,
          vocabulary: item.result.vocabulary,
          grammar: item.result.grammar,
          // 구버전 데이터 대비 — 모든 텍스트 필드 전송
          translation: (item.result as unknown as Record<string, unknown>)["translation"],
          teacherScript: (item.result as unknown as Record<string, unknown>)["teacherScript"],
          context: (item.result as unknown as Record<string, unknown>)["context"],
          studentQuestions: (item.result as unknown as Record<string, unknown>)["studentQuestions"],
          answerExamples: (item.result as unknown as Record<string, unknown>)["answerExamples"],
          summary: (item.result as unknown as Record<string, unknown>)["summary"],
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "시험지 생성 실패");
      }
      const data = await response.json() as QuizData;
      setQuiz(data);
      saveQuiz(item.id, data);
      setIsSaved(true);
      setSavedQuizExists(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!quiz) return;
    saveQuiz(item.id, quiz);
    setIsSaved(true);
    setSavedQuizExists(true);
  };

  const handleDelete = () => {
    deleteSavedQuiz(item.id);
    setIsSaved(false);
    setSavedQuizExists(false);
    setQuiz(null);
  };

  if (studentMode && quiz) {
    return <StudentQuiz quiz={quiz} onClose={() => setStudentMode(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <div>
              <p className="font-bold text-foreground leading-tight">파이널 테스트</p>
              <p className="text-xs text-muted-foreground">
                {item.textbook}{item.pageLabel ? ` · ${item.pageLabel}` : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/40 px-5 gap-1 bg-muted/20">
          <button
            onClick={() => setActiveTab("finaltest")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "finaltest"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            파이널 테스트
          </button>
          {quiz && (
            <button
              onClick={() => setActiveTab("answerkey")}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "answerkey"
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              정답지
            </button>
          )}
          <button
            onClick={() => setActiveTab("essay")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "essay"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            에세이 서술형
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">

          {/* ── 에세이 서술형 탭 ── */}
          {activeTab === "essay" && (
            <EssayViewer
              result={item.result}
              title={`${item.textbook}${item.pageLabel ? ` · ${item.pageLabel}` : ""}`}
              itemId={item.id}
            />
          )}

          {/* ── 정답지 탭 ── */}
          {activeTab === "answerkey" && quiz && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                <KeyRound className="w-4 h-4 shrink-0 text-red-500" />
                <span>원장·교사 전용 정답지입니다. 학생에게 보여주지 마세요.</span>
              </div>
              <Button
                className="w-full gap-2 border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                variant="outline"
                onClick={() => printPDF(quiz, true)}
              >
                <FileDown className="w-4 h-4" />
                🔐 정답지 PDF 인쇄 (원장용)
              </Button>
              <p className="text-xs text-muted-foreground text-center -mt-2">
                ※ 브라우저 인쇄 창 → "PDF로 저장" 선택하세요
              </p>
              <div className="border border-red-200 rounded-xl overflow-hidden">
                <div className="bg-red-700 text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                  정답 및 해설 미리보기
                </div>
                <div className="p-4 max-h-[520px] overflow-y-auto">
                  <QuizPreview data={quiz} />
                </div>
              </div>
            </div>
          )}

          {/* ── 파이널 테스트 탭 ── */}
          {activeTab === "finaltest" && <>

          {/* Topic + cutline info */}
          <div className="flex gap-3">
            <div className="flex-1 bg-primary/5 rounded-xl px-4 py-3 border border-primary/15">
              <p className="text-xs font-bold text-primary uppercase tracking-wide mb-0.5">주제</p>
              <p className="text-sm text-foreground">{item.result.topic}</p>
            </div>
            <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-200/60 text-center shrink-0">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">커트라인</p>
              <p className="text-lg font-bold text-blue-800">오답 {CUTLINE}개</p>
              <p className="text-[10px] text-blue-600">{20 - CUTLINE}개 이상 정답</p>
            </div>
          </div>

          {/* Empty state — no quiz yet */}
          {!quiz && !loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground text-center">
                객관식 10개 · 서술형 3개 · 언스크램블 7개<br />
                총 20문제 · 커트라인 오답 5개 이하
              </p>
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 rounded-lg px-4 py-2.5 w-full">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button onClick={generateQuiz} size="lg" className="gap-2 px-8">
                <BookOpen className="w-4 h-4" />
                파이널 테스트 생성하기
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">AI가 시험 문제를 출제하고 있습니다…</p>
              <p className="text-xs">보통 20~30초 소요됩니다</p>
            </div>
          )}

          {quiz && !loading && (
            <>
              {/* Saved badge */}
              {isSaved && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="flex-1">
                    {savedQuizExists
                      ? "저장된 시험지를 불러왔습니다. 다음에도 바로 사용할 수 있습니다."
                      : "시험지가 저장됐습니다. 다음에 다시 열어도 그대로 사용할 수 있어요."}
                  </span>
                </div>
              )}

              {/* 학생 퀴즈 시작 */}
              <Button
                onClick={() => setStudentMode(true)}
                size="lg"
                className="w-full h-14 gap-2 text-base font-bold rounded-2xl bg-violet-600 hover:bg-violet-700 text-white shadow-md"
              >
                <Gamepad2 className="w-5 h-5" />
                📱 학생 퀴즈 시작 (모바일·태블릿)
              </Button>

              {/* Action bar */}
              <div className="flex flex-wrap gap-2">
                {/* Save */}
                {!isSaved && (
                  <Button onClick={handleSave} variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                    <Save className="w-3.5 h-3.5" />
                    시험지 저장
                  </Button>
                )}

                {/* Regenerate */}
                <Button onClick={generateQuiz} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5" />
                  다시 생성
                </Button>

                {/* Delete saved */}
                {isSaved && (
                  <Button onClick={handleDelete} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground ml-auto text-xs">
                    저장 삭제
                  </Button>
                )}
              </div>

              {/* PDF download buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="flex-1 gap-2" onClick={() => printPDF(quiz, false)}>
                  <FileDown className="w-4 h-4" />
                  📄 학생용 PDF
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => printPDF(quiz, true)}
                >
                  <FileDown className="w-4 h-4" />
                  🔐 정답지 PDF (원장용)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center -mt-2">
                ※ 브라우저 인쇄 창 → "PDF로 저장" 선택하세요
              </p>

              {/* Preview */}
              <div className="border border-border/30 rounded-xl overflow-hidden">
                <div className="bg-muted/40 px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border/30">
                  미리보기 (정답 포함)
                </div>
                <div className="p-4 max-h-[480px] overflow-y-auto">
                  <QuizPreview data={quiz} />
                </div>
              </div>
            </>
          )}

          </>}
        </div>
      </div>
    </div>
  );
}
