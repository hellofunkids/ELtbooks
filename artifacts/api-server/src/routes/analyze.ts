import { Router, type IRouter } from "express";
import { AnalyzeImageBody } from "@workspace/api-zod";
import { passageSentences, cleanOcrSentences, PASSAGE_OCR_PROMPT } from "../lib/analysis-input";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

const toStr = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((item) => (typeof item === "object" && item !== null ? Object.values(item).join(" - ") : String(item))).join("\n");
  if (v !== null && typeof v === "object") return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join("\n");
  return String(v ?? "");
};

async function callOpenAI(apiKey: string, body: object): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(`OpenAI API 오류 (${response.status})`), { status: response.status, err });
  }
  return response.json() as Promise<{ choices: Array<{ message: { content: string } }> }>;
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

// ── route ──────────────────────────────────────────────────────────────────

router.post("/analyze", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    req.log.warn("OPENAI_API_KEY is not configured");
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다. 호스팅 환경의 비밀값(Secrets)에 OPENAI_API_KEY를 추가해주세요." });
    return;
  }

  const parsed = AnalyzeImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, mimeType, text } = parsed.data;
  const hasText = Boolean(text?.trim());
  const hasImage = Boolean(imageBase64 && mimeType);
  if ((hasText && (imageBase64 || mimeType)) || (!hasText && !hasImage)) {
    res.status(400).json({ error: "영어 지문을 붙여넣거나 교재 이미지를 선택해주세요. 한 번에 한 가지 방식으로 분석할 수 있습니다." });
    return;
  }
  const imageUrl = `data:${mimeType};base64,${imageBase64}`;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Extract every sentence from the image (pure OCR — no grouping)
  // ─────────────────────────────────────────────────────────────────────────
  req.log.info({ input: hasText ? "text" : "image" }, "Step 1: Reading passage");

  const step1Prompt = PASSAGE_OCR_PROMPT;

  let sentences: string[] = [];
  let originalText = "";

  try {
    if (hasText) {
      sentences = passageSentences(text!);
      originalText = sentences.join("\n");
    } else {
    const step1Data = await callOpenAI(apiKey, {
      model: "gpt-4o",
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          { type: "text", text: step1Prompt },
        ],
      }],
    });

    const step1Json = parseJson(step1Data.choices[0]?.message?.content ?? "{}");
    originalText = toStr(step1Json["fullText"] ?? "").trim();
    sentences = cleanOcrSentences(step1Json["sentences"], originalText);
    // OCR 모델이 fullText의 줄바꿈이나 문장부호를 빠뜨려도, 개별 추출 문장을
    // 원문 후보로 보존해 시험/에세이 근거 추출이 형식 때문에 실패하지 않게 한다.
    if (sentences.length > 0) {
      originalText = sentences.join("\n");
    }
    }
    req.log.info({ count: sentences.length }, "Step 1 complete: sentences extracted");
  } catch (e) {
    req.log.error({ err: e }, "Step 1 failed");
    res.status(502).json({ error: "영어 지문을 읽는 데 실패했습니다. 입력 내용을 확인하고 다시 시도해주세요." });
    return;
  }

  if (sentences.length === 0) {
    res.status(422).json({ error: hasText ? "입력한 내용에서 영어 지문을 찾지 못했습니다. 페이지 번호가 아닌 영어 본문을 붙여넣어 주세요." : "이미지에서 영어 본문을 찾지 못했습니다. 교재 사진을 더 선명하게 촬영해 주세요." });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Create lesson content for every sentence (text-only, no image)
  // ─────────────────────────────────────────────────────────────────────────
  req.log.info("Step 2: Generating lesson content for each sentence");

  const numberedSentences = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const step2Prompt = `당신은 경험 많은 초등 영어 선생님입니다. 아래 문장 목록에 대해 수업 자료를 작성해주세요.

=== 문장 목록 (총 ${sentences.length}개) ===
${numberedSentences}

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이 순수 JSON만):

{
  "lessonSegments": [
    {
      "phrase": "문장 목록의 1번 문장 (완전히 동일한 문자열)",
      "explanation": "이 문장 한국어 해석 + 맥락 설명 (구어체 2~3문장). 예: '이 문장은 ~라는 뜻이에요. ~할 때 자주 쓰는 표현이에요!'",
      "grammarNote": "문법 포인트가 있으면 선생님 말투로 1~2문장. 없으면 빈 문자열 \"\"",
      "grammarUsage": "grammarNote가 있을 때만: [패턴] → 용법 설명. 없으면 \"\"",
      "grammarExamples": [
        { "sentence": "같은 문법의 추가 예문 (초등 수준)", "translation": "한국어 해석" }
      ]
    }
  ],
  "topic": "오늘의 핵심 주제 (한 문장)",
  "translation": "위 문장들 전체를 한국어로 자연스럽게 해석",
  "context": "본문 배경·상황 문맥 설명 (학생들이 이해하기 쉽게)",
  "vocabulary": "핵심 단어 5~8개 (단어 - 뜻 - 예문)",
  "grammar": "주요 문법 포인트 3~5개 (예문 → 설명)",
  "teacherScript": "수업 중 선생님이 실제로 말할 설명 스크립트",
  "studentQuestions": "학생에게 던질 질문 5~7개",
  "answerExamples": "각 질문 모범 답안",
  "summary": "수업 마무리 요약 2~3줄"
}

★ lessonSegments 규칙:
- 반드시 ${sentences.length}개여야 합니다 (문장 목록과 동일한 개수)
- lessonSegments[0].phrase = 목록 1번, lessonSegments[1].phrase = 목록 2번 ... (순서 동일)
- phrase는 목록의 문장과 완전히 동일한 문자열 (한 글자도 다르면 안 됨)
- grammarExamples: grammarNote가 있으면 예문 2~3개, 없으면 반드시 빈 배열 []
- 모든 한국어 설명은 음성으로 읽을 때 자연스럽게 들리도록 구어체로 작성`;

  let aiJson: Record<string, unknown>;

  try {
    const step2Data = await callOpenAI(apiKey, {
      model: "gpt-4o",
      max_tokens: 16384,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: step2Prompt,
      }],
    });

    aiJson = parseJson(step2Data.choices[0]?.message?.content ?? "{}");
    req.log.info({ segCount: Array.isArray(aiJson["lessonSegments"]) ? (aiJson["lessonSegments"] as unknown[]).length : 0 }, "Step 2 complete");
  } catch (e) {
    req.log.error({ err: e }, "Step 2 failed");
    res.status(502).json({ error: "AI 응답을 파싱하는 데 실패했습니다. 다시 시도해주세요." });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Normalize output
  // ─────────────────────────────────────────────────────────────────────────

  const STRING_FIELDS = [
    "topic", "translation", "context", "vocabulary", "grammar",
    "teacherScript", "studentQuestions", "answerExamples", "summary",
  ] as const;

  const analysisResult: Record<string, unknown> = { originalText };
  for (const field of STRING_FIELDS) {
    analysisResult[field] = toStr(aiJson[field] ?? "");
  }

  // Build a lookup of AI-generated segments by phrase
  const rawSegments = aiJson["lessonSegments"];
  const segMap = new Map<string, Record<string, unknown>>();
  if (Array.isArray(rawSegments)) {
    for (const seg of rawSegments) {
      if (seg && typeof seg === "object") {
        const s = seg as Record<string, unknown>;
        const p = toStr(s["phrase"] ?? "").trim();
        if (p) segMap.set(p, s);
      }
    }
  }

  // Align segments to the authoritative sentence list from Step 1
  const normalizeExamples = (raw: unknown): { sentence: string; translation: string }[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
      .map((e) => ({ sentence: toStr(e["sentence"] ?? ""), translation: toStr(e["translation"] ?? "") }))
      .filter((e) => e.sentence.length > 0);
  };

  analysisResult["lessonSegments"] = sentences.map((phrase) => {
    const seg = segMap.get(phrase);
    if (seg) {
      return {
        phrase,
        explanation: toStr(seg["explanation"] ?? ""),
        grammarNote: toStr(seg["grammarNote"] ?? ""),
        grammarUsage: toStr(seg["grammarUsage"] ?? ""),
        grammarExamples: normalizeExamples(seg["grammarExamples"]),
      };
    }
    // Fuzzy match: try partial prefix
    for (const [key, seg2] of segMap) {
      const minLen = Math.min(phrase.length, key.length, 25);
      if (minLen > 5 && (phrase.slice(0, minLen) === key.slice(0, minLen))) {
        segMap.delete(key);
        return {
          phrase,
          explanation: toStr(seg2["explanation"] ?? ""),
          grammarNote: toStr(seg2["grammarNote"] ?? ""),
          grammarUsage: toStr(seg2["grammarUsage"] ?? ""),
          grammarExamples: normalizeExamples(seg2["grammarExamples"]),
        };
      }
    }
    // No match — phrase only, explanation will be empty
    return { phrase, explanation: "", grammarNote: "", grammarUsage: "", grammarExamples: [] };
  });

  req.log.info({ total: sentences.length }, "Image analysis completed successfully");
  res.json(analysisResult);
});

export default router;
