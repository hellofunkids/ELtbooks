import { Router, type IRouter } from "express";
import { selectSourcePassages, chooseEvidence } from "../lib/text-evidence";
import { groundReadingQuestions, createReadingClozeQuestions, READING_QUESTION_RULES } from "../lib/reading-questions";

const router: IRouter = Router();

router.post("/quiz", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const topic = typeof body["topic"] === "string" ? body["topic"] : "";
  const textbook = typeof body["textbook"] === "string" ? body["textbook"] : "";
  const pageLabel = typeof body["pageLabel"] === "string" ? body["pageLabel"] : "";
  const vocabulary = typeof body["vocabulary"] === "string" ? body["vocabulary"] : "";
  const grammar = typeof body["grammar"] === "string" ? body["grammar"] : "";

  // 언스크램블은 번역이나 설명이 아닌 OCR 원문만 사용한다.
  const str = (key: string) => typeof body[key] === "string" ? (body[key] as string) : "";
  const originalText = str("originalText").trim();
  const supportingText = originalText ||
    [str("translation"), str("teacherScript"), str("context"),
     str("studentQuestions"), str("answerExamples"), str("summary")]
      .filter(Boolean).join("\n\n");

  if (!supportingText && !topic && !vocabulary && !grammar) {
    res.status(400).json({ error: "분석 내용이 부족합니다. 해당 교재를 다시 분석해주세요." });
    return;
  }

  // ── 1단계: 서버에서 언스크램블 문장 직접 추출 (AI 불필요) ──────────────────
  if (!originalText) {
    res.status(400).json({ error: "본문 영어 원문을 찾을 수 없습니다. 교재를 다시 분석해주세요." });
    return;
  }
  const unscrambleData = selectSourcePassages(originalText, 7);
  if (unscrambleData.length !== 7) {
    res.status(422).json({ error: "본문에서 언스크램블에 사용할 영어 문장을 충분히 찾지 못했습니다. 교재를 다시 분석해주세요." });
    return;
  }
  const unscrambleNote = unscrambleData.length > 0
    ? `\n\n[언스크램블용 선택 문장 — 이미 서버에서 선택됨, 별도 생성 불필요]\n${unscrambleData.map((u, i) => `${i + 1}. ${u.text}`).join("\n")}`
    : "";
  const shortEvidence = chooseEvidence(originalText, 3);

  // ── 2단계: AI는 객관식 10문제 + 서술형 3문제만 생성 ───────────────────────
  const title = textbook
    ? `${textbook}${pageLabel ? " - " + pageLabel : ""} 영어 시험`
    : "영어 시험지";

  const prompt = `당신은 영어 시험 출제 전문가입니다.
아래 영어 지문만을 바탕으로 시험 문제를 출제해주세요.
지문에 없는 내용, 지문에서 유추한 내용, 외부 지식은 절대 사용하지 마세요.

[지문 원문 — 반드시 이 텍스트에서만 문제 출제]
${originalText}

[주제 참고]
${topic}

[핵심 단어 참고]
${vocabulary}

[문법 포인트 참고]
${grammar}${unscrambleNote}

다음 구성으로 13문제를 만들어주세요:
- 객관식(mcq) 10문제 (번호 1~10): 지문 이해, 내용 일치/불일치, 어휘, 문법 등 다양하게
- 영어 서술형(short) 3문제 (번호 11~13):
  * 11번은 EVIDENCE 0, 12번은 EVIDENCE 1, 13번은 EVIDENCE 2의 구체적인 사실 하나씩을 물으세요.

[서술형에 사용할 본문 근거 — 학생 질문에 원문이나 정답을 노출하지 마세요]
${shortEvidence.map((text, index) => `EVIDENCE ${index}: ${text}`).join("\n")}
${READING_QUESTION_RULES}

※ 언스크램블(14~20번)은 별도로 처리되므로 JSON에 포함하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:

{
  "questions": [
    {
      "type": "mcq",
      "number": 1,
      "question": "다음 중 본문의 내용과 일치하는 것은?",
      "options": ["① 한국어 선택지 A", "② 한국어 선택지 B", "③ 한국어 선택지 C", "④ 한국어 선택지 D"],
      "answer": "② 한국어 선택지 B",
      "explanation": "본문 내용 근거 설명 (한국어)"
    },
    {
      "type": "short",
      "number": 11,
      "evidenceIndex": 0,
      "question": "EVIDENCE 0에 명시된 구체적 사실을 묻는 한국어 질문",
      "answer": "EVIDENCE 0에서 그대로 복사한 정답 영어 표현"
    }
  ]
}

[객관식 출제 필수 규칙]
1. 문제(question), 선택지(options), 정답(answer), 해설(explanation) 모두 한국어로 작성
2. 선택지는 반드시 ①②③④ 형식으로 4개 작성
3. 모든 문제는 반드시 지문 원문 내용을 근거로 출제 — 지문에 없는 내용 절대 금지
4. 정답이 하나만 명확히 맞도록 출제

[서술형 규칙]
- 11~13번 모두 본문 사실 찾기형이며, 정답은 지정된 근거에서 그대로 복사한 영어 표현입니다.

[공통]
- 난이도는 중학교 1~2학년 수준
- 지문에 없는 내용 절대 사용 금지`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      req.log.error({ status: response.status, err }, "OpenAI quiz generation error");
      res.status(502).json({ error: `OpenAI API 오류: ${response.status}` });
      return;
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const aiJson = JSON.parse(cleaned) as { questions?: Array<Record<string, unknown>> };

    // ── 3단계: AI 결과(1~13번) + 서버 생성 언스크램블(14~20번) 합산 ───────────
    const aiQuestions: Array<Record<string, unknown>> = Array.isArray(aiJson.questions)
      ? aiJson.questions.filter((q) => q["type"] === "mcq" || q["type"] === "short")
      : [];
    const mcqQuestions = aiQuestions.filter((q) =>
      q["type"] === "mcq" &&
      typeof q["question"] === "string" &&
      Array.isArray(q["options"]) &&
      (q["options"] as unknown[]).length === 4 &&
      typeof q["answer"] === "string"
    ).slice(0, 10).map((q, index) => ({ ...q, number: index + 1 }));
    const groundedShort = groundReadingQuestions(
      aiQuestions.filter((q) => q["type"] === "short"),
      shortEvidence,
    );
    if (!groundedShort) {
      req.log.warn("Invalid AI reading questions replaced with exact-source passage completion questions");
    }
    const shortQuestions = (groundedShort ?? createReadingClozeQuestions(shortEvidence)).map((q, index) => ({
      ...q, type: "short", number: index + 11,
    }));

    if (mcqQuestions.length !== 10 || shortQuestions.length !== 3) {
      res.status(502).json({ error: "본문에서 정답을 찾을 수 있는 시험 문제 생성에 실패했습니다. 다시 생성해주세요." });
      return;
    }

    const unscrambleQuestions: Array<Record<string, unknown>> = unscrambleData.map((u, i) => ({
      type: "unscramble",
      number: 14 + i,
      question: u.isFragment
        ? "다음 본문 표현의 단어들을 올바른 순서로 배열하시오."
        : "다음 본문 문장의 단어들을 올바른 순서로 배열하시오.",
      words: u.words,
      answer: u.text,
    }));

    const allQuestions = [...mcqQuestions, ...shortQuestions, ...unscrambleQuestions];

    req.log.info({
      aiQCount: mcqQuestions.length + shortQuestions.length,
      unscrambleCount: unscrambleQuestions.length,
      total: allQuestions.length,
    }, "Quiz generated");

    res.json({ title, questions: allQuestions });
  } catch (e) {
    req.log.error({ err: e }, "Quiz generation failed");
    res.status(502).json({ error: "시험지 생성에 실패했습니다. 다시 시도해주세요." });
  }
});

export default router;
