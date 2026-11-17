import { notifyLocalChange } from "./sync-events";
const ESSAY_STORE_KEY = "elt-essay-v3";

export interface EssayEntry {
  questions: string[];
  answers: string[];
}

export function loadEssayEntry(itemId: string): EssayEntry | null {
  try {
    const raw = localStorage.getItem(ESSAY_STORE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, EssayEntry>;
    return store[itemId] ?? null;
  } catch {
    return null;
  }
}

export function saveEssayEntry(itemId: string, entry: EssayEntry): void {
  try {
    const raw = localStorage.getItem(ESSAY_STORE_KEY);
    const store: Record<string, EssayEntry> = raw ? (JSON.parse(raw) as Record<string, EssayEntry>) : {};
    store[itemId] = entry;
    localStorage.setItem(ESSAY_STORE_KEY, JSON.stringify(store));
    notifyLocalChange("essaysV3", [itemId]);
  } catch {
    // storage full — ignore
  }
}

export function clearEssayEntry(itemId: string): void {
  try {
    const raw = localStorage.getItem(ESSAY_STORE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw) as Record<string, EssayEntry>;
    delete store[itemId];
    notifyLocalChange("essaysV3", [itemId], true);
    localStorage.setItem(ESSAY_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}
