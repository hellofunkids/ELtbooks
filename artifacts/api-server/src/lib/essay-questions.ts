export interface EssayQuestion {
  question: string;
  answer: string;
}
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const forbidden = /요약|주제|의견|상상|자신의|여러분|생각|경험|창작|동의|느낌|느낀|나라면|편지|이어서|왜|이유|원인|교훈|의미/;
const instruction = "본문에서 해당 사실을 찾아 영어 완전한 문장 2~3개(약 2~3줄)로 쓰세요.";

export function groundEssayQuestions(
  items: Array<Record<string, unknown>>,
  evidence: string[][],
): EssayQuestion[] | null {
  if (items.length !== 3 || evidence.length !== 3) return null;
  const result: EssayQuestion[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const index = item.evidenceIndex;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 2 || seen.has(index)) return null;
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answers = item.answerSentences;
    const source = evidence[index];
    if (!question || forbidden.test(question)) return null;
    // The server already knows the full source answer; the model need only write the question.
    if (answers !== undefined && (!Array.isArray(answers) || answers.length !== source.length ||
      !answers.every((answer, offset) => typeof answer === "string" &&
        normalize(answer).toLowerCase() === normalize(source[offset]).toLowerCase()))) return null;
    seen.add(index);
    result[index] = { question: `${question}\n${instruction}`, answer: source.join("\n") };
  }
  return result;
}

/** Preserve passage-only, multi-sentence answers even if the model returns a short or invented answer. */
export function createEssayRetrievalQuestions(evidence: string[][]): EssayQuestion[] {
  return evidence.map(sentences => ({
    question: `본문에서 다음 시작 표현으로 시작하는 문장들을 찾아, 각각의 사실을 쓰세요.\n${
      sentences.map((sentence, index) => `${index + 1}) ${sentence.split(/\s+/).slice(0, 2).join(" ")} …`).join("\n")
    }\n${instruction}`,
    answer: sentences.join("\n"),
  }));
}
