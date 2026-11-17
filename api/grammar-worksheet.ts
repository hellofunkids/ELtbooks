import { GenerateGrammarWorksheetBody } from "@workspace/api-zod";
import { generateGrammarCards } from "../artifacts/api-server/src/lib/grammar-worksheet";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const parsed = GenerateGrammarWorksheetBody.safeParse(
    typeof req.body === "string" ? JSON.parse(req.body) : req.body,
  );
  if (!parsed.success || !parsed.data.originalText.trim()) {
    res.status(400).json({ error: "영어 본문을 확인해주세요. 최대 20,000자까지 생성할 수 있습니다." });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAIAPI;
  if (!apiKey) {
    res.status(503).json({ error: "AI 서비스가 설정되지 않았습니다." });
    return;
  }
  try {
    res.json(await generateGrammarCards(apiKey, parsed.data.originalText, parsed.data.grammarSummary));
  } catch {
    res.status(502).json({ error: "문법 설명과 예문을 완성하지 못했습니다. 다시 생성해주세요." });
  }
}
