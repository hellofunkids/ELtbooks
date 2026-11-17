/** Remove only unambiguous page furniture, never numbers embedded in a story. */
export function isPageFurniture(line: string): boolean {
  const text = line.trim();
  return /^(?:[-–—]\s*)?\d{1,4}(?:\s*[-–—])?$/.test(text) ||
    /^(?:page|p\.?)\s*\d+(?:\s*(?:of|\/)\s*\d+)?\.?$/i.test(text) ||
    /^\d+\s*(?:\/|of)\s*\d+$/i.test(text) ||
    /^(?:©|copyright\b|\(c\)|all rights reserved\b|isbn\b|issn\b)/i.test(text) ||
    /^(?:https?:\/\/|www\.)\S+$/i.test(text) ||
    /^(?:unit|lesson|chapter|track)\s*\d+(?:\s*[-:|｜]\s*[^.!?]+)?$/i.test(text) ||
    /^[^.!?]{1,100}\s*[|｜]\s*\d{1,4}$/.test(text) ||
    /^\d{1,4}\s*[|｜]\s*[^.!?]{1,100}$/.test(text);
}

export function passageSentences(value: string): string[] {
  const clean = value.replace(/\r\n?/g, "\n").split("\n")
    .filter(line => !isPageFurniture(line)).join(" ").trim();
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return Array.from(segmenter.segment(clean), item => item.segment.replace(/\s+/g, " ").trim())
    .filter(sentence => /[A-Za-z]/.test(sentence) && !isPageFurniture(sentence));
}

export function cleanOcrSentences(sentences: unknown, fullText: string): string[] {
  const lines = Array.isArray(sentences)
    ? sentences.filter((line): line is string => typeof line === "string")
    : [];
  return passageSentences(lines.length ? lines.join("\n") : fullText);
}

export const PASSAGE_OCR_PROMPT = `이 ELT 교재 이미지에서 학습할 영어 지문과 본문 대화만 정확히 추출하세요.

규칙:
- 본문 문장과 실제 본문 대화를 위에서 아래로 순서대로 추출하세요. 원문 표현·숫자·문장부호를 보존하고 문장을 요약·번역·창작하지 마세요.
- 본문 안의 짧은 대사(예: "Yes!", "Hello.")도 보존하세요.
- 페이지 위·아래 가장자리의 페이지 번호, 쪽수, 책 이름, 단원/레슨 표시, 반복 머리말·꼬리말, 출판사명, 저작권, ISBN, URL, 오디오 트랙 번호, 로고, 장식 문구는 제외하세요.
- 본문 바깥의 "Listen and read", "Look and write", "Answer the questions" 같은 활동 지시문과 문제 번호·보기·단어 목록도 제외하세요.
- 단, 이야기 안의 나이·연도·가격·시간·수량·고유명사는 본문 내용이므로 절대 제거하지 마세요.
- 제목·페이지 번호·단원명만 있고 영어 본문이 없으면 빈 sentences 배열을 반환하세요.
- fullText에도 위에서 제외한 불필요한 내용을 넣지 마세요.

반드시 아래 JSON만 응답하세요:
{"sentences":["첫 번째 본문 영어 문장","두 번째 본문 영어 문장"],"fullText":"불필요한 내용을 제외한 영어 본문 전체"}`;
