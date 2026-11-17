import React, { useState } from "react";
import { Copy, CheckCircle2, Play, Square, Loader2, BookOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { AnalysisResult, GrammarCard } from "@workspace/api-client-react";
import { AnimatedGrammarSection } from "@/components/AnimatedGrammarSection";
import { TranslationText } from "@/components/TranslationText";
import { LessonMode } from "@/components/LessonMode";
import { GrammarWorksheet } from "@/components/GrammarWorksheet";
import { SaveDialog } from "@/components/SaveDialog";
import { useTTS } from "@/hooks/use-tts";

interface ResultDisplayProps {
  result: AnalysisResult;
  existingTextbooks: string[];
  onSave: (textbook: string, pageLabel: string) => Promise<void>;
  onGrammarGenerated: (cards: GrammarCard[]) => void;
}

const SECTION_CONFIG = [
  { key: "topic", icon: "📌", title: "오늘의 핵심 주제" },
  { key: "translation", icon: "📖", title: "본문 쉬운 해석" },
  { key: "context", icon: "💬", title: "문맥 설명" },
  { key: "vocabulary", icon: "📝", title: "핵심 단어" },
  { key: "grammar", icon: "🔤", title: "문법 포인트" },
  { key: "teacherScript", icon: "🎤", title: "선생님 설명 스크립트" },
  { key: "studentQuestions", icon: "❓", title: "학생 질문" },
  { key: "answerExamples", icon: "✅", title: "정답 예시" },
  { key: "summary", icon: "🏁", title: "수업 마무리 요약" },
] as const;

function SectionContent({ sectionKey, content }: { sectionKey: string; content: string }) {
  if (sectionKey === "grammar") {
    return <AnimatedGrammarSection content={content} />;
  }
  if (sectionKey === "translation") {
    return <TranslationText content={content} />;
  }
  return (
    <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-[15px]">
      {content}
    </div>
  );
}

function PlayButton({
  sectionKey,
  content,
  activeKey,
  ttsState,
  onToggle,
}: {
  sectionKey: string;
  content: string;
  activeKey: string | null;
  ttsState: "idle" | "loading" | "playing";
  onToggle: (key: string, text: string) => void;
}) {
  const isThisActive = activeKey === sectionKey;
  const isLoading = isThisActive && ttsState === "loading";
  const isPlaying = isThisActive && ttsState === "playing";

  return (
    <button
      onClick={() => onToggle(sectionKey, content)}
      disabled={!isThisActive && ttsState === "loading"}
      title={isPlaying ? "정지" : "음성으로 듣기"}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-200 border
        ${isPlaying
          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          : isLoading
          ? "bg-primary/5 border-primary/20 text-primary/60 cursor-wait"
          : "bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"
        }
      `}
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <Square className="w-3 h-3 fill-current" />
      ) : (
        <Play className="w-3 h-3 fill-current" />
      )}
      {isLoading ? "생성 중..." : isPlaying ? "정지" : "듣기"}
    </button>
  );
}

export function ResultDisplay({ result, existingTextbooks, onSave, onGrammarGenerated }: ResultDisplayProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const { toggle, activeKey, ttsState } = useTTS();

  const segments = Array.isArray(result.lessonSegments) ? result.lessonSegments : [];
  const originalText = result.originalText ?? "";

  const handleCopy = () => {
    const textToCopy = SECTION_CONFIG.map(({ key, icon, title }) => {
      return `${icon} ${title}\n${result[key as keyof AnalysisResult]}`;
    }).join("\n\n");

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      toast({ title: "복사 완료!", description: "클립보드에 결과가 복사되었습니다." });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = async (textbook: string, pageLabel: string) => {
    await onSave(textbook, pageLabel);
    toast({ title: "저장 완료!", description: `"${textbook}"에 저장됐습니다.` });
  };

  return (
    <div className="w-full space-y-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">✨ 분석 결과</h2>
        <div className="flex items-center gap-2">
          {segments.length > 0 && (
            <>
              <Button
                onClick={() => setLessonOpen((o) => !o)}
                variant={lessonOpen ? "default" : "outline"}
                className="gap-2"
                data-testid="button-lesson-mode"
              >
                <BookOpen className="w-4 h-4" />
                {lessonOpen ? "수업 모드 닫기" : "수업 모드"}
              </Button>
            </>
          )}
          <GrammarWorksheet
            key={originalText}
            topic={result.topic ?? ""}
            grammarSummary={result.grammar ?? ""}
            originalText={originalText}
            cards={result.grammarWorksheetCards}
            onGenerated={onGrammarGenerated}
          />
          <Button onClick={() => setSaveOpen(true)} variant="outline" className="gap-2 bg-card">
            <Save className="w-4 h-4" />
            저장하기
          </Button>
          <Button onClick={handleCopy} variant="outline" className="gap-2 bg-card">
            {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            {copied ? "복사됨" : "결과 복사"}
          </Button>
        </div>
      </div>

      {/* Lesson mode panel */}
      {lessonOpen && segments.length > 0 && (
        <LessonMode
          originalText={originalText}
          segments={segments}
          onClose={() => setLessonOpen(false)}
        />
      )}

      {/* Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTION_CONFIG.map(({ key, icon, title }, index) => {
          const content = result[key as keyof AnalysisResult];
          if (!content || typeof content !== "string") return null;

          return (
            <Card
              key={key}
              className={`border-border/50 shadow-sm transition-shadow hover:shadow-md ${
                index === SECTION_CONFIG.length - 1 ? "md:col-span-2" : ""
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-foreground">
                    <span className="text-xl">{icon}</span>
                    {title}
                  </h3>
                  <PlayButton
                    sectionKey={key}
                    content={content}
                    activeKey={activeKey}
                    ttsState={ttsState}
                    onToggle={toggle}
                  />
                </div>
                <SectionContent sectionKey={key} content={content} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={handleSave}
        existingTextbooks={existingTextbooks}
      />
    </div>
  );
}
