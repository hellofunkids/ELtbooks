import { useRef, useEffect, useState } from "react";
import { Play, Pause, Square, SkipForward, SkipBack, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLessonPlayer, type LessonSegment } from "@/hooks/use-lesson-player";

interface LessonModeProps {
  originalText: string;
  segments: LessonSegment[];
  onClose: () => void;
}

const SPEED_OPTIONS = [
  { label: "0.75×", value: 0.75 },
  { label: "1×",    value: 1.0  },
  { label: "1.25×", value: 1.25 },
  { label: "1.5×",  value: 1.5  },
];

const REPEAT_OPTIONS = [
  { label: "1회", value: 1 },
  { label: "2회", value: 2 },
  { label: "3회", value: 3 },
];

function OptionBar<T extends number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-10 shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150
              ${value === opt.value
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border/40 hover:border-primary/40 hover:text-foreground disabled:opacity-40"
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  activePhrase,
  onPhraseClick,
  segments,
}: {
  text: string;
  activePhrase: string | null;
  onPhraseClick: (index: number) => void;
  segments: LessonSegment[];
}) {
  if (!text) return <p className="text-muted-foreground italic">본문 텍스트를 추출하지 못했습니다.</p>;

  const parts: { text: string; isActive: boolean; isSegment: boolean; segIndex: number }[] = [];

  const allPhrases = segments
    .map((seg, i) => ({ phrase: seg.phrase, index: i }))
    .filter((p) => p.phrase && text.includes(p.phrase))
    .sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase));

  let cursor = 0;
  for (const { phrase, index } of allPhrases) {
    const pos = text.indexOf(phrase, cursor);
    if (pos === -1) continue;
    if (pos > cursor) {
      parts.push({ text: text.slice(cursor, pos), isActive: false, isSegment: false, segIndex: -1 });
    }
    parts.push({ text: phrase, isActive: activePhrase === phrase, isSegment: true, segIndex: index });
    cursor = pos + phrase.length;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), isActive: false, isSegment: false, segIndex: -1 });
  }

  return (
    <p className="text-[16px] leading-[2.1] font-medium tracking-wide">
      {parts.map((part, i) => {
        if (!part.isSegment) {
          return <span key={i} className="text-muted-foreground/60">{part.text}</span>;
        }
        return (
          <span
            key={i}
            onClick={() => onPhraseClick(part.segIndex)}
            className={`relative cursor-pointer rounded px-0.5 transition-all duration-300
              ${part.isActive ? "text-primary bg-primary/10" : "hover:bg-muted/60"}`}
          >
            {part.text}
            {part.isActive && (
              <span className="absolute bottom-0 left-0 h-[2.5px] bg-primary rounded-full" style={{ width: "100%" }} />
            )}
          </span>
        );
      })}
    </p>
  );
}

