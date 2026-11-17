import { Router, type IRouter } from "express";
import { chooseEssayEvidence } from "../lib/text-evidence";
import { groundEssayQuestions, createEssayRetrievalQuestions } from "../lib/essay-questions";

const router: IRouter = Router();

router.post("/essay-answers", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const str = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";

  const originalText = str("originalText").trim();
  const topic = str("topic");
  const vocabulary = str("vocabulary");
  const grammar = str("grammar");

  if (!originalText) {
    res.status(400).json({ error: "분석 내용이 부족합니다. 해당 교재를 다시 분석해주세요." });
    return;
  }

  const evidence = chooseEssayEvidence(originalText);
  if (evidence.length < 3) {
    res.status(422).json({ error: "본문에서 에세이 근거 문장을 충분히 찾지 못했습니다. 교재를 다시 분석해주세요." });
    return;
  }

  const prompt = `당신은 초등·중학교 영어 교사입니다. 아래 영어 지문과 서버가 지정한 근거 문장만을 바탕으로 본문 사실 찾기 서술형 문제 3개와 정답을 만들어주세요.

[지문 원문]
${originalText}

[주제]
${topic}

[핵심 단어]
${vocabulary}

[문법 포인트]
${grammar}

서버가 지정한 본문 근거 문장 묶음:
${evidence.map((sentences, index) => `EVIDENCE ${index}:\n${sentences.map((sentence, i) => `${i + 1}. ${sentence}`).join("\n")}`).join("\n\n")}

[에세이 서술형 규칙]
- 기존의 본문 사실 찾기 질문 방향을 유지하되, 한 문제에서 지정된 묶음의 사실 2~3개를 함께 물으세요.
- 질문은 누구의 어떤 행동·장소·대상·특징인지 구체적으로 쓰고, 필요한 경우 (1), (2), (3) 소질문으로 나누세요.
- 단어 하나, 짧은 구절 하나로 끝나는 질문은 금지합니다. 답안은 영어 완전한 문장 2~3개, 약 2~3줄이어야 합니다.
- evidenceIndex 0, 1, 2에 대해 한 문제씩 순서대로 출제하세요.
- 정답은 서버가 해당 묶음의 모든 원문 문장을 그대로 연결해 제공합니다. 따라서 지정된 모든 문장의 사실을 함께 묻는 질문만 작성하세요. 정답을 따로 생성하지 마세요.
- 모범 답안을 길게 만들기 위해 같은 사실을 반복하거나 본문에 없는 설명을 덧붙이지 마세요.
- 의견·상상·경험·창작·주제 요약·추론·이유 만들기는 금지합니다. "왜", "이유", "원인", "교훈", "의미"를 묻지 마세요.
- 질문에서 "주제", "생각", "경험", "의견"이라는 표현은 사용하지 마세요. 본문에 명시된 행동·장소·대상·특징을 직접 물으세요.
- 질문에 정답 원문을 그대로 노출하지 마세요. 학생이 본문에서 해당 사실들을 찾아 영어로 옮겨 쓸 수 있어야 합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "questions": [
    { "question": "EVIDENCE 0의 여러 구체적인 사실을 함께 묻는 한국어 질문", "evidenceIndex": 0 },
    { "question": "EVIDENCE 1의 여러 구체적인 사실을 함께 묻는 한국어 질문", "evidenceIndex": 1 },
    { "question": "EVIDENCE 2의 여러 구체적인 사실을 함께 묻는 한국어 질문", "evidenceIndex": 2 }
  ]
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      req.log.error({ status: response.status, err }, "OpenAI essay-answers error");
      res.status(502).json({ error: `OpenAI API 오류: ${response.status}` });
      return;
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const result = JSON.parse(cleaned) as {
      questions?: Array<{
        question?: string;
        evidenceIndex?: number;
        answerSentences?: string[];
      }>;
    };

    if (!Array.isArray(result.questions) || result.questions.length < 3) {
      res.status(502).json({ error: "AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요." });
      return;
    }

    const validated = groundEssayQuestions(result.questions, evidence);
    if (!validated) {
      req.log.warn("Invalid AI essay questions replaced with multi-sentence passage retrieval questions");
    }
    const grounded = validated ?? createEssayRetrievalQuestions(evidence);

    req.log.info("Essay questions+answers generated");
    res.json({
      questions: grounded.map((item) => item.question),
      answers: grounded.map((item) => item.answer),
    });
  } catch (e) {
    req.log.error({ err: e }, "Essay answers generation failed");
    res.status(502).json({ error: "모범 답안 생성에 실패했습니다. 다시 시도해주세요." });
  }
});

export default router;
