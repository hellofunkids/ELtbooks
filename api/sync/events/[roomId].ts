import { proxySync } from "../../lib/sync-proxy";

export default async function handler(req: any, res: any) {
  const roomId = String(req.query.roomId ?? "");
  if (req.method !== "GET") { res.status(405).end(); return; }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(roomId)) { res.status(400).end(); return; }
  await proxySync(req, res, `/api/sync/events/${encodeURIComponent(roomId)}`, true);
}
