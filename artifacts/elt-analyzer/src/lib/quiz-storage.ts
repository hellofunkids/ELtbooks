import type { QuizData } from "@/lib/quiz-types";
import { notifyLocalChange } from "./sync-events";

// 요약·의견형 서술형이 포함된 이전 시험지를 새 출제 방식과 섞지 않는다.
const QUIZ_STORE_KEY = "elt-quiz-v3";

export function loadSavedQuiz(itemId: string): QuizData | null {
  try {
    const raw = localStorage.getItem(QUIZ_STORE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, QuizData>;
    return store[itemId] ?? null;
  } catch {
    return null;
  }
}

export function saveQuiz(itemId: string, quiz: QuizData): void {
  try {
    const raw = localStorage.getItem(QUIZ_STORE_KEY);
    const store: Record<string, QuizData> = raw ? (JSON.parse(raw) as Record<string, QuizData>) : {};
    store[itemId] = quiz;
    localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify(store));
    notifyLocalChange("quizzesV3", [itemId]);
  } catch {
    // storage full — ignore
  }
}

export function deleteSavedQuiz(itemId: string): void {
  try {
    const raw = localStorage.getItem(QUIZ_STORE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw) as Record<string, QuizData>;
    delete store[itemId];
    notifyLocalChange("quizzesV3", [itemId], true);
    localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}
