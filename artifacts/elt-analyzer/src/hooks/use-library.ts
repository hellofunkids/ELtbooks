import { useState, useCallback, useEffect } from "react";
import { DATA_UPDATED, notifyLocalChange } from "@/lib/sync-events";
import type { AnalysisResult } from "@workspace/api-client-react";

const STORAGE_KEY = "elt-library-v1";

export interface SavedAnalysis {
  id: string;
  textbook: string;
  pageLabel: string;
  savedAt: string;
  thumbnailUrl: string;
  result: AnalysisResult;
}

/** Normalize a textbook name so minor typing differences go into the same folder.
 *  e.g. "InsightLink1" → "Insight Link 1", "  Insight  link 1  " → "Insight Link 1"
 */
export function normalizeTextbook(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, " ")                    // collapse multiple spaces
    .replace(/([A-Za-z])(\d)/g, "$1 $2")     // "Link1" → "Link 1"
    .replace(/(\d)([A-Za-z])/g, "$1 $2")     // "1B" → "1 B"
    .trim();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function compressThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 320;
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function loadAll(): SavedAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAnalysis[];
  } catch {
    return [];
  }
}

function persistAll(items: SavedAnalysis[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useLibrary() {
  const [items, setItems] = useState<SavedAnalysis[]>(() => loadAll());
  useEffect(() => {
    const refresh = () => setItems(loadAll());
    window.addEventListener(DATA_UPDATED, refresh);
    return () => window.removeEventListener(DATA_UPDATED, refresh);
  }, []);

  const save = useCallback(
    async (
      textbook: string,
      pageLabel: string,
      imageDataUrl: string,
      result: AnalysisResult
    ): Promise<string> => {
      const thumbnailUrl = imageDataUrl ? await compressThumbnail(imageDataUrl) : "";
      const newItem: SavedAnalysis = {
        id: generateId(),
        textbook: normalizeTextbook(textbook),
        pageLabel: pageLabel.trim(),
        savedAt: new Date().toISOString(),
        thumbnailUrl,
        result,
      };
      const next = [newItem, ...loadAll()];
      persistAll(next);
      notifyLocalChange("library", [newItem.id]);
      setItems(next);
      return newItem.id;
    },
    []
  );

  const remove = useCallback((id: string) => {
    const next = loadAll().filter(item => item.id !== id);
    notifyLocalChange("library", [id], true);
    persistAll(next);
    setItems(next);
  }, []);

  const removeFolder = useCallback((textbook: string) => {
    const current = loadAll();
    const removed = current.filter(item => normalizeTextbook(item.textbook) === textbook);
    const next = current.filter(item => normalizeTextbook(item.textbook) !== textbook);
    notifyLocalChange("library", removed.map(item => item.id), true);
    persistAll(next);
    setItems(next);
  }, []);

  // textbooks are the normalized, unique folder names
  const updateGrammarCards = useCallback((id: string, cards: NonNullable<AnalysisResult["grammarWorksheetCards"]>) => {
    const next = loadAll().map(item => item.id === id
      ? { ...item, result: { ...item.result, grammarWorksheetCards: cards } }
      : item);
    persistAll(next);
    notifyLocalChange("library", [id]);
    setItems(next);
  }, []);

  const textbooks = Array.from(new Set(items.map((i) => normalizeTextbook(i.textbook)))).filter(Boolean);

  return { items, textbooks, save, remove, removeFolder, updateGrammarCards };
}
