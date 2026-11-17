export const READING_QUESTION_RULES = `
[본문 사실 찾기 서술형 규칙]
- 학생의 생각을 쓰는 에세이가 아닌, 본문에서 정답을 찾아 영어로 옮겨 쓰는 문제를 출제하세요.
- 각 EVIDENCE 0, 1, 2에 대해 한 문제씩, 순서대로 evidenceIndex 0, 1, 2를 작성하세요.
- 질문은 쉽고 구체적인 한국어 질문입니다. 누구, 무엇, 어디, 언제, 몇 개, 어떤 색/물건/행동인지 등 본문에 명시된 사실 하나만 물으세요.
- 질문에 대상과 상황을 구체적으로 써서 하나의 정답을 찾을 수 있게 하세요. 모호한 대명사나 "핵심 문장을 쓰세요" 같은 지시를 사용하지 마세요.
- 의견, 상상, 경험, 창작, 동의 여부, 요약, 주제, 추론, 감상, 생각이나 이유 만들기는 금지합니다.
- "왜", "이유", "원인", "교훈", "의미"를 묻는 질문은 금지합니다. 장소 표현은 장소 질문의 답이어야 하며, 이를 이유의 답으로 사용하지 마세요.
- "this", "it", "them" 같은 모호한 대명사만으로 답하는 질문은 피하고, 본문의 구체적인 사물·장소·색깔·행동을 묻도록 하세요.
- answer는 해당 EVIDENCE에서 질문에 답하는 최소한의 연속된 영어 단어·구절만 그대로 복사하세요(1~10단어). 학생이 문장을 새로 만들거나 바꿔 쓸 필요가 없어야 합니다.
- 근거 문장 전체를 answer로 복사하지 마세요. 나라를 물으면 나라 이름만, 이동 수단을 물으면 "in boats"처럼 질문에 필요한 표현만 선택하세요.
- 원문에 없는 단어 추가, 번역, 바꿔 쓰기, 서로 떨어진 구절 합치기는 금지합니다.
- 질문에 정답이나 EVIDENCE 원문을 그대로 넣지 마세요. 원문을 확인하고 답하게 하세요.
- 예: EVIDENCE가 "Farmers use water from the river to grow crops."이면,
  question은 "농부들은 농작물을 기르기 위해 어디에서 온 물을 사용하나요?",
  answer는 "from the river"입니다. 이 예시를 실제 지문에 없는 문제로 출제하지 마세요.
`;

export interface ReadingQuestion {
  question: string;
  answer: string;
  sourceText: string;
}

/**
 * A deterministic passage-retrieval task when an AI question violates the rules.
 * The visible sentence and missing words are both copied directly from evidence.
 */
export function createReadingClozeQuestions(evidence: string[]): ReadingQuestion[] {
  return evidence.map((sourceText) => {
    const words = sourceText.trim().split(/\s+/);
    let start = Math.max(1, words.length - Math.min(3, Math.floor(words.length / 2)));
    // Prefer a short object/place/action phrase after the last preposition.
    for (let index = words.length - 2; index >= 1; index -= 1) {
      if (/^(?:in|on|at|from|through|near|with|to|for|by|over)$/i.test(words[index]) &&
          words.length - index - 1 <= 6) {
        start = index + 1;
        break;
      }
    }
    if (/^(?:and|or|but)$/i.test(words[start]) && start < words.length - 1) start += 1;
    const rawAnswer = words.slice(start).join(" ");
    const punctuation = rawAnswer.match(/[.!?]+$/)?.[0] ?? "";
    const answer = rawAnswer.slice(0, rawAnswer.length - punctuation.length);
    return {
      question: `본문에서 다음 문장을 찾아 빈칸에 들어갈 영어 표현을 그대로 쓰세요.\n${words.slice(0, start).join(" ")} __________${punctuation}`,
      answer,
      sourceText,
    };
  });
}

/** Reject invented answers and reflective prompts; return the exact source spelling. */
export function groundReadingQuestions(
  items: Array<Record<string, unknown>>,
  evidence: string[],
): ReadingQuestion[] | null {
  if (items.length !== 3 || evidence.length !== 3) return null;
  const seen = new Set<number>();
  const grounded: ReadingQuestion[] = [];
  for (const item of items) {
    const index = item["evidenceIndex"];
    const question = typeof item["question"] === "string" ? item["question"].trim() : "";
    const answer = typeof item["answer"] === "string" ? item["answer"].replace(/\s+/g, " ").trim() : "";
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 2 || seen.has(index)) return null;
    if (!question || /요약|주제|의견|상상|자신의|여러분|생각|경험|창작|동의|느낌|느낀|나라면|편지|이어서|왜|이유|원인|교훈|의미/.test(question)) return null;
    if (!answer || !/[A-Za-z]/.test(answer) || /[가-힣]/.test(answer) || answer.split(" ").length > 10) return null;
    const sourceText = evidence[index].replace(/\s+/g, " ").trim();
    if (answer.toLowerCase().replace(/[.!?]+$/, "") === sourceText.toLowerCase().replace(/[.!?]+$/, "")) return null;
    const position = sourceText.toLowerCase().indexOf(answer.toLowerCase());
    if (position < 0) return null;
    // A substring inside a larger word is not a valid extracted answer.
    if (/[A-Za-z]/.test(sourceText[position - 1] ?? "") ||
        /[A-Za-z]/.test(sourceText[position + answer.length] ?? "")) return null;
    seen.add(index);
    grounded[index] = {
      question: `${question}\n본문에서 정답을 찾아 필요한 영어 단어·구절만 쓰세요.`,
      answer: sourceText.slice(position, position + answer.length),
      sourceText,
    };
  }
  return grounded;
}