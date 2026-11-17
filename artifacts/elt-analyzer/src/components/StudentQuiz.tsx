import { useState, useEffect, useRef } from "react";
import {
  X, ChevronRight, ChevronLeft, CheckCircle2, XCircle,
  Trophy, RotateCcw, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizData, McqQuestion, ShortQuestion, UnscrambleQuestion } from "@/lib/quiz-types";

const CUTLINE = 5;

// ── Helpers ──────────────────────────────────────────────────────────────────

function leadingSymbol(text: string) {
  return text.match(/^[①②③④⑤]/)?.[0] ?? text.trim();
}

function scoreQuestion(q: QuizData["questions"][number], userAnswer: string): boolean {
  if (!userAnswer.trim()) return false;
  if (q.type === "mcq") {
    return leadingSymbol(userAnswer) === leadingSymbol(q.answer);
  }
  if (q.type === "short") {
    const normalize = (value: string) => value.toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[.!?,;:"]/g, "")
      .replace(/\s+/g, " ").trim();
    return normalize(userAnswer) === normalize(q.answer);
  }
  return userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
}

// ── UnscramblePicker ─────────────────────────────────────────────────────────

function UnscramblePicker({
  words,
  value,
  onChange,
}: {
  words: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = value ? value.split(" ").filter(Boolean) : [];

  const availableWords = (() => {
    const pool = [...words];
    const used: boolean[] = new Array(pool.length).fill(false);
    for (const w of selected) {
      const idx = pool.findIndex((p, i) => !used[i] && p === w);
      if (idx !== -1) used[idx] = true;
    }
    return pool.map((w, i) => ({ word: w, used: used[i] }));
  })();

  const addWord = (word: string, idx: number) => {
    // find first matching unused slot in availableWords
    const newSelected = [...selected, word];
    onChange(newSelected.join(" "));
  };

  const removeWord = (pos: number) => {
    const newSelected = selected.filter((_, i) => i !== pos);
    onChange(newSelected.join(" "));
  };

  const reset = () => onChange("");

  return (
    <div className="space-y-4">
      {/* Answer area */}
      <div
        className="min-h-[60px] bg-white border-2 border-dashed border-blue-300 rounded-2xl
                   p-3 flex flex-wrap gap-2 items-start"
      >
        {selected.length === 0 ? (
          <p className="text-muted-foreground text-sm w-full text-center py-2">
            아래 단어를 순서대로 탭하세요
          </p>
        ) : (
          selected.map((w, i) => (
            <button
              key={i}
              onClick={() => removeWord(i)}
              className="bg-blue-100 text-blue-900 border border-blue-300 rounded-xl
                         px-3 py-1.5 text-base font-medium active:scale-95 transition-transform"
            >
              {w}
            </button>
          ))
        )}
      </div>

      {/* Word pool */}
      <div className="flex flex-wrap gap-2">
        {availableWords.map(({ word, used }, i) => (
          <button
            key={i}
            disabled={used}
            onClick={() => !used && addWord(word, i)}
            className={`rounded-xl px-3 py-2 text-base font-medium border transition-all
              ${used
                ? "opacity-30 bg-muted border-border/30 cursor-not-allowed"
                : "bg-card border-border hover:border-primary/50 hover:bg-primary/5 active:scale-95"
              }`}
          >
            {word}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <button
          onClick={reset}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          다시 고르기
        </button>
      )}
    </div>
  );
}

// ── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  answer,
  onAnswer,
  showResult,
}: {
  question: QuizData["questions"][number];
  answer: string;
  onAnswer: (v: string) => void;
  showResult: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isCorrect = scoreQuestion(question, answer);

  const ResultBadge = () =>
    showResult && answer ? (
      isCorrect ? (
        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-sm mt-3">
          <CheckCircle2 className="w-4 h-4" /> 정답!
        </div>
      ) : (
        <div className="mt-3 space-y-0.5">
          <div className="flex items-center gap-1.5 text-red-500 font-semibold text-sm">
            <XCircle className="w-4 h-4" /> 오답
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            정답: <span className="font-semibold text-foreground">{question.answer}</span>
          </p>
        </div>
      )
    ) : null;

  if (question.type === "mcq") {
    const q = question as McqQuestion;
    return (
      <div className="space-y-4">
        <p className="text-base font-semibold leading-relaxed text-foreground">
          {q.number}. {q.question}
        </p>
        <div className="space-y-2.5">
          {q.options.map((opt, i) => {
            const isSelected = leadingSymbol(answer) === leadingSymbol(opt);
            const isRight = leadingSymbol(opt) === leadingSymbol(q.answer);
            const base =
              "w-full text-left px-4 py-3.5 rounded-2xl border-2 text-base transition-all active:scale-[0.98]";
            let style = `${base} border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5`;
            if (isSelected && !showResult)
              style = `${base} border-primary bg-primary/10 font-medium`;
            if (showResult && isRight)
              style = `${base} border-emerald-400 bg-emerald-50 font-semibold text-emerald-900`;
            if (showResult && isSelected && !isRight)
              style = `${base} border-red-400 bg-red-50 font-semibold text-red-800`;

            return (
              <button
                key={i}
                className={style}
                disabled={showResult}
                onClick={() => onAnswer(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <ResultBadge />
      </div>
    );
  }

  if (question.type === "short") {
    const q = question as ShortQuestion;
    return (
      <div className="space-y-4">
        <p className="text-base font-semibold leading-relaxed text-foreground whitespace-pre-line">
          {q.number}. {q.question}
        </p>
        <textarea
          ref={textareaRef}
          disabled={showResult}
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
           placeholder="본문에서 찾은 정답 영어 단어·구절만 입력하세요"
          rows={3}
          className="w-full rounded-2xl border-2 border-border/50 bg-card px-4 py-3
                     text-base resize-none focus:outline-none focus:border-primary/60
                     disabled:opacity-70 placeholder:text-muted-foreground/60"
        />
        <ResultBadge />
      </div>
    );
  }

  // unscramble
  const q = question as UnscrambleQuestion;
  return (
    <div className="space-y-4">
      <p className="text-base font-semibold leading-relaxed text-foreground">
        {q.number}. {q.question}
      </p>
      {showResult ? (
        <div
          className="bg-muted/40 border border-border/40 rounded-2xl px-4 py-3 text-base font-medium"
        >
          {answer || <span className="text-muted-foreground italic">미답변</span>}
        </div>
      ) : (
        <UnscramblePicker
          words={q.words}
          value={answer}
          onChange={onAnswer}
        />
      )}
      <ResultBadge />
    </div>
  );
}

// ── Main StudentQuiz ──────────────────────────────────────────────────────────

interface StudentQuizProps {
  quiz: QuizData;
  onClose: () => void;
}

type Phase = "quiz" | "result" | "review";

export function StudentQuiz({ quiz, onClose }: StudentQuizProps) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [reviewIdx, setReviewIdx] = useState(0);
  const [showReviewAnswers, setShowReviewAnswers] = useState(true);

  const questions = quiz.questions;
  const total = questions.length;
  const q = questions[current];
  const answeredCount = Object.keys(answers).length;

  const answer = answers[q?.number] ?? "";
  const setAnswer = (v: string) => {
    setAnswers((prev) => ({ ...prev, [q.number]: v }));
  };

  // scroll to top on question change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current]);

  const goNext = () => {
    if (current < total - 1) setCurrent((c) => c + 1);
    else finishQuiz();
  };

  const goPrev = () => setCurrent((c) => Math.max(0, c - 1));

  const finishQuiz = () => {
    setPhase("result");
  };

  // ── Score calculation ──
  const correctCount = questions.filter((q) =>
    scoreQuestion(q, answers[q.number] ?? "")
  ).length;
  const wrongCount = total - correctCount;
  const passed = wrongCount <= CUTLINE;
  const progressPct = ((current + 1) / total) * 100;

  // ── Quiz Phase ──
  if (phase === "quiz") {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 bg-card border-b border-border/40 px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted/60 text-muted-foreground shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{quiz.title}</p>
            <p className="text-sm font-bold text-foreground">
              {current + 1} / {total}문제
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">풀었음</p>
            <p className="text-sm font-bold text-primary">{answeredCount}개</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 h-1.5 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-r-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Part label */}
        <div className="shrink-0 px-4 pt-4 pb-1">
          {q.type === "mcq" && (
            <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
              Part A · 객관식 · 3점
            </span>
          )}
          {q.type === "short" && (
            <span className="inline-block bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
              Part B · 서술형 · 4점
            </span>
          )}
          {q.type === "unscramble" && (
            <span className="inline-block bg-violet-100 text-violet-800 text-xs font-bold px-2.5 py-1 rounded-full">
              Part C · 문장 배열 · 4점
            </span>
          )}
        </div>

        {/* Question content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <QuestionCard
            question={q}
            answer={answer}
            onAnswer={setAnswer}
            showResult={false}
          />
        </div>

        {/* Bottom navigation */}
        <div className="shrink-0 bg-card border-t border-border/40 px-4 py-3 flex gap-3">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={current === 0}
            className="gap-1.5 rounded-2xl"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>

          <Button
            onClick={goNext}
            className="flex-1 rounded-2xl gap-1.5 h-12 text-base font-semibold"
          >
            {current === total - 1 ? "제출하기" : (
              <>
                다음
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>

        {/* Dot navigator */}
        <div className="shrink-0 flex justify-center gap-1 py-2 px-4 flex-wrap bg-card">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-5 h-5 rounded-full text-[9px] font-bold transition-all
                ${i === current
                  ? "bg-primary text-white scale-110"
                  : answers[questions[i].number]
                    ? "bg-primary/25 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Result Phase ──
  if (phase === "result") {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          {/* Trophy / fail icon */}
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 text-5xl
              ${passed ? "bg-emerald-100" : "bg-red-100"}`}
          >
            {passed ? <Trophy className="w-12 h-12 text-emerald-600" /> : "😅"}
          </div>

          <h1 className="text-4xl font-black mb-1">
            {correctCount} <span className="text-xl font-semibold text-muted-foreground">/ {total}</span>
          </h1>
          <p className="text-muted-foreground text-sm mb-4">정답 개수</p>

          {/* Pass / Fail badge */}
          <div
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-lg font-bold mb-6
              ${passed
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"}`}
          >
            {passed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            {passed ? "합격" : "불합격"}
          </div>

          {/* Stats */}
          <div className="w-full max-w-sm grid grid-cols-3 gap-3 mb-8">
            {[
              { label: "정답", value: correctCount, color: "text-emerald-600" },
              { label: "오답", value: wrongCount, color: "text-red-500" },
              { label: "커트라인", value: `오답 ${CUTLINE}개`, color: "text-blue-600", small: true },
            ].map(({ label, value, color, small }) => (
              <div
                key={label}
                className="bg-card border border-border/40 rounded-2xl py-3 px-2 text-center"
              >
                <p className={`font-black ${small ? "text-base" : "text-2xl"} ${color}`}>
                  {value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Score bar */}
          <div className="w-full max-w-sm mb-8">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>0</span>
              <span className="text-blue-600 font-semibold">커트라인 ({total - CUTLINE}개 정답)</span>
              <span>{total}</span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden relative">
              {/* cutline marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10"
                style={{ left: `${((total - CUTLINE) / total) * 100}%` }}
              />
              <div
                className={`h-full rounded-full transition-all duration-700
                  ${passed ? "bg-emerald-500" : "bg-red-400"}`}
                style={{ width: `${(correctCount / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="w-full max-w-sm flex flex-col gap-3">
            <Button
              onClick={() => { setReviewIdx(0); setPhase("review"); }}
              variant="outline"
              className="w-full h-12 rounded-2xl gap-2"
            >
              <Eye className="w-4 h-4" />
              문제 & 정답 확인
            </Button>
            <Button
              onClick={() => {
                setAnswers({});
                setCurrent(0);
                setPhase("quiz");
              }}
              variant="outline"
              className="w-full h-12 rounded-2xl gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 풀기
            </Button>
            <Button
              onClick={onClose}
              className="w-full h-12 rounded-2xl"
            >
              닫기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review Phase ──
  const rq = questions[reviewIdx];
  const rAnswer = answers[rq.number] ?? "";
  const rCorrect = scoreQuestion(rq, rAnswer);

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-card border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setPhase("result")}
          className="p-1.5 rounded-xl hover:bg-muted/60 text-muted-foreground"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold">오답 확인</p>
          <p className="text-xs text-muted-foreground">{reviewIdx + 1} / {total}</p>
        </div>
        <button
          onClick={() => setShowReviewAnswers((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5
                     rounded-xl border border-border/40 hover:bg-muted/50"
        >
          {showReviewAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showReviewAnswers ? "정답 숨기기" : "정답 보기"}
        </button>
      </div>

      {/* Correct/wrong indicator strip */}
      <div className={`shrink-0 h-1.5 ${rCorrect ? "bg-emerald-400" : "bg-red-400"}`} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <QuestionCard
          question={rq}
          answer={rAnswer}
          onAnswer={() => {}}
          showResult={showReviewAnswers}
        />
      </div>

      <div className="shrink-0 bg-card border-t border-border/40 px-4 py-3 flex gap-3">
        <Button
          variant="outline"
          onClick={() => setReviewIdx((i) => Math.max(0, i - 1))}
          disabled={reviewIdx === 0}
          className="rounded-2xl gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </Button>
        <Button
          onClick={() => {
            if (reviewIdx < total - 1) setReviewIdx((i) => i + 1);
            else setPhase("result");
          }}
          className="flex-1 rounded-2xl"
        >
          {reviewIdx === total - 1 ? "결과로 돌아가기" : (
            <><span>다음</span><ChevronRight className="w-4 h-4 ml-1" /></>
          )}
        </Button>
      </div>

      {/* Dot nav */}
      <div className="shrink-0 flex justify-center gap-1 py-2 px-4 flex-wrap bg-card">
        {questions.map((q, i) => {
          const a = answers[q.number] ?? "";
          const correct = scoreQuestion(q, a);
          return (
            <button
              key={i}
              onClick={() => setReviewIdx(i)}
              className={`w-5 h-5 rounded-full text-[9px] font-bold transition-all
                ${i === reviewIdx
                  ? "ring-2 ring-primary scale-110"
                  : ""
                } ${correct ? "bg-emerald-400 text-white" : "bg-red-300 text-white"}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
