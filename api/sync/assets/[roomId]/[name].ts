import { proxySync } from "../../../lib/sync-proxy";

export default async function handler(req: any, res: any) {
  const roomId = String(req.query.roomId ?? "");
  const name = String(req.query.name ?? "");
  if (req.method !== "GET") { res.status(405).end(); return; }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(roomId) || !/^[a-f0-9]{64}\.(jpeg|png|webp)$/.test(name)) { res.status(400).end(); return; }
  await proxySync(req, res, `/api/sync/assets/${roomId}/${name}`);
}
