import { passageSentences, cleanOcrSentences, PASSAGE_OCR_PROMPT } from "../artifacts/api-server/src/lib/analysis-input";

const toStr = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((i) => (typeof i === "object" && i !== null ? Object.values(i as object).join(" - ") : String(i))).join("\n");
  if (v !== null && typeof v === "object") return Object.entries(v as object).map(([k, val]) => `${k}: ${val}`).join("\n");
  return String(v ?? "");
};

async function callOpenAI(apiKey: string, body: object) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`OpenAI API 오류 (${res.status})`), { status: res.status, err });
  }
  return res.json() as Promise<{ choices: Array<{ message: { content: string } }> }>;
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAIAPI;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다. Vercel 환경변수에 OPENAI_API_KEY를 추가해주세요." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { imageBase64, mimeType, text } = body ?? {};
  const hasText = typeof text === "string" && Boolean(text.trim());
  if ((hasText && (imageBase64 || mimeType)) || (!hasText && (!imageBase64 || !mimeType)) ||
      (typeof text === "string" && text.length > 20000)) {
    res.status(400).json({ error: "영어 지문(최대 20,000자) 또는 교재 이미지를 한 가지 방식으로 입력해주세요." });
    return;
  }

  const imageUrl = `data:${mimeType};base64,${imageBase64}`;

  // STEP 1: Extract sentences from image
  const step1Prompt = PASSAGE_OCR_PROMPT;

  let sentences: string[] = [];
  let originalText = "";

  try {
    if (hasText) {
      sentences = passageSentences(text);
    } else {
    const step1 = await callOpenAI(apiKey, {
      model: "gpt-4o", max_tokens: 2048, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        { type: "text", text: step1Prompt },
      ]}],
    });
    const j = parseJson(step1.choices[0]?.message?.content ?? "{}");
    originalText = toStr(j["fullText"] ?? "");
    sentences = cleanOcrSentences(j["sentences"], originalText);
    }
    originalText = sentences.join("\n");
  } catch {
    res.status(502).json({ error: "이미지에서 텍스트를 추출하는 데 실패했습니다. 다시 시도해주세요." });
    return;
  }

  if (sentences.length === 0) {
    res.status(422).json({ error: "영어 본문을 찾지 못했습니다. 붙여넣은 지문이나 교재 사진을 확인해주세요." });
    return;
  }

  // STEP 2: Generate lesson content
  const numberedSentences = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const step2Prompt = `당신은 경험 많은 초등 영어 선생님입니다. 아래 문장 목록에 대해 수업 자료를 작성해주세요.
=== 문장 목록 (총 ${sentences.length}개) ===
${numberedSentences}
반드시 아래 JSON 형식으로만 응답하세요:
{"lessonSegments":[{"phrase":"문장 목록의 1번 문장 (완전히 동일한 문자열)","explanation":"이 문장 한국어 해석 + 맥락 설명 (구어체 2~3문장)","grammarNote":"문법 포인트가 있으면 선생님 말투로 1~2문장. 없으면 빈 문자열 \\"\\"","grammarUsage":"grammarNote가 있을 때만: [패턴] → 용법 설명. 없으면 \\"\\"","grammarExamples":[{"sentence":"같은 문법의 추가 예문 (초등 수준)","translation":"한국어 해석"}]}],"topic":"오늘의 핵심 주제 (한 문장)","translation":"위 문장들 전체를 한국어로 자연스럽게 해석","context":"본문 배경·상황 문맥 설명","vocabulary":"핵심 단어 5~8개 (단어 - 뜻 - 예문)","grammar":"주요 문법 포인트 3~5개 (예문 → 설명)","teacherScript":"수업 중 선생님이 실제로 말할 설명 스크립트","studentQuestions":"학생에게 던질 질문 5~7개","answerExamples":"각 질문 모범 답안","summary":"수업 마무리 요약 2~3줄"}
★ lessonSegments 규칙:
- 반드시 ${sentences.length}개여야 합니다
- phrase는 목록의 문장과 완전히 동일한 문자열
- grammarExamples: grammarNote가 있으면 예문 2~3개, 없으면 반드시 빈 배열 []
- 모든 한국어 설명은 음성으로 읽을 때 자연스럽게 들리도록 구어체로 작성`;

  let aiJson: Record<string, unknown>;
  try {
    const step2 = await callOpenAI(apiKey, {
      model: "gpt-4o", max_tokens: 16384, response_format: { type: "json_object" },
      messages: [{ role: "user", content: step2Prompt }],
    });
    aiJson = parseJson(step2.choices[0]?.message?.content ?? "{}");
  } catch {
    res.status(502).json({ error: "AI 응답을 파싱하는 데 실패했습니다. 다시 시도해주세요." });
    return;
  }

  const STRING_FIELDS = ["topic","translation","context","vocabulary","grammar","teacherScript","studentQuestions","answerExamples","summary"] as const;
  const result: Record<string, unknown> = { originalText };
  for (const f of STRING_FIELDS) result[f] = toStr(aiJson[f] ?? "");

  const normalizeExamples = (raw: unknown) => {
    if (!Array.isArray(raw)) return [];
    return (raw as Record<string, unknown>[])
      .filter((e) => e != null && typeof e === "object")
      .map((e) => ({ sentence: toStr(e["sentence"] ?? ""), translation: toStr(e["translation"] ?? "") }))
      .filter((e) => e.sentence.length > 0);
  };

  const rawSegs = aiJson["lessonSegments"];
  const segMap = new Map<string, Record<string, unknown>>();
  if (Array.isArray(rawSegs)) {
    for (const seg of rawSegs as Record<string, unknown>[]) {
      const p = toStr(seg["phrase"] ?? "").trim();
      if (p) segMap.set(p, seg);
    }
  }

  result["lessonSegments"] = sentences.map((phrase) => {
    const seg = segMap.get(phrase);
    if (seg) return { phrase, explanation: toStr(seg["explanation"] ?? ""), grammarNote: toStr(seg["grammarNote"] ?? ""), grammarUsage: toStr(seg["grammarUsage"] ?? ""), grammarExamples: normalizeExamples(seg["grammarExamples"]) };
    for (const [key, seg2] of segMap) {
      const minLen = Math.min(phrase.length, key.length, 25);
      if (minLen > 5 && phrase.slice(0, minLen) === key.slice(0, minLen)) {
        segMap.delete(key);
        return { phrase, explanation: toStr(seg2["explanation"] ?? ""), grammarNote: toStr(seg2["grammarNote"] ?? ""), grammarUsage: toStr(seg2["grammarUsage"] ?? ""), grammarExamples: normalizeExamples(seg2["grammarExamples"]) };
      }
    }
    return { phrase, explanation: "", grammarNote: "", grammarUsage: "", grammarExamples: [] };
  });

  res.status(200).json(result);
}
