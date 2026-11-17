export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAIAPI;
  if (!apiKey) {
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { text, speed } = body ?? {};
  if (!text || typeof text !== "string") { res.status(400).json({ error: "text 필드가 필요합니다." }); return; }

  const trimmed = text.slice(0, 4096);
  const ttsSpeed = typeof speed === "number" && speed >= 0.25 && speed <= 4.0 ? speed : 1.0;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "tts-1", input: trimmed, voice: "nova", response_format: "mp3", speed: ttsSpeed }),
  });

  if (!response.ok) {
    res.status(502).json({ error: "음성 생성 중 오류가 발생했습니다." });
    return;
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  const buffer = await response.arrayBuffer();
  res.send(Buffer.from(buffer));
}
