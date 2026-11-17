import { useState } from "react";
import { Trash2, BookOpen, ChevronLeft, FolderOpen, Clock, FileText, ClipboardList, Gamepad2, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedAnalysis } from "@/hooks/use-library";
import { normalizeTextbook } from "@/hooks/use-library";
import { QuizViewer } from "@/components/QuizViewer";
import { StudentQuiz } from "@/components/StudentQuiz";
import type { QuizData } from "@/components/QuizViewer";
import { loadSavedQuiz } from "@/lib/quiz-storage";
import { SyncModal } from "@/components/SyncModal";

interface LibraryProps {
  items: SavedAnalysis[];
  textbooks: string[];
  onLoad: (item: SavedAnalysis) => void;
  onDelete: (id: string) => void;
  onDeleteFolder: (textbook: string) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function TextbookFolder({
  name,
  count,
  onClick,
}: {
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-border/50 bg-card
                 hover:border-primary/30 hover:shadow-md transition-all duration-200 p-5"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center
                        justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
          <FolderOpen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count}개 페이지 저장됨
          </p>
        </div>
        <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 shrink-0 mt-1
                                group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
}

function AnalysisCard({
  item,
  onLoad,
  onDelete,
  onQuiz,
  onStudentQuiz,
}: {
  item: SavedAnalysis;
  onLoad: (item: SavedAnalysis) => void;
  onDelete: (id: string) => void;
  onQuiz: (item: SavedAnalysis) => void;
  onStudentQuiz: (item: SavedAnalysis) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgError, setImgError] = useState(false);
  const hasSavedQuiz = !!loadSavedQuiz(item.id);
  const showImg = item.thumbnailUrl && !imgError;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden
                    hover:shadow-md transition-shadow duration-200">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/30 flex items-center justify-center">
          {showImg ? (
            <img
              src={item.thumbnailUrl}
              alt="교재 이미지"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <BookOpen className="w-8 h-8 text-muted-foreground/40" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <p className="font-medium text-foreground text-sm line-clamp-2 leading-snug">
              {item.result.topic || "(제목 없음)"}
            </p>
            {item.pageLabel && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {item.pageLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(item.savedAt)}
            </p>
            {hasSavedQuiz && (
              <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">
                퀴즈 저장됨
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick play button if quiz saved */}
      {hasSavedQuiz && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onStudentQuiz(item)}
            className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800
                       text-white text-sm font-bold py-2.5 rounded-xl flex items-center
                       justify-center gap-2 transition-colors"
          >
            <Gamepad2 className="w-4 h-4" />
            📱 학생 퀴즈 풀기
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex border-t border-border/30 divide-x divide-border/30">
        <button
          onClick={() => onLoad(item)}
          className="flex-1 text-sm font-medium text-primary py-2.5 hover:bg-primary/5
                     transition-colors text-center"
        >
          불러오기
        </button>

        <button
          onClick={() => onQuiz(item)}
          className="flex-1 text-sm font-medium text-emerald-700 py-2.5 hover:bg-emerald-50
                     transition-colors text-center flex items-center justify-center gap-1"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          시험 생성
        </button>

        {confirmDelete ? (
          <>
            <button
              onClick={() => onDelete(item.id)}
              className="flex-1 text-sm font-medium text-destructive py-2.5
                         hover:bg-destructive/5 transition-colors text-center"
            >
              삭제 확인
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 text-sm text-muted-foreground py-2.5 hover:bg-muted/50 transition-colors"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 text-muted-foreground py-2.5 hover:bg-muted/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Library({ items, textbooks, onLoad, onDelete, onDeleteFolder }: LibraryProps) {
  const [selectedTextbook, setSelectedTextbook] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [quizItem, setQuizItem] = useState<SavedAnalysis | null>(null);
  const [studentQuiz, setStudentQuiz] = useState<QuizData | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const folderItems = selectedTextbook
    ? items.filter((i) => normalizeTextbook(i.textbook) === selectedTextbook)
    : [];

  const handleStudentQuiz = (item: SavedAnalysis) => {
    const quiz = loadSavedQuiz(item.id);
    if (quiz) setStudentQuiz(quiz);
  };

  const handleImported = () => {
    // Reload the page so useLibrary re-reads from localStorage
    window.location.reload();
  };

  const SyncButton = () => (
    <button
      onClick={() => setSyncOpen(true)}
      className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground
                 hover:text-foreground px-3 py-1.5 rounded-xl border border-border/50
                 hover:border-primary/40 hover:bg-primary/5 transition-all"
    >
      <ArrowLeftRight className="w-3.5 h-3.5" />
      동기화
    </button>
  );

  if (items.length === 0) {
    return (
      <>
        {syncOpen && <SyncModal onClose={() => setSyncOpen(false)} onSynced={handleImported} />}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">저장된 분석이 없습니다</p>
          <p className="text-sm text-muted-foreground mb-6">
            분석 후 "저장하기" 버튼으로 결과를 교재별로 모아두세요
          </p>
          <SyncButton />
          <p className="text-xs text-muted-foreground mt-2">다른 기기에서 가져오려면 동기화를 사용하세요</p>
        </div>
      </>
    );
  }

  return (
    <>
      {syncOpen && <SyncModal onClose={() => setSyncOpen(false)} onSynced={handleImported} />}

      {/* Student quiz fullscreen */}
      {studentQuiz && (
        <StudentQuiz quiz={studentQuiz} onClose={() => setStudentQuiz(null)} />
      )}

      {/* Quiz modal */}
      {quizItem && !studentQuiz && (
        <QuizViewer item={quizItem} onClose={() => setQuizItem(null)} />
      )}

      {selectedTextbook ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedTextbook(null); setConfirmDeleteFolder(false); }}
              className="gap-1.5 text-muted-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
              교재 목록
            </Button>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{selectedTextbook}</h3>
              <p className="text-xs text-muted-foreground">{folderItems.length}개 저장됨</p>
            </div>
            {confirmDeleteFolder ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { onDeleteFolder(selectedTextbook); setSelectedTextbook(null); setConfirmDeleteFolder(false); }}
                  className="text-xs font-medium text-destructive px-2 py-1 rounded-lg border border-destructive/30 hover:bg-destructive/5 transition-colors"
                >
                  전체 삭제 확인
                </button>
                <button
                  onClick={() => setConfirmDeleteFolder(false)}
                  className="text-xs text-muted-foreground px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteFolder(true)}
                className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-lg border border-border/50 hover:border-destructive/30 hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                폴더 삭제
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {folderItems.map((item) => (
              <AnalysisCard
                key={item.id}
                item={item}
                onLoad={onLoad}
                onDelete={onDelete}
                onQuiz={setQuizItem}
                onStudentQuiz={handleStudentQuiz}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground">교재 폴더</h3>
              <p className="text-xs text-muted-foreground">총 {items.length}개 저장됨</p>
            </div>
            <SyncButton />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {textbooks.map((name) => {
              const count = items.filter((i) => normalizeTextbook(i.textbook) === name).length;
              return (
                <TextbookFolder
                  key={name}
                  name={name}
                  count={count}
                  onClick={() => setSelectedTextbook(name)}
                />
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
