import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/tts", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." });
    return;
  }

  const { text, speed } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text 필드가 필요합니다." });
    return;
  }

  const trimmed = text.slice(0, 4096);
  const ttsSpeed = typeof speed === "number" && speed >= 0.25 && speed <= 4.0 ? speed : 1.0;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      input: trimmed,
      voice: "nova",
      response_format: "mp3",
      speed: ttsSpeed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    req.log.error({ status: response.status, errText }, "OpenAI TTS error");
    res.status(502).json({ error: "음성 생성 중 오류가 발생했습니다." });
    return;
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  const buffer = await response.arrayBuffer();
  res.send(Buffer.from(buffer));
});

export default router;
