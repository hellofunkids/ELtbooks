import { Readable } from "node:stream";

// Verified published URL. Vercel uses the same persistent Replit backend, never its local disk.
const SYNC_SERVER_URL = process.env.SYNC_SERVER_URL ?? "https://teaching-material-ai.replit.app";
export async function proxySync(req: any, res: any, path: string, stream = false): Promise<void> {
  const target = new URL(path, SYNC_SERVER_URL);
  if (target.hostname === (req.headers.host ?? "").split(":")[0]) {
    res.status(503).json({ error: "SYNC_SERVER_URL을 Replit에 게시된 앱 주소로 설정해주세요." });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), stream ? 50_000 : 60_000);
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { "Content-Type": "application/json", "Accept": stream ? "text/event-stream" : "*/*" },
      body: req.method === "PUT" ? JSON.stringify(typeof req.body === "string" ? JSON.parse(req.body) : req.body) : undefined,
      signal: controller.signal,
    });
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (stream) res.setHeader("X-Accel-Buffering", "no");
    if (!upstream.body) { res.end(); return; }
    const readable = Readable.fromWeb(upstream.body as any);
    await new Promise<void>((resolve, reject) => {
      readable.on("error", reject);
      res.on("finish", resolve);
      res.on("close", resolve);
      readable.pipe(res);
    });
  } catch {
    if (!res.headersSent && !res.destroyed) {
      res.status(503).json({ error: "Replit 동기화 서버에 연결할 수 없습니다. 최신 버전을 Replit에 먼저 게시해주세요. 이 기기의 자료는 유지됩니다." });
    } else if (!res.destroyed) res.end();
  } finally { clearTimeout(timer); }
}
