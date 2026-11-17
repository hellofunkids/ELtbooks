import { proxySync } from "../../lib/sync-proxy";

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };
export default async function handler(req: any, res: any) {
  const roomId = String(req.query.roomId ?? "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(roomId)) { res.status(400).json({ error: "유효하지 않은 동기화 코드입니다." }); return; }
  if (!["GET", "PUT"].includes(req.method)) { res.status(405).end(); return; }
  await proxySync(req, res, `/api/sync/room/${encodeURIComponent(roomId)}`);
}
