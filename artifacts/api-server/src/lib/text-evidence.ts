export interface SourcePassage {
  text: string;
  words: string[];
  isFragment: boolean;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function cleanPassage(value: string): string {
  return value
    .replace(/^\s*(?:[-•*]\s*|\d+[.)]\s*)/, "")
    .replace(/^[("'“‘]+/, "")
    .replace(/[)"'”’]+$/, "")
    .trim();
}

function isEnglishPassage(value: string, minWords: number, maxWords: number): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < minWords || words.length > maxWords) return false;
  const englishWords = words.filter((word) => /[A-Za-z]/.test(word));
  return englishWords.length / words.length >= 0.8;
}

function splitPassages(text: string): string[] {
  if (!text.trim()) return [];

  return text
    .split(/\r?\n+/)
    .flatMap((line) => normalizeWhitespace(line).split(/(?<=[.!?])(?=\s|$)/))
    .map(cleanPassage)
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function splitWords(value: string): string[] {
  return value.split(/\s+/).map((word) => word.trim()).filter(Boolean);
}

function shuffleWords(words: string[]): string[] {
  if (words.length < 2) return [...words];
  const original = words.join(" ").toLowerCase();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = shuffled(words);
    if (result.join(" ").toLowerCase() !== original) return result;
  }
  const result = [...words];
  const differentIndex = result.findIndex((word, index) => word !== result[0] && index > 0);
  if (differentIndex > 0) {
    [result[0], result[differentIndex]] = [result[differentIndex], result[0]];
  }
  return result;
}

/**
 * Returns only text that is present verbatim in the supplied original text.
 * If the page has fewer than `count` complete sentences, contiguous passages
 * are used as a last resort; they still never contain a word from outside the
 * original text.
 */
export function selectSourcePassages(text: string, count: number): SourcePassage[] {
  const passages = splitPassages(text);
  const sentenceCandidates = unique(passages.filter((passage) => isEnglishPassage(passage, 4, 12)));
  const relaxedCandidates = unique(passages.filter((passage) => isEnglishPassage(passage, 3, 16)));
  const candidates = unique([...sentenceCandidates, ...relaxedCandidates]);

  const fragments: string[] = [];
  if (candidates.length < count) {
    const fragmentSources = unique(
      passages.filter((passage) => {
        const words = splitWords(passage);
        return words.length >= 5 && words.filter((word) => /[A-Za-z]/.test(word)).length / words.length >= 0.8;
      }),
    );
    for (const passage of fragmentSources) {
      const words = splitWords(passage);
      for (let size = Math.min(9, words.length); size >= 5; size -= 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
          fragments.push(words.slice(start, start + size).join(" "));
        }
      }
    }
  }

  const selected = unique([...shuffled(candidates), ...shuffled(fragments)]).slice(0, count);
  return selected.map((passage) => ({
    text: passage,
    words: shuffleWords(splitWords(passage)),
    isFragment: !/[.!?]$/.test(passage),
  }));
}

export function chooseEvidence(text: string, count: number): string[] {
  // 독해 질문의 근거는 긴 문장도 그대로 보존한다. 단어 배열용 길이 제한을 적용하지 않는다.
  const sentences = unique(splitPassages(text).filter((passage) => isEnglishPassage(passage, 3, 100)));
  const facts = sentences.filter((sentence) => !/\b(?:should|must|ought)\b/i.test(sentence));
  if (facts.length >= count) return shuffled(facts).slice(0, count);
  if (sentences.length >= count) return shuffled(sentences).slice(0, count);
  return selectSourcePassages(text, count).map((passage) => passage.text);
}

/** Group related, complete source sentences for a two-to-three-line written answer. */
export function chooseEssayEvidence(text: string): string[][] {
  const sentences = unique(splitPassages(text).filter(passage => isEnglishPassage(passage, 3, 100)));
  const facts = sentences.filter(sentence => !/\b(?:should|must|ought)\b/i.test(sentence));
  const pool = facts.length >= 3 ? facts : sentences;
  if (pool.length < 3) return [];
  return Array.from({ length: 3 }, (_, index) => {
    const start = Math.floor(index * pool.length / 3);
    const three = Array.from({ length: 3 }, (__, offset) => pool[(start + offset) % pool.length]);
    const size = pool.length >= 9 && three.join(" ").split(/\s+/).length <= 45 ? 3 : 2;
    return three.slice(0, size);
  });
}
