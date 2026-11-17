export const config = { api: { bodyParser: true } };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." }); return; }

  const body = req.body ?? {};
  const originalText = typeof body["originalText"] === "string" ? body["originalText"] : "";
  if (!originalText) { res.status(400).json({ error: "originalText가 필요합니다." }); return; }

  const topic = typeof body["topic"] === "string" ? body["topic"] : "";
  const textbook = typeof body["textbook"] === "string" ? body["textbook"] : "";
  const pageLabel = typeof body["pageLabel"] === "string" ? body["pageLabel"] : "";
  const vocabulary = typeof body["vocabulary"] === "string" ? body["vocabulary"] : "";
  const grammar = typeof body["grammar"] === "string" ? body["grammar"] : "";

  const title = textbook ? `${textbook}${pageLabel ? " - " + pageLabel : ""} 영어 시험` : "영어 시험지";

  const prompt = `당신은 영어 시험 출제 전문가입니다. 아래 영어 지문을 바탕으로 파이널 테스트 수준의 시험지를 출제해주세요.
[지문 원문]
${originalText}
[주제]
${topic}
[핵심 단어]
${vocabulary}
[문법 포인트]
${grammar}
다음 구성으로 총 20문제를 만들어주세요:
- 객관식(mcq) 10문제 (번호 1~10): 지문 이해, 내용 일치/불일치, 어휘, 문법 등 다양하게
- 영어 서술형(short) 3문제 (번호 11~13): 아래 3가지 유형으로 정확히 출제. 11번: 본문에서 가장 핵심이 되는 문장 1개를 찾아 영어로 그대로 쓰시오. 12번: 본문의 주요 내용을 영어로 3문장 이내로 요약하시오. 13번: 본문의 주제를 영어로 1~2문장으로 쓰시오.
- 언스크램블(unscramble) 7문제 (번호 14~20): 지문의 문장에서 단어 순서 재배열
반드시 아래 JSON 형식으로만 응답하세요:
{"title":"${title}","questions":[{"type":"mcq","number":1,"question":"다음 중 본문의 내용과 일치하는 것은?","options":["① 선택지 A","② 선택지 B","③ 선택지 C","④ 선택지 D"],"answer":"② 선택지 B","explanation":"본문 내용 근거 설명"},{"type":"short","number":11,"question":"본문에서 가장 핵심이 되는 문장 1개를 찾아 영어로 그대로 쓰시오.","answer":"본문의 핵심 문장 (영어 원문)"},{"type":"short","number":12,"question":"본문의 주요 내용을 영어로 3문장 이내로 요약하시오.","answer":"모범 요약 답안 (영어 3문장 이내)"},{"type":"short","number":13,"question":"본문의 주제를 영어로 1~2문장으로 쓰시오.","answer":"모범 주제 답안 (영어 1~2문장)"},{"type":"unscramble","number":14,"question":"다음 단어들을 올바른 순서로 배열하여 문장을 완성하시오.","words":["word1","word2","word3","word4"],"answer":"word1 word2 word3 word4."}]}
주의사항:
- 모든 문제는 반드시 위 지문 내용을 바탕으로 출제할 것
- 객관식은 정답이 하나만 확실히 맞도록 출제
- 영어 서술형 11~13번은 반드시 영어로 답을 쓰는 문제로 출제하고 모범 답안도 영어로 작성
- 언스크램블은 지문에 실제로 등장하는 문장 사용, 단어 수는 5~9개 적당하게
- 난이도는 중학교 1~2학년 수준으로`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o", max_tokens: 8192, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) { res.status(502).json({ error: `OpenAI API 오류: ${response.status}` }); return; }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const quizJson = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
    res.status(200).json(quizJson);
  } catch {
    res.status(502).json({ error: "시험지 생성에 실패했습니다. 다시 시도해주세요." });
  }
}
