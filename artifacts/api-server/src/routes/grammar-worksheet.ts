import { Router, type IRouter } from "express";
import { GenerateGrammarWorksheetBody } from "@workspace/api-zod";
import { generateGrammarCards } from "../lib/grammar-worksheet";

const router: IRouter = Router();
router.post("/grammar-worksheet", async (req, res): Promise<void> => {
  const parsed = GenerateGrammarWorksheetBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.originalText.trim()) {
    res.status(400).json({ error: "영어 본문을 확인해주세요. 최대 20,000자까지 생성할 수 있습니다." });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI 서비스가 설정되지 않았습니다." });
    return;
  }
  try {
    res.json(await generateGrammarCards(apiKey, parsed.data.originalText, parsed.data.grammarSummary));
  } catch (error) {
    req.log.error({ err: error }, "Grammar worksheet generation failed");
    res.status(502).json({ error: "문법 설명과 예문을 완성하지 못했습니다. 다시 생성해주세요." });
  }
});
export default router;