function SegmentList({
  segments,
  currentIndex,
  onJump,
}: {
  segments: LessonSegment[];
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (currentIndex >= 0 && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentIndex]);

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
      {segments.map((seg, i) => (
        <button
          key={i}
          ref={i === currentIndex ? activeRef : undefined}
          onClick={() => onJump(i)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 border ${
            i === currentIndex
              ? "bg-primary text-primary-foreground border-primary shadow-sm font-medium"
              : "bg-card border-border/40 hover:bg-muted/60 text-muted-foreground"
          }`}
        >
          <span className="font-mono text-[11px] opacity-60 mr-2">{i + 1}</span>
          {seg.phrase.length > 55 ? seg.phrase.slice(0, 55) + "…" : seg.phrase}
          {seg.grammarNote && <span className="ml-1.5 text-[10px] opacity-60">📐</span>}
        </button>
      ))}
    </div>
  );
}

function GrammarPanel({ seg }: { seg: LessonSegment }) {
  const [open, setOpen] = useState(false);
  const hasGrammar = seg.grammarNote && seg.grammarNote.trim();
  if (!hasGrammar) return null;

  return (
    <div className="border border-emerald-200/60 rounded-xl overflow-hidden">
      {/* Grammar note header — always visible */}
      <div className="px-4 py-3 bg-emerald-50/70">
        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
          📐 문법 포인트
        </p>
        <p className="text-[14px] leading-relaxed text-emerald-900">{seg.grammarNote}</p>
      </div>

      {/* Grammar usage + examples — expandable */}
      {(seg.grammarUsage?.trim() || (seg.grammarExamples && seg.grammarExamples.length > 0)) && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 bg-emerald-100/60 hover:bg-emerald-100 transition-colors text-[12px] font-semibold text-emerald-800"
          >
            <span>예문 & 용법 보기</span>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {open && (
            <div className="px-4 py-3 bg-white/70 space-y-3">
              {/* Grammar usage pattern */}
              {seg.grammarUsage?.trim() && (
                <div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200/50">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">용법</p>
                  <p className="text-[13px] text-emerald-900 leading-relaxed">{seg.grammarUsage}</p>
                </div>
              )}

              {/* Example sentences */}
              {seg.grammarExamples && seg.grammarExamples.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2">예문</p>
                  <div className="space-y-2">
                    {seg.grammarExamples.map((ex, idx) => (
                      <div key={idx} className="bg-white rounded-lg px-3 py-2 border border-emerald-100 shadow-sm">
                        <p className="text-[14px] font-medium text-foreground">{ex.sentence}</p>
                        <p className="text-[13px] text-muted-foreground mt-0.5">{ex.translation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LessonMode({ originalText, segments, onClose }: LessonModeProps) {
  const [speed, setSpeed] = useState<number>(1.0);
  const [repeatCount, setRepeatCount] = useState<number>(1);

  const { currentIndex, playerState, start, pause, resume, stop, jumpTo } =
    useLessonPlayer(segments, { speed, repeatCount });

  // Audio auto-stops when component unmounts (handled in use-lesson-player cleanup)
  const handleClose = () => {
    stop();
    onClose();
  };

  const isActive = playerState === "playing" || playerState === "loading" || playerState === "paused";
  const activePhrase = currentIndex >= 0 ? segments[currentIndex]?.phrase ?? null : null;
  const currentSeg = currentIndex >= 0 ? segments[currentIndex] : null;

  const handlePlayPause = () => {
    if (playerState === "idle" || playerState === "done") start();
    else if (playerState === "playing") pause();
    else if (playerState === "paused") resume();
  };

  const handlePrev = () => {
    if (currentIndex - 1 >= 0) jumpTo(currentIndex - 1);
  };

  const handleNext = () => {
    const next = currentIndex + 1;
    if (next < segments.length) jumpTo(next);
    else if (playerState === "idle" || playerState === "done") start();
  };

  return (
    <div className="w-full rounded-2xl border border-primary/20 bg-card shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Volume2 className="w-4 h-4" />
          수업 모드
          <span className="text-xs font-normal text-muted-foreground ml-1">
            ({segments.length}개 문장 전체)
          </span>
        </div>
        <button
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground text-sm px-2 py-1 rounded hover:bg-muted/50 transition-colors"
        >
          닫기
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Settings */}
        <div className="flex flex-wrap gap-y-2 gap-x-5 bg-muted/30 rounded-xl px-4 py-3 border border-border/30">
          <OptionBar
            label="속도"
            options={SPEED_OPTIONS as { label: string; value: number }[]}
            value={speed}
            onChange={setSpeed}
            disabled={isActive}
          />
          <OptionBar
            label="반복"
            options={REPEAT_OPTIONS as { label: string; value: number }[]}
            value={repeatCount}
            onChange={setRepeatCount}
            disabled={isActive}
          />
        </div>

        {/* Highlighted full text */}
        <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wider">
            본문 전체 · 문장 클릭 → 바로 재생
          </p>
          <HighlightedText
            text={originalText}
            activePhrase={activePhrase}
            onPhraseClick={jumpTo}
            segments={segments}
          />
        </div>

        {/* Current segment info */}
        <div className={`rounded-xl border transition-all duration-300 overflow-hidden ${
          playerState === "playing" || playerState === "loading"
            ? "border-primary/20"
            : "border-border/30"
        }`}>
          {/* Status bar */}
          <div className={`px-4 py-2 text-xs font-semibold ${
            playerState === "playing" || playerState === "loading"
              ? "bg-primary/8 text-primary"
              : "bg-muted/40 text-muted-foreground"
          }`}>
            {playerState === "loading" ? "🔊 음성 생성 중..." :
             playerState === "done"    ? "✓ 전체 수업이 완료됐습니다" :
             playerState === "idle"    ? "▶ 재생 버튼을 눌러 수업을 시작하세요" :
             `${currentIndex + 1} / ${segments.length} 번째 문장`}
          </div>

          {currentSeg && playerState !== "idle" && playerState !== "done" && (
            <div className="divide-y divide-border/20">
              {/* Phrase + Explanation */}
              <div className="px-4 py-3 space-y-1.5 bg-card">
                <p className="text-[13px] font-semibold text-primary/80 tracking-wide">
                  🔤 {currentSeg.phrase}
                </p>
                <p className="text-[15px] leading-relaxed text-foreground">
                  💬 {currentSeg.explanation}
                </p>
              </div>

              {/* Grammar panel — note + expandable usage & examples */}
              {currentSeg.grammarNote?.trim() && (
                <div className="px-4 py-3 bg-card">
                  <GrammarPanel seg={currentSeg} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-md"
            onClick={handlePlayPause}
            disabled={playerState === "loading"}
          >
            {playerState === "loading" ? (
              <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : playerState === "playing" ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={handleNext}
            disabled={
              (currentIndex >= segments.length - 1) &&
              playerState !== "idle" &&
              playerState !== "done"
            }
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-muted-foreground"
              onClick={stop}
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          )}
        </div>

        {/* Segment list */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            문장 목록 ({segments.length}개) · 클릭 → 바로 재생
          </p>
          <SegmentList segments={segments} currentIndex={currentIndex} onJump={jumpTo} />
        </div>
      </div>
    </div>
  );
}
